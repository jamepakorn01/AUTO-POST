const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'server', 'index.js');
let s = fs.readFileSync(p, 'utf8');
const a = `    if (postProcess) return;
    const schedules = await db.getSchedules();`;
const b = `    if (postProcess) return;
    if (leadCollectBot.isCollectRunning()) return;
    const schedules = await db.getSchedules();`;
if (s.includes(b)) {
  console.log('scheduler already patched');
} else if (s.includes(a)) {
  s = s.split(a).join(b);
  fs.writeFileSync(p, s);
  console.log('scheduler patched');
} else {
  throw new Error('pattern not found');
}
