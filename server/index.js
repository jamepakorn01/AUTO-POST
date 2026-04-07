/**
 * AUTO-POST Web Admin Server
 * Express backend with PostgreSQL
 */
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
/** พเธญเธฃ์เธ•เธ—เธต่ listen จเธฃเธดง (กเธฃเธ“เธต 3000 เธ–เธนกใช้แเธฅ้เธงจเธฐไป 3001/3002...) */
let serverListenPort = PORT;

// Middleware
app.use(express.json());

/** ลงทะเบียนก่อน require db — ใช้ยืนยันว่าโปรเซสรันไฟล์นี้จริง (ถ้า URL นี้ยัง 404 = ไม่ใช่ server/index.js ชุดนี้บนพอร์ตนั้น) */
const SERVER_BUILD_MARK = 'fb-session-20260407d';
app.get('/api/fb-session-health', (req, res) => {
  res.json({
    ok: true,
    build: SERVER_BUILD_MARK,
    cwd: process.cwd(),
    server_entry: path.resolve(__filename),
    post_paths: ['/api/fb-session-check', '/api/user/facebook-check-session'],
  });
});

const { spawn } = require('child_process');
const db = require('./db');
const logger = require('./logger');
const leadCollectBot = require('./leadCollectBot');
const facebookSessionCheck = require('./facebookSessionCheck');

const PROJECT_ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');

/** Facebook session warm-up (ปุ่มเช็ค Session ใน Users) — ใช้ handler เดียวกันหลาย path กันพลาด proxy / เซิร์ฟเวอร์เก่า */
async function handleFacebookSessionCheckPost(req, res) {
  try {
    const userId = String(req.body?.user_id ?? req.body?.userId ?? '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'ต้องส่ง user_id ใน JSON body' });
    }
    const { status } = await facebookSessionCheck.startCheckSession(userId, { projectRoot: PROJECT_ROOT });
    res.status(202).json({
      ok: true,
      message:
        'กำลังเปิด Google Chrome — ล็อกอินหรือยืนยันตัวตนถ้ามี แล้วรอจนโหลด Facebook สำเร็จ (session บันทึกอัตโนมัติ)',
      status,
    });
  } catch (err) {
    const code = err.statusCode && Number(err.statusCode) >= 400 && Number(err.statusCode) < 600 ? err.statusCode : 500;
    res.status(code).json({ error: err.message || String(err) });
  }
}

app.post('/api/fb-session-check', handleFacebookSessionCheckPost);

/** เธ•เธฃเธงจเธง่เธฒเน€ซเธดเธฃ์ฟเน€เธงเธญเธฃ์แเธฅเธฐ PostgreSQL พเธฃ้เธญเธก (ใช้กเธฑบ PM2 / monitoring) */
app.get('/api/health', async (req, res) => {
  const dbOk = await db.pingDb();
  const body = {
    ok: dbOk,
    uptime_ms: Math.round(process.uptime() * 1000),
    db: dbOk ? 'ok' : 'error',
    listen_port: serverListenPort,
    version: pkg.version || '1.0.0',
  };
  if (!dbOk) {
    return res.status(503).json(body);
  }
  res.json(body);
});

// --- API: Group adders (ผเธน้เน€พเธด่เธก Group - dropdown) เธ•้เธญงเธญเธขเธน่ก่เธญน /api/groups/:id ---
app.get('/api/group-adders', async (req, res) => {
  try {
    res.json(await db.getGroupAdders());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/group-adders', async (req, res) => {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const row = await db.addGroupAdder(name);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/group-adders', async (req, res) => {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const ok = await db.deleteGroupAdder(name);
    if (!ok) return res.status(404).json({ error: 'Name not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Assignment doers (ผเธน้เธ—เธณ Assignment - dropdown) ---
app.get('/api/assignment-doers', async (req, res) => {
  try {
    res.json(await db.getAssignmentDoers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assignment-doers', async (req, res) => {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const row = await db.addAssignmentDoer(name);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/assignment-doers', async (req, res) => {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const ok = await db.deleteAssignmentDoer(name);
    if (!ok) return res.status(404).json({ error: 'Name not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseArrayField(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function normalizeIncomingJobBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const o = { ...body };
  if (o.province === undefined && o.Province !== undefined) o.province = o.Province;
  if (o.province_note === undefined && o.provinceNote !== undefined) o.province_note = o.provinceNote;
  return o;
}

async function ensureGroupColumns() {
  try {
    await db.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS job_type VARCHAR(100)`);
    await db.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS job_positions JSONB DEFAULT '[]'`);
    await db.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS added_by VARCHAR(255)`);
    await db.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS province_note VARCHAR(255)`);
    await db.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS sheet_url TEXT`);
    await db.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS blacklist_groups JSONB DEFAULT '[]'`);
  } catch (err) {
    console.error('ensureGroupColumns error:', err.message);
  }
}
ensureGroupColumns();

async function ensureJobColumns() {
  try {
    await db.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_position VARCHAR(255)`);
    await db.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS job_position VARCHAR(255)`);
    await db.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS province VARCHAR(255)`);
    await db.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS province_note VARCHAR(255)`);
  } catch (err) {
    console.error('ensureJobColumns error:', err.message);
  }
}
ensureJobColumns();
db.ensurePostSchedulesTable().catch((err) => {
  logger.error('ensurePostSchedulesTable', { message: err.message });
});

// --- API: Users ---
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.group_ids !== undefined) body.group_ids = parseArrayField(body.group_ids);
    if (body.blacklist_groups !== undefined) body.blacklist_groups = parseArrayField(body.blacklist_groups);
    if (body.fb_access_token === '') body.fb_access_token = null;
    const newUser = await db.createUser(body);
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/facebook-check-session', handleFacebookSessionCheckPost);

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.group_ids !== undefined) body.group_ids = parseArrayField(body.group_ids);
    if (body.blacklist_groups !== undefined) body.blacklist_groups = parseArrayField(body.blacklist_groups);
    if (body.fb_access_token === '') body.fb_access_token = null;
    const user = await db.updateUser(req.params.id, body);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const ok = await db.deleteUser(req.params.id);
    if (!ok) return res.status(404).json({ error: 'User not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** เปิด Chrome (headed) ล็อกอิน Facebook และบันทึก session ลง .auth — ใช้ก่อนรันโพสต์จริง */
app.post('/api/users/:id/check-session', async (req, res) => {
  try {
    const { status } = await facebookSessionCheck.startCheckSession(req.params.id, { projectRoot: PROJECT_ROOT });
    res.status(202).json({
      ok: true,
      message:
        'กำลังเปิด Google Chrome — ล็อกอินหรือยืนยันตัวตนถ้ามี แล้วรอจนโหลด Facebook สำเร็จ (session บันทึกอัตโนมัติ)',
      status,
    });
  } catch (err) {
    const code = err.statusCode && Number(err.statusCode) >= 400 && Number(err.statusCode) < 600 ? err.statusCode : 500;
    res.status(code).json({ error: err.message || String(err) });
  }
});

app.get('/api/users/:id/session-snapshot', async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const has_saved_session = facebookSessionCheck.hasFacebookSavedSessionForUser(PROJECT_ROOT, user);
    const check = facebookSessionCheck.getCheckSessionStatus(req.params.id);
    res.json({
      has_saved_session,
      check_session_running: check.running,
      message: check.message,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Facebook - เธ”เธถงชเธท่เธญกเธฅเธธ่เธกจเธฒก Group ID (ใช้ token เธ•เธฒเธก User) ---
app.post('/api/facebook/group-name', async (req, res) => {
  const { fb_group_id: fbGroupId, user_id: userId } = req.body || {};
  const gid = (fbGroupId || '').trim();
  if (!gid) {
    return res.status(400).json({ error: 'กรุณาระบุ fb_group_id' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'กรุณาเลือก User (บัญชีที่เข้ากลุ่มนี้ได้)' });
  }
  const token = await db.getUserFbToken(userId);
  if (!token) {
    return res.status(503).json({
      error: 'User นี้ยังไม่มี FB Access Token\n\nไปแก้ไข User แล้วกรอก "FB Access Token" หรือกำหนด USER_{env_key}_FB_ACCESS_TOKEN ใน .env',
    });
  }
  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(gid)}?fields=name&access_token=${encodeURIComponent(token)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) {
      return res.status(400).json({
        error: data.error.message || 'Facebook API error',
        code: data.error.code,
      });
    }
    res.json({ name: data.name || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Groups ---
app.get('/api/groups', async (req, res) => {
  try {
    res.json(await db.getGroups());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.blacklist_groups !== undefined) body.blacklist_groups = parseArrayField(body.blacklist_groups);
    const newGroup = await db.createGroup(body);
    res.status(201).json(newGroup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/groups/:id', async (req, res) => {
  try {
    const group = await db.getGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/groups/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.blacklist_groups !== undefined) body.blacklist_groups = parseArrayField(body.blacklist_groups);
    const group = await db.updateGroup(req.params.id, body);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  try {
    const ok = await db.deleteGroup(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Group not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Jobs ---
app.get('/api/jobs', async (req, res) => {
  try {
    res.json(await db.getJobs());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Job Owners ---
app.get('/api/job-owners', async (req, res) => {
  try {
    res.json(await db.getJobOwners());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/job-owners', async (req, res) => {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const owner = await db.addJobOwner(name);
    res.status(201).json(owner);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/job-owners', async (req, res) => {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const ok = await db.deleteJobOwner(name);
    if (!ok) return res.status(404).json({ error: 'Owner not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Job Positions ---
app.get('/api/job-positions', async (req, res) => {
  try {
    res.json(await db.getJobPositions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/job-positions', async (req, res) => {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const pos = await db.addJobPosition(name);
    res.status(201).json(pos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/job-positions', async (req, res) => {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const ok = await db.deleteJobPosition(name);
    if (!ok) return res.status(404).json({ error: 'Position not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs', async (req, res) => {
  try {
    const newJob = await db.createJob({ ...normalizeIncomingJobBody(req.body), status: 'pending' });
    res.status(201).json(newJob);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await db.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/jobs/:id', async (req, res) => {
  try {
    const job = await db.updateJob(req.params.id, normalizeIncomingJobBody(req.body));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const ok = await db.deleteJob(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Job not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Templates ---
app.get('/api/templates', async (req, res) => {
  try {
    res.json(await db.getTemplates());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/templates', async (req, res) => {
  try {
    const newTemplate = await db.createTemplate(req.body);
    res.status(201).json(newTemplate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/templates/:id', async (req, res) => {
  try {
    const tpl = await db.getTemplateById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const tpl = await db.updateTemplate(req.params.id, req.body);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    const ok = await db.deleteTemplate(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Template not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/templates/:id/create-job', async (req, res) => {
  try {
    const tpl = await db.getTemplateById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    const newJob = await db.createJob({
      title: tpl.title,
      job_position: tpl.job_position || null,
      owner: tpl.owner,
      company: tpl.company,
      caption: tpl.caption,
      apply_link: tpl.apply_link || '',
      comment_reply: tpl.comment_reply || '',
      status: 'pending',
    });
    res.status(201).json(newJob);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Assignments ---
app.get('/api/assignments', async (req, res) => {
  try {
    res.json(await db.getAssignments());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assignments', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.job_ids !== undefined) body.job_ids = parseArrayField(body.job_ids);
    if (body.group_ids !== undefined) body.group_ids = parseArrayField(body.group_ids);
    if (Array.isArray(body.job_ids) && body.job_ids.length > 0 && body.job_id == null) {
      body.job_id = body.job_ids[0];
    }
    const newAssignment = await db.createAssignment(body);
    res.status(201).json(newAssignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assignments/:id', async (req, res) => {
  try {
    const a = await db.getAssignmentById(req.params.id);
    if (!a) return res.status(404).json({ error: 'Assignment not found' });
    res.json(a);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/assignments/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.job_ids !== undefined) body.job_ids = parseArrayField(body.job_ids);
    if (body.group_ids !== undefined) body.group_ids = parseArrayField(body.group_ids);
    if (Array.isArray(body.job_ids) && body.job_ids.length > 0 && body.job_id == null) {
      body.job_id = body.job_ids[0];
    }
    const a = await db.updateAssignment(req.params.id, body);
    if (!a) return res.status(404).json({ error: 'Assignment not found' });
    res.json(a);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/assignments/:id', async (req, res) => {
  try {
    const ok = await db.deleteAssignment(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Assignment not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Run Logs ---
app.post('/api/run-logs', async (req, res) => {
  try {
    const { run_id, level, message, assignment_id, user_id, job_id, group_id, meta } = req.body || {};
    if (!run_id || !message) {
      return res.status(400).json({ error: 'run_id และ message จำเป็น' });
    }
    await db.createRunLog({ run_id, level, message, assignment_id, user_id, job_id, group_id, meta });
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/run-logs', async (req, res) => {
  try {
    const run_id = req.query.run_id;
    const limit = parseInt(req.query.limit, 10) || 200;
    const logs = await db.getRunLogs({ run_id, limit });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Post Logs (เธฃเธนปแบบ Log File) ---
app.post('/api/post-logs', async (req, res) => {
  try {
    const body = req.body || {};
    const data = {
      run_id: body.run_id,
      assignment_id: body.assignment_id,
      user_id: body.user_id,
      job_id: body.job_id,
      group_id: body.group_id,
      poster_name: body.poster_name,
      owner: body.owner,
      job_title: body.job_title,
      company: body.company,
      group_name: body.group_name,
      member_count: body.member_count || '0',
      post_link: body.post_link,
      post_status: body.post_status,
      comment_count: body.comment_count ?? 0,
      customer_phone: body.customer_phone,
    };
    if (!data.run_id || !data.poster_name || !data.job_title) {
      return res.status(400).json({ error: 'run_id, poster_name, job_title จำเป็น' });
    }
    await db.createPostLog(data);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/post-logs', async (req, res) => {
  try {
    const run_id = req.query.run_id;
    const limit = parseInt(req.query.limit, 10) || 500;
    const logs = await db.getPostLogs({ run_id, limit });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** เธฃเธฒเธขกเธฒเธฃโพเธชเธ•์เธชเธณเธซเธฃเธฑบเน€ก็บ Comment: ช่เธงงเธงเธฑนเธ—เธต่ (ไเธ—เธข) + user_id เธ•้เธญงเธ•เธฃงกเธฑบบเธฑนเธ—เธถกเธ•เธญนโพเธชเธ•์ */
app.get('/api/post-logs/for-comment-collect', async (req, res) => {
  try {
    const date = req.query.date;
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;
    const user_id = req.query.user_id;
    const limit = parseInt(req.query.limit, 10) || 500;
    const { rows, stats } = await db.getPostLogsForCommentCollect({ date, start_date, end_date, user_id, limit });
    res.json({ rows, stats });
  } catch (err) {
    const msg = err.message || String(err);
    const bad = /รูปแบบวันที่|วันที่เริ่ม|ต้องระบุ user_id/.test(msg);
    res.status(bad ? 400 : 500).json({ error: msg });
  }
});

/** เธฃเธฒเธขงเธฒนกเธฒเธฃโพเธชเธ•์ (เธ•เธฒเธกเธงเธฑน / เน€จ้เธฒขเธญงงเธฒน / บเธฑญชเธต FB / กเธฅเธธ่เธก / เธฅเธดงก์) - JSON { total, rows } เธซเธฃเธทเธญ format=csv */
app.get('/api/reports/posts', async (req, res) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    const start_date = req.query.start_date || null;
    const end_date = req.query.end_date || null;
    const owner = req.query.owner || null;
    const department = req.query.department || null;
    const doer = req.query.doer || null;
    const limit = parseInt(req.query.limit, 10) || 8000;
    const { total, rows, daily_breakdown, owner_breakdown } = await db.getPostReports({
      start_date,
      end_date,
      owner,
      department,
      doer,
      limit,
    });
    if (format === 'csv') {
      const esc = (v) => {
        const s = String(v ?? '');
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const sep = ',';
      const headers = [
        'วันที่เวลา',
        'ชื่องาน',
        'เจ้าของงาน',
        'แผนก',
        'ผู้ทำ_Assignment',
        'ชื่อบัญชี_Facebook',
        'อีเมล_Facebook',
        'หน่วยงาน',
        'ชื่อกลุ่ม',
        'สมาชิกกลุ่ม',
        'ลิงก์โพสต์',
        'สถานะ',
        'Comment',
        'เบอร์ลูกค้า',
        'Run_ID',
      ];
      const lines = [headers.join(sep)];
      for (const r of rows) {
        const dt = r.created_at
          ? new Date(r.created_at).toLocaleString('th-TH', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          : '';
        const doer = String(r.assignment_doer || '').trim();
        const dept = String(r.assignment_department || '').trim();
        lines.push(
          [
            esc(dt),
            esc(r.job_title),
            esc(r.owner),
            esc(dept),
            esc(doer),
            esc(r.fb_account_name || ''),
            esc(r.fb_account_email || ''),
            esc(r.company),
            esc(r.group_name),
            esc(r.member_count),
            esc(r.post_link),
            esc(r.post_status),
            esc(r.comment_count),
            esc(r.customer_phone),
            esc(r.run_id),
          ].join(sep)
        );
      }
      const fname = `post-report-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      res.send(`\uFEFF${lines.join('\n')}`);
      return;
    }
    res.json({ total, rows, daily_breakdown, owner_breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Dashboard ---
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const { start_date, end_date, owner } = req.query || {};
    const summary = await db.getDashboardSummary({ start_date, end_date, owner });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Schedules ---
app.get('/api/schedules', async (req, res) => {
  try {
    res.json(await db.getSchedules());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const body = { ...req.body };
    body.assignment_ids = parseArrayField(body.assignment_ids);
    if (!body.name || !String(body.name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!body.scheduled_for) {
      return res.status(400).json({ error: 'scheduled_for is required' });
    }
    const row = await db.createSchedule(body);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/schedules/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.assignment_ids !== undefined) {
      body.assignment_ids = parseArrayField(body.assignment_ids);
    }
    const row = await db.updateSchedule(req.params.id, body);
    if (!row) return res.status(404).json({ error: 'Schedule not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const ok = await db.deleteSchedule(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Schedule not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Run Post Bot ---
let postProcess = null;
let runStatus = {
  running: false,
  paused: false,
  run_id: null,
  started_at: null,
  finished_at: null,
  exit_code: null,
  error: null,
  message: 'ยังไม่เคยเริ่มโพสต์',
};

function startPostRun(assignmentIds = []) {
  if (postProcess) {
    const err = new Error('กำลังรัน Post อยู่แล้ว');
    err.statusCode = 409;
    err.payload = { running: true, status: runStatus };
    throw err;
  }
  const runId = db.generateRunId();
  const env = { ...process.env, FORCE_COLOR: '1', RUN_ID: runId };
  if (Array.isArray(assignmentIds) && assignmentIds.length > 0) {
    env.ASSIGNMENT_IDS = assignmentIds.join(',');
  }
  env.RUN_LOG_API_URL = `http://localhost:${serverListenPort}`;
  runStatus = {
    running: true,
    paused: false,
    run_id: runId,
    started_at: new Date().toISOString(),
    finished_at: null,
    exit_code: null,
    error: null,
    message: 'กำลังดำเนินการโพสต์...',
  };
  const isWin = process.platform === 'win32';
  if (isWin) {
    const cmdArgs = ['npx', 'playwright', 'test', 'postAll', '--headed', '--project=Google Chrome'];
    postProcess = spawn('cmd.exe', ['/d', '/c', ...cmdArgs], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env,
      shell: false,
      windowsHide: false,
    });
    logger.info('post_bot.spawn', { shell: 'cmd', args: cmdArgs.join(' '), run_id: runId });
  } else {
    const pwArgs = ['playwright', 'test', 'postAll', '--headed', '--project=Google Chrome'];
    postProcess = spawn('npx', pwArgs, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env,
      shell: false,
      windowsHide: false,
    });
    logger.info('post_bot.spawn', { shell: 'npx', args: pwArgs.join(' '), run_id: runId });
  }
  postProcess.on('close', (code) => {
    const finishedRunId = runId;
    postProcess = null;
    runStatus = {
      ...runStatus,
      running: false,
      paused: false,
      finished_at: new Date().toISOString(),
      exit_code: typeof code === 'number' ? code : null,
      message: code === 0 ? 'ดำเนินการเสร็จสิ้นแล้ว' : `สิ้นสุดการทำงาน (exit code: ${code})`,
    };
    logger.info('post_bot.close', { exit_code: code, run_id: finishedRunId });
    db.updateScheduleByRunId?.(finishedRunId, code === 0 ? 'completed' : 'failed', code === 0 ? null : `exit code: ${code}`)
      .catch((e) => logger.error('updateScheduleByRunId(close)', { message: e.message }));
  });
  postProcess.on('error', (err) => {
    const finishedRunId = runId;
    postProcess = null;
    runStatus = {
      ...runStatus,
      running: false,
      paused: false,
      finished_at: new Date().toISOString(),
      error: err.message || String(err),
      message: 'เกิดข้อผิดพลาดระหว่างรันโพสต์',
    };
    logger.error('post_bot.spawn_error', { message: err.message || String(err), run_id: finishedRunId });
    db.updateScheduleByRunId?.(finishedRunId, 'failed', err.message || String(err))
      .catch((e) => logger.error('updateScheduleByRunId(error)', { message: e.message }));
  });
  return { runId, status: runStatus };
}

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

app.post('/api/run/post', (req, res) => {
  try {
    const assignmentIds = req.body?.assignment_ids;
    startPostRun(Array.isArray(assignmentIds) ? assignmentIds : []);
    res.json({ ok: true, message: 'กำลังเปิด Browser สำหรับโพสต์ - กรุณา Login Facebook', status: runStatus });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message, ...(err.payload || {}) });
    }
    postProcess = null;
    runStatus = {
      ...runStatus,
      running: false,
      finished_at: new Date().toISOString(),
      error: err.message || String(err),
      message: 'เริ่มโพสต์ไม่สำเร็จ',
    };
    logger.error('api.run.post', { message: err.message || String(err) });
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/run/post/pause', async (req, res) => {
  try {
    if (!postProcess) return res.status(400).json({ error: 'ไม่มีงานโพสต์ที่กำลังรัน' });
    if (runStatus.paused) return res.json({ ok: true, status: runStatus });
    await suspendProcess(postProcess.pid);
    runStatus = { ...runStatus, paused: true, message: 'หยุดงานโพสต์ชั่วคราว (Pause)' };
    res.json({ ok: true, status: runStatus });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/run/post/resume', async (req, res) => {
  try {
    if (!postProcess) return res.status(400).json({ error: 'ไม่มีงานโพสต์ที่กำลังรัน' });
    if (!runStatus.paused) return res.json({ ok: true, status: runStatus });
    await resumeProcess(postProcess.pid);
    runStatus = { ...runStatus, paused: false, message: 'กลับมาทำงานโพสต์ต่อแล้ว (Resume)' };
    res.json({ ok: true, status: runStatus });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/run/post/cancel', async (req, res) => {
  try {
    if (!postProcess) return res.status(400).json({ error: 'ไม่มีงานโพสต์ที่กำลังรัน' });
    if (runStatus.paused) {
      await resumeProcess(postProcess.pid).catch(() => {});
    }
    postProcess.kill();
    runStatus = {
      ...runStatus,
      running: false,
      paused: false,
      finished_at: new Date().toISOString(),
      message: 'ยกเลิกงานโพสต์แล้ว',
    };
    res.json({ ok: true, status: runStatus });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/run/status', async (req, res) => {
  const base = {
    ...runStatus,
    running: !!postProcess,
    paused: !!runStatus.paused,
  };
  if (!base.run_id) {
    return res.json({ ...base, recent_logs: [], user_runs: [] });
  }
  try {
    const [logs, users] = await Promise.all([
      db.getRunLogs({ run_id: base.run_id, limit: 200 }),
      db.getUsers().catch(() => []),
    ]);
    const userNameById = new Map((Array.isArray(users) ? users : []).map((u) => [String(u.id), u.poster_name || u.name || u.id]));
    const ordered = [...logs].reverse();
    const byUser = new Map();
    for (const l of ordered) {
      const uid = String(l.user_id || '').trim();
      const key = uid || '__unknown__';
      if (!byUser.has(key)) {
        byUser.set(key, {
          user_id: uid || null,
          user_name: uid ? (userNameById.get(uid) || uid) : 'ไม่ระบุบัญชี',
          recent_logs: [],
        });
      }
      const item = byUser.get(key);
      item.recent_logs.push(l);
    }
    const user_runs = [...byUser.values()].map((g) => ({
      ...g,
      recent_logs: g.recent_logs.slice(0, 10),
      message: g.recent_logs[0]?.message || base.message || '',
      running: base.running,
      paused: base.paused,
      run_id: base.run_id,
    }));
    return res.json({ ...base, recent_logs: ordered.slice(0, 80), user_runs });
  } catch {
    return res.json({ ...base, recent_logs: [], user_runs: [] });
  }
});


app.patch('/api/post-logs/:id/collect-result', async (req, res) => {
  try {
    if (!leadCollectBot.isCollectPatchTokenValid(req.get('x-collect-token'))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { comment_count, customer_phone } = req.body || {};
    await leadCollectBot.updatePostLogFromCollect(req.params.id, comment_count, customer_phone);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/run/collect-status', async (req, res) => {
  const user_id = req.query.user_id ? String(req.query.user_id) : '';
  const base = leadCollectBot.getCollectRunStatus(user_id || undefined);
  const runs = Array.isArray(base?.runs) ? base.runs : [base];
  const byRunId = new Map();
  await Promise.all(
    runs
      .filter((r) => r && r.run_id)
      .map(async (r) => {
        try {
          const logs = await db.getRunLogs({ run_id: r.run_id, limit: 40 });
          byRunId.set(r.run_id, [...logs].reverse());
        } catch {
          byRunId.set(r.run_id, []);
        }
      })
  );
  const runsWithLogs = runs.map((r) => ({ ...r, recent_logs: r?.run_id ? (byRunId.get(r.run_id) || []) : [] }));
  if (Array.isArray(base?.runs)) {
    return res.json({ ...base, runs: runsWithLogs });
  }
  res.json(runsWithLogs[0] || base);
});

app.post('/api/run/collect-comments/pause', async (req, res) => {
  try {
    const user_id = String(req.body?.user_id || '').trim();
    if (!user_id) return res.status(400).json({ error: 'กรุณาระบุ user_id' });
    const status = await leadCollectBot.pauseCollectRun(user_id);
    res.json({ ok: true, status });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.post('/api/run/collect-comments/resume', async (req, res) => {
  try {
    const user_id = String(req.body?.user_id || '').trim();
    if (!user_id) return res.status(400).json({ error: 'กรุณาระบุ user_id' });
    const status = await leadCollectBot.resumeCollectRun(user_id);
    res.json({ ok: true, status });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.post('/api/run/collect-comments/cancel', async (req, res) => {
  try {
    const user_id = String(req.body?.user_id || '').trim();
    if (!user_id) return res.status(400).json({ error: 'กรุณาระบุ user_id' });
    const status = await leadCollectBot.cancelCollectRun(user_id);
    res.json({ ok: true, status });
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.post('/api/run/collect-comments', async (req, res) => {
  try {
    const runs = Array.isArray(req.body?.runs) ? req.body.runs : null;
    if (runs && runs.length > 0) {
      const started = [];
      const errors = [];
      for (const item of runs) {
        const user_id = item?.user_id;
        const post_log_ids = item?.post_log_ids;
        try {
          const out = await leadCollectBot.startCollectCommentsRun(user_id, post_log_ids, {
            projectRoot: PROJECT_ROOT,
            listenPort: serverListenPort,
          });
          started.push({ user_id, run_id: out.runId, status: out.status });
        } catch (err) {
          errors.push({ user_id, error: err.message || String(err), statusCode: err.statusCode || 500 });
        }
      }
      const status = leadCollectBot.getCollectRunStatus();
      return res.status(started.length > 0 ? 200 : 400).json({ ok: started.length > 0, started, errors, status });
    }

    const user_id = req.body?.user_id;
    const post_log_ids = req.body?.post_log_ids;
    const out = await leadCollectBot.startCollectCommentsRun(user_id, post_log_ids, {
      projectRoot: PROJECT_ROOT,
      listenPort: serverListenPort,
    });
    res.json({ ok: true, run_id: out.runId, status: out.status });
  } catch (err) {
    if (err.statusCode === 409 || err.statusCode === 400) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules/:id/run-now', async (req, res) => {
  try {
    const schedule = await db.getScheduleById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const assignmentIds = Array.isArray(schedule.assignment_ids) ? schedule.assignment_ids : [];
    const started = startPostRun(assignmentIds);
    await db.updateSchedule(schedule.id, {
      status: 'running',
      last_run_id: started.runId,
      last_error: null,
    });
    res.json({ ok: true, run_id: started.runId });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message, ...(err.payload || {}) });
    }
    res.status(500).json({ error: err.message });
  }
});

// scheduler worker: เธ•เธฃเธงจงเธฒนเธ—เธธก 15 เธงเธดนเธฒเธ—เธต
setInterval(async () => {
  try {
    if (postProcess) return;
    const schedules = await db.getSchedules();
    const now = Date.now();
    const due = schedules.find((s) => s.status === 'pending' && new Date(s.scheduled_for).getTime() <= now);
    if (!due) return;
    try {
      const assignmentIds = Array.isArray(due.assignment_ids) ? due.assignment_ids : [];
      const started = startPostRun(assignmentIds);
      await db.updateSchedule(due.id, { status: 'running', last_run_id: started.runId, last_error: null });
    } catch (err) {
      await db.updateSchedule(due.id, { status: 'failed', last_error: err.message || String(err) });
    }
  } catch (err) {
    logger.error('schedule_worker', { message: err.message });
  }
}, 15000);

// --- API: Config (for Bot) ---
app.get('/api/config', async (req, res) => {
  try {
    const config = await db.getDynamicConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Serve admin UI (static + SPA fallback) ---
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API เธ—เธต่ไเธก่เธกเธต route เธ•เธฃงกเธฑน โ’ JSON 404
app.use((req, res, next) => {
  const url = req.originalUrl || req.url || '';
  if (url.startsWith('/api')) {
    logger.warn('api.not_found', { method: req.method, path: url });
    return res.status(404).json({
      error: 'API not found',
      path: url,
      hint:
        'ถ้าเป็น /api/fb-session-health — โปรเซสนี้ไม่ใช่ server/index.js ชุดล่าสุด หรือรัน npm start จากโฟลเดอร์ผิด ให้หยุดโปรเซสบนพอร์ตนี้แล้วรัน npm start จากโฟลเดอร์ AUTO-POST ที่แก้ไขใน Cursor',
    });
  }
  next();
});

// API: เธช่ง JSON เน€เธชเธกเธญเน€เธกเธท่เธญ error (กเธฑนเน€บเธฃเธฒเธง์เน€ซเธญเธฃ์ไเธ”้ HTML จเธฒก default handler ขเธญง Express) - เธ•้เธญงเธญเธขเธน่เธ—้เธฒเธขเธชเธธเธ”
app.use((err, req, res, next) => {
  const url = req.originalUrl || req.url || '';
  if (url.startsWith('/api')) {
    logger.error('api.unhandled', { path: url, message: err.message });
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({ error: err.message || 'Internal server error' });
  }
  next(err);
});

function startServer(port) {
  const server = app.listen(port, () => {
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      serverListenPort = addr.port;
    }
    logger.info('server.listen', { url: `http://localhost:${serverListenPort}`, port: serverListenPort });
    console.log(
      `[AUTO-POST] ${SERVER_BUILD_MARK} | ${path.resolve(__filename)} | http://localhost:${serverListenPort}/api/fb-session-health`
    );
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn('server.port_in_use', { port, try_next: port + 1 });
      console.warn(
        `\n[AUTO-POST] พอร์ต ${port} ถูกใช้อยู่แล้ว → จะลองพอร์ต ${port + 1}\n` +
          `[AUTO-POST] เปิด Admin ที่ http://localhost:${port + 1} (ไม่ใช่ ${port}) ถ้าสำเร็จ\n`
      );
      startServer(port + 1);
    } else {
      throw err;
    }
  });
}

if (process.env.VERCEL) {
  // Vercel Serverless Function mode: export app instead of opening local port.
  module.exports = app;
} else {
  startServer(PORT);
  (async () => {
    await db.ensurePostLogsGroupNameText().catch(() => {});
    await db.ensureUsersContactPhoneColumn().catch(() => {});
    await db.ensureAssignmentsJobIdsColumn().catch((e) =>
      logger.warn('db.assignments_bootstrap', { message: e?.message || String(e) })
    );
  })();
}
