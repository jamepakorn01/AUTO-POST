/**
 * One-off patch: date range API, ensureUsersContactPhoneColumn, exports.
 * Run: node scripts/patch-comment-collect.js
 */
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../server/db.js');
let s = fs.readFileSync(dbPath, 'utf8');

const oldFn = `/**
 * โพสต์สำหรับหน้า «เก็บ Comment»: วันที่ตามเขตไทย + บัญชีที่โพสต์ต้องตรง + มีลิงก์โพสต์
 */
async function getPostLogsForCommentCollect(opts = {}) {
  const dateStr = String(opts.date || '').trim();
  const userId = String(opts.user_id || '').trim();
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateStr)) {
    throw new Error('รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD');
  }
  if (!userId) {
    throw new Error('ต้องระบุ user_id (บัญชีที่โพสต์)');
  }
  const limit = Math.min(Math.max(parseInt(String(opts.limit), 10) || 500, 1), 2000);
  const sql = \`
    SELECT
      pl.id,
      pl.created_at,
      pl.run_id,
      pl.assignment_id,
      pl.user_id,
      pl.job_id,
      pl.group_id,
      pl.poster_name,
      pl.owner,
      pl.job_title,
      pl.company,
      pl.group_name,
      pl.member_count,
      pl.post_link,
      pl.post_status,
      pl.comment_count,
      pl.customer_phone,
      u.name AS fb_account_name,
      u.email AS fb_account_email
    FROM post_logs pl
    LEFT JOIN users u ON u.id = pl.user_id
    WHERE (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date = $1::date
      AND pl.user_id = $2
      AND pl.post_link IS NOT NULL
      AND TRIM(pl.post_link) <> ''
    ORDER BY pl.created_at ASC
    LIMIT $3
  \`;
  const { rows } = await query(sql, [dateStr, userId, limit]);
  return rows;
}`;

const newFn = `/**
 * โพสต์สำหรับหน้า «เก็บ Comment»: ช่วงวันที่ (เขตไทย) + บัญชีที่โพสต์ต้องตรง + มีลิงก์โพสต์
 * รองรับ start_date/end_date หรือ date เดียว (เดิม)
 */
async function getPostLogsForCommentCollect(opts = {}) {
  let startStr = String(opts.start_date || opts.date || '').trim();
  let endStr = String(opts.end_date || opts.date || '').trim();
  if (startStr && !endStr) endStr = startStr;
  if (!startStr && endStr) startStr = endStr;
  const userId = String(opts.user_id || '').trim();
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(startStr) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(endStr)) {
    throw new Error('รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD (start_date / end_date หรือ date)');
  }
  if (startStr > endStr) {
    throw new Error('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
  }
  if (!userId) {
    throw new Error('ต้องระบุ user_id (บัญชีที่โพสต์)');
  }
  const limit = Math.min(Math.max(parseInt(String(opts.limit), 10) || 500, 1), 2000);
  const sql = \`
    SELECT
      pl.id,
      pl.created_at,
      pl.run_id,
      pl.assignment_id,
      pl.user_id,
      pl.job_id,
      pl.group_id,
      pl.poster_name,
      pl.owner,
      pl.job_title,
      pl.company,
      pl.group_name,
      pl.member_count,
      pl.post_link,
      pl.post_status,
      pl.comment_count,
      pl.customer_phone,
      u.name AS fb_account_name,
      u.email AS fb_account_email
    FROM post_logs pl
    LEFT JOIN users u ON u.id = pl.user_id
    WHERE (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
      AND pl.user_id = $3
      AND pl.post_link IS NOT NULL
      AND TRIM(pl.post_link) <> ''
    ORDER BY pl.created_at ASC
    LIMIT $4
  \`;
  const { rows } = await query(sql, [startStr, endStr, userId, limit]);
  return rows;
}`;

if (!s.includes('WHERE (pl.created_at AT TIME ZONE')) {
  console.error('unexpected db.js');
  process.exit(1);
}
if (s.includes('BETWEEN $1::date AND $2::date')) {
  console.log('getPostLogsForCommentCollect already patched');
} else if (s.includes(oldFn.slice(0, 120))) {
  s = s.replace(oldFn, newFn);
  fs.writeFileSync(dbPath, s);
  console.log('patched getPostLogsForCommentCollect');
} else {
  const marker = 'async function getPostLogsForCommentCollect(opts = {}) {';
  const i = s.indexOf(marker);
  if (i < 0) {
    console.error('function not found');
    process.exit(1);
  }
  console.error('oldFn exact match failed; edit manually');
  process.exit(1);
}

s = fs.readFileSync(dbPath, 'utf8');
if (!s.includes('ensureUsersContactPhoneColumn')) {
  s = s.replace(
    `async function ensurePostLogsGroupNameText() {
  const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';
  const schemaName = SCHEMA.includes('-') ? \`"\${SCHEMA}"\` : SCHEMA;
  await query(\`ALTER TABLE \${schemaName}.post_logs ALTER COLUMN group_name TYPE TEXT\`).catch(() => {});
}

async function initSchema()`,
    `async function ensurePostLogsGroupNameText() {
  const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';
  const schemaName = SCHEMA.includes('-') ? \`"\${SCHEMA}"\` : SCHEMA;
  await query(\`ALTER TABLE \${schemaName}.post_logs ALTER COLUMN group_name TYPE TEXT\`).catch(() => {});
}

/** เพิ่ม users.contact_phone สำหรับ DB เดิมที่ยังไม่มีคอลัมน์ */
async function ensureUsersContactPhoneColumn() {
  const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';
  const schemaName = SCHEMA.includes('-') ? \`"\${SCHEMA}"\` : SCHEMA;
  await query(\`ALTER TABLE \${schemaName}.users ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(64)\`).catch(() => {});
}

async function initSchema()`
  );
  s = s.replace(
    `  await ensurePostLogsGroupNameText();
}

/** Health check: DB reachable */`,
    `  await ensurePostLogsGroupNameText();
  await ensureUsersContactPhoneColumn();
}

/** Health check: DB reachable */`
  );
  s = s.replace(
    `  initSchema,
  ensurePostLogsGroupNameText,
};`,
    `  initSchema,
  ensurePostLogsGroupNameText,
  ensureUsersContactPhoneColumn,
};`
  );
  fs.writeFileSync(dbPath, s);
  console.log('patched ensureUsersContactPhoneColumn + initSchema + exports');
}
