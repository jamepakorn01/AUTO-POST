async function loadLeadCollectTab() {
  const container = document.getElementById('list-container');
  container.className = 'min-h-[240px] p-4 sm:p-6';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const defaultDate = localDateISO(yesterday);
  const selStartDate = document.getElementById('collect-date-start')?.value || defaultDate;
  const selEndDate = document.getElementById('collect-date-end')?.value || defaultDate;
  const selUser = document.getElementById('collect-user-id')?.value || '';
  const qFilter = String(document.getElementById('collect-search')?.value || '').trim();

  let userOptions = [];
  try {
    userOptions = await apiGet('users');
  } catch {
    userOptions = [];
  }

  const userOptsHtml = userOptions
    .map((u) => {
      const id = String(u.id || '');
      const lab = u.poster_name || u.name || u.email || id;
      const sel = id === selUser ? ' selected' : '';
      return `<option value="${escapeHtml(id)}"${sel}>${escapeHtml(lab)}</option>`;
    })
    .join('');

  container.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-4 mb-4 shadow-sm">
      <p class="text-sm font-semibold text-slate-800 mb-1">เน€เธฅเธทเธญเธเธเนเธงเธเธงเธฑเธเธ—เธตเนเนเธเธชเธ•เนเนเธฅเธฐเธเธฑเธเธเธต</p>
      <p class="text-xs text-slate-500 mb-3">เน€เธฅเธทเธญเธเธ—เธตเธฅเธฐเธเธฑเธเธเธตเนเธฅเนเธงเธเธ”เน€เธเนเธ Comment เธเธฒเธเธเธฑเนเธเน€เธเธฅเธตเนเธขเธเธเธฑเธเธเธตเนเธฅเนเธงเธเธ”เธฃเธฑเธเธ•เนเธญเนเธ”เน เนเธ”เธขเธชเธ–เธฒเธเธฐเธเธฐเนเธขเธเน€เธเนเธเธเธฅเนเธญเธเธฃเธฒเธขเธเธฑเธเธเธตเธญเธฑเธ•เนเธเธกเธฑเธ•เธด</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label class="block text-xs text-slate-500 mb-1">เธงเธฑเธเธ—เธตเนเนเธเธชเธ•เนเน€เธฃเธดเนเธก (เนเธ—เธข)</label>
          <input id="collect-date-start" type="date" class="input py-1.5 text-sm" value="${escapeHtml(selStartDate)}">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">เธงเธฑเธเธ—เธตเนเนเธเธชเธ•เนเธชเธดเนเธเธชเธธเธ” (เนเธ—เธข)</label>
          <input id="collect-date-end" type="date" class="input py-1.5 text-sm" value="${escapeHtml(selEndDate)}">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-slate-500 mb-1">เธเธฑเธเธเธต Facebook เธ—เธตเนเนเธเนเนเธเธชเธ•เน</label>
          <select id="collect-user-id" class="input py-1.5 text-sm">
            <option value="">-- เน€เธฅเธทเธญเธเธเธฑเธเธเธต --</option>
            ${userOptsHtml}
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">เธเนเธเธซเธฒเนเธเธ•เธฒเธฃเธฒเธ</label>
          <input id="collect-search" type="text" class="input py-1.5 text-sm" placeholder="เธเธทเนเธญเธเธฒเธ, เธเธฅเธธเนเธก, เธฅเธดเธเธเนโ€ฆ" value="${escapeHtml(qFilter)}">
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        <button type="button" id="collect-clear-search" class="btn-secondary text-sm">เธฅเนเธฒเธเธเนเธญเธเธเนเธเธซเธฒ</button>
        <button type="button" id="collect-select-all-btn" class="btn-secondary text-sm">เน€เธฅเธทเธญเธเธ—เธฑเนเธเธซเธกเธ”เธ—เธตเนเนเธชเธ”เธ</button>
        <button type="button" id="collect-download-report-btn" class="btn-secondary text-sm">เธ”เธฒเธงเธเนเนเธซเธฅเธ”เธฃเธฒเธขเธเธฒเธ (CSV)</button>
        <button type="button" id="collect-run-headless-btn" class="btn-primary text-sm">เน€เธเนเธ Comment</button>
        <span id="collect-selected-count" class="text-xs text-slate-600 self-center">เน€เธฅเธทเธญเธ 0 เธฃเธฒเธขเธเธฒเธฃ</span>
      </div>
    </div>
    <button type="button" id="collect-status-open" class="btn-secondary text-xs fixed right-4 bottom-4 z-40 hidden">เนเธชเธ”เธเธชเธ–เธฒเธเธฐเน€เธเนเธ Comment</button>
    <div id="collect-status-stack" class="fixed right-4 bottom-4 w-[min(520px,94vw)] max-h-[72vh] overflow-y-auto space-y-2 z-40 pr-1"></div>
    <div id="collect-table-wrap" class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm min-h-[120px]">
      <div class="p-6 text-center text-sm text-slate-500">เน€เธฅเธทเธญเธเธเธฑเธเธเธตเนเธฅเธฐเธเนเธงเธเธงเธฑเธเธ—เธตเน เนเธฅเนเธงเธเธ” ยซเนเธซเธฅเธ”เธฃเธฒเธขเธเธฒเธฃเนเธเธชเธ•เนยป</div>
    </div>`;

  let cachedRows = [];

  const updateSelectedCount = () => {
    const n = document.querySelectorAll('.collect-post-check:checked').length;
    const el = document.getElementById('collect-selected-count');
    if (el) el.textContent = 'เน€เธฅเธทเธญเธ ' + n + ' เธฃเธฒเธขเธเธฒเธฃ';
    const btn = document.getElementById('collect-run-headless-btn');
    if (btn) btn.disabled = n === 0;
  };

  const escCsv = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadCollectCsv = (rows) => {
    const headers = ['เน€เธงเธฅเธฒ', 'เธเธฑเธเธเธต', 'เน€เธเนเธฒเธเธญเธเธเธฒเธ', 'เธเธทเนเธญเธเธฒเธ', 'เธเธทเนเธญเธเธฅเธธเนเธก', 'เธฅเธดเธเธเน', 'เน€เธเธญเธฃเนเนเธ—เธฃเธจเธฑเธเธ—เนเธ—เธตเนเน€เธเนเธเนเธ”เน'];
    const lines = [headers.map(escCsv).join(',')];
    for (const r of rows) {
      const t = r.created_at ? new Date(r.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '';
      lines.push([
        t,
        r.fb_account_name || r.poster_name || r.user_id || '',
        r.owner || '',
        r.job_title || '',
        r.group_name || '',
        r.post_link || '',
        r.customer_phone || '',
      ].map(escCsv).join(','));
    }
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collect-report-${localDateISO(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const hiddenStatusRunIds = new Set();
  const collectTrackedRunIds = new Set();
  let autoFetchTimer = null;
  const collectOpenBtnToneClass = (progress) => {
    if (progress >= 100) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    if (progress >= 70) return 'bg-cyan-50 text-cyan-800 border-cyan-300';
    if (progress >= 35) return 'bg-amber-50 text-amber-800 border-amber-300';
    return 'bg-slate-100 text-slate-700 border-slate-300';
  };
  const collectControl = async (action, userId) => {
    const uid = String(userId || '').trim();
    if (!uid) return;
    if (action === 'cancel') {
      const ok = confirm(`เธขเธทเธเธขเธฑเธเธขเธเน€เธฅเธดเธเธเธฒเธเน€เธเนเธ Comment เธเธญเธเธเธฑเธเธเธต ${uid} ?`);
      if (!ok) return;
    }
    const r = await fetch(`${API}/run/collect-comments/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `เธชเธฑเนเธ ${action} เนเธกเนเธชเธณเน€เธฃเนเธ`);
  };
  const getProgressFromLogs = (logs, isRunning) => {
    const arr = Array.isArray(logs) ? logs : [];
    for (const l of arr) {
      const msg = String(l?.message || '');
      const m = msg.match(/\[(\d+)\/(\d+)\]/);
      if (m) {
        const cur = Math.max(0, parseInt(m[1], 10) || 0);
        const tot = Math.max(0, parseInt(m[2], 10) || 0);
        if (tot > 0) return Math.min(100, Math.round((cur / tot) * 100));
      }
    }
    return isRunning ? 0 : 100;
  };

  const renderStatusCards = (runs) => {
    const stack = document.getElementById('collect-status-stack');
    const openBtn = document.getElementById('collect-status-open');
    if (!stack) return;
    const allRuns = Array.isArray(runs) ? runs : [];
    const shown = allRuns.filter((r) => r && r.run_id && !hiddenStatusRunIds.has(String(r.run_id)));
    const hiddenRuns = allRuns.filter((r) => hiddenStatusRunIds.has(String(r?.run_id || '')));
    if (openBtn) {
      if (hiddenRuns.length > 0) {
        const topProgress = Math.max(...hiddenRuns.map((r) => getProgressFromLogs(r.recent_logs, !!r.running)));
        const short = hiddenRuns
          .slice(0, 2)
          .map((r) => `${String(r.user_name || r.user_id || '-')} ${getProgressFromLogs(r.recent_logs, !!r.running)}%`)
          .join(' | ');
        openBtn.textContent = hiddenRuns.length > 2 ? `เนเธชเธ”เธเธชเธ–เธฒเธเธฐ: ${short} +${hiddenRuns.length - 2}` : `เนเธชเธ”เธเธชเธ–เธฒเธเธฐ: ${short}`;
        openBtn.className = `btn-secondary text-xs fixed right-4 bottom-4 z-40 border ${collectOpenBtnToneClass(topProgress)}`;
        openBtn.classList.remove('hidden');
      } else {
        openBtn.classList.add('hidden');
      }
    }
    if (!shown.length) {
      stack.innerHTML = '';
      return;
    }
    // Keep UI compact: show latest 3 status cards
    const latest = shown.slice(0, 3);
    stack.innerHTML = latest
      .map((run) => {
        const rid = escapeHtml(String(run.run_id || ''));
        const isRunning = !!run.running;
        const isSuccessDone = !isRunning && (Number(run.exit_code) === 0 || /เน€เธชเธฃเนเธ/.test(String(run.message || '')));
        const isFailedDone = !isRunning && !isSuccessDone;
        const progress = getProgressFromLogs(run.recent_logs, isRunning);
        const title = `${escapeHtml(run.user_name || run.user_id || '-')} (${isRunning ? 'เธเธณเธฅเธฑเธเธฃเธฑเธ' : (isSuccessDone ? 'เน€เธชเธฃเนเธเธชเธกเธเธนเธฃเธ“เน' : 'เธชเธดเนเธเธชเธธเธ”เธเธฒเธฃเธ—เธณเธเธฒเธ')})`;
        const logs = Array.isArray(run.recent_logs) ? run.recent_logs : [];
        const uid = escapeHtml(String(run.user_id || ''));
        const canPause = isRunning && !run.paused;
        const canResume = isRunning && !!run.paused;
        const canCancel = isRunning;
        const logHtml = logs.slice(-3).map((l) => `<li>${escapeHtml(l.message || '')}</li>`).join('');
        const progressTone = progress >= 100
          ? 'border-emerald-700 bg-emerald-950/90'
          : progress >= 70
            ? 'border-cyan-700 bg-cyan-950/80'
            : progress >= 35
              ? 'border-amber-700 bg-amber-950/80'
              : 'border-slate-800 bg-slate-900';
        const cardTone = isSuccessDone
          ? 'border-emerald-700 bg-emerald-950/90'
          : (isFailedDone ? 'border-rose-700 bg-rose-950/80' : progressTone);
        return `<div class="rounded-xl border ${cardTone} text-slate-100 p-3 text-sm shadow-2xl">
          <div class="flex items-start justify-between gap-2 mb-1">
            <p class="text-xs font-semibold text-slate-300">${title}</p>
            <button type="button" class="collect-status-hide-one text-sm text-slate-300 hover:text-white" data-run-id="${rid}" aria-label="close-status">ปิด</button>
          </div>
          <p class="text-sm mb-1">${escapeHtml(run.message || '-')} ยท ${progress}%</p>
          <div class="mb-2 grid grid-cols-3 gap-2 border-t border-slate-700 pt-2">
            <button type="button" class="collect-status-action rounded-md px-2 py-1 text-xs bg-amber-500/20 text-amber-200 border border-amber-500/30 disabled:opacity-40" data-action="pause" data-user-id="${uid}" ${canPause ? '' : 'disabled'}>Pause</button>
            <button type="button" class="collect-status-action rounded-md px-2 py-1 text-xs bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 disabled:opacity-40" data-action="resume" data-user-id="${uid}" ${canResume ? '' : 'disabled'}>Play</button>
            <button type="button" class="collect-status-action rounded-md px-2 py-1 text-xs bg-rose-500/20 text-rose-200 border border-rose-500/30 disabled:opacity-40" data-action="cancel" data-user-id="${uid}" ${canCancel ? '' : 'disabled'}>เธขเธเน€เธฅเธดเธเธเธฒเธ</button>
          </div>
          <ul class="max-h-32 overflow-y-auto text-xs space-y-0.5 list-disc pl-4 text-slate-300">${logHtml || '<li>เธขเธฑเธเนเธกเนเธกเธต log เธฅเนเธฒเธชเธธเธ”</li>'}</ul>
        </div>`;
      })
      .join('');
    stack.querySelectorAll('.collect-status-hide-one').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rid = String(btn.getAttribute('data-run-id') || '').trim();
        if (!rid) return;
        hiddenStatusRunIds.add(rid);
        renderStatusCards(runs);
        if (openBtn) openBtn.classList.remove('hidden');
      });
    });
    stack.querySelectorAll('.collect-status-action').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const action = String(btn.getAttribute('data-action') || '').trim();
          const userId = String(btn.getAttribute('data-user-id') || '').trim();
          if (!action || !userId) return;
          btn.disabled = true;
          await collectControl(action, userId);
          await refreshCollectStatusOnce();
        } catch (e) {
          alert(e.message || String(e));
        } finally {
          btn.disabled = false;
        }
      });
    });
  };

  const refreshCollectStatusOnce = async () => {
    try {
      const r = await fetch(API + '/run/collect-status');
      const d = await r.json();
      const runs = Array.isArray(d.runs) ? d.runs : (d.run_id ? [d] : []);
      const visibleRuns = runs.filter((x) => x && x.run_id && (x.running || collectTrackedRunIds.has(String(x.run_id))));
      renderStatusCards(visibleRuns);
      return !!d.running;
    } catch {
      return false;
    }
  };

  const startCollectStatusPoll = () => {
    if (typeof collectStatusPollTimer !== 'undefined' && collectStatusPollTimer) {
      clearInterval(collectStatusPollTimer);
    }
    refreshCollectStatusOnce();
    collectStatusPollTimer = setInterval(async () => {
      const go = await refreshCollectStatusOnce();
      if (!go && collectStatusPollTimer) {
        clearInterval(collectStatusPollTimer);
        collectStatusPollTimer = null;
      }
    }, 2000);
  };

  const groupKey = (r) => `${String(r.user_id || '-')}:${String(r.job_id || 'nojob')}::${String(r.job_title || '(เนเธกเนเธกเธตเธเธทเนเธญเธเธฒเธ)').slice(0, 120)}`;

  const renderRows = (rows) => {
    const wrap = document.getElementById('collect-table-wrap');
    if (!wrap) return;
    const f = String(document.getElementById('collect-search')?.value || '').trim().toLowerCase();
    const filtered = !f
      ? rows
      : rows.filter((r) => [r.job_title, r.group_name, r.post_link, r.owner, r.company, r.poster_name, r.job_id, r.assignment_id, r.fb_account_name]
        .map((x) => String(x || '').toLowerCase()).join(' ').includes(f));
    if (!filtered.length) {
      wrap.innerHTML = '<div class="p-8 text-center text-sm text-slate-500">เนเธกเนเธเธเนเธเธชเธ•เนเธ•เธฒเธกเน€เธเธทเนเธญเธเนเธ</div>';
      updateSelectedCount();
      return;
    }
    const buckets = new Map();
    for (const r of filtered) {
      const k = groupKey(r);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    }
    const parts = [];
    for (const [, list] of buckets) {
      const title = list[0].job_title || '(เนเธกเนเธกเธตเธเธทเนเธญเธเธฒเธ)';
      const rowsHtml = list.map((r) => {
        const link = r.post_link || '';
        const t = r.created_at ? new Date(r.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-';
        const pid = escapeHtml(r.id);
        const uid = escapeHtml(r.user_id || '');
        return `<tr class="border-t border-slate-100 text-sm">
          <td class="py-2 px-2 w-10"><input type="checkbox" class="collect-post-check" data-post-log-id="${pid}" data-user-id="${uid}"></td>
          <td class="py-2 px-3 whitespace-nowrap text-slate-600 text-xs">${escapeHtml(t)}</td>
          <td class="py-2 px-3 text-xs text-slate-600">${escapeHtml(r.fb_account_name || r.poster_name || r.user_id || '-')}</td>
          <td class="py-2 px-3 text-slate-600 max-w-[10rem] truncate text-xs" title="${escapeHtml(r.group_name || '')}">${escapeHtml(r.group_name || '-')}</td>
          <td class="py-2 px-3 text-xs"><a class="text-red-600 hover:underline break-all" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">เน€เธเธดเธ”เนเธเธชเธ•เน</a></td>
          <td class="py-2 px-3 text-xs text-slate-500 font-mono">${escapeHtml(r.job_id || '-')}</td>
          <td class="py-2 px-3 text-center text-xs">${escapeHtml(String(r.comment_count ?? 0))}</td>
          <td class="py-2 px-3 text-xs text-slate-600 max-w-[10rem] truncate" title="${escapeHtml(r.customer_phone || '')}">${escapeHtml(r.customer_phone || '-')}</td>
        </tr>`;
      }).join('');
      parts.push(`<details class="border border-slate-200 rounded-lg mb-2 overflow-hidden" open>
        <summary class="cursor-pointer px-3 py-2.5 bg-slate-50 font-medium text-sm flex flex-wrap items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
          <input type="checkbox" class="collect-group-check mt-0.5" aria-label="close-status">
          <span class="text-slate-800">${escapeHtml(title)}</span>
          <span class="text-xs font-normal text-slate-500">(${list.length} เธฅเธดเธเธเน)</span>
        </summary>
        <div class="overflow-x-auto border-t border-slate-100">
          <table class="w-full text-left">
            <thead><tr class="bg-white text-xs text-slate-500">
              <th class="py-2 px-2 w-10"></th>
              <th class="py-2 px-3">เน€เธงเธฅเธฒ</th>
              <th class="py-2 px-3">เธเธฑเธเธเธต</th>
              <th class="py-2 px-3">เธเธฅเธธเนเธก</th>
              <th class="py-2 px-3">เธฅเธดเธเธเน</th>
              <th class="py-2 px-3">Job ID</th>
              <th class="py-2 px-3 text-center">Comment</th>
              <th class="py-2 px-3">เน€เธเธญเธฃเนเนเธ—เธฃเธ—เธตเนเน€เธเนเธเนเธ”เน</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </details>`);
    }
    wrap.innerHTML = '<div class="p-2">' + parts.join('') + '</div>';

    wrap.querySelectorAll('.collect-post-check').forEach((cb) => cb.addEventListener('change', updateSelectedCount));
    wrap.querySelectorAll('.collect-group-check').forEach((gcb) => {
      gcb.addEventListener('change', () => {
        const details = gcb.closest('details');
        if (!details) return;
        const on = gcb.checked;
        details.querySelectorAll('.collect-post-check').forEach((cb) => { cb.checked = on; });
        updateSelectedCount();
      });
    });
    updateSelectedCount();
  };

  const runFetch = async () => {
    const startDate = document.getElementById('collect-date-start')?.value || '';
    const endDate = document.getElementById('collect-date-end')?.value || '';
    const uid = String(document.getElementById('collect-user-id')?.value || '').trim();
    const tw = document.getElementById('collect-table-wrap');
    if (!uid) return alert('เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธเธฑเธเธเธต');
    if (!startDate || !endDate) return alert('เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธงเธฑเธเธ—เธตเนเน€เธฃเธดเนเธกเนเธฅเธฐเธงเธฑเธเธ—เธตเนเธชเธดเนเธเธชเธธเธ”');
    if (startDate > endDate) return alert('เธงเธฑเธเธ—เธตเนเน€เธฃเธดเนเธกเธ•เนเธญเธเนเธกเนเน€เธเธดเธเธงเธฑเธเธ—เธตเนเธชเธดเนเธเธชเธธเธ”');

    if (tw) tw.innerHTML = '<div class="p-6 text-center text-sm text-slate-500">เธเธณเธฅเธฑเธเนเธซเธฅเธ”โ€ฆ</div>';
    try {
      const url = `${API}/post-logs/for-comment-collect?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&user_id=${encodeURIComponent(uid)}`;
      const merged = await fetch(url).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.error) || res.statusText);
        if (Array.isArray(data)) return data;
        return Array.isArray(data.rows) ? data.rows : [];
      });
      const byId = new Map(merged.map((r) => [String(r.id), r]));
      cachedRows = [...byId.values()].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      renderRows(cachedRows);
    } catch (e) {
      if (tw) tw.innerHTML = `<div class="p-6 text-center text-sm text-red-600">เนเธซเธฅเธ”เนเธกเนเธชเธณเน€เธฃเนเธ: ${escapeHtml(e.message)}</div>`;
    }
  };

  document.getElementById('collect-download-report-btn')?.addEventListener('click', () => {
    if (!cachedRows.length) return alert('เธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธกเธนเธฅเธชเธณเธซเธฃเธฑเธเธ”เธฒเธงเธเนเนเธซเธฅเธ”');
    downloadCollectCsv(cachedRows);
  });
  document.getElementById('collect-clear-search')?.addEventListener('click', () => {
    const el = document.getElementById('collect-search');
    if (el) el.value = '';
    renderRows(cachedRows);
  });
  document.getElementById('collect-search')?.addEventListener('input', () => renderRows(cachedRows));
  const triggerAutoFetch = () => {
    if (autoFetchTimer) clearTimeout(autoFetchTimer);
    autoFetchTimer = setTimeout(() => {
      runFetch();
    }, 250);
  };
  document.getElementById('collect-date-start')?.addEventListener('change', triggerAutoFetch);
  document.getElementById('collect-date-end')?.addEventListener('change', triggerAutoFetch);
  document.getElementById('collect-user-id')?.addEventListener('change', triggerAutoFetch);
  document.getElementById('collect-select-all-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.collect-post-check').forEach((cb) => { cb.checked = true; });
    document.querySelectorAll('.collect-group-check').forEach((g) => { g.checked = true; });
    updateSelectedCount();
  });

  document.getElementById('collect-run-headless-btn')?.addEventListener('click', async () => {
    const selected = [...document.querySelectorAll('.collect-post-check:checked')]
      .map((cb) => ({ id: cb.getAttribute('data-post-log-id'), user_id: cb.getAttribute('data-user-id') }))
      .filter((x) => x.id && x.user_id);
    if (!selected.length) return alert('เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธญเธขเนเธฒเธเธเนเธญเธข 1 เธฅเธดเธเธเน');

    const grouped = new Map();
    for (const it of selected) {
      if (!grouped.has(it.user_id)) grouped.set(it.user_id, []);
      grouped.get(it.user_id).push(it.id);
    }
    const runs = [...grouped.entries()].map(([user_id, post_log_ids]) => ({ user_id, post_log_ids }));

    if (!confirm(`เธฃเธฑเธเน€เธเนเธ Comment ${selected.length} เนเธเธชเธ•เน เธเธฒเธ ${runs.length} เธเธฑเธเธเธต?`)) return;
    try {
      const res = await fetch(API + '/run/collect-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        const firstErr = Array.isArray(data.errors) && data.errors[0] ? data.errors[0].error : '';
        throw new Error(firstErr || data.error || res.statusText);
      }
      if (Array.isArray(data.started) && data.started.length > 0) {
        data.started.forEach((s) => { if (s?.run_id) collectTrackedRunIds.add(String(s.run_id)); });
      } else if (data.run_id) {
        collectTrackedRunIds.add(String(data.run_id));
      }
      startCollectStatusPoll();
    } catch (e) {
      alert('เธชเธฑเนเธเธฃเธฑเธเนเธกเนเธชเธณเน€เธฃเนเธ: ' + e.message);
    }
  });

  const statusOpen = document.getElementById('collect-status-open');
  statusOpen?.addEventListener('click', () => {
    hiddenStatusRunIds.clear();
    statusOpen.classList.add('hidden');
    refreshCollectStatusOnce();
  });

  await refreshCollectStatusOnce();
  const st = await fetch(API + '/run/collect-status').then((r) => r.json()).catch(() => ({}));
  if (st.running) startCollectStatusPoll();
  if (String(document.getElementById('collect-user-id')?.value || '').trim()) {
    runFetch();
  }
}

