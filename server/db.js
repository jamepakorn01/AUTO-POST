/**
 * AUTO-POST Database Layer - PostgreSQL
 */
require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_jobs';

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
  await query(
    `INSERT INTO users (id, env_key, name, poster_name, sheet_url, email, password, group_ids, blacklist_groups, post_settings, fb_access_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
    ]
  );
  return getUserById(id);
}

async function updateUser(id, data) {
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
      fb_access_token = CASE WHEN $11 IS NOT NULL THEN NULLIF($11::text, '') ELSE fb_access_token END,
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

async function createGroup(data) {
  const id = data.id || generateId();
  const { rows } = await query(
    `INSERT INTO groups (id, name, fb_group_id, province) VALUES ($1, $2, $3, $4)
     ON CONFLICT (fb_group_id) DO UPDATE SET name = COALESCE($2, groups.name), province = COALESCE($4, groups.province)
     RETURNING *`,
    [id, data.name || null, data.fb_group_id, data.province || null]
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
  await query(
    `UPDATE groups SET name = COALESCE($2, name), fb_group_id = COALESCE($3, fb_group_id), province = COALESCE($4, province) WHERE id = $1`,
    [id, data.name, data.fb_group_id, data.province]
  );
  return getGroupById(id);
}

async function deleteGroup(id) {
  const { rowCount } = await query('DELETE FROM groups WHERE id = $1', [id]);
  return rowCount > 0;
}

// --- Jobs ---
async function getJobs() {
  const { rows } = await query('SELECT * FROM jobs ORDER BY created_at DESC');
  return rows;
}

async function getJobById(id) {
  const { rows } = await query('SELECT * FROM jobs WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createJob(data) {
  const id = generateId();
  await query(
    `INSERT INTO jobs (id, title, owner, company, caption, apply_link, comment_reply, job_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.title,
      data.owner,
      data.company,
      data.caption || '',
      data.apply_link || null,
      data.comment_reply || null,
      data.job_type || null,
      data.status || 'pending',
    ]
  );
  return getJobById(id);
}

async function updateJob(id, data) {
  await query(
    `UPDATE jobs SET
      title = COALESCE($2, title), owner = COALESCE($3, owner), company = COALESCE($4, company),
      caption = COALESCE($5, caption), apply_link = COALESCE($6, apply_link),
      comment_reply = COALESCE($7, comment_reply), status = COALESCE($8, status),
      updated_at = NOW()
    WHERE id = $1`,
    [id, data.title, data.owner, data.company, data.caption, data.apply_link, data.comment_reply, data.status]
  );
  return getJobById(id);
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
  const id = generateId();
  await query(
    `INSERT INTO templates (id, name, title, owner, company, caption, apply_link, comment_reply)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      data.name || data.title,
      data.title,
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
  await query(
    `UPDATE templates SET name = COALESCE($2, name), title = COALESCE($3, title), owner = COALESCE($4, owner),
     company = COALESCE($5, company), caption = COALESCE($6, caption), apply_link = COALESCE($7, apply_link),
     comment_reply = COALESCE($8, comment_reply) WHERE id = $1`,
    [id, data.name, data.title, data.owner, data.company, data.caption, data.apply_link, data.comment_reply]
  );
  return getTemplateById(id);
}

async function deleteTemplate(id) {
  const { rowCount } = await query('DELETE FROM templates WHERE id = $1', [id]);
  return rowCount > 0;
}

// --- Assignments ---
async function getAssignments() {
  const { rows } = await query('SELECT * FROM assignments ORDER BY created_at DESC');
  return rows.map((r) => ({ ...r, job_ids: r.job_ids || [] }));
}

async function getAssignmentById(id) {
  const { rows } = await query('SELECT * FROM assignments WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return { ...r, job_ids: r.job_ids || [] };
}

async function getAssignmentsByUserId(userId) {
  const { rows } = await query('SELECT * FROM assignments WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map((r) => ({ ...r, job_ids: r.job_ids || [] }));
}

async function createAssignment(data) {
  const id = generateId();
  const jobIds = Array.isArray(data.job_ids) ? data.job_ids : (data.job_id ? [data.job_id] : []);
  await query(
    `INSERT INTO assignments (id, job_ids, user_id) VALUES ($1, $2, $3)`,
    [id, JSON.stringify(jobIds), data.user_id]
  );
  return getAssignmentById(id);
}

async function updateAssignment(id, data) {
  const jobIds = data.job_ids !== undefined ? (Array.isArray(data.job_ids) ? data.job_ids : []) : null;
  await query(
    `UPDATE assignments SET job_ids = COALESCE($2, job_ids), user_id = COALESCE($3, user_id) WHERE id = $1`,
    [id, jobIds ? JSON.stringify(jobIds) : null, data.user_id]
  );
  return getAssignmentById(id);
}

async function deleteAssignment(id) {
  const { rowCount } = await query('DELETE FROM assignments WHERE id = $1', [id]);
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
}

module.exports = {
  query,
  getPool,
  generateId,
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
  generateRunId,
  getDynamicConfig,
  initSchema,
};
