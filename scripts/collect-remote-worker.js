/* eslint-disable no-console */
require('dotenv').config();
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore',
        detached: true,
      }).unref();
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  } catch (e) {
    console.error('[collect-worker] killProcessTree:', e.message || e);
  }
}

const API_BASE = String(process.env.WORKER_API_BASE || '').replace(/\/$/, '');
const TOKEN = String(process.env.POST_WORKER_TOKEN || '').trim();
const INTERVAL_MS = Math.max(2000, Number(process.env.WORKER_POLL_MS) || 5000);
const CONCURRENCY = Math.min(16, Math.max(1, Number(process.env.WORKER_COLLECT_CONCURRENCY) || 4));
const PROJECT_ROOT = process.cwd();
const JOB_MAX_MS = Math.min(
  12 * 60 * 60 * 1000,
  Math.max(10 * 60 * 1000, Number(process.env.WORKER_COLLECT_JOB_MAX_MS) || 6 * 60 * 60 * 1000)
);
const AUTO_COLLECT_ENABLED = process.env.AUTO_COLLECT_ENABLED === '1';
const AUTO_COLLECT_TZ = String(process.env.AUTO_COLLECT_TZ || 'Asia/Bangkok').trim() || 'Asia/Bangkok';
const AUTO_COLLECT_HOUR = Math.min(23, Math.max(0, Number(process.env.AUTO_COLLECT_HOUR) || 7));
const AUTO_COLLECT_MINUTE = Math.min(59, Math.max(0, Number(process.env.AUTO_COLLECT_MINUTE) || 15));
const AUTO_COLLECT_STATE_PATH = path.join(PROJECT_ROOT, 'data', '.collect-auto-last-date.txt');

if (!API_BASE) {
  console.error('[collect-worker] missing WORKER_API_BASE');
  process.exit(1);
}
if (!TOKEN) {
  console.error('[collect-worker] missing POST_WORKER_TOKEN');
  process.exit(1);
}

const workerId = `${os.hostname()}-${process.pid}`;
let activeJobs = 0;
let claiming = false;

async function callApi(pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-token': TOKEN,
      'x-worker-id': workerId,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${pathname} ${res.status}`);
  return data;
}

function formatDateByTz(d, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value || '0000';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const dd = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${dd}`;
}

function getNowInTz(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value || 0);
  const month = Number(parts.find((p) => p.type === 'month')?.value || 1);
  const day = Number(parts.find((p) => p.type === 'day')?.value || 1);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return { year, month, day, hour, minute, dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

function getYesterdayByTz(timeZone) {
  const now = new Date();
  const dateStr = formatDateByTz(now, timeZone);
  const [y, m, d] = dateStr.split('-').map((x) => Number(x));
  const utcMid = new Date(Date.UTC(y, m - 1, d));
  utcMid.setUTCDate(utcMid.getUTCDate() - 1);
  return formatDateByTz(utcMid, 'UTC');
}

function readLastAutoCollectDate() {
  try {
    if (!fs.existsSync(AUTO_COLLECT_STATE_PATH)) return '';
    return String(fs.readFileSync(AUTO_COLLECT_STATE_PATH, 'utf8') || '').trim();
  } catch {
    return '';
  }
}

function saveLastAutoCollectDate(dateStr) {
  try {
    fs.mkdirSync(path.dirname(AUTO_COLLECT_STATE_PATH), { recursive: true });
    fs.writeFileSync(AUTO_COLLECT_STATE_PATH, String(dateStr || '').trim(), 'utf8');
  } catch (e) {
    console.error('[collect-worker] save auto state failed:', e.message || e);
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${url} ${res.status}`);
  return data;
}

async function enqueueDailyCollectForYesterday() {
  const yesterday = getYesterdayByTz(AUTO_COLLECT_TZ);
  console.log(`[collect-worker] auto-daily: preparing jobs for ${yesterday} (${AUTO_COLLECT_TZ})`);
  const users = await fetchJson(`${API_BASE}/api/users`);
  const runs = [];
  for (const u of Array.isArray(users) ? users : []) {
    const uid = String(u?.id || '').trim();
    if (!uid) continue;
    try {
      const q =
        `${API_BASE}/api/post-logs/for-comment-collect` +
        `?start_date=${encodeURIComponent(yesterday)}` +
        `&end_date=${encodeURIComponent(yesterday)}` +
        `&user_id=${encodeURIComponent(uid)}` +
        `&limit=2000`;
      const out = await fetchJson(q);
      const rows = Array.isArray(out?.rows) ? out.rows : [];
      const post_log_ids = rows
        .map((r) => String(r?.id || '').trim())
        .filter(Boolean);
      if (post_log_ids.length > 0) {
        runs.push({ user_id: uid, post_log_ids });
      }
    } catch (e) {
      console.error(`[collect-worker] auto-daily: skip user ${uid}: ${e.message || e}`);
    }
  }
  if (runs.length === 0) {
    console.log('[collect-worker] auto-daily: no posts from yesterday to collect');
    return { queuedUsers: 0, queuedPosts: 0, date: yesterday };
  }
  const res = await fetch(`${API_BASE}/api/run/collect-comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runs }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || (Array.isArray(data?.errors) && data.errors[0]?.error) || 'enqueue daily collect failed');
  }
  const queuedPosts = runs.reduce((s, r) => s + (Array.isArray(r.post_log_ids) ? r.post_log_ids.length : 0), 0);
  console.log(`[collect-worker] auto-daily: queued ${queuedPosts} posts across ${runs.length} users`);
  return { queuedUsers: runs.length, queuedPosts, date: yesterday };
}

let autoCollectRunning = false;
async function tickAutoDailySchedule() {
  if (!AUTO_COLLECT_ENABLED) return;
  if (autoCollectRunning) return;
  const now = getNowInTz(AUTO_COLLECT_TZ);
  const due = now.hour > AUTO_COLLECT_HOUR || (now.hour === AUTO_COLLECT_HOUR && now.minute >= AUTO_COLLECT_MINUTE);
  if (!due) return;
  const last = readLastAutoCollectDate();
  if (last === now.dateStr) return;
  autoCollectRunning = true;
  try {
    await enqueueDailyCollectForYesterday();
    saveLastAutoCollectDate(now.dateStr);
  } catch (e) {
    console.error('[collect-worker] auto-daily failed:', e.message || e);
  } finally {
    autoCollectRunning = false;
  }
}

async function runPlaywrightForJob(job) {
  const tmpDir = path.join(PROJECT_ROOT, 'data');
  fs.mkdirSync(tmpDir, { recursive: true });
  const planPath = path.join(tmpDir, `.collect-worker-plan-${job.id}-${Date.now()}.json`);
  const plan = {
    user_id: String(job.user_id || ''),
    posts: Array.isArray(job.posts) ? job.posts : [],
  };
  fs.writeFileSync(planPath, JSON.stringify(plan), 'utf8');

  const forceHeaded = process.env.COLLECT_FORCE_HEADED === '1';
  const args = forceHeaded
    ? ['playwright', 'test', 'collectComments', '--headed', '--project=GoogleChrome']
    : ['playwright', 'test', 'collectComments', '--project=ChromiumCollect'];
  const env = {
    ...process.env,
    FORCE_COLOR: '1',
    RUN_ID: String(job.run_id || ''),
    RUN_LOG_API_URL: API_BASE,
    COLLECT_PLAN_PATH: planPath,
    COLLECT_WORKER_TOKEN: TOKEN,
    COLLECT_USE_HEADED: forceHeaded ? '1' : '0',
  };
  const isWin = process.platform === 'win32';
  return await new Promise((resolve, reject) => {
    const child = isWin
      ? spawn('cmd.exe', ['/d', '/c', 'npx', ...args], {
          cwd: PROJECT_ROOT,
          stdio: 'inherit',
          env,
          shell: false,
          windowsHide: false,
        })
      : spawn('npx', args, {
          cwd: PROJECT_ROOT,
          stdio: 'inherit',
          env,
          shell: false,
          windowsHide: false,
        });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killProcessTree(child);
      reject(new Error(`WORKER_COLLECT_JOB_MAX_MS exceeded (${JOB_MAX_MS}ms)`));
    }, JOB_MAX_MS);

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        fs.unlinkSync(planPath);
      } catch {}
      if (err) reject(err);
      else resolve();
    };
    child.on('close', (code) => finish(code === 0 ? null : new Error(`collect worker exit code ${code}`)));
    child.on('error', finish);
  });
}

async function processJob(job) {
  activeJobs += 1;
  console.log(
    `[collect-worker] picked job ${job.id} run_id=${job.run_id || '-'} user=${job.user_id || '-'} posts=${(job.post_log_ids || []).length} active=${activeJobs}/${CONCURRENCY}`
  );
  try {
    try {
      await runPlaywrightForJob(job);
      await callApi('/api/worker/collect/complete', {
        job_id: job.id,
        run_id: job.run_id,
        ok: true,
        message: 'Collect worker run completed',
      });
      console.log(`[collect-worker] job ${job.id} completed`);
    } catch (e) {
      await callApi('/api/worker/collect/complete', {
        job_id: job.id,
        run_id: job.run_id,
        ok: false,
        message: 'Collect worker run failed',
        error: e.message || String(e),
      });
      console.error(`[collect-worker] job ${job.id} failed: ${e.message || e}`);
    }
  } catch (e) {
    console.error(`[collect-worker] process job error: ${e.message || e}`);
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

async function tick() {
  if (claiming) return;
  if (activeJobs >= CONCURRENCY) return;
  claiming = true;
  try {
    while (activeJobs < CONCURRENCY) {
      const claimed = await callApi('/api/worker/collect/claim', { worker_id: workerId });
      const job = claimed?.job || null;
      if (!job) break;
      processJob(job).catch((e) => console.error(`[collect-worker] unhandled process job error: ${e.message || e}`));
    }
  } catch (e) {
    console.error(`[collect-worker] tick error: ${e.message || e}`);
  } finally {
    claiming = false;
  }
}

const SWEEP_MS = Math.max(60_000, Number(process.env.WORKER_SWEEP_INTERVAL_MS) || 120_000);
async function sweepStale() {
  try {
    const maxMin = Math.min(24 * 60, Math.max(15, Number(process.env.COLLECT_RUN_STALE_MINUTES) || 180));
    const out = await callApi('/api/worker/collect/sweep-stale', { max_age_minutes: maxMin });
    if (out.failed_stale_count > 0) {
      console.warn(`[collect-worker] sweep-stale: ปิดงานค้าง ${out.failed_stale_count} รายการ (running > ${maxMin} min)`);
    }
  } catch (e) {
    console.error(`[collect-worker] sweep-stale: ${e.message || e}`);
  }
}

console.log('[collect-worker] started');
console.log(`[collect-worker] api=${API_BASE}`);
console.log(`[collect-worker] worker_id=${workerId}`);
console.log(`[collect-worker] concurrency=${CONCURRENCY}`);
console.log(`[collect-worker] job max duration ${Math.round(JOB_MAX_MS / 60000)} min (WORKER_COLLECT_JOB_MAX_MS)`);
if (AUTO_COLLECT_ENABLED) {
  console.log(
    `[collect-worker] auto-daily enabled at ${String(AUTO_COLLECT_HOUR).padStart(2, '0')}:${String(AUTO_COLLECT_MINUTE).padStart(2, '0')} (${AUTO_COLLECT_TZ})`
  );
}
setInterval(sweepStale, SWEEP_MS);
sweepStale();
setInterval(tick, INTERVAL_MS);
tick();
setInterval(tickAutoDailySchedule, 60_000);
tickAutoDailySchedule();
