const fs = require('fs');
const p = 'public/app.js';
let s = fs.readFileSync(p, 'utf8');

s = s.replace('    el.textContent = `สถานะ: ${parts.join(\' \')}`;\n  } catch {', '    el.textContent = `สถานะ: ${parts.join(\' \')}`;\n    renderPostStatusCards(s);\n  } catch {');

if (!s.includes('function renderPostStatusCards(status)')) {
  const insertAfter = '}
setInterval(refreshRunStatusBanner, 4000);
refreshRunStatusBanner();';
  const block = `}

const hiddenPostStatusUsers = new Set();

function ensurePostStatusStack() {
  let stack = document.getElementById('post-status-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'post-status-stack';
    stack.className = 'fixed right-4 top-20 w-[min(520px,94vw)] space-y-2 z-40';
    document.body.appendChild(stack);
  }
  return stack;
}

function renderPostStatusCards(status) {
  const stack = ensurePostStatusStack();
  const runs = Array.isArray(status?.user_runs) ? status.user_runs : [];
  const visible = runs.filter((u) => {
    const key = String(u.user_id || '__unknown__');
    return !hiddenPostStatusUsers.has(key);
  });
  if (!visible.length || !status?.running) {
    stack.innerHTML = '';
    return;
  }
  stack.innerHTML = visible
    .map((u) => {
      const key = escapeHtml(String(u.user_id || '__unknown__'));
      const title = escapeHtml(String(u.user_name || u.user_id || 'ไม่ระบุบัญชี'));
      const logs = Array.isArray(u.recent_logs) ? u.recent_logs : [];
      const logHtml = logs.slice(0, 5).map((l) => \
        '<li>' + escapeHtml(l.message || '') + '</li>'\
      ).join('');
      return \
        '<div class="rounded-xl border border-slate-800 bg-slate-900 text-slate-100 p-3 text-sm shadow-2xl">' +
        '<div class="flex items-start justify-between gap-2 mb-1">' +
        '<p class="text-xs font-semibold text-slate-300">สถานะโพสต์: ' + title + '</p>' +
        '<button type="button" class="post-status-hide-one text-xs text-slate-300 hover:text-white" data-user-key="' + key + '">ซ่อน</button>' +
        '</div>' +
        '<p class="text-sm mb-1">' + escapeHtml(u.message || status.message || '-') + '</p>' +
        '<ul class="max-h-28 overflow-y-auto text-xs space-y-0.5 list-disc pl-4 text-slate-300">' + (logHtml || '<li>ยังไม่มี log ล่าสุด</li>') + '</ul>' +
        '</div>';
    })
    .join('');
  stack.querySelectorAll('.post-status-hide-one').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = String(btn.getAttribute('data-user-key') || '').trim();
      if (!key) return;
      hiddenPostStatusUsers.add(key);
      renderPostStatusCards(status);
    });
  });
}
setInterval(refreshRunStatusBanner, 4000);
refreshRunStatusBanner();`;
  s = s.replace(insertAfter, block);
}

fs.writeFileSync(p, s, 'utf8');
console.log('post status cards injected');
