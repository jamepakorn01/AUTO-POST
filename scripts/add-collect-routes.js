const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'server', 'index.js');
let s = fs.readFileSync(p, 'utf8');
if (s.includes("'/api/run/collect-status'")) {
  console.log('routes already present');
  process.exit(0);
}
const marker = "app.post('/api/schedules/:id/run-now', async (req, res) => {";
const idx = s.indexOf(marker);
if (idx === -1) throw new Error('marker not found');
const block = `
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
  const base = leadCollectBot.getCollectRunStatus();
  if (base.run_id) {
    try {
      const logs = await db.getRunLogs({ run_id: base.run_id, limit: 80 });
      base.recent_logs = [...logs].reverse();
    } catch {
      base.recent_logs = [];
    }
  } else base.recent_logs = [];
  res.json(base);
});

app.post('/api/run/collect-comments', async (req, res) => {
  try {
    const user_id = req.body?.user_id;
    const post_log_ids = req.body?.post_log_ids;
    const out = await leadCollectBot.startCollectCommentsRun(user_id, post_log_ids, {
      projectRoot: PROJECT_ROOT,
      listenPort: serverListenPort,
      postProcessRef: () => !!postProcess,
    });
    res.json({ ok: true, run_id: out.runId, status: out.status });
  } catch (err) {
    if (err.statusCode === 409 || err.statusCode === 400) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

`;
s = s.slice(0, idx) + block + s.slice(idx);
fs.writeFileSync(p, s);
console.log('routes added');
