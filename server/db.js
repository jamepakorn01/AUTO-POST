/**
 * AUTO-POST Database Layer - PostgreSQL
 */
require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';
const ASSIGNMENTS_TABLE = SCHEMA.includes('-') ? `"${SCHEMA}".assignments` : `${SCHEMA}.assignments`;

let pool = null;

function getPool() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL ไม่ได้ตั้งค่าใน .env');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    });
    pool.on('error', (err) => {
      console.error('[db] pool idle client error:', err?.message || err);
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    const schemaName = SCHEMA.includes('-') ? `"${SCHEMA}"` : SCHEMA;
    await client.query(`SET search_path TO ${schemaName}`);
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// --- Job Owners ---
async function ensureJobOwnersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS job_owners (
      name VARCHAR(255) PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getJobOwners() {
  await ensureJobOwnersTable();
  const { rows } = await query('SELECT name FROM job_owners ORDER BY name');
  return rows;
}

async function addJobOwner(name) {
  const ownerName = String(name || '').trim();
  if (!ownerName) throw new Error('name is required');
  await ensureJobOwnersTable();
  const { rows } = await query(
    `INSERT INTO job_owners (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING name`,
    [ownerName]
  );
  return rows[0];
}

async function deleteJobOwner(name) {
  const ownerName = String(name || '').trim();
  if (!ownerName) return false;
  await ensureJobOwnersTable();
  const { rowCount } = await query('DELETE FROM job_owners WHERE name = $1', [ownerName]);
  return rowCount > 0;
}

// --- Job Positions ---
async function ensureJobPositionsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS job_positions (
      name VARCHAR(255) PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getJobPositions() {
  await ensureJobPositionsTable();
  const { rows } = await query('SELECT name FROM job_positions ORDER BY name');
  return rows;
}

async function addJobPosition(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('name is required');
  await ensureJobPositionsTable();
  const { rows } = await query(
    `INSERT INTO job_positions (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING name`,
    [n]
  );
  return rows[0];
}

async function deleteJobPosition(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  await ensureJobPositionsTable();
  const { rowCount } = await query('DELETE FROM job_positions WHERE name = $1', [n]);
  return rowCount > 0;
}

// --- Group adders (ผู้เพิ่ม Group) ---
async function ensureGroupAddersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS group_adders (
      name VARCHAR(255) PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getGroupAdders() {
  await ensureGroupAddersTable();
  const { rows } = await query('SELECT name FROM group_adders ORDER BY name');
  return rows;
}

async function addGroupAdder(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('name is required');
  await ensureGroupAddersTable();
  const { rows } = await query(
    `INSERT INTO group_adders (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING name`,
    [n]
  );
  return rows[0];
}

async function deleteGroupAdder(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  await ensureGroupAddersTable();
  const { rowCount } = await query('DELETE FROM group_adders WHERE name = $1', [n]);
  return rowCount > 0;
}

// --- Assignment doers (ผู้ทำ Assignment) ---
async function ensureAssignmentDoersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS assignment_doers (
      name VARCHAR(255) PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAssignmentDoers() {
  await ensureAssignmentDoersTable();
  const { rows } = await query('SELECT name FROM assignment_doers ORDER BY name');
  return rows;
}

async function addAssignmentDoer(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('name is required');
  await ensureAssignmentDoersTable();
  const { rows } = await query(
    `INSERT INTO assignment_doers (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING name`,
    [n]
  );
  return rows[0];
}

async function deleteAssignmentDoer(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  await ensureAssignmentDoersTable();
  const { rowCount } = await query('DELETE FROM assignment_doers WHERE name = $1', [n]);
  return rowCount > 0;
}

async function deleteAllGroups() {
  const { rowCount } = await query('DELETE FROM groups');
  return rowCount;
}

// --- Users ---
async function getUsers() {
  const { rows } = await query('SELECT * FROM users ORDER BY COALESCE(NULLIF(trim(name), \'\'), env_key), env_key');
  return rows.map((r) => {
    const { fb_access_token, ...rest } = r;
    const base = `USER_${String(r.env_key || r.id).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
    return {
      ...rest,
      has_fb_token: !!(fb_access_token || process.env[`${base}_FB_ACCESS_TOKEN`]),
      group_ids: r.group_ids || [],
      blacklist_groups: r.blacklist_groups || [],
      post_settings: r.post_settings || {},
    };
  });
}

async function getUserFbToken(userId) {
  const { rows } = await query('SELECT env_key, fb_access_token FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) return null;
  const r = rows[0];
  const token = r.fb_access_token || process.env[`USER_${String(r.env_key || userId).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_FB_ACCESS_TOKEN`];
  return token || null;
}

async function getUserById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  const { fb_access_token, ...rest } = r;
  return { ...rest, group_ids: r.group_ids || [], blacklist_groups: r.blacklist_groups || [], post_settings: r.post_settings || {} };
}

async function createUser(data) {
  const id = generateId();
  const envKey = data.env_key || id;
  const contactPhone =
    data.contact_phone != null && String(data.contact_phone).trim()
      ? String(data.contact_phone).trim().slice(0, 64)
      : null;
  await query(
    `INSERT INTO users (id, env_key, name, poster_name, sheet_url, email, password, group_ids, blacklist_groups, post_settings, fb_access_token, contact_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      envKey,
      data.name || null,
      data.poster_name || null,
      data.sheet_url || null,
      data.email || null,
      data.password || null,
      JSON.stringify(data.group_ids || []),
      JSON.stringify(data.blacklist_groups || []),
      JSON.stringify(data.post_settings || {}),
      data.fb_access_token || null,
      contactPhone,
    ]
  );
  return getUserById(id);
}

async function updateUser(id, data) {
  const contactPhoneParam =
    data.contact_phone !== undefined
      ? data.contact_phone != null && String(data.contact_phone).trim()
        ? String(data.contact_phone).trim().slice(0, 64)
        : null
      : null;
  await query(
    `UPDATE users SET
      env_key = COALESCE($2, env_key),
      name = COALESCE($3, name),
      poster_name = COALESCE($4, poster_name),
      sheet_url = COALESCE($5, sheet_url),
      email = COALESCE($6, email),
      password = CASE WHEN $7::text IS NOT NULL AND $7::text <> '' THEN $7::text ELSE password END,
      group_ids = COALESCE($8, group_ids),
      blacklist_groups = COALESCE($9, blacklist_groups),
      post_settings = COALESCE($10, post_settings),
      fb_access_token = CASE WHEN $11::text IS NOT NULL THEN NULLIF($11::text, '') ELSE fb_access_token END,
      contact_phone = CASE WHEN $12::text IS NOT NULL THEN NULLIF(TRIM($12::text), '') ELSE contact_phone END,
      updated_at = NOW()
    WHERE id = $1`,
    [
      id,
      data.env_key,
      data.name,
      data.poster_name,
      data.sheet_url,
      data.email,
      data.password !== undefined ? data.password : null,
      data.group_ids ? JSON.stringify(data.group_ids) : null,
      data.blacklist_groups ? JSON.stringify(data.blacklist_groups) : null,
      data.post_settings ? JSON.stringify(data.post_settings) : null,
      data.fb_access_token !== undefined ? data.fb_access_token : null,
      data.contact_phone !== undefined ? contactPhoneParam ?? '' : null,
    ]
  );
  return getUserById(id);
}

async function deleteUser(id) {
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
  return rowCount > 0;
}

// --- Groups ---
async function getGroups() {
  const { rows } = await query('SELECT * FROM groups ORDER BY name');
  return rows;
}

async function getGroupById(id) {
  const { rows } = await query('SELECT * FROM groups WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getGroupByFbId(fbGroupId) {
  const { rows } = await query('SELECT * FROM groups WHERE fb_group_id = $1', [fbGroupId]);
  return rows[0] || null;
}

function normalizeStringArray(val) {
  if (Array.isArray(val)) return val.map((x) => String(x).trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
}

async function createGroup(data) {
  await ensureGroupsDepartmentColumn();
  const id = data.id || generateId();
  const positions = normalizeStringArray(data.job_positions);
  const blacklistGroups = normalizeStringArray(data.blacklist_groups);
  const addedBy = data.added_by != null ? String(data.added_by).trim() : null;
  const provinceNote = data.province_note != null ? String(data.province_note).trim() : null;
  const department = data.department != null ? String(data.department).trim() || null : null;
  if (addedBy) await addGroupAdder(addedBy);
  const { rows } = await query(
    `INSERT INTO groups (id, name, fb_group_id, province, province_note, sheet_url, blacklist_groups, job_type, job_positions, added_by, department)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
     ON CONFLICT (fb_group_id) DO UPDATE SET
       name = COALESCE($2, groups.name),
       province = COALESCE($4, groups.province),
       province_note = COALESCE($5, groups.province_note),
       sheet_url = COALESCE($6, groups.sheet_url),
       blacklist_groups = COALESCE($7::jsonb, groups.blacklist_groups),
       job_type = COALESCE($8, groups.job_type),
       job_positions = COALESCE($9, groups.job_positions),
       added_by = COALESCE($10, groups.added_by),
       department = COALESCE($11, groups.department)
     RETURNING *`,
    [
      id,
      data.name || null,
      data.fb_group_id,
      data.province || null,
      provinceNote,
      data.sheet_url || null,
      JSON.stringify(blacklistGroups),
      data.job_type || null,
      JSON.stringify(positions),
      addedBy,
      department,
    ]
  );
  return rows[0] || getGroupById(id);
}

async function upsertGroupByFbId(fbGroupId, name = null, province = null) {
  const id = generateId();
  const { rows } = await query(
    `INSERT INTO groups (id, name, fb_group_id, province) VALUES ($1, $2, $3, $4)
     ON CONFLICT (fb_group_id) DO UPDATE SET name = COALESCE($2, groups.name), province = COALESCE($4, groups.province)
     RETURNING *`,
    [id, name || fbGroupId, fbGroupId, province]
  );
  return rows[0];
}

async function updateGroup(id, data) {
  await ensureGroupsDepartmentColumn();
  const positions = data.job_positions !== undefined ? JSON.stringify(normalizeStringArray(data.job_positions)) : null;
  const blacklistGroups = data.blacklist_groups !== undefined ? JSON.stringify(normalizeStringArray(data.blacklist_groups)) : null;
  const addedByRaw = data.added_by;
  const addedBy = addedByRaw !== undefined && addedByRaw != null ? String(addedByRaw).trim() : null;
  const provinceNoteRaw = data.province_note;
  const provinceNote = provinceNoteRaw !== undefined && provinceNoteRaw != null ? String(provinceNoteRaw).trim() : null;
  const departmentRaw = data.department;
  const department = departmentRaw !== undefined && departmentRaw != null ? String(departmentRaw).trim() || null : null;
  if (addedBy) await addGroupAdder(addedBy);
  await query(
    `UPDATE groups SET
      name = COALESCE($2, name),
      fb_group_id = COALESCE($3, fb_group_id),
      province = COALESCE($4, province),
      province_note = COALESCE($5, province_note),
      sheet_url = COALESCE($6, sheet_url),
      blacklist_groups = COALESCE($7::jsonb, blacklist_groups),
      job_type = COALESCE($8, job_type),
      job_positions = COALESCE($9, job_positions),
      added_by = COALESCE($10, added_by),
      department = COALESCE($11, department)
    WHERE id = $1`,
    [
      id,
      data.name,
      data.fb_group_id,
      data.province,
      provinceNoteRaw !== undefined ? provinceNote : null,
      data.sheet_url,
      blacklistGroups,
      data.job_type,
      positions,
      addedByRaw !== undefined ? addedBy : null,
      departmentRaw !== undefined ? department : null,
    ]
  );
  return getGroupById(id);
}

async function deleteGroup(id) {
  const { rowCount } = await query('DELETE FROM groups WHERE id = $1', [id]);
  return rowCount > 0;
}

// --- Jobs ---
function normalizeJobRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  if (out.province == null && out.Province != null) out.province = out.Province;
  if (out.province_note == null && out.provinceNote != null) out.province_note = out.provinceNote;
  if (out.province_note == null && out.Province_note != null) out.province_note = out.Province_note;
  return out;
}

async function getJobs() {
  await ensureJobsProvinceColumns();
  const { rows } = await query('SELECT * FROM jobs ORDER BY created_at DESC');
  return rows.map(normalizeJobRow);
}

async function getJobById(id) {
  await ensureJobsProvinceColumns();
  const { rows } = await query('SELECT * FROM jobs WHERE id = $1', [id]);
  return normalizeJobRow(rows[0]) || null;
}

async function createJob(data) {
  await ensureJobsDepartmentColumn();
  await ensureJobsProvinceColumns();
  if (data.owner) await addJobOwner(data.owner);
  if (data.job_position) await addJobPosition(data.job_position);
  const department = data.department != null ? String(data.department).trim() || null : null;
  const rawProv = data.province != null && data.province !== undefined ? data.province : data.Province;
  const rawProvNote =
    data.province_note != null && data.province_note !== undefined ? data.province_note : data.provinceNote;
  const province = rawProv != null ? String(rawProv).trim() || null : null;
  const provinceNote = rawProvNote != null ? String(rawProvNote).trim() || null : null;
  const id = generateId();
  await query(
    `INSERT INTO jobs (id, title, job_position, owner, company, department, province, province_note, caption, apply_link, comment_reply, job_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      data.title,
      data.job_position || null,
      data.owner,
      data.company,
      department,
      province,
      provinceNote,
      data.caption || '',
      data.apply_link || null,
      data.comment_reply || null,
      data.job_type || null,
      data.status || 'pending',
    ]
  );
  return getJobById(id);
}

function normJobTextField(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

async function updateJob(id, data) {
  await ensureJobsDepartmentColumn();
  await ensureJobsProvinceColumns();
  if (data.owner) await addJobOwner(data.owner);
  if (data.job_position) await addJobPosition(data.job_position);
  const ex = await getJobById(id);
  if (!ex) return null;

  const hasProv =
    data != null &&
    typeof data === 'object' &&
    (Object.prototype.hasOwnProperty.call(data, 'province') ||
      Object.prototype.hasOwnProperty.call(data, 'Province'));
  const hasProvNote =
    data != null &&
    typeof data === 'object' &&
    (Object.prototype.hasOwnProperty.call(data, 'province_note') ||
      Object.prototype.hasOwnProperty.call(data, 'provinceNote'));

  const rawP = data?.province !== undefined && data?.province !== null ? data.province : data?.Province;
  const rawN =
    data?.province_note !== undefined && data?.province_note !== null ? data.province_note : data?.provinceNote;

  let province;
  let provinceNote;
  if (!hasProv || !hasProvNote) {
    province = hasProv ? normJobTextField(rawP) : ex.province ?? null;
    provinceNote = hasProvNote ? normJobTextField(rawN) : ex.province_note ?? null;
  } else {
    province = normJobTextField(rawP);
    provinceNote = normJobTextField(rawN);
  }

  const { rows, rowCount } = await query(
    `UPDATE jobs SET
      title = COALESCE($2, title),
      job_position = COALESCE($3, job_position),
      owner = COALESCE($4, owner),
      company = COALESCE($5, company),
      department = COALESCE($6, department),
      province = $7,
      province_note = $8,
      caption = COALESCE($9, caption),
      apply_link = COALESCE($10, apply_link),
      comment_reply = COALESCE($11, comment_reply),
      status = COALESCE($12, status),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [
      id,
      data.title,
      data.job_position,
      data.owner,
      data.company,
      data.department,
      province,
      provinceNote,
      data.caption,
      data.apply_link,
      data.comment_reply,
      data.status,
    ]
  );
  if (!rowCount) return null;
  return normalizeJobRow(rows[0]) || null;
}

async function deleteJob(id) {
  const { rowCount } = await query('DELETE FROM jobs WHERE id = $1', [id]);
  return rowCount > 0;
}

// --- Templates ---
async function getTemplates() {
  const { rows } = await query('SELECT * FROM templates ORDER BY name');
  return rows;
}

async function getTemplateById(id) {
  const { rows } = await query('SELECT * FROM templates WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createTemplate(data) {
  if (data.owner) await addJobOwner(data.owner);
  if (data.job_position) await addJobPosition(data.job_position);
  const id = generateId();
  await query(
    `INSERT INTO templates (id, name, title, job_position, owner, company, caption, apply_link, comment_reply)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.name || data.title,
      data.title,
      data.job_position || null,
      data.owner,
      data.company,
      data.caption || '',
      data.apply_link || null,
      data.comment_reply || null,
    ]
  );
  return getTemplateById(id);
}

async function updateTemplate(id, data) {
  if (data.owner) await addJobOwner(data.owner);
  if (data.job_position) await addJobPosition(data.job_position);
  await query(
    `UPDATE templates SET name = COALESCE($2, name), title = COALESCE($3, title), job_position = COALESCE($4, job_position), owner = COALESCE($5, owner),
     company = COALESCE($6, company), caption = COALESCE($7, caption), apply_link = COALESCE($8, apply_link),
     comment_reply = COALESCE($9, comment_reply) WHERE id = $1`,
    [id, data.name, data.title, data.job_position, data.owner, data.company, data.caption, data.apply_link, data.comment_reply]
  );
  return getTemplateById(id);
}

async function deleteTemplate(id) {
  const { rowCount } = await query('DELETE FROM templates WHERE id = $1', [id]);
  return rowCount > 0;
}

// --- Assignments ---
/** cache: null = ยังไม่รู้, true/false = probe แล้ว */
let cachedAssignmentsHasJobIdsColumn = null;
/** Set ของชื่อคอลัมน์จริงในตาราง assignments (lower case) */
let cachedAssignmentColumnSet = null;

function invalidateAssignmentsJobIdsCache() {
  cachedAssignmentsHasJobIdsColumn = null;
  cachedAssignmentColumnSet = null;
}

async function getAssignmentColumnSet() {
  if (cachedAssignmentColumnSet !== null) return cachedAssignmentColumnSet;
  const set = new Set();
  /** ใช้ SCHEMA จาก env + regclass ของเป้าหมาย INSERT โดยตรง — อย่าพึ่ง current_schema() อย่างเดียว (อาจคนละ schema กับ ASSIGNMENTS_TABLE) */
  const { rows: iRows } = await query(
    `SELECT column_name AS c
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = 'assignments'`,
    [SCHEMA]
  );
  for (const r of iRows) {
    const c = String(r.c || '').toLowerCase();
    if (c) set.add(c);
  }
  try {
    const { rows: pRows } = await query(
      `SELECT a.attname::text AS c
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       WHERE c.oid = $1::regclass
         AND a.attnum > 0
         AND NOT a.attisdropped`,
      [ASSIGNMENTS_TABLE]
    );
    for (const r of pRows) {
      const c = String(r.c || '').toLowerCase();
      if (c) set.add(c);
    }
  } catch (_) {
    /** regclass ไม่ resolve (ชื่อผิด) — ใช้แค่ information_schema */
  }
  cachedAssignmentColumnSet = set;
  return cachedAssignmentColumnSet;
}

function is42703UndefinedJobIdColumn(err) {
  if (!err || String(err.code) !== '42703') return false;
  const s = String(err.message || '');
  return /\bjob_id\b/i.test(s) && (/does not exist/i.test(s) || /undefined column/i.test(s));
}

function isNotNullJobIdViolation(err) {
  let e = err;
  for (let i = 0; i < 5 && e; i++) {
    const code = String(e.code ?? '');
    const msg = String(e.message || '');
    if (code === '23502' && /\bjob_id\b/i.test(msg)) return true;
    e = e.cause || e.originalError;
  }
  return false;
}

/**
 * INSERT ตามคอลัมน์ที่มีจริง — ถ้ามีทั้ง job_ids และ job_id จะใส่ทั้งคู่ (กันฐานเก่า NOT NULL job_id)
 */
async function insertAssignmentRow({ id, jobIds, groupIds, doerName, department, userId, firstJobId }) {
  if (!firstJobId) {
    throw new Error('ต้องเลือกงาน (Jobs) อย่างน้อย 1 รายการใน Assignment');
  }

  const execInsert = async (cols, alwaysIncludeJobId) => {
    if (!cols.has('id')) throw new Error('ตาราง assignments ไม่มีคอลัมน์ id');
    if (!cols.has('user_id')) throw new Error('ตาราง assignments ไม่มีคอลัมน์ user_id');
    if (!cols.has('job_ids') && !cols.has('job_id') && !alwaysIncludeJobId) {
      throw new Error('ตาราง assignments ต้องมีคอลัมน์ job_ids หรือ job_id');
    }

    const names = [];
    const params = [];
    const ph = [];
    const add = (name, val, cast = '') => {
      names.push(name);
      params.push(val);
      ph.push(`$${params.length}${cast}`);
    };

    add('id', id);
    if (cols.has('job_ids')) {
      add('job_ids', JSON.stringify(jobIds), '::jsonb');
    }
    if (cols.has('group_ids')) {
      add('group_ids', JSON.stringify(Array.isArray(groupIds) ? groupIds : []), '::jsonb');
    }
    if (cols.has('doer_name')) {
      add('doer_name', doerName);
    }
    if (cols.has('department')) {
      add('department', department);
    }
    add('user_id', userId);
    if (alwaysIncludeJobId) {
      add('job_id', firstJobId);
    } else if (cols.has('job_id')) {
      add('job_id', firstJobId);
    }

    await query(
      `INSERT INTO ${ASSIGNMENTS_TABLE} (${names.join(', ')}) VALUES (${ph.join(', ')})`,
      params
    );
  };

  let cols = await getAssignmentColumnSet();
  if (!cols.has('id') || !cols.has('user_id')) {
    throw new Error(
      'ตาราง assignments ไม่มี id หรือ user_id — ตรวจสอบ DB_SCHEMA ใน .env ให้ตรง schema ที่มีตารางนี้: ' +
        ASSIGNMENTS_TABLE
    );
  }

  try {
    /** ลองใส่ job_id เสมอเมื่อมีงาน — กันฐานเก่า NOT NULL ที่ discovery พลาด */
    await execInsert(cols, true);
  } catch (e) {
    if (is42703UndefinedJobIdColumn(e)) {
      invalidateAssignmentsJobIdsCache();
      cols = await getAssignmentColumnSet();
      await execInsert(cols, false);
      return;
    }
    if (isNotNullJobIdViolation(e)) {
      await relaxAssignmentsJobIdConstraint();
      invalidateAssignmentsJobIdsCache();
      cols = await getAssignmentColumnSet();
      await execInsert(cols, true);
      return;
    }
    throw e;
  }
}

async function runAssignmentUpdateSql(id, { jobIds, groupIds, doerName, department, user_id }) {
  const cols = await getAssignmentColumnSet();
  const assigns = [];
  const params = [];

  if (jobIds !== null && cols.has('job_ids')) {
    const idx = params.length + 1;
    params.push(JSON.stringify(jobIds));
    const pj = `$${idx}`;
    assigns.push(`job_ids = COALESCE(${pj}::jsonb, job_ids)`);
    if (cols.has('job_id')) {
      assigns.push(
        `job_id = CASE WHEN jsonb_array_length(COALESCE(${pj}::jsonb, '[]'::jsonb)) > 0 THEN (${pj}::jsonb->>0) ELSE job_id END`
      );
    }
  } else if (jobIds !== null && !cols.has('job_ids') && cols.has('job_id') && jobIds.length > 0) {
    params.push(jobIds[0]);
    assigns.push(`job_id = COALESCE($${params.length}, job_id)`);
  }

  if (groupIds !== null && cols.has('group_ids')) {
    params.push(JSON.stringify(groupIds));
    assigns.push(`group_ids = COALESCE($${params.length}::jsonb, group_ids)`);
  }
  if (doerName !== undefined && cols.has('doer_name')) {
    params.push(doerName);
    assigns.push(`doer_name = COALESCE($${params.length}, doer_name)`);
  }
  if (department !== undefined && cols.has('department')) {
    params.push(department);
    assigns.push(`department = COALESCE($${params.length}, department)`);
  }
  if (user_id !== undefined && cols.has('user_id')) {
    params.push(user_id);
    assigns.push(`user_id = COALESCE($${params.length}, user_id)`);
  }

  if (assigns.length === 0) return;
  params.push(id);
  const idPh = `$${params.length}`;
  await query(`UPDATE ${ASSIGNMENTS_TABLE} SET ${assigns.join(', ')} WHERE id = ${idPh}`, params);
}

function isMissingJobIdsColumnError(err) {
  if (err && String(err.code) === '42703') {
    const s = String(err.message || '');
    return /job_ids/i.test(s);
  }
  const s = String(err?.message || err || '');
  if (!/job_ids/i.test(s)) return false;
  return /does not exist/i.test(s) || /undefined column/i.test(s);
}

/** ค่า job id ที่ใช้ได้จริง (กันพวยพวย [null], [""], length โกง) */
function normalizeAssignmentJobIds(data) {
  const raw = Array.isArray(data.job_ids)
    ? data.job_ids
    : data.job_id != null && String(data.job_id).trim() !== ''
      ? [data.job_id]
      : [];
  return raw.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
}

/**
 * คลาย NOT NULL ของ job_id บนตารางจริง (ASSIGNMENTS_TABLE / DB_SCHEMA)
 * ห้ามพึ่ง current_schema() ใน EXISTS — ถ้า search_path ไม่ตรง env จะไม่ ALTER แล้ว INSERT job_ids จะชน NOT NULL ตลอด
 */
async function relaxAssignmentsJobIdConstraint() {
  try {
    await query(`ALTER TABLE ${ASSIGNMENTS_TABLE} ALTER COLUMN job_id DROP NOT NULL`);
  } catch (e) {
    const m = String(e?.message || e || '');
    if (/column "job_id" of relation/i.test(m) && /does not exist/i.test(m)) return;
    if (/does not exist/i.test(m) && /assignments/i.test(m)) return;
    console.warn('[db] relaxAssignmentsJobIdConstraint:', m);
  }
}

/**
 * ตรวจจาก pg_catalog ว่า "ตารางจริง" assignments มีคอลัมน์ job_ids หรือไม่
 * (ไม่ใช้ SELECT job_ids เพราะ view อาจมีคอลัมน์นี้ แต่ INSERT/UPDATE ไปที่ heap แล้วพัง)
 */
async function assignmentsHasJobIdsColumn() {
  if (cachedAssignmentsHasJobIdsColumn !== null) return cachedAssignmentsHasJobIdsColumn;
  const { rows: heapRows } = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1
         AND c.relname = 'assignments'
         AND c.relkind IN ('r', 'p', 'f')
         AND a.attname = 'job_ids'
         AND a.attnum > 0
         AND NOT a.attisdropped
     ) AS has_job_ids`,
    [SCHEMA]
  );
  if (heapRows[0] && heapRows[0].has_job_ids) {
    cachedAssignmentsHasJobIdsColumn = true;
    return true;
  }
  const { rows: viewRows } = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = 'assignments'
         AND column_name = 'job_ids'
     ) AS has_job_ids`,
    [SCHEMA]
  );
  cachedAssignmentsHasJobIdsColumn = !!(viewRows[0] && viewRows[0].has_job_ids);
  return cachedAssignmentsHasJobIdsColumn;
}

async function ensureAssignmentsJobIdsColumn() {
  await relaxAssignmentsJobIdConstraint();
  try {
    await query(`ALTER TABLE ${ASSIGNMENTS_TABLE} ADD COLUMN IF NOT EXISTS job_ids JSONB NOT NULL DEFAULT '[]'`);
    await query(`ALTER TABLE ${ASSIGNMENTS_TABLE} ADD COLUMN IF NOT EXISTS group_ids JSONB NOT NULL DEFAULT '[]'`);
    await query(`ALTER TABLE ${ASSIGNMENTS_TABLE} ADD COLUMN IF NOT EXISTS doer_name VARCHAR(255)`);
    await query(`ALTER TABLE ${ASSIGNMENTS_TABLE} ADD COLUMN IF NOT EXISTS department VARCHAR(255)`);
    invalidateAssignmentsJobIdsCache();
    const { rows: jc } = await query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'assignments'
          AND column_name = 'job_id'
      ) AS x`,
      [SCHEMA]
    );
    if (jc[0] && jc[0].x) {
      await query(
        `UPDATE ${ASSIGNMENTS_TABLE}
         SET job_ids = jsonb_build_array(job_id)
         WHERE job_id IS NOT NULL
           AND (job_ids IS NULL OR job_ids = '[]'::jsonb)`
      );
      await query(`ALTER TABLE ${ASSIGNMENTS_TABLE} ALTER COLUMN job_id DROP NOT NULL`);
    }
    invalidateAssignmentsJobIdsCache();
  } catch (_) {
    // สิทธิ์ไม่พอ / ตารางพิเศษ: ใช้โหมด job_id เดิม
  }
}

async function ensureGroupsDepartmentColumn() {
  try {
    await query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS department VARCHAR(255)`);
  } catch (_) {
    // ignore if no permission / table variation
  }
}

async function ensureJobsDepartmentColumn() {
  try {
    await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS department VARCHAR(255)`);
  } catch (_) {
    // ignore if no permission / table variation
  }
}

async function ensureJobsProvinceColumns() {
  try {
    await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS province VARCHAR(255)`);
    await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS province_note VARCHAR(255)`);
  } catch (e) {
    console.error('ensureJobsProvinceColumns:', e?.message || e);
  }
}

async function getAssignments() {
  await ensureAssignmentsJobIdsColumn();
  const hasMulti = await assignmentsHasJobIdsColumn();
  // เรียงลำดับจากเก่าไปใหม่ เพื่อให้ลำดับการสร้าง Assignment = ลำดับการโพสต์
  const { rows } = await query(`SELECT * FROM ${ASSIGNMENTS_TABLE} ORDER BY created_at ASC`);
  if (hasMulti) {
    return rows.map((r) => ({ ...r, job_ids: r.job_ids || [], group_ids: r.group_ids || [] }));
  }
  return rows.map((r) => ({ ...r, job_ids: r.job_id ? [r.job_id] : [], group_ids: r.group_ids || [] }));
}

async function getAssignmentById(id) {
  await ensureAssignmentsJobIdsColumn();
  const hasMulti = await assignmentsHasJobIdsColumn();
  const { rows } = await query(`SELECT * FROM ${ASSIGNMENTS_TABLE} WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  if (hasMulti) {
    return { ...r, job_ids: r.job_ids || [], group_ids: r.group_ids || [] };
  }
  return { ...r, job_ids: r.job_id ? [r.job_id] : [], group_ids: r.group_ids || [] };
}

async function getAssignmentsByUserId(userId) {
  await ensureAssignmentsJobIdsColumn();
  const hasMulti = await assignmentsHasJobIdsColumn();
  // เรียง Assignment ของ User นี้จากเก่าไปใหม่ เพื่อให้ลำดับการโพสต์ตรงกับลำดับที่สร้าง
  const { rows } = await query(`SELECT * FROM ${ASSIGNMENTS_TABLE} WHERE user_id = $1 ORDER BY created_at ASC`, [
    userId,
  ]);
  if (hasMulti) {
    return rows.map((r) => ({ ...r, job_ids: r.job_ids || [], group_ids: r.group_ids || [] }));
  }
  return rows.map((r) => ({ ...r, job_ids: r.job_id ? [r.job_id] : [], group_ids: r.group_ids || [] }));
}

async function createAssignment(data) {
  await ensureAssignmentsJobIdsColumn();
  await relaxAssignmentsJobIdConstraint();
  const id = generateId();
  const jobIds = normalizeAssignmentJobIds(data);
  const groupIds = Array.isArray(data.group_ids) ? data.group_ids : [];
  if (!jobIds.length) {
    throw new Error('ต้องเลือกงาน (Jobs) อย่างน้อย 1 รายการใน Assignment');
  }
  const firstJobId = jobIds[0];
  const doerName = data.doer_name != null ? String(data.doer_name).trim() : null;
  const department = data.department != null ? String(data.department).trim() || null : null;
  if (doerName) await addAssignmentDoer(doerName);
  invalidateAssignmentsJobIdsCache();
  const row = {
    id,
    jobIds,
    groupIds,
    doerName,
    department,
    userId: data.user_id,
    firstJobId,
  };
  try {
    await insertAssignmentRow(row);
  } catch (err) {
    if (!isMissingJobIdsColumnError(err)) throw err;
    cachedAssignmentsHasJobIdsColumn = false;
    invalidateAssignmentsJobIdsCache();
    await insertAssignmentRow(row);
  }
  return getAssignmentById(id);
}

async function updateAssignment(id, data) {
  await ensureAssignmentsJobIdsColumn();
  await relaxAssignmentsJobIdConstraint();
  const jobIds =
    data.job_ids !== undefined
      ? normalizeAssignmentJobIds({ job_ids: Array.isArray(data.job_ids) ? data.job_ids : [] })
      : null;
  const groupIds = data.group_ids !== undefined ? (Array.isArray(data.group_ids) ? data.group_ids : []) : null;
  const doerName = data.doer_name !== undefined
    ? (data.doer_name != null ? String(data.doer_name).trim() : null)
    : undefined;
  const department = data.department !== undefined
    ? (data.department != null ? String(data.department).trim() || null : null)
    : undefined;
  if (doerName) await addAssignmentDoer(doerName);
  invalidateAssignmentsJobIdsCache();
  const fields = {
    jobIds,
    groupIds,
    doerName,
    department,
    user_id: data.user_id,
  };
  try {
    await runAssignmentUpdateSql(id, fields);
  } catch (err) {
    if (!isMissingJobIdsColumnError(err)) throw err;
    cachedAssignmentsHasJobIdsColumn = false;
    invalidateAssignmentsJobIdsCache();
    await runAssignmentUpdateSql(id, fields);
  }
  return getAssignmentById(id);
}

async function deleteAssignment(id) {
  const { rowCount } = await query(`DELETE FROM ${ASSIGNMENTS_TABLE} WHERE id = $1`, [id]);
  return rowCount > 0;
}

// --- Run Logs ---
function generateRunId() {
  return 'run_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function createRunLog(data) {
  const id = generateId();
  await query(
    `INSERT INTO run_logs (id, run_id, assignment_id, user_id, job_id, group_id, level, message, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.run_id || '',
      data.assignment_id || null,
      data.user_id || null,
      data.job_id || null,
      data.group_id || null,
      data.level || 'info',
      data.message || '',
      JSON.stringify(data.meta || {}),
    ]
  );
  return id;
}

async function getRunLogs(opts = {}) {
  const { run_id, limit = 200 } = opts;
  let sql = 'SELECT * FROM run_logs';
  const params = [];
  if (run_id) {
    params.push(run_id);
    sql += ` WHERE run_id = $1`;
  }
  sql += ' ORDER BY created_at DESC';
  if (limit) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  const { rows } = await query(sql, params);
  return rows;
}

// --- Post Logs (รูปแบบ Log File) ---
async function createPostLog(data) {
  const id = generateId();
  await query(
    `INSERT INTO post_logs (id, run_id, assignment_id, user_id, job_id, group_id, poster_name, owner, job_title, company, group_name, member_count, post_link, post_status, comment_count, customer_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      data.run_id || null,
      data.assignment_id || null,
      data.user_id || null,
      data.job_id || null,
      data.group_id || null,
      data.poster_name || null,
      data.owner || null,
      data.job_title || null,
      data.company || null,
      data.group_name || null,
      data.member_count || '0',
      data.post_link || null,
      data.post_status || null,
      data.comment_count ?? 0,
      data.customer_phone || null,
    ]
  );
  return id;
}

async function getPostLogs(opts = {}) {
  const { run_id, limit = 500 } = opts;
  let sql = 'SELECT * FROM post_logs';
  const params = [];
  if (run_id) {
    params.push(run_id);
    sql += ` WHERE run_id = $1`;
  }
  sql += ' ORDER BY created_at ASC';
  if (limit) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  const { rows } = await query(sql, params);
  return rows;
}

/**
 * โพสต์สำหรับหน้า «เก็บ Comment»: ช่วงวันที่ (เขตไทย) + บัญชีที่โพสต์ต้องตรง + มีลิงก์โพสต์
 * รองรับ start_date/end_date หรือ date เดียว (เดิม)
 */
async function getPostLogsForCommentCollect(opts = {}) {
  let startStr = String(opts.start_date || opts.date || '').trim();
  let endStr = String(opts.end_date || opts.date || '').trim();
  if (startStr && !endStr) endStr = startStr;
  if (!startStr && endStr) startStr = endStr;
  const userId = String(opts.user_id || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    throw new Error('รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD (start_date / end_date หรือ date)');
  }
  if (startStr > endStr) {
    throw new Error('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
  }
  if (!userId) {
    throw new Error('ต้องระบุ user_id (บัญชีที่โพสต์)');
  }
  const limit = Math.min(Math.max(parseInt(String(opts.limit), 10) || 500, 1), 2000);
  const userMatchSql = `
    (
        pl.user_id = $3::varchar
        OR (
          pl.user_id IS NULL
          AND NULLIF(TRIM(COALESCE(pl.poster_name, '')), '') IS NOT NULL
          AND (
            (NULLIF(TRIM(COALESCE(sel.poster_name, '')), '') IS NOT NULL
              AND LOWER(TRIM(pl.poster_name)) = LOWER(TRIM(sel.poster_name)))
            OR (NULLIF(TRIM(COALESCE(sel.name, '')), '') IS NOT NULL
              AND LOWER(TRIM(pl.poster_name)) = LOWER(TRIM(sel.name)))
          )
        )
      )`;
  const statsSql = `
    SELECT
      COUNT(*)::int AS total_in_range,
      COUNT(*) FILTER (WHERE pl.post_link IS NOT NULL AND TRIM(pl.post_link) <> '')::int AS with_link
    FROM post_logs pl
    INNER JOIN users sel ON sel.id = $3::varchar
    LEFT JOIN users u ON u.id = pl.user_id
    WHERE (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
      AND ${userMatchSql}
  `;
  const sql = `
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
      COALESCE(u.name, sel.name) AS fb_account_name,
      COALESCE(u.email, sel.email) AS fb_account_email
    FROM post_logs pl
    INNER JOIN users sel ON sel.id = $3::varchar
    LEFT JOIN users u ON u.id = pl.user_id
    WHERE (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date BETWEEN $1::date AND $2::date
      AND ${userMatchSql}
      AND pl.post_link IS NOT NULL
      AND TRIM(pl.post_link) <> ''
    ORDER BY pl.created_at ASC
    LIMIT $4
  `;
  const [statsRes, { rows }] = await Promise.all([
    query(statsSql, [startStr, endStr, userId]),
    query(sql, [startStr, endStr, userId, limit]),
  ]);
  const s = statsRes.rows[0] || {};
  return {
    rows,
    stats: {
      total_in_range: Number(s.total_in_range) || 0,
      with_link: Number(s.with_link) || 0,
    },
  };
}

async function getPostLogsByIdsForUser(ids, userId) {
  const idList = (Array.isArray(ids) ? ids : []).map((x) => String(x || '').trim()).filter(Boolean);
  if (idList.length === 0) return [];
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const placeholders = idList.map((_, i) => `$${i + 2}`).join(', ');
  const sql = `SELECT * FROM post_logs WHERE user_id = $1 AND id IN (${placeholders})`;
  const { rows } = await query(sql, [uid, ...idList]);
  return rows;
}

async function updatePostLogCollectResult(id, commentCount, customerPhone) {
  const phoneStr =
    customerPhone != null && String(customerPhone).trim() ? String(customerPhone).trim().slice(0, 2000) : null;
  await query(`UPDATE post_logs SET comment_count = $2, customer_phone = $3 WHERE id = $1`, [
    String(id),
    commentCount == null ? 0 : Math.max(0, parseInt(String(commentCount), 10) || 0),
    phoneStr,
  ]);
}

/** รายงานโพสต์: JOIN users + assignments (ผู้ทำ) + นับ total + แยกตามวัน/เจ้าของงาน */
async function getPostReports(opts = {}) {
  const { start_date, end_date, owner, doer, department, limit = 8000 } = opts;
  const maxLim = Math.min(Math.max(parseInt(String(limit), 10) || 8000, 1), 15000);
  const params = [];
  const where = [];
  if (start_date) {
    params.push(start_date);
    where.push(`pl.created_at >= $${params.length}::timestamptz`);
  }
  if (end_date) {
    params.push(end_date);
    where.push(`pl.created_at <= $${params.length}::timestamptz`);
  }
  if (owner && String(owner).trim()) {
    params.push(String(owner).trim());
    where.push(`COALESCE(NULLIF(pl.owner, ''), 'ไม่ระบุ') = $${params.length}`);
  }
  if (doer && String(doer).trim()) {
    params.push(String(doer).trim());
    where.push(`TRIM(COALESCE(a.doer_name, '')) = $${params.length}`);
  }
  if (department && String(department).trim()) {
    params.push(String(department).trim());
    where.push(`TRIM(COALESCE(a.department, '')) = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const fromJoin = `
    FROM post_logs pl
    LEFT JOIN users u ON u.id = pl.user_id
    LEFT JOIN ${ASSIGNMENTS_TABLE} a ON a.id = pl.assignment_id
  `;

  const baseParams = [...params];
  const dataSelect = `SELECT
      pl.id,
      pl.created_at,
      pl.run_id,
      pl.job_title,
      pl.owner,
      pl.poster_name,
      pl.company,
      pl.group_name,
      pl.member_count,
      pl.post_link,
      pl.post_status,
      pl.comment_count,
      pl.customer_phone,
      pl.user_id,
      pl.job_id,
      pl.group_id,
      pl.assignment_id,
      u.name AS fb_account_name,
      u.email AS fb_account_email,
      a.doer_name AS assignment_doer,
      a.department AS assignment_department
    ${fromJoin}`;

  /** ไม่มีตัวกรอง: นับจาก post_logs โดยตรง = จำนวนโพสต์ทั้งหมดในระบบ (ไม่ถูกบิดจาก JOIN) */
  if (!where.length) {
    const [{ rows: countRows }, dailyRows, ownerRows, dataRows] = await Promise.all([
      query(`SELECT COUNT(*)::int AS c FROM post_logs`, []),
      query(
        `SELECT
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS post_date,
          COUNT(*)::int AS count
        FROM post_logs
        GROUP BY date_trunc('day', created_at)
        ORDER BY date_trunc('day', created_at) DESC
        LIMIT 62`,
        []
      ),
      query(
        `SELECT
          COALESCE(NULLIF(owner, ''), 'ไม่ระบุ') AS owner,
          COUNT(*)::int AS count
        FROM post_logs
        GROUP BY COALESCE(NULLIF(owner, ''), 'ไม่ระบุ')
        ORDER BY count DESC
        LIMIT 30`,
        []
      ),
      query(
        `${dataSelect}
    ORDER BY pl.created_at DESC
    LIMIT $1`,
        [maxLim]
      ),
    ]);
    return {
      total: countRows[0]?.c ?? 0,
      rows: dataRows.rows,
      daily_breakdown: dailyRows.rows,
      owner_breakdown: ownerRows.rows,
    };
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(DISTINCT pl.id)::int AS c ${fromJoin} ${whereSql}`,
    baseParams
  );
  const total = countRows[0]?.c ?? 0;

  const [dailyRows, ownerRows, dataRows] = await Promise.all([
    query(
      `SELECT
        to_char(date_trunc('day', pl.created_at), 'YYYY-MM-DD') AS post_date,
        COUNT(DISTINCT pl.id)::int AS count
      ${fromJoin}
      ${whereSql}
      GROUP BY date_trunc('day', pl.created_at)
      ORDER BY date_trunc('day', pl.created_at) DESC
      LIMIT 62`,
      baseParams
    ),
    query(
      `SELECT
        COALESCE(NULLIF(pl.owner, ''), 'ไม่ระบุ') AS owner,
        COUNT(DISTINCT pl.id)::int AS count
      ${fromJoin}
      ${whereSql}
      GROUP BY COALESCE(NULLIF(pl.owner, ''), 'ไม่ระบุ')
      ORDER BY count DESC
      LIMIT 30`,
      baseParams
    ),
    query(
      `${dataSelect}
    ${whereSql}
    ORDER BY pl.created_at DESC
    LIMIT $${baseParams.length + 1}`,
      [...baseParams, maxLim]
    ),
  ]);

  return {
    total,
    rows: dataRows.rows,
    daily_breakdown: dailyRows.rows,
    owner_breakdown: ownerRows.rows,
  };
}

// --- Dashboard summary ---
async function getDashboardSummary(opts = {}) {
  const { start_date, end_date, owner } = opts;
  const params = [];
  const where = [];
  if (start_date) {
    params.push(start_date);
    where.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (end_date) {
    params.push(end_date);
    where.push(`created_at <= $${params.length}::timestamptz`);
  }
  if (owner && String(owner).trim()) {
    params.push(String(owner).trim());
    where.push(`COALESCE(NULLIF(owner, ''), 'ไม่ระบุ') = $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const [{ rows: totalRows }, { rows: todayRows }, { rows: statusRows }, { rows: ownerRows }, { rows: dailyRows }, { rows: ownersAllRows }, { rows: recentRows }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total_posts FROM post_logs ${whereSql}`, params),
    query(
      `SELECT COUNT(*)::int AS today_posts
       FROM post_logs
       WHERE created_at >= date_trunc('day', NOW())
       ${where.length > 0 ? `AND ${where.join(' AND ')}` : ''}`,
      params
    ),
    query(`
      SELECT
        COALESCE(post_status, 'unknown') AS post_status,
        COUNT(*)::int AS count
      FROM post_logs
      ${whereSql}
      GROUP BY COALESCE(post_status, 'unknown')
      ORDER BY count DESC
    `, params),
    query(`
      SELECT
        COALESCE(NULLIF(owner, ''), 'ไม่ระบุ') AS owner,
        COUNT(*)::int AS count
      FROM post_logs
      ${whereSql}
      GROUP BY COALESCE(NULLIF(owner, ''), 'ไม่ระบุ')
      ORDER BY count DESC
      LIMIT 8
    `, params),
    query(`
      SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS post_date,
        COUNT(*)::int AS count
      FROM post_logs
      ${whereSql}
      GROUP BY date_trunc('day', created_at)
      ORDER BY date_trunc('day', created_at) DESC
      LIMIT 31
    `, params),
    query(`
      SELECT DISTINCT COALESCE(NULLIF(owner, ''), 'ไม่ระบุ') AS owner
      FROM post_logs
      ORDER BY owner
    `),
    query(`
      SELECT *
      FROM post_logs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT 10
    `, params),
  ]);
  return {
    total_posts: totalRows[0]?.total_posts || 0,
    today_posts: todayRows[0]?.today_posts || 0,
    filters: {
      start_date: start_date || null,
      end_date: end_date || null,
      owner: owner || '',
    },
    status_breakdown: statusRows,
    top_owners: ownerRows,
    daily_breakdown: dailyRows,
    owner_options: ownersAllRows.map((r) => r.owner).filter(Boolean),
    recent_posts: recentRows,
  };
}

// --- Post schedules ---
async function ensurePostSchedulesTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS post_schedules (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      assignment_ids JSONB NOT NULL DEFAULT '[]',
      scheduled_for TIMESTAMPTZ NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      last_run_id VARCHAR(50),
      last_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      executed_at TIMESTAMPTZ
    )
  `);
}

function normalizeIdArray(val) {
  if (Array.isArray(val)) return val.map((x) => String(x).trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  return [];
}

async function getSchedules() {
  await ensurePostSchedulesTable();
  const { rows } = await query(`SELECT * FROM post_schedules ORDER BY scheduled_for ASC, created_at ASC`);
  return rows.map((r) => ({ ...r, assignment_ids: r.assignment_ids || [] }));
}

async function getScheduleById(id) {
  await ensurePostSchedulesTable();
  const { rows } = await query(`SELECT * FROM post_schedules WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  const row = rows[0];
  return { ...row, assignment_ids: row.assignment_ids || [] };
}

async function createSchedule(data) {
  await ensurePostSchedulesTable();
  const id = generateId();
  const assignmentIds = normalizeIdArray(data.assignment_ids);
  const status = data.status || 'pending';
  await query(
    `INSERT INTO post_schedules (id, name, assignment_ids, scheduled_for, status, last_run_id, last_error)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
    [
      id,
      String(data.name || '').trim(),
      JSON.stringify(assignmentIds),
      data.scheduled_for,
      status,
      data.last_run_id || null,
      data.last_error || null,
    ]
  );
  return getScheduleById(id);
}

async function updateSchedule(id, data) {
  await ensurePostSchedulesTable();
  const assignmentIds = data.assignment_ids !== undefined ? JSON.stringify(normalizeIdArray(data.assignment_ids)) : null;
  await query(
    `UPDATE post_schedules SET
      name = COALESCE($2, name),
      assignment_ids = COALESCE($3::jsonb, assignment_ids),
      scheduled_for = COALESCE($4, scheduled_for),
      status = COALESCE($5, status),
      last_run_id = COALESCE($6, last_run_id),
      last_error = COALESCE($7, last_error),
      updated_at = NOW(),
      executed_at = CASE WHEN $5 = 'completed' THEN NOW() ELSE executed_at END
     WHERE id = $1`,
    [
      id,
      data.name !== undefined ? String(data.name || '').trim() : null,
      assignmentIds,
      data.scheduled_for || null,
      data.status || null,
      data.last_run_id || null,
      data.last_error || null,
    ]
  );
  return getScheduleById(id);
}

async function deleteSchedule(id) {
  await ensurePostSchedulesTable();
  const { rowCount } = await query(`DELETE FROM post_schedules WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function updateScheduleByRunId(runId, status, lastError = null) {
  await ensurePostSchedulesTable();
  if (!runId) return false;
  const { rowCount } = await query(
    `UPDATE post_schedules
     SET status = $2::varchar,
         last_error = $3::text,
         updated_at = NOW(),
         executed_at = CASE WHEN $2::varchar = 'completed' THEN NOW() ELSE executed_at END
     WHERE last_run_id = $1`,
    [runId, status, lastError]
  );
  return rowCount > 0;
}

// --- Remote post worker queue ---
async function ensurePostRunQueueTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS post_run_queue (
      id VARCHAR(50) PRIMARY KEY,
      assignment_ids JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(30) NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | cancelled
      run_id VARCHAR(50),
      requested_by VARCHAR(255),
      worker_id VARCHAR(255),
      message TEXT,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function enqueuePostRunJob(data = {}) {
  await ensurePostRunQueueTable();
  const id = generateId();
  const assignmentIds = normalizeIdArray(data.assignment_ids);
  await query(
    `INSERT INTO post_run_queue (id, assignment_ids, status, requested_by, message)
     VALUES ($1, $2::jsonb, 'queued', $3, $4)`,
    [id, JSON.stringify(assignmentIds), data.requested_by || null, data.message || 'queued from web']
  );
  const { rows } = await query(`SELECT * FROM post_run_queue WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function claimNextPostRunJob(workerId, runId) {
  await ensurePostRunQueueTable();
  const wid = String(workerId || '').trim() || 'worker';
  const rid = String(runId || '').trim() || null;
  const { rows } = await query(
    `WITH next AS (
       SELECT id
       FROM post_run_queue
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE post_run_queue q
     SET status = 'running',
         worker_id = $1,
         run_id = COALESCE(q.run_id, $2),
         started_at = NOW(),
         updated_at = NOW(),
         message = 'worker accepted job'
     FROM next
     WHERE q.id = next.id
     RETURNING q.*`,
    [wid, rid]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

async function completePostRunJob(id, data = {}) {
  await ensurePostRunQueueTable();
  const ok = !!data.ok;
  const status = ok ? 'completed' : 'failed';
  const { rows } = await query(
    `UPDATE post_run_queue
     SET status = $2,
         run_id = COALESCE($3, run_id),
         message = COALESCE($4, message),
         error = $5,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [String(id || ''), status, data.run_id || null, data.message || null, data.error || null]
  );
  return rows[0] || null;
}

async function getPostRunQueueSummary() {
  await ensurePostRunQueueTable();
  const [countsRes, latestRes] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status='queued')::int AS queued,
         COUNT(*) FILTER (WHERE status='running')::int AS running
       FROM post_run_queue`,
      []
    ),
    query(`SELECT * FROM post_run_queue ORDER BY created_at DESC LIMIT 1`, []),
  ]);
  const c = countsRes.rows[0] || { queued: 0, running: 0 };
  return {
    queued: Number(c.queued) || 0,
    running: Number(c.running) || 0,
    latest: latestRes.rows[0] || null,
  };
}

/** นับงาน running ที่ค้างเกิน maxAgeMinutes (สำหรับมอนิเตอร์) */
async function countStaleRunningPostJobs(maxAgeMinutes) {
  await ensurePostRunQueueTable();
  const m = Math.max(1, Math.floor(Number(maxAgeMinutes) || 180));
  const { rows } = await query(
    `SELECT COUNT(*)::int AS c FROM post_run_queue
     WHERE status = 'running'
       AND started_at < NOW() - ($1::int * INTERVAL '1 minute')`,
    [m]
  );
  return Number(rows[0]?.c) || 0;
}

/**
 * ปิดงาน running ที่ค้างนานเกินไป (worker crash / Chrome ค้าง) — กันคิวไม่ไหล
 * คืนจำนวนแถวที่อัปเดต
 */
async function failStaleRunningPostJobs(maxAgeMinutes) {
  await ensurePostRunQueueTable();
  const m = Math.max(15, Math.floor(Number(maxAgeMinutes) || 180));
  const { rows } = await query(
    `UPDATE post_run_queue
     SET status = 'failed',
         error = COALESCE(NULLIF(TRIM(error), ''), 'stale_running_watchdog'),
         message = 'watchdog: running exceeded max age — release slot',
         finished_at = NOW(),
         updated_at = NOW()
     WHERE status = 'running'
       AND started_at < NOW() - ($1::int * INTERVAL '1 minute')
     RETURNING id`,
    [m]
  );
  return rows.length;
}

// --- Remote collect worker queue ---
async function ensureCollectRunQueueTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS collect_run_queue (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      post_log_ids JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(30) NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | cancelled
      run_id VARCHAR(50),
      requested_by VARCHAR(255),
      worker_id VARCHAR(255),
      message TEXT,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function enqueueCollectRunJob(data = {}) {
  await ensureCollectRunQueueTable();
  const id = generateId();
  const userId = String(data.user_id || '').trim();
  if (!userId) throw new Error('user_id is required');
  const postLogIds = normalizeIdArray(data.post_log_ids);
  if (postLogIds.length === 0) throw new Error('post_log_ids is required');
  await query(
    `INSERT INTO collect_run_queue (id, user_id, post_log_ids, status, requested_by, message)
     VALUES ($1, $2, $3::jsonb, 'queued', $4, $5)`,
    [id, userId, JSON.stringify(postLogIds), data.requested_by || null, data.message || 'collect queued from web']
  );
  const { rows } = await query(`SELECT * FROM collect_run_queue WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function claimNextCollectRunJob(workerId, runId) {
  await ensureCollectRunQueueTable();
  const wid = String(workerId || '').trim() || 'worker';
  const rid = String(runId || '').trim() || null;
  const { rows } = await query(
    `WITH next AS (
       SELECT id
       FROM collect_run_queue
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE collect_run_queue q
     SET status = 'running',
         worker_id = $1,
         run_id = COALESCE(q.run_id, $2),
         started_at = NOW(),
         updated_at = NOW(),
         message = 'worker accepted collect job'
     FROM next
     WHERE q.id = next.id
     RETURNING q.*`,
    [wid, rid]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

async function completeCollectRunJob(id, data = {}) {
  await ensureCollectRunQueueTable();
  const ok = !!data.ok;
  const status = ok ? 'completed' : 'failed';
  const { rows } = await query(
    `UPDATE collect_run_queue
     SET status = $2,
         run_id = COALESCE($3, run_id),
         message = COALESCE($4, message),
         error = $5,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [String(id || ''), status, data.run_id || null, data.message || null, data.error || null]
  );
  return rows[0] || null;
}

async function getCollectRunQueueSummary(userId) {
  await ensureCollectRunQueueTable();
  const uid = String(userId || '').trim();
  const where = uid ? 'WHERE user_id = $1' : '';
  const params = uid ? [uid] : [];
  const [countsRes, latestRes] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status='queued')::int AS queued,
         COUNT(*) FILTER (WHERE status='running')::int AS running
       FROM collect_run_queue ${where}`,
      params
    ),
    query(`SELECT * FROM collect_run_queue ${where} ORDER BY created_at DESC LIMIT 1`, params),
  ]);
  const c = countsRes.rows[0] || { queued: 0, running: 0 };
  return {
    queued: Number(c.queued) || 0,
    running: Number(c.running) || 0,
    latest: latestRes.rows[0] || null,
  };
}

async function countStaleRunningCollectJobs(maxAgeMinutes) {
  await ensureCollectRunQueueTable();
  const m = Math.max(1, Math.floor(Number(maxAgeMinutes) || 180));
  const { rows } = await query(
    `SELECT COUNT(*)::int AS c FROM collect_run_queue
     WHERE status = 'running'
       AND started_at < NOW() - ($1::int * INTERVAL '1 minute')`,
    [m]
  );
  return Number(rows[0]?.c) || 0;
}

async function failStaleRunningCollectJobs(maxAgeMinutes) {
  await ensureCollectRunQueueTable();
  const m = Math.max(15, Math.floor(Number(maxAgeMinutes) || 180));
  const { rows } = await query(
    `UPDATE collect_run_queue
     SET status = 'failed',
         error = COALESCE(NULLIF(TRIM(error), ''), 'stale_running_watchdog'),
         message = 'watchdog: collect running exceeded max age — release slot',
         finished_at = NOW(),
         updated_at = NOW()
     WHERE status = 'running'
       AND started_at < NOW() - ($1::int * INTERVAL '1 minute')
     RETURNING id`,
    [m]
  );
  return rows.length;
}

// --- Config for Bot ---
async function getDynamicConfig() {
  const [users, groups, jobs, assignments] = await Promise.all([
    getUsers(),
    getGroups(),
    getJobs(),
    getAssignments(),
  ]);
  return { users, groups, jobs, assignments };
}

/** ย้าย group_name เป็น TEXT (ชื่อกลุ่มยาว) — เรียกตอนสตาร์ทเซิร์ฟเวอร์ / initSchema */
async function ensurePostLogsGroupNameText() {
  const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';
  const schemaName = SCHEMA.includes('-') ? `"${SCHEMA}"` : SCHEMA;
  await query(`ALTER TABLE ${schemaName}.post_logs ALTER COLUMN group_name TYPE TEXT`).catch(() => {});
}

/** เพิ่ม users.contact_phone สำหรับ DB เดิมที่ยังไม่มีคอลัมน์ */
async function ensureUsersContactPhoneColumn() {
  const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';
  const schemaName = SCHEMA.includes('-') ? `"${SCHEMA}"` : SCHEMA;
  await query(`ALTER TABLE ${schemaName}.users ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(64)`).catch(() => {});
}

/** เก็บหลายเบอร์ใน customer_phone — ขยายจาก VARCHAR(100) */
async function ensurePostLogsCustomerPhoneWide() {
  const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';
  const schemaName = SCHEMA.includes('-') ? `"${SCHEMA}"` : SCHEMA;
  await query(`ALTER TABLE ${schemaName}.post_logs ALTER COLUMN customer_phone TYPE VARCHAR(2000)`).catch(() => {});
}

async function initSchema() {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf-8');
  const client = await getPool().connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
  await ensurePostLogsGroupNameText();
  await ensureUsersContactPhoneColumn();
  await ensurePostLogsCustomerPhoneWide().catch(() => {});
  await ensureAssignmentsJobIdsColumn().catch(() => {});
  await ensurePostRunQueueTable().catch(() => {});
  await ensureCollectRunQueueTable().catch(() => {});
}

/** Health check: DB reachable */
async function pingDb() {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  query,
  getPool,
  pingDb,
  generateId,
  getJobOwners,
  addJobOwner,
  deleteJobOwner,
  getJobPositions,
  addJobPosition,
  deleteJobPosition,
  getUsers,
  getUserById,
  getUserFbToken,
  createUser,
  updateUser,
  deleteUser,
  getGroups,
  getGroupById,
  getGroupByFbId,
  createGroup,
  upsertGroupByFbId,
  updateGroup,
  deleteGroup,
  getGroupAdders,
  addGroupAdder,
  deleteGroupAdder,
  getAssignmentDoers,
  addAssignmentDoer,
  deleteAssignmentDoer,
  deleteAllGroups,
  getJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getAssignments,
  getAssignmentById,
  getAssignmentsByUserId,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  createRunLog,
  getRunLogs,
  createPostLog,
  getPostLogs,
  getPostLogsForCommentCollect,
  getPostLogsByIdsForUser,
  updatePostLogCollectResult,
  getPostReports,
  getDashboardSummary,
  ensurePostSchedulesTable,
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  updateScheduleByRunId,
  ensurePostRunQueueTable,
  enqueuePostRunJob,
  claimNextPostRunJob,
  completePostRunJob,
  getPostRunQueueSummary,
  countStaleRunningPostJobs,
  failStaleRunningPostJobs,
  ensureCollectRunQueueTable,
  enqueueCollectRunJob,
  claimNextCollectRunJob,
  completeCollectRunJob,
  getCollectRunQueueSummary,
  countStaleRunningCollectJobs,
  failStaleRunningCollectJobs,
  generateRunId,
  getDynamicConfig,
  initSchema,
  ensurePostLogsGroupNameText,
  ensureUsersContactPhoneColumn,
  ensureAssignmentsJobIdsColumn,
};
