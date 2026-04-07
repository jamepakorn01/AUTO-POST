const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'public', 'app.js');
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  /if \(d\.total_posts\) parts\.push\('โพสต์ในรอบ: ' \+ d\.total_posts\);\r?\n\s*line\.textContent = \(parts\.join\(' · '\) \|\| 'พร้อม'\) \+ ' — ' \+ \(d\.message \|\| ''\);/,
  `if (d.total_posts) parts.push('โพสต์ในรอบ: ' + d.total_posts);
        if (d.running && d.use_headed_browser === true) parts.push('โหมด: เปิด Chrome');
        if (d.running && d.use_headed_browser === false) parts.push('โหมด: ไม่โชว์หน้าต่าง');
        line.textContent = (parts.join(' · ') || 'พร้อม') + ' — ' + (d.message || '');`
);
fs.writeFileSync(p, s);
console.log('ok');
