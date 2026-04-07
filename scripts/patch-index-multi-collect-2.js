const fs = require('fs');
const p = 'server/index.js';
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
`function startPostRun(assignmentIds = []) {
  if (leadCollectBot.isCollectRunning()) {
    const err = new Error('กำลังรันเก็บ Comment อยู่แล้ว รอให้จบก่อน');
    err.statusCode = 409;
    err.payload = { collect_running: true, status: leadCollectBot.getCollectRunStatus() };
    throw err;
  }
  if (postProcess) {`,
`function startPostRun(assignmentIds = []) {
  if (postProcess) {`
);

s = s.replace(
`app.get('/api/run/collect-status', async (req, res) => {
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
});`,
`app.get('/api/run/collect-status', async (req, res) => {
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
});`
);

s = s.replace(
`app.post('/api/run/collect-comments', async (req, res) => {
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
});`,
`app.post('/api/run/collect-comments', async (req, res) => {
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
});`
);

s = s.replace('    if (leadCollectBot.isCollectRunning()) return;\n', '');

fs.writeFileSync(p, s, 'utf8');
console.log('index replacements done');
