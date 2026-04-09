/* eslint-disable no-console */
require('dotenv').config();
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const API_BASE = String(process.env.WORKER_API_BASE || '').replace(/\/$/, '');
const TOKEN = String(process.env.POST_WORKER_TOKEN || '').trim();
const INTERVAL_MS = Math.max(2000, Number(process.env.WORKER_POLL_MS) || 5000);
/**
 * จำนวนงานโพสต์ที่รันพร้อมกัน (แต่ละงาน = Chrome คนละหน้าต่าง / บัญชีละโปรเซส)
 * ค่าเริ่มต้น 2 — ให้กด Assignment คนละบัญชีแล้วเริ่มได้พร้อมกัน (ไม่ต้องรอคิวจบงานแรก)
 * ถ้าโพสต์แค่บัญชีเดียวและเจอ session เพี้ยน/Chrome ปิดเอง ให้ตั้ง WORKER_CONCURRENCY=1 ใน .env
 */
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 2);
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
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`post worker exit code ${code}`));
    });
    child.on('error', (err) => reject(err));
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
console.log(`[post-worker] concurrency=${CONCURRENCY}`);
setInterval(tick, INTERVAL_MS);
tick();

