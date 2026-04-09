/* eslint-disable no-console */
require('dotenv').config();
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

/** ฆ่าโปรเซสลูกทั้งต้นไม้ (Windows: npx/playwright ใต้ cmd) */
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
    console.error('[post-worker] killProcessTree:', e.message || e);
  }
}

const API_BASE = String(process.env.WORKER_API_BASE || '').replace(/\/$/, '');
const TOKEN = String(process.env.POST_WORKER_TOKEN || '').trim();
const INTERVAL_MS = Math.max(2000, Number(process.env.WORKER_POLL_MS) || 5000);
/**
 * งานโพสต์พร้อมกัน = จำนวน Chrome/Playwright ที่เปิดคู่กัน (บัญชีละ 1 งานโดยทั่วไป)
 * ค่าเริ่มต้น 24 / เพดาน 48 — รองรับหลาย Assignments หลายบัญชีพร้อมกัน (ปรับลดถ้า RAM ไม่พอ)
 * WORKER_CONCURRENCY_MAX จำกัดเพดานสูงสุดในโค้ดที่ 96
 * บัญชีเดียวแต่เจอ session เพี้ยน: ตั้ง WORKER_CONCURRENCY=1
 */
const CONCURRENCY_MAX = Math.min(96, Math.max(1, Number(process.env.WORKER_CONCURRENCY_MAX) || 48));
const CONCURRENCY = Math.min(
  CONCURRENCY_MAX,
  Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 24)
);
const PROJECT_ROOT = process.cwd();

if (!API_BASE) {
  console.error('[post-worker] missing WORKER_API_BASE (example: https://soworkautopost.vercel.app)');
  process.exit(1);
}
if (!TOKEN) {
  console.error('[post-worker] missing POST_WORKER_TOKEN');
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

/** งานโพสต์หนึ่งงานนานได้ — ค่า default 4 ชม.; เกินแล้วฆ่า Playwright เพื่อคืนช่อง concurrency */
const JOB_MAX_MS = Math.min(
  12 * 60 * 60 * 1000,
  Math.max(10 * 60 * 1000, Number(process.env.WORKER_POST_JOB_MAX_MS) || 4 * 60 * 60 * 1000)
);

function runPlaywrightForJob(job) {
  return new Promise((resolve, reject) => {
    const assignmentIds = Array.isArray(job.assignment_ids) ? job.assignment_ids.map(String).filter(Boolean) : [];
    const env = { ...process.env, FORCE_COLOR: '1', RUN_ID: String(job.run_id || ''), RUN_LOG_API_URL: API_BASE };
    if (assignmentIds.length > 0) env.ASSIGNMENT_IDS = assignmentIds.join(',');
    const args = ['playwright', 'test', 'postAll', '--headed', '--project=Google Chrome'];
    const isWin = process.platform === 'win32';
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
      console.error(`[post-worker] job ${job.id} timeout ${JOB_MAX_MS}ms — killing Chrome/playwright`);
      killProcessTree(child);
      reject(new Error(`WORKER_POST_JOB_MAX_MS exceeded (${JOB_MAX_MS}ms) — killed to free slot`));
    }, JOB_MAX_MS);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`post worker exit code ${code}`));
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function processJob(job) {
  activeJobs += 1;
  console.log(
    `[post-worker] picked job ${job.id} run_id=${job.run_id || '-'} assignments=${(job.assignment_ids || []).length} active=${activeJobs}/${CONCURRENCY}`
  );
  try {
    try {
      await runPlaywrightForJob(job);
      await callApi('/api/worker/post/complete', {
        job_id: job.id,
        run_id: job.run_id,
        ok: true,
        message: 'Worker run completed',
      });
      console.log(`[post-worker] job ${job.id} completed`);
    } catch (e) {
      await callApi('/api/worker/post/complete', {
        job_id: job.id,
        run_id: job.run_id,
        ok: false,
        message: 'Worker run failed',
        error: e.message || String(e),
      });
      console.error(`[post-worker] job ${job.id} failed: ${e.message || e}`);
    }
  } catch (e) {
    console.error(`[post-worker] process job error: ${e.message || e}`);
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
      const claimed = await callApi('/api/worker/post/claim', { worker_id: workerId });
      const job = claimed?.job || null;
      if (!job) break;
      processJob(job).catch((e) => {
        console.error(`[post-worker] unhandled process job error: ${e.message || e}`);
      });
    }
  } catch (e) {
    console.error(`[post-worker] tick error: ${e.message || e}`);
  } finally {
    claiming = false;
  }
}

console.log('[post-worker] started');
console.log(`[post-worker] api=${API_BASE}`);
console.log(`[post-worker] worker_id=${workerId}`);
console.log(`[post-worker] concurrency=${CONCURRENCY} (max cap ${CONCURRENCY_MAX})`);
if (CONCURRENCY >= 20) {
  console.warn(
    '[post-worker] เตือน: Chrome หลายตัวกิน RAM มาก — ถ้าเครื่องค้างให้ลด WORKER_CONCURRENCY หรือแบ่งรันหลายเครื่อง worker'
  );
}
console.log(`[post-worker] job max duration ${Math.round(JOB_MAX_MS / 60000)} min (WORKER_POST_JOB_MAX_MS)`);

/** ล้างงาน running ค้างใน DB (worker crash / ไม่เรียก complete) */
const SWEEP_MS = Math.max(60_000, Number(process.env.WORKER_SWEEP_INTERVAL_MS) || 120_000);
async function sweepStale() {
  try {
    const maxMin = Math.min(24 * 60, Math.max(15, Number(process.env.POST_RUN_STALE_MINUTES) || 180));
    const out = await callApi('/api/worker/post/sweep-stale', { max_age_minutes: maxMin });
    if (out.failed_stale_count > 0) {
      console.warn(`[post-worker] sweep-stale: ปิดงานค้าง ${out.failed_stale_count} รายการ (running > ${maxMin} min)`);
    }
  } catch (e) {
    console.error(`[post-worker] sweep-stale: ${e.message || e}`);
  }
}
setInterval(sweepStale, SWEEP_MS);
sweepStale();

/** รายงานว่ายังมีงานรันอยู่ — กันคิดว่า worker ค้างเงียบๆ */
const HEARTBEAT_MS = Math.max(30_000, Number(process.env.WORKER_HEARTBEAT_MS) || 60_000);
setInterval(() => {
  if (activeJobs <= 0) return;
  console.log(`[post-worker] heartbeat activeJobs=${activeJobs}/${CONCURRENCY} (ยังโพสต์อยู่)`);
}, HEARTBEAT_MS);

setInterval(tick, INTERVAL_MS);
tick();

