const fs = require('fs');
const p = 'public/index.html';
let s = fs.readFileSync(p, 'utf8');

s = s.replace(/<title>[\s\S]*?<\/title>/, '<title>AUTO-POST ผู้ดูแลระบบ</title>');
s = s.replace(/(<aside id="app-sidebar" class="app-sidebar" aria-label=")[^"]*(">)/, '$1เมนูหลัก$2');
s = s.replace(/(<nav class="sidebar-nav" aria-label=")[^"]*(">)/, '$1แท็บหน้า$2');
s = s.replace(/(<button type="button" data-tab="lead_collect"[\s\S]*?<span class="tab-icon"[\s\S]*?<\/svg><\/span>\s*<span>)[\s\S]*?(<\/span>)/, '$1เก็บ Comment$2');
s = s.replace(/(<button type="button" data-tab="reports"[\s\S]*?<span class="tab-icon"[\s\S]*?<\/svg><\/span>\s*<span>)[\s\S]*?(<\/span>)/, '$1รายงาน$2');
s = s.replace(/<p id="run-status-text" class="run-status">[\s\S]*?<\/p>/, '<p id="run-status-text" class="run-status">สถานะ: ยังไม่เคยเริ่มโพสต์</p>');
s = s.replace(/(<button type="button" id="btn-run-post" class="btn-primary w-full justify-center py-2\.5">)\s*[\s\S]*?(\s*<\/button>)/, '$1เริ่มโพสต์$2');
s = s.replace(/(<button type="button" id="sidebar-toggle" class="btn-icon lg:hidden" aria-label=")[^"]*(">)/, '$1เปิดเมนู$2');
s = s.replace(/(<button type="button" id="btn-add" class="btn-primary text-sm shrink-0 w-full sm:w-auto">)[\s\S]*?(<\/button>)/, '$1+ เพิ่มรายการ$2');
s = s.replace(/<!-- Modal:[\s\S]*?-->\s*<div id="form-modal"/, '<!-- Modal: เพิ่ม/แก้ไข -->\n  <div id="form-modal"');
s = s.replace(/(<h3 class="text-lg font-bold text-slate-900 tracking-tight" id="form-title">)[\s\S]*?(<\/h3>)/, '$1เพิ่ม User$2');
s = s.replace(/(<button id="modal-close"[\s\S]*?aria-label=")[^"]*(">)/, '$1ปิด$2');
s = s.replace(/<!-- Modal:[\s\S]*?-->\s*<div id="delete-modal"/, '<!-- Modal: ยืนยันลบ -->\n  <div id="delete-modal"');
s = s.replace(/(<h3 class="text-lg font-bold text-slate-900 leading-snug pt-1">)[\s\S]*?(<\/h3>)/, '$1ยืนยันการลบ$2');
s = s.replace(/<p class="text-slate-600 text-sm leading-relaxed mb-6">[\s\S]*?<\/p>/, '<p class="text-slate-600 text-sm leading-relaxed mb-6">ต้องการลบ <span id="delete-desc" class="font-semibold text-slate-800">รายการนี้</span> ใช่หรือไม่?</p>');
s = s.replace(/(<button id="delete-cancel" type="button" class="btn-secondary">)[\s\S]*?(<\/button>)/, '$1ยกเลิก$2');
s = s.replace(/(<button id="delete-confirm" type="button" class="btn-danger">)[\s\S]*?(<\/button>)/, '$1ลบ$2');

fs.writeFileSync(p, s, 'utf8');
console.log('index labels normalized');
