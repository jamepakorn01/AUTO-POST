const fs = require('fs');

function fixIndex() {
  const p = 'public/index.html';
  let s = fs.readFileSync(p, 'utf8');
  const replacements = [
    [/aria-label="เน€เธกเธเธนเธซเธฅเธฑเธ"/g, 'aria-label="เมนูหลัก"'],
    [/aria-label="เนเธ—เนเธเธซเธเนเธฒ"/g, 'aria-label="แท็บหน้า"'],
    [/>เน€เธเนเธ Comment</g, '>เก็บ Comment<'],
    [/>เธฃเธฒเธขเธเธฒเธ</g, '>รายงาน<'],
    [/>เธชเธ–เธฒเธเธฐ: เธขเธฑเธเนเธกเนเน€เธเธขเน€เธฃเธดเนเธกเนเธเธชเธ•เน</g, '>สถานะ: ยังไม่เคยเริ่มโพสต์<'],
    [/>\s*เน€เธฃเธดเนเธกเนเธเธชเธ•เน\s*</g, '>เริ่มโพสต์<'],
    [/aria-label="เน€เธเธดเธ”เน€เธกเธเธน"/g, 'aria-label="เปิดเมนู"'],
    [/>\+ เน€เธเธดเนเธกเธฃเธฒเธขเธเธฒเธฃ</g, '>+ เพิ่มรายการ<'],
    [/<!-- Modal: เน€เธเธดเนเธก\/เนเธเนเนเธ -->/g, '<!-- Modal: เพิ่ม/แก้ไข -->'],
    [/>เน€เธเธดเนเธก User</g, '>เพิ่ม User<'],
    [/aria-label="เธเธดเธ”"/g, 'aria-label="ปิด"'],
    [/<!-- Modal: เธขเธทเธเธขเธฑเธเธฅเธ -->/g, '<!-- Modal: ยืนยันลบ -->'],
    [/>เธขเธทเธเธขเธฑเธเธเธฒเธฃเธฅเธ</g, '>ยืนยันการลบ<'],
    [/เธ•เนเธญเธเธเธฒเธฃเธฅเธ <span id="delete-desc" class="font-semibold text-slate-800">เธฃเธฒเธขเธเธฒเธฃเธเธตเน<\/span> เนเธเนเธซเธฃเธทเธญเนเธกเน\?/g, 'ต้องการลบ <span id="delete-desc" class="font-semibold text-slate-800">รายการนี้</span> ใช่หรือไม่?'],
    [/>เธขเธเน€เธฅเธดเธ</g, '>ยกเลิก<'],
    [/>เธฅเธ</g, '>ลบ<'],
  ];
  for (const [from, to] of replacements) s = s.replace(from, to);
  fs.writeFileSync(p, s, 'utf8');
}

function fixServerIndex() {
  const p = 'server/index.js';
  let s = fs.readFileSync(p, 'utf8');
  const replacements = [
    [/error: 'เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธ fb_group_id'/g, "error: 'กรุณาระบุ fb_group_id'"],
    [/error: 'เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ User \(เธเธฑเธเธเธตเธ—เธตเนเน€เธเนเธฒเธเธฅเธธเนเธกเธเธตเนเนเธ”เน\)'/g, "error: 'กรุณาเลือก User (บัญชีที่เข้ากลุ่มนี้ได้)'"],
    [/error: 'User เธเธตเนเธขเธฑเธเนเธกเนเธกเธต FB Access Token\\n\\nเนเธเนเธเนเนเธ User เนเธฅเนเธงเธเธฃเธญเธ "FB Access Token" เธซเธฃเธทเธญเธ•เธฑเนเธเธเนเธฒ USER_\{env_key\}_FB_ACCESS_TOKEN เนเธ \.env'/g, "error: 'User นี้ยังไม่มี FB Access Token\\n\\nไปแก้ไข User แล้วกรอก \"FB Access Token\" หรือกำหนด USER_{env_key}_FB_ACCESS_TOKEN ใน .env'"],
    [/error: 'run_id เนเธฅเธฐ message เธเธณเน€เธเนเธ'/g, "error: 'run_id และ message จำเป็น'"],
    [/error: 'run_id, poster_name, job_title เธเธณเน€เธเนเธ'/g, "error: 'run_id, poster_name, job_title จำเป็น'"],
    [/const bad = \/เธฃเธนเธเนเธเธเธงเธฑเธเธ—เธตเน\|เธ•เนเธญเธเธฃเธฐเธเธธ user_id\/.test\(msg\);/g, "const bad = /รูปแบบวันที่|วันที่เริ่ม|ต้องระบุ user_id/.test(msg);"],
    [/message: 'เธขเธฑเธเนเธกเนเน€เธเธขเน€เธฃเธดเนเธกเนเธเธชเธ•เน'/g, "message: 'ยังไม่เคยเริ่มโพสต์'"],
    [/new Error\('เธเธณเธฅเธฑเธเธฃเธฑเธเน€เธเนเธ Comment เธญเธขเธนเนเนเธฅเนเธง เธฃเธญเนเธซเนเธเธเธเนเธญเธ'\)/g, "new Error('กำลังรันเก็บ Comment อยู่แล้ว รอให้จบก่อน')"],
    [/new Error\('เธเธณเธฅเธฑเธเธฃเธฑเธ Post เธญเธขเธนเนเนเธฅเนเธง'\)/g, "new Error('กำลังรัน Post อยู่แล้ว')"],
    [/message: 'เธเธณเธฅเธฑเธเธ”เธณเน€เธเธดเธเธเธฒเธฃเนเธเธชเธ•เน\.\.\.'/g, "message: 'กำลังดำเนินการโพสต์...'"],
    [/message: code === 0 \? 'เธ”เธณเน€เธเธดเธเธเธฒเธฃเน€เธชเธฃเนเธเธชเธดเนเธเนเธฅเนเธง' : `เธชเธดเนเธเธชเธธเธ”เธเธฒเธฃเธ—เธณเธเธฒเธ \(exit code: \$\{code\}\)`/g, "message: code === 0 ? 'ดำเนินการเสร็จสิ้นแล้ว' : `สิ้นสุดการทำงาน (exit code: ${code})`"],
    [/message: 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เธฃเธฐเธซเธงเนเธฒเธเธฃเธฑเธเนเธเธชเธ•เน'/g, "message: 'เกิดข้อผิดพลาดระหว่างรันโพสต์'"],
    [/message: 'เธเธณเธฅเธฑเธเน€เธเธดเธ” Browser เธชเธณเธซเธฃเธฑเธเนเธเธชเธ•เน - เธเธฃเธธเธ“เธฒ Login Facebook'/g, "message: 'กำลังเปิด Browser สำหรับโพสต์ - กรุณา Login Facebook'"],
    [/message: 'เน€เธฃเธดเนเธกเนเธเธชเธ•เนเนเธกเนเธชเธณเน€เธฃเนเธ'/g, "message: 'เริ่มโพสต์ไม่สำเร็จ'"],
  ];
  for (const [from, to] of replacements) s = s.replace(from, to);
  fs.writeFileSync(p, s, 'utf8');
}

fixIndex();
fixServerIndex();
console.log('mojibake fixed in index/server');
