const fs = require('fs');
const p = 'public/index.html';
let s = fs.readFileSync(p, 'utf8');
const replacements = [
  ['aria-label="เน€เธกเธเธนเธซเธฅเธฑเธ"', 'aria-label="เมนูหลัก"'],
  ['aria-label="เนเธ—เนเธเธซเธเนเธฒ"', 'aria-label="แท็บหน้า"'],
  ['<span>เน€เธเนเธ Comment</span>', '<span>เก็บ Comment</span>'],
  ['<span>เธฃเธฒเธขเธเธฒเธ</span>', '<span>รายงาน</span>'],
  ['<p id="run-status-text" class="run-status">เธชเธ–เธฒเธเธฐ: เธขเธฑเธเนเธกเนเน€เธเธขเน€เธฃเธดเนเธกเนเธเธชเธ•เน</p>', '<p id="run-status-text" class="run-status">สถานะ: ยังไม่เคยเริ่มโพสต์</p>'],
  ['เน€เธฃเธดเนเธกเนเธเธชเธ•เน', 'เริ่มโพสต์'],
  ['aria-label="เน€เธเธดเธ”เน€เธกเธเธน"', 'aria-label="เปิดเมนู"'],
  ['+ เน€เธเธดเนเธกเธฃเธฒเธขเธเธฒเธฃ', '+ เพิ่มรายการ'],
  ['<!-- Modal: เน€เธเธดเนเธก/เนเธเนเนเธ -->', '<!-- Modal: เพิ่ม/แก้ไข -->'],
  ['>เน€เธเธดเนเธก User<', '>เพิ่ม User<'],
  ['aria-label="เธเธดเธ”"', 'aria-label="ปิด"'],
  ['<!-- Modal: เธขเธทเธเธขเธฑเธเธฅเธ -->', '<!-- Modal: ยืนยันลบ -->'],
  ['>เธขเธทเธเธขเธฑเธเธเธฒเธฃเธฅเธ<', '>ยืนยันการลบ<'],
  ['เธ•เนเธญเธเธเธฒเธฃเธฅเธ <span id="delete-desc" class="font-semibold text-slate-800">เธฃเธฒเธขเธเธฒเธฃเธเธตเน</span> เนเธเนเธซเธฃเธทเธญเนเธกเน?', 'ต้องการลบ <span id="delete-desc" class="font-semibold text-slate-800">รายการนี้</span> ใช่หรือไม่?'],
  ['>เธขเธเน€เธฅเธดเธ<', '>ยกเลิก<'],
  ['>เธฅเธ<', '>ลบ<'],
];
for (const [a,b] of replacements) s = s.split(a).join(b);
fs.writeFileSync(p, s, 'utf8');
console.log('fixed index thai labels');
