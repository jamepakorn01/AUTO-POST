const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'public', 'app.js');
let s = fs.readFileSync(p, 'utf8');
const rep = [
  [
    'รายการจัดกลุ่มตามชื่องาน — ติ๊กเลือกลิงก์ที่ต้องการ แล้วกด <strong>เก็บ Comment (Headless)</strong> ระบบใช้ Chromium แบบไม่โชว์หน้าต่าง และบันทึกเบอร์ลง Post Log (ช่องเบอร์สูงสุด ~100 ตัวอักษร)',
    'รายการจัดกลุ่มตามชื่องาน — ติ๊กเลือกลิงก์แล้วกด <strong>เก็บ Comment</strong> · <strong>ครั้งแรก</strong> (ยังไม่มี session ในโฟลเดอร์ <code class="text-xs bg-slate-100 px-1 rounded">.auth</code>) ระบบจะเปิด Google Chrome ให้ล็อกอิน/ยืนยันตัวตน · <strong>ครั้งถัดไป</strong> ถ้ามี session แล้วจะรันแบบไม่โชว์หน้าต่าง · บันทึกเบอร์ลง Post Log (สูงสุด ~100 ตัวอักษร)',
  ],
  [
    '<button type="button" id="collect-run-headless-btn" class="btn-primary text-sm">เก็บ Comment (Headless)</button>',
    '<button type="button" id="collect-run-headless-btn" class="btn-primary text-sm">เก็บ Comment</button>',
  ],
  [
    'ถ้า Facebook ขอยืนยันตัวตน (checkpoint) แบบ headless อาจล้มเหลว — ให้รันโพสต์แบบมีหน้าต่างครั้งหนึ่งเพื่อบันทึก session ก่อน',
    'ถ้ายังไม่เคยล็อกอินบัญชีนี้ในระบบ ให้ยืนยันใน Chrome ที่เปิดขึ้น; หลังมีไฟล์ session แล้วรอบถัดไปจะไม่เปิดหน้าต่าง',
  ],
  [
    "if (!confirm('รันเก็บ Comment แบบ Headless สำหรับ ' + ids.length + ' โพสต์? (ดูสถานะด้านบน — ห้ามรันโพสต์พร้อมกัน)')) return;",
    "if (!confirm('รันเก็บ Comment สำหรับ ' + ids.length + ' โพสต์? (ครั้งแรกอาจเปิด Chrome — ดูสถานะด้านบน — ห้ามรันโพสต์พร้อมกัน)')) return;",
  ],
];
for (const [a, b] of rep) {
  if (!s.includes(a)) {
    console.warn('skip (not found):', a.slice(0, 50));
    continue;
  }
  s = s.split(a).join(b);
}
const statusOld = `        if (d.total_posts) parts.push('โพสต์ในรอบ: ' + d.total_posts);
        line.textContent = (parts.join(' · ') || 'พร้อม') + ' — ' + (d.message || '');`;
const statusNew = `        if (d.total_posts) parts.push('โพสต์ในรอบ: ' + d.total_posts);
        if (d.running && d.use_headed_browser === true) parts.push('โหมด: เปิด Chrome');
        if (d.running && d.use_headed_browser === false) parts.push('โหมด: ไม่โชว์หน้าต่าง');
        line.textContent = (parts.join(' · ') || 'พร้อม') + ' — ' + (d.message || '');`;
if (s.includes(statusOld)) s = s.split(statusOld).join(statusNew);
else console.warn('status line pattern skip');
fs.writeFileSync(p, s);
console.log('app copy patched');
