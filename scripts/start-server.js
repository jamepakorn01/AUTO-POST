/**
 * ตรวจว่า server/index.js บนดิสก์มี route เช็ค Facebook session แล้วค่อยรัน Node
 * กันพลาดรัน npm start จากโฟลเดอร์ผิด / ไฟล์ไม่ save
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'server', 'index.js');

const markers = [
  "app.get('/api/fb-session-health'",
  'SERVER_BUILD_MARK',
  "app.post('/api/fb-session-check'",
  'handleFacebookSessionCheckPost',
];

function main() {
  if (!fs.existsSync(indexPath)) {
    console.error('[AUTO-POST] ไม่พบไฟล์:', indexPath);
    process.exit(1);
  }
  const src = fs.readFileSync(indexPath, 'utf8');
  const missing = markers.filter((m) => !src.includes(m));
  if (missing.length) {
    console.error('[AUTO-POST] server/index.js ไม่มีส่วนที่จำเป็นสำหรับ "ล็อกอิน Facebook":', missing.join(', '));
    console.error('แก้ไข: save ไฟล์ server/index.js ให้ครบ แล้วรัน npm start จากโฟลเดอร์ที่มีโฟลเดอร์ server นี้');
    process.exit(1);
  }

  console.log('[AUTO-POST] ตรวจไฟล์แล้ว — สตาร์ทเซิร์ฟเวอร์จาก:');
  console.log('         ', path.resolve(indexPath));
  console.log('');

  const child = spawn(process.execPath, [indexPath], {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env },
  });
  child.on('exit', (code, sig) => {
    process.exit(code != null ? code : sig ? 1 : 0);
  });
}

main();
