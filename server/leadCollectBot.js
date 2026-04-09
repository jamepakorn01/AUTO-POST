/**
 * Playwright เก็บ Comment/เบอร์ — รองรับหลายบัญชีพร้อมกัน
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const db = require('./db');
const logger = require('./logger');

/** @type {Map<string, {
 *   process: import('child_process').ChildProcess | null,
 *   patchToken: string | null,
 *   status: any
 * }>} */
const collectRunsByUser = new Map();
const collectTokenToUser = new Map();
/** patch token → collect run_id (สำหรับอัปเดต CSV หลังแต่ละโพสต์) */
const collectTokenToRunId = new Map();
/**
 * run_id → meta ส่งออก CSV สด
 * @type {Map<string, { user_id: string, post_log_ids: string[], projectRoot: string }>}
 */
const collectExportByRunId = new Map();

function runPwsh(command) {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', command], { windowsHide: true });
    let stderr = '';
    ps.stderr.on('data', (d) => { stderr += String(d || ''); });
    ps.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(stderr.trim() || `powershell exit code ${code}`));
    });
    ps.on('error', reject);
  });
}

async function suspendProcess(pid) {
  if (!pid) throw new Error('ไม่พบ process id');
  if (process.platform === 'win32') {
    await runPwsh(`Suspend-Process -Id ${Number(pid)} -ErrorAction Stop`);
    return;
  }
  process.kill(pid, 'SIGSTOP');
}

async function resumeProcess(pid) {
  if (!pid) throw new Error('ไม่พบ process id');
  if (process.platform === 'win32') {
    await runPwsh(`Resume-Process -Id ${Number(pid)} -ErrorAction Stop`);
    return;
  }
  process.kill(pid, 'SIGCONT');
}

/** ตรงกับ facebookLogin.ts — ไฟล์ state ของบัญชีนี้ */
function facebookSessionStatePath(projectRoot, user) {
  const sessionKey = String(user?.env_key || user?.id || user?.email || 'default');
  const keyBase = sessionKey.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase();
  return path.join(projectRoot, '.auth', `facebook-${keyBase}.json`);
}

function hasFacebookSavedSession(projectRoot, user) {
  try {
    const p = facebookSessionStatePath(projectRoot, user);
    if (!fs.existsSync(p)) return false;
    if (fs.statSync(p).size < 40) return false;
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    const cookies = Array.isArray(j.cookies) ? j.cookies : [];
    return cookies.length > 0;
  } catch {
    return false;
  }
}

function statusSnapshotOf(uid) {
  const entry = collectRunsByUser.get(uid);
  if (!entry) {
    return {
      running: false,
      run_id: null,
      started_at: null,
      finished_at: null,
      exit_code: null,
      error: null,
      message: 'ยังไม่เคยรันเก็บ Comment',
      user_id: uid,
      user_name: null,
      total_posts: 0,
      use_headed_browser: false,
    };
  }
  return { ...entry.status, running: !!entry.process };
}

function getCollectRunStatus(userId) {
  const uid = userId != null ? String(userId || '').trim() : '';
  if (uid) return statusSnapshotOf(uid);
  const runs = [...collectRunsByUser.keys()].map((k) => statusSnapshotOf(k));
  const running = runs.some((r) => r.running);
  return {
    running,
    total_running: runs.filter((r) => r.running).length,
    message: running ? 'กำลังรันเก็บ Comment บางบัญชี' : 'ไม่มีงานเก็บ Comment ที่กำลังรัน',
    runs,
  };
}

function isCollectPatchTokenValid(token) {
  return !!(token && collectTokenToUser.has(String(token)));
}

function isCollectRunning(userId) {
  if (userId != null) {
    const uid = String(userId || '').trim();
    if (!uid) return false;
    return !!collectRunsByUser.get(uid)?.process;
  }
  for (const entry of collectRunsByUser.values()) {
    if (entry.process) return true;
  }
  return false;
}

function escCsvCell(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function buildCollectCsvString(runId) {
  const meta = collectExportByRunId.get(runId);
  if (!meta) return null;
  const dbRows = await db.getPostLogsByIdsForUser(meta.post_log_ids, meta.user_id);
  const byId = new Map(dbRows.map((r) => [String(r.id), r]));
  const headers = [
    'เวลาโพสต์',
    'บัญชี',
    'เจ้าของงาน',
    'ชื่องาน',
    'ชื่อกลุ่ม',
    'ลิงก์โพสต์',
    'จำนวน_Comment',
    'เบอร์_โทร',
  ];
  const lines = [headers.map(escCsvCell).join(',')];
  for (const id of meta.post_log_ids) {
    const r = byId.get(String(id));
    if (!r) continue;
    const t = r.created_at
      ? new Date(r.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      : '';
    lines.push(
      [
        t,
        r.poster_name || r.fb_account_name || r.user_id || '',
        r.owner || '',
        r.job_title || '',
        r.group_name || '',
        r.post_link || '',
        r.comment_count != null ? String(r.comment_count) : '0',
        r.customer_phone || '',
      ]
        .map(escCsvCell)
        .join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

async function flushCollectExportCsv(runId) {
  const body = await buildCollectCsvString(runId);
  if (body == null) return;
  const meta = collectExportByRunId.get(runId);
  if (!meta) return;
  const outDir = path.join(meta.projectRoot, 'data', 'collect-exports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${runId}.csv`), body, 'utf8');
}

/**
 * หลัง PATCH collect-result — รีเฟรชไฟล์/เนื้อหา CSV สด
 * @param {string} patchToken
 */
async function onCollectPatchDone(patchToken) {
  const t = String(patchToken || '').trim();
  const runId = collectTokenToRunId.get(t);
  if (!runId) return;
  await flushCollectExportCsv(runId);
}

/**
 * @returns {Promise<string|null>}
 */
async function getLiveCsvBody(runId) {
  const rid = String(runId || '').trim();
  if (!rid || !collectExportByRunId.has(rid)) return null;
  return buildCollectCsvString(rid);
}

/**
 * @param {string} userId
 * @param {string[]} postLogIds
 * @param {{ projectRoot: string, listenPort: number }} opts
 */
async function startCollectCommentsRun(userId, postLogIds, opts) {
  const uid = String(userId || '').trim();
  const ids = (Array.isArray(postLogIds) ? postLogIds : []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!uid || ids.length === 0) {
    const err = new Error('user_id และ post_log_ids จำเป็น');
    err.statusCode = 400;
    throw err;
  }
  if (isCollectRunning(uid)) {
    const err = new Error(`บัญชี ${uid} กำลังรันเก็บ Comment อยู่แล้ว`);
    err.statusCode = 409;
    throw err;
  }

  const user = await db.getUserById(uid);
  if (!user) {
    const err = new Error(`ไม่พบ user ${uid}`);
    err.statusCode = 400;
    throw err;
  }

  const rows = await db.getPostLogsByIdsForUser(ids, uid);
  const found = new Set(rows.map((r) => r.id));
  for (const id of ids) {
    if (!found.has(id)) {
      const err = new Error(`ไม่พบโพสต์ ${id} หรือไม่ใช่ของบัญชีนี้`);
      err.statusCode = 400;
      throw err;
    }
  }
  for (const r of rows) {
    if (!r.post_link || !String(r.post_link).trim()) {
      const err = new Error(`โพสต์ ${r.id} ไม่มีลิงก์`);
      err.statusCode = 400;
      throw err;
    }
  }

  const useHeadedChrome = !hasFacebookSavedSession(opts.projectRoot, user);
  const runId = `collect_${db.generateRunId()}`;
  const patchToken = crypto.randomBytes(24).toString('hex');
  collectTokenToUser.set(patchToken, uid);
  collectTokenToRunId.set(patchToken, runId);
  collectExportByRunId.set(runId, {
    user_id: uid,
    post_log_ids: rows.map((r) => String(r.id)),
    projectRoot: opts.projectRoot,
  });

  const toBangkokDate = (d) => {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  };

  const plan = {
    user_id: uid,
    posts: rows.map((r) => ({
      post_log_id: r.id,
      post_link: String(r.post_link).trim(),
      job_id: r.job_id || '',
      job_title: r.job_title || '',
      owner: r.owner || '',
      company: r.company || '',
      poster_name: r.poster_name || '',
      group_name: r.group_name || '',
      posted_date_bangkok: toBangkokDate(r.created_at),
      created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    })),
  };

  const planPath = path.join(opts.projectRoot, 'data', `.collect-plan-${uid}-${runId}.json`);
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, JSON.stringify(plan), 'utf8');

  const status = {
    running: true,
    paused: false,
    run_id: runId,
    started_at: new Date().toISOString(),
    finished_at: null,
    exit_code: null,
    error: null,
    message: useHeadedChrome
      ? 'กำลังเปิด Chrome (ครั้งแรก / ยังไม่มี session) — ยืนยันตัวตนใน Facebook ถ้ามี'
      : 'กำลังรันเก็บ Comment แบบไม่โชว์หน้าต่าง (พบ session แล้ว)',
    user_id: uid,
    user_name: user.poster_name || user.name || uid,
    total_posts: rows.length,
    use_headed_browser: useHeadedChrome,
  };

  const env = {
    ...process.env,
    FORCE_COLOR: '1',
    RUN_ID: runId,
    RUN_LOG_API_URL: `http://127.0.0.1:${opts.listenPort}`,
    COLLECT_PLAN_PATH: planPath,
    COLLECT_PATCH_TOKEN: patchToken,
    COLLECT_USE_HEADED: useHeadedChrome ? '1' : '0',
  };

  const isWin = process.platform === 'win32';
  const pwArgs = useHeadedChrome
    ? ['playwright', 'test', 'collectComments', '--headed', '--project=GoogleChrome']
    : ['playwright', 'test', 'collectComments', '--project=ChromiumCollect'];

  logger.info('collect_bot.mode', {
    run_id: runId,
    user_id: uid,
    headed: useHeadedChrome,
    session_file: facebookSessionStatePath(opts.projectRoot, user),
  });

  const child = isWin
    ? spawn('cmd.exe', ['/d', '/c', 'npx', ...pwArgs], {
        cwd: opts.projectRoot,
        stdio: 'inherit',
        env,
        shell: false,
        windowsHide: false,
      })
    : spawn('npx', pwArgs, {
        cwd: opts.projectRoot,
        stdio: 'inherit',
        env,
        shell: false,
        windowsHide: false,
      });

  collectRunsByUser.set(uid, { process: child, patchToken, status });
  logger.info('collect_bot.spawn', { shell: isWin ? 'cmd' : 'npx', args: pwArgs.join(' '), run_id: runId, user_id: uid });

  setImmediate(() => {
    flushCollectExportCsv(runId).catch((e) =>
      logger.error('collect_export.initial', { run_id: runId, message: e.message || String(e) })
    );
  });

  child.on('close', (code) => {
    const entry = collectRunsByUser.get(uid);
    if (!entry) return;
    entry.process = null;
    if (entry.patchToken) {
      collectTokenToUser.delete(entry.patchToken);
      collectTokenToRunId.delete(entry.patchToken);
    }
    entry.patchToken = null;
    entry.status = {
      ...entry.status,
      running: false,
      paused: false,
      finished_at: new Date().toISOString(),
      exit_code: typeof code === 'number' ? code : null,
      use_headed_browser: false,
      message: code === 0 ? 'เก็บ Comment เสร็จแล้ว' : `สิ้นสุดการเก็บ Comment (exit code: ${code})`,
    };
    collectRunsByUser.set(uid, entry);
    logger.info('collect_bot.close', { exit_code: code, run_id: runId, user_id: uid });
    flushCollectExportCsv(runId).catch(() => {});
  });

  child.on('error', (err) => {
    const entry = collectRunsByUser.get(uid);
    if (!entry) return;
    entry.process = null;
    if (entry.patchToken) {
      collectTokenToUser.delete(entry.patchToken);
      collectTokenToRunId.delete(entry.patchToken);
    }
    entry.patchToken = null;
    entry.status = {
      ...entry.status,
      running: false,
      paused: false,
      finished_at: new Date().toISOString(),
      error: err.message || String(err),
      message: 'เริ่มเก็บ Comment ไม่สำเร็จ',
      use_headed_browser: false,
    };
    collectRunsByUser.set(uid, entry);
    logger.error('collect_bot.spawn_error', { message: err.message || String(err), user_id: uid });
  });

  return { runId, status: getCollectRunStatus(uid) };
}

async function pauseCollectRun(userId) {
  const uid = String(userId || '').trim();
  const entry = collectRunsByUser.get(uid);
  if (!entry?.process) throw new Error('ไม่พบงานเก็บ Comment ที่กำลังรันของบัญชีนี้');
  if (entry.status?.paused) return statusSnapshotOf(uid);
  await suspendProcess(entry.process.pid);
  entry.status = { ...entry.status, paused: true, message: 'หยุดชั่วคราว (Pause)' };
  collectRunsByUser.set(uid, entry);
  return statusSnapshotOf(uid);
}

async function resumeCollectRun(userId) {
  const uid = String(userId || '').trim();
  const entry = collectRunsByUser.get(uid);
  if (!entry?.process) throw new Error('ไม่พบงานเก็บ Comment ที่กำลังรันของบัญชีนี้');
  if (!entry.status?.paused) return statusSnapshotOf(uid);
  await resumeProcess(entry.process.pid);
  entry.status = { ...entry.status, paused: false, message: 'กลับมาทำงานต่อแล้ว (Resume)' };
  collectRunsByUser.set(uid, entry);
  return statusSnapshotOf(uid);
}

async function cancelCollectRun(userId) {
  const uid = String(userId || '').trim();
  const entry = collectRunsByUser.get(uid);
  if (!entry?.process) throw new Error('ไม่พบงานเก็บ Comment ที่กำลังรันของบัญชีนี้');
  try {
    if (entry.status?.paused) {
      await resumeProcess(entry.process.pid).catch(() => {});
    }
    entry.process.kill();
  } catch {}
  entry.status = {
    ...entry.status,
    running: false,
    paused: false,
    finished_at: new Date().toISOString(),
    exit_code: null,
    message: 'ยกเลิกงานเก็บ Comment แล้ว',
  };
  collectRunsByUser.set(uid, entry);
  return statusSnapshotOf(uid);
}

module.exports = {
  startCollectCommentsRun,
  getCollectRunStatus,
  isCollectRunning,
  isCollectPatchTokenValid,
  pauseCollectRun,
  resumeCollectRun,
  cancelCollectRun,
  updatePostLogFromCollect: (id, commentCount, customerPhone) =>
    db.updatePostLogCollectResult(id, commentCount, customerPhone),
  onCollectPatchDone,
  getLiveCsvBody,
  hasCollectExport: (runId) => collectExportByRunId.has(String(runId || '').trim()),
};
