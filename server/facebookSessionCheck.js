/**
 * เปิด Chrome (headed) เพื่อล็อกอิน Facebook และบันทึก storage state ลง .auth
 * ใช้ sessionKey เดียวกับ facebookLogin.ts / postAll
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('./db');
const logger = require('./logger');

/** @type {Map<string, { process: import('child_process').ChildProcess | null, status: object }>} */
const checkRunsByUser = new Map();

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

function userCredentials(user) {
  const base = `USER_${String(user.env_key || user.id).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
  const email = String(user.email || process.env[`${base}_EMAIL`] || '').trim();
  const password = String(user.password || process.env[`${base}_PASSWORD`] || '').trim();
  return { email, password };
}

function snapshotStatus(uid) {
  const entry = checkRunsByUser.get(uid);
  if (!entry) {
    return {
      running: false,
      message: 'ยังไม่เคยรันเช็ค Session ในรอบนี้',
      started_at: null,
      finished_at: null,
      exit_code: null,
    };
  }
  return {
    ...entry.status,
    running: !!entry.process,
  };
}

/**
 * @param {string} userId
 * @param {{ projectRoot: string }} opts
 */
async function startCheckSession(userId, opts) {
  const uid = String(userId || '').trim();
  if (!uid) {
    const err = new Error('user id ไม่ถูกต้อง');
    err.statusCode = 400;
    throw err;
  }
  const existing = checkRunsByUser.get(uid);
  if (existing?.process) {
    const err = new Error('บัญชีนี้กำลังเช็ค Session อยู่แล้ว — ดูหน้าต่าง Chrome');
    err.statusCode = 409;
    throw err;
  }

  const user = await db.getUserById(uid);
  if (!user) {
    const err = new Error('ไม่พบ User');
    err.statusCode = 404;
    throw err;
  }

  const { email, password } = userCredentials(user);
  if (!email || !password) {
    const err = new Error(
      'ไม่มี Email/Password สำหรับบัญชีนี้ (กรอกในแก้ไข User หรือตั้ง USER_{env_key}_EMAIL / _PASSWORD ใน .env)'
    );
    err.statusCode = 400;
    throw err;
  }

  /** ต้องตรงกับ postAll.spec.ts → facebookLogin(..., { sessionKey }) เพื่อให้ไฟล์ .auth ตัวเดียวกัน */
  const sessionKey = String(user.env_key || user.id || user.email || email || 'default');
  const userLabel = String(user.name || user.poster_name || uid).trim() || uid;

  const env = {
    ...process.env,
    FORCE_COLOR: '1',
    CHECK_SESSION_EMAIL: email,
    CHECK_SESSION_PASSWORD: password,
    CHECK_SESSION_KEY: sessionKey,
    CHECK_SESSION_LABEL: userLabel,
  };

  const pwArgs = ['playwright', 'test', 'checkFacebookSession', '--headed', '--project=GoogleChrome'];
  const isWin = process.platform === 'win32';
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

  const status = {
    running: true,
    message: 'กำลังเปิด Chrome — ล็อกอิน/ยืนยันตัวตนถ้ามี แล้วรอจน Facebook พร้อม (session จะถูกบันทึกอัตโนมัติ)',
    started_at: new Date().toISOString(),
    finished_at: null,
    exit_code: null,
    user_id: uid,
    session_file: path.basename(facebookSessionStatePath(opts.projectRoot, user)),
  };

  checkRunsByUser.set(uid, { process: child, status });
  logger.info('session_check.spawn', { user_id: uid, shell: isWin ? 'cmd' : 'npx', args: pwArgs.join(' ') });

  child.on('close', (code) => {
    const entry = checkRunsByUser.get(uid);
    if (!entry) return;
    entry.process = null;
    entry.status = {
      ...entry.status,
      running: false,
      finished_at: new Date().toISOString(),
      exit_code: typeof code === 'number' ? code : null,
      message:
        code === 0
          ? 'เช็ค Session เสร็จแล้ว — สามารถรันโพสต์ได้ (ถ้า Playwright รายงานสำเร็จ)'
          : `เช็ค Session จบด้วย exit code ${code} — ดูข้อความใน Terminal`,
    };
    checkRunsByUser.set(uid, entry);
    logger.info('session_check.close', { user_id: uid, exit_code: code });
  });

  child.on('error', (err) => {
    const entry = checkRunsByUser.get(uid);
    if (!entry) return;
    entry.process = null;
    entry.status = {
      ...entry.status,
      running: false,
      finished_at: new Date().toISOString(),
      error: err.message || String(err),
      message: 'เริ่ม Playwright ไม่สำเร็จ',
    };
    checkRunsByUser.set(uid, entry);
    logger.error('session_check.spawn_error', { user_id: uid, message: err.message || String(err) });
  });

  return { status: snapshotStatus(uid) };
}

function getCheckSessionStatus(userId) {
  return snapshotStatus(String(userId || '').trim());
}

module.exports = {
  startCheckSession,
  getCheckSessionStatus,
  hasFacebookSavedSessionForUser: (projectRoot, user) => hasFacebookSavedSession(projectRoot, user),
  facebookSessionStatePath,
};
