/* eslint-disable no-console */
const db = require('../server/db');

const DEFAULT_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/14OfTs-euDUX9gXDD9tgfseLJGY0DitXFk5atEu6PAmg/export?format=csv&gid=443076440';

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((x) => String(x || '').trim());
  return lines.map(parseCsvLine);
}

function parseThaiDateTimeToIso(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const hh = Number(m[4]);
  const mi = Number(m[5]);
  const ss = Number(m[6] || '0');
  if (!dd || !mm || !yyyy) return null;
  // Bangkok = UTC+7
  const utcMs = Date.UTC(yyyy, mm - 1, dd, hh - 7, mi, ss);
  return new Date(utcMs).toISOString();
}

function normalizeDigits(v) {
  const n = parseInt(String(v || '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function monthKeyBangkok(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7);
}

async function main() {
  const csvUrl = process.env.SHEET_CSV_URL || DEFAULT_SHEET_CSV_URL;
  const nowMonth = process.env.IMPORT_MONTH || monthKeyBangkok(new Date());
  const runId = `sheet_import_${nowMonth.replace('-', '')}`;

  console.log('[import-sheet] csv:', csvUrl);
  console.log('[import-sheet] month:', nowMonth);

  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`โหลด CSV ไม่สำเร็จ: ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length <= 1) throw new Error('CSV ไม่มีข้อมูล');

  const users = await db.getUsers();
  const userByName = new Map();
  for (const u of users) {
    const keys = [u.poster_name, u.name, u.email].map((x) => String(x || '').trim()).filter(Boolean);
    for (const k of keys) userByName.set(k.toLowerCase(), u);
  }

  const existing = await db.query(
    `SELECT user_id, post_link
     FROM post_logs
     WHERE TO_CHAR((created_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') = $1`,
    [nowMonth]
  );
  const existingKey = new Set(
    (existing.rows || []).map((r) => `${String(r.user_id || '')}||${String(r.post_link || '').trim()}`)
  );

  let inserted = 0;
  let skipped = 0;
  let unmapped = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const c = rows[i];
    if (!c || c.length < 9) continue;
    const createdIso = parseThaiDateTimeToIso(c[0]);
    if (!createdIso) {
      skipped += 1;
      continue;
    }
    if (monthKeyBangkok(createdIso) !== nowMonth) continue;

    const posterName = String(c[1] || '').trim();
    const owner = String(c[2] || '').trim();
    const jobTitle = String(c[3] || '').trim();
    const company = String(c[4] || '').trim();
    const groupName = String(c[5] || '').trim();
    const memberCount = String(c[6] || '0').trim();
    const postLink = String(c[7] || '').trim();
    const postStatus = String(c[8] || '').trim() || 'ไม่ระบุ';
    const commentCount = normalizeDigits(c[9] || 0);
    const customerPhone = String(c[10] || '').trim();

    if (!posterName || !jobTitle || !postLink) {
      skipped += 1;
      continue;
    }
    const u = userByName.get(posterName.toLowerCase());
    if (!u) {
      unmapped += 1;
      continue;
    }
    const k = `${String(u.id)}||${postLink}`;
    if (existingKey.has(k)) {
      skipped += 1;
      continue;
    }

    await db.query(
      `INSERT INTO post_logs (
        id, run_id, assignment_id, user_id, job_id, group_id,
        poster_name, owner, job_title, company, group_name, member_count,
        post_link, post_status, comment_count, customer_phone, created_at
      ) VALUES (
        $1,$2,NULL,$3,NULL,NULL,
        $4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14::timestamptz
      )`,
      [
        db.generateId(),
        runId,
        u.id,
        posterName,
        owner || null,
        jobTitle,
        company || null,
        groupName || null,
        memberCount || '0',
        postLink,
        postStatus,
        Math.max(0, commentCount),
        customerPhone || null,
        createdIso,
      ]
    );
    existingKey.add(k);
    inserted += 1;
  }

  console.log(`[import-sheet] done: inserted=${inserted} skipped=${skipped} unmapped_user=${unmapped}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[import-sheet] error:', e.message || e);
    process.exit(1);
  });

