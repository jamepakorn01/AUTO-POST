const fs = require('fs');
const p = 'server/index.js';
let s = fs.readFileSync(p, 'utf8');
const old = `app.get('/api/run/status', (req, res) => {
  res.json({
    ...runStatus,
    running: !!postProcess,
  });
});`;
const neu = `app.get('/api/run/status', async (req, res) => {
  const base = {
    ...runStatus,
    running: !!postProcess,
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
      run_id: base.run_id,
    }));
    return res.json({ ...base, recent_logs: ordered.slice(0, 80), user_runs });
  } catch {
    return res.json({ ...base, recent_logs: [], user_runs: [] });
  }
});`;
if (!s.includes(old)) {
  throw new Error('old run/status block not found');
}
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('run status patched');
