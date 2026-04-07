const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'public', 'index.html');
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/app\.js\?v=[^"']+/, 'app.js?v=collect-headed-session-20260401');
fs.writeFileSync(p, s);
console.log('bumped');
