/* eslint-disable no-console */
/**
 * มอนิเตอร์คิวโพสต์บนเซิร์ฟเวอร์ — รันแยกเทอร์มินัลคู่กับ worker:post
 * เตือนเมื่อมีคิวแต่ไม่มี running นานหลายรอบ (worker อาจหยุด / ไม่รับงาน)
 */
require('dotenv').config();

const API_BASE = String(process.env.WORKER_API_BASE || '').replace(/\/$/, '');
const TOKEN = String(process.env.POST_WORKER_TOKEN || '').trim();
const POLL_MS = Math.max(15_000, Number(process.env.WORKER_WATCH_POLL_MS) || 45_000);
const STALE_MIN = Math.min(24 * 60, Math.max(15, Number(process.env.POST_RUN_STALE_MINUTES) || 180));
/** กี่รอบติดกันที่ queued>0 แต่ running=0 ถึงจะเตือน */
const IDLE_WARN_ROUNDS = Math.max(3, Number(process.env.WORKER_WATCH_IDLE_ROUNDS) || 5);

if (!API_BASE || !TOKEN) {
  console.error('[queue-watch] ต้องตั้ง WORKER_API_BASE และ POST_WORKER_TOKEN ใน .env');
  process.exit(1);
}

let idleQueuedRounds = 0;

async function poll() {
  const url = `${API_BASE}/api/worker/post/queue-status?stale_after_minutes=${STALE_MIN}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-worker-token': TOKEN, 'x-worker-id': `watch-${process.pid}` },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[queue-watch] ${res.status} ${j.error || res.statusText}`);
    return;
  }
  const ts = new Date().toISOString();
  const q = Number(j.queued) || 0;
  const r = Number(j.running) || 0;
  const st = Number(j.stale_running) || 0;
  console.log(`[queue-watch] ${ts} queued=${q} running=${r} stale_running(>${STALE_MIN}m)=${st}`);

  if (st > 0) {
    console.warn(`[queue-watch] ⚠ มีงาน running ค้างเกิน ${STALE_MIN} นาที ${st} รายการ — worker จะ sweep หรือรอ sweep-stale`);
  }

  if (q > 0 && r === 0) {
    idleQueuedRounds += 1;
    if (idleQueuedRounds >= IDLE_WARN_ROUNDS) {
      console.warn(
        `[queue-watch] ⚠ มีคิว ${q} แต่ running=0 ครบ ${idleQueuedRounds} รอบ — ตรวจสอบว่ารัน npm run worker:post อยู่หรือไม่ / token ถูกต้องหรือไม่`
      );
    }
  } else {
    idleQueuedRounds = 0;
  }
}

console.log('[queue-watch] started poll every', POLL_MS, 'ms →', API_BASE);
setInterval(() => poll().catch((e) => console.error('[queue-watch]', e.message || e)), POLL_MS);
poll().catch((e) => console.error('[queue-watch]', e.message || e));
