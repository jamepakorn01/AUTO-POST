const fs = require('fs');
const p = 'public/index.html';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('id="form-modal"')) {
  const marker = '  <!-- Modal: ยืนยันลบ -->';
  const block = `  <!-- Modal: เพิ่ม/แก้ไข -->\n  <div id="form-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="form-title">\n    <div class="modal-panel" onclick="event.stopPropagation()">\n      <div class="modal-panel-inner">\n        <div class="flex justify-between items-start gap-4">\n          <h3 class="text-lg font-bold text-slate-900 tracking-tight" id="form-title">เพิ่ม User</h3>\n          <button id="modal-close" type="button" class="modal-close-btn shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" aria-label="ปิด">\n            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>\n          </button>\n        </div>\n        <form id="crud-form" class="field-form-spacing mt-4"></form>\n        <div id="form-actions" class="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-2"></div>\n      </div>\n    </div>\n  </div>\n\n`;
  if (!s.includes(marker)) throw new Error('delete modal marker not found');
  s = s.replace(marker, block + marker);
  fs.writeFileSync(p, s, 'utf8');
  console.log('form modal restored');
} else {
  console.log('form modal already exists');
}
