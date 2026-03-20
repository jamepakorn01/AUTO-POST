/**
 * AUTO-POST Web Admin Server
 * Express backend with PostgreSQL
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const db = require('./db');

const PROJECT_ROOT = path.join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

function parseArrayField(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

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

// --- API: Facebook - ดึงชื่อกลุ่มจาก Group ID (ใช้ token ตาม User) ---
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
      error: 'User นี้ยังไม่มี FB Access Token\n\nไปแก้ไข User แล้วกรอก "FB Access Token" หรือตั้งค่า USER_{env_key}_FB_ACCESS_TOKEN ใน .env',
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
    const newGroup = await db.createGroup(req.body);
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
    const group = await db.updateGroup(req.params.id, req.body);
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

app.post('/api/jobs', async (req, res) => {
  try {
    const newJob = await db.createJob({ ...req.body, status: 'pending' });
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
    const job = await db.updateJob(req.params.id, req.body);
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

// --- API: Post Logs (รูปแบบ Log File) ---
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

// --- API: Run Post Bot ---
let postProcess = null;

app.post('/api/run/post', (req, res) => {
  if (postProcess) {
    return res.status(409).json({ error: 'กำลังรัน Post อยู่แล้ว', running: true });
  }
  const assignmentIds = req.body?.assignment_ids;
  const runId = db.generateRunId();
  const env = { ...process.env, FORCE_COLOR: '1', RUN_ID: runId };
  if (Array.isArray(assignmentIds) && assignmentIds.length > 0) {
    env.ASSIGNMENT_IDS = assignmentIds.join(',');
  }
  env.RUN_LOG_API_URL = `http://localhost:${process.env.PORT || 3000}`;
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npx.cmd' : 'npx';
  const args = ['playwright', 'test', 'postAll', '--headed', '--project=Google Chrome'];
  postProcess = spawn(cmd, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env,
  });
  postProcess.on('close', (code) => {
    postProcess = null;
    console.log(`Post Bot จบ (code: ${code})`);
  });
  postProcess.on('error', (err) => {
    postProcess = null;
    console.error('Post Bot error:', err);
  });
  res.json({ ok: true, message: 'กำลังเปิด Browser สำหรับโพสต์ - กรุณา Login และกด Resume' });
});

app.get('/api/run/status', (req, res) => {
  res.json({ running: !!postProcess });
});

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

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`AUTO-POST Admin running at http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} ถูกใช้งานอยู่ ลองพอร์ต ${port + 1}...`);
      startServer(port + 1);
    } else {
      throw err;
    }
  });
}
startServer(PORT);
