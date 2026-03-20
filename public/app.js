/**
 * AUTO-POST Admin - Frontend
 */
const API = '/api';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
let currentTab = 'users';
let editingId = null;

const TAB_CONFIG = {
  users: {
    title: 'Users',
    addTitle: 'เพิ่ม User',
    editTitle: 'แก้ไข User',
    api: 'users',
    fields: [
      { key: 'name', label: 'ชื่อ', type: 'text', required: true },
      { key: 'email', label: 'Email (Facebook)', type: 'email', required: true },
      { key: 'password', label: 'Password (Facebook)', type: 'password', required: false, placeholder: 'เว้นว่าง = ไม่เปลี่ยน (ตอนแก้ไข)' },
      { key: 'group_ids', label: 'Groups (ผูกกลุ่ม FB ที่ User นี้โพสต์ได้)', type: 'multiselectFrom', optionsFrom: 'groups', optionLabel: 'name', optionValue: 'id', required: true },
      { key: 'poster_name', label: 'Poster Name', type: 'text' },
      { key: 'sheet_url', label: 'Sheet URL', type: 'url' },
      { key: 'blacklist_groups', label: 'Blacklist Groups (คั่นด้วย comma)', type: 'text', placeholder: '1073449637181260,550295531832556' },
      { key: 'fb_access_token', label: 'FB Access Token (สำหรับดึงชื่อกลุ่ม)', type: 'password', required: false, placeholder: 'เว้นว่าง = ไม่เปลี่ยน (หรือใช้ .env)' },
    ],
    listFields: ['name', 'email', 'poster_name'],
    note: 'ข้อมูลทั้งหมดเก็บในฐานข้อมูล',
  },
  groups: {
    title: 'Groups',
    addTitle: 'เพิ่ม Group',
    editTitle: 'แก้ไข Group',
    api: 'groups',
    fields: [
      { key: 'name', label: 'ชื่อกลุ่ม', type: 'text', required: true },
      { key: 'fb_group_id', label: 'Facebook Group ID', type: 'text', required: true },
      { key: 'province', label: 'จังหวัด', type: 'text' },
    ],
    listFields: ['id', 'name', 'fb_group_id', 'province'],
  },
  jobs: {
    title: 'Jobs',
    addTitle: 'เพิ่ม Job',
    editTitle: 'แก้ไข Job',
    api: 'jobs',
    fields: [
      { key: 'title', label: 'หัวข้อ', type: 'text', required: true },
      { key: 'owner', label: 'Owner', type: 'text', required: true },
      { key: 'company', label: 'Company', type: 'text', required: true },
      { key: 'caption', label: 'Caption', type: 'textarea', required: true },
      { key: 'apply_link', label: 'Apply Link', type: 'url' },
      { key: 'comment_reply', label: 'Comment Reply', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['pending', 'posted', 'cancelled'] },
    ],
    listFields: ['id', 'title', 'owner', 'company', 'status'],
    extraActions: [
      { label: 'บันทึกเป็น Template', action: 'saveAsTemplate' },
    ],
  },
  templates: {
    title: 'Templates',
    addTitle: 'เพิ่ม Template',
    editTitle: 'แก้ไข Template',
    api: 'templates',
    fields: [
      { key: 'name', label: 'ชื่อ Template', type: 'text', required: true },
      { key: 'title', label: 'หัวข้อ', type: 'text', required: true },
      { key: 'owner', label: 'Owner', type: 'text', required: true },
      { key: 'company', label: 'Company', type: 'text', required: true },
      { key: 'caption', label: 'Caption', type: 'textarea', required: true },
      { key: 'apply_link', label: 'Apply Link', type: 'url' },
      { key: 'comment_reply', label: 'Comment Reply', type: 'text' },
    ],
    listFields: ['id', 'name', 'title', 'owner', 'company'],
    extraActions: [
      { label: 'สร้าง Job จาก Template', action: 'createJobFromTemplate' },
    ],
  },
  logs: {
    title: 'Post Logs',
  },
  assignments: {
    title: 'Assignments',
    addTitle: 'เพิ่ม Assignment',
    editTitle: 'แก้ไข Assignment',
    api: 'assignments',
    fields: [
      { key: 'user_id', label: 'User', type: 'selectFrom', optionsFrom: 'users', optionLabel: 'name', required: true },
      { key: 'job_ids', label: 'Jobs (เลือกได้หลายงาน)', type: 'multiselectFrom', optionsFrom: 'jobs', optionLabel: 'title', optionValue: 'id', required: true },
    ],
    listFields: ['id', 'user_id', 'job_ids'],
    note: 'Groups มาจาก User ที่ผูกไว้ในหน้า Users',
  },
};

// --- API helpers ---
async function apiGet(entity) {
  const res = await fetch(`${API}/${entity}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(entity, body) {
  const res = await fetch(`${API}/${entity}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPut(entity, id, body) {
  const res = await fetch(`${API}/${entity}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiDelete(entity, id) {
  const res = await fetch(`${API}/${entity}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

// --- Modal ---
const formModal = document.getElementById('form-modal');
const deleteModal = document.getElementById('delete-modal');
let deleteTargetId = null;
let deleteTargetItem = null;

function openFormModal() {
  formModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeFormModal() {
  formModal.classList.add('hidden');
  document.body.style.overflow = '';
}
function openDeleteModal(id, item) {
  deleteTargetId = id;
  deleteTargetItem = item;
  const desc = document.getElementById('delete-desc');
  if (desc) {
    const label = item ? (item.name || item.title || item.id || id) : id;
    desc.textContent = label ? `"${String(label).slice(0, 50)}"` : 'รายการนี้';
  }
  deleteModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeDeleteModal() {
  deleteTargetId = null;
  deleteTargetItem = null;
  deleteModal.classList.add('hidden');
  document.body.style.overflow = '';
}

formModal.addEventListener('click', (e) => { if (e.target === formModal) closeFormModal(); });
deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(); });
document.getElementById('modal-close').addEventListener('click', closeFormModal);
document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeFormModal(); closeDeleteModal(); }
});

// --- UI ---
async function setActiveTab(tab) {
  currentTab = tab;
  editingId = null;
  closeFormModal();
  closeDeleteModal();
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('tab-active', btn.dataset.tab === tab);
  });
  const cfg = TAB_CONFIG[tab];
  document.getElementById('list-title').textContent = cfg.title;
  document.getElementById('form-title').textContent = cfg.addTitle || cfg.title;
  const addBtn = document.getElementById('btn-add');
  const logsFilter = document.getElementById('logs-filter-wrap');
  if (addBtn) addBtn.style.display = tab === 'logs' ? 'none' : '';
  if (logsFilter) logsFilter.style.display = tab === 'logs' ? '' : 'none';
  if (tab === 'logs') {
    loadLogsTab();
    return;
  }
  await renderForm(cfg, null);
  loadList();
}

async function renderForm(cfg, item) {
  const form = document.getElementById('crud-form');
  const actions = document.getElementById('form-actions');
  form.innerHTML = '';

  for (const f of cfg.fields) {
    const div = document.createElement('div');
    let input;
    if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'input';
      input.rows = 4;
    } else if (f.type === 'select') {
      input = document.createElement('select');
      input.className = 'input';
      (f.options || []).forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        input.appendChild(o);
      });
    } else if (f.type === 'selectFrom' && f.optionsFrom) {
      input = document.createElement('select');
      input.className = 'input';
      const opts = await apiGet(f.optionsFrom);
      input.appendChild(new Option('-- เลือก --', ''));
      opts.forEach((opt) => {
        const val = opt.id;
        const label = opt[f.optionLabel || 'name'] || val;
        input.appendChild(new Option(label, val));
      });
      if (item && item[f.key]) input.value = item[f.key];
    } else if (f.type === 'multiselectFrom' && f.optionsFrom) {
      const opts = await apiGet(f.optionsFrom);
      const selected = item && Array.isArray(item[f.key])
        ? item[f.key].map(String)
        : (item && item[f.key.replace(/_ids$/, '_id')] ? [String(item[f.key.replace(/_ids$/, '_id')])] : []);
      input = document.createElement('div');
      input.className = 'border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50';
      const searchWrap = document.createElement('div');
      searchWrap.className = 'p-2 border-b border-slate-200 bg-white/80';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'ค้นหา...';
      searchInput.className = 'input py-1.5 text-sm';
      searchWrap.appendChild(searchInput);
      input.appendChild(searchWrap);
      const listWrap = document.createElement('div');
      listWrap.className = 'space-y-0.5 max-h-40 overflow-y-auto p-2';
      opts.forEach((opt) => {
        const val = opt[f.optionValue || 'id'];
        const label = opt[f.optionLabel || 'name'] || val;
        const searchText = `${label} ${val} ${opt.name || ''} ${opt.fb_group_id || ''} ${opt.province || ''}`.toLowerCase();
        const cb = document.createElement('label');
        cb.className = 'flex items-center gap-3 cursor-pointer py-2 px-2 -mx-2 rounded hover:bg-slate-100/50 transition multiselect-option';
        cb.dataset.search = searchText;
        cb.innerHTML = `<input type="checkbox" name="${f.key}[]" value="${val}" ${selected.includes(String(val)) ? 'checked' : ''} class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"> <span class="text-sm text-slate-700 truncate">${escapeHtml(label)}</span>`;
        listWrap.appendChild(cb);
      });
      input.appendChild(listWrap);
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        listWrap.querySelectorAll('.multiselect-option').forEach((el) => {
          el.style.display = !q || el.dataset.search.includes(q) ? '' : 'none';
        });
      });
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      input.className = 'input';
    }
    if (input.name === undefined) input.name = f.key;
    if (item && item[f.key] !== undefined && f.key === 'fb_group_id') input.value = item[f.key];
    if (cfg.api === 'groups' && f.key === 'fb_group_id') {
      const wrap = document.createElement('div');
      wrap.className = 'space-y-2';
      const inputRow = document.createElement('div');
      inputRow.className = 'flex gap-2';
      input.classList.add('flex-1');
      inputRow.appendChild(input);
      const users = await apiGet('users');
      const userSelect = document.createElement('select');
      userSelect.className = 'input py-1.5 text-sm w-48 shrink-0';
      userSelect.title = 'เลือกบัญชีที่เข้ากลุ่มนี้ได้';
      userSelect.innerHTML = '<option value="">-- เลือก User --</option>';
      users.forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name || u.id}${u.has_fb_token ? ' ✓' : ''}`;
        userSelect.appendChild(opt);
      });
      const fetchBtn = document.createElement('button');
      fetchBtn.type = 'button';
      fetchBtn.className = 'btn-secondary shrink-0 text-sm py-1.5 px-3';
      fetchBtn.textContent = 'ดึงชื่อจาก FB';
      fetchBtn.onclick = async () => {
        const gid = input.value.trim();
        const uid = userSelect.value;
        if (!gid) {
          alert('กรุณากรอก Facebook Group ID ก่อน');
          return;
        }
        if (!uid) {
          alert('กรุณาเลือก User (บัญชีที่เข้ากลุ่มนี้ได้)');
          return;
        }
        fetchBtn.disabled = true;
        fetchBtn.textContent = 'กำลังดึง...';
        try {
          const r = await fetch(`${API}/facebook/group-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fb_group_id: gid, user_id: uid }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'ดึงไม่สำเร็จ');
          const nameEl = form.querySelector('[name="name"]');
          if (nameEl) nameEl.value = data.name || '';
          if (data.name) fetchBtn.textContent = '✓ ดึงแล้ว';
        } catch (e) {
          alert('ดึงชื่อไม่สำเร็จ: ' + e.message);
          fetchBtn.textContent = 'ดึงชื่อจาก FB';
        } finally {
          fetchBtn.disabled = false;
        }
      };
      inputRow.appendChild(userSelect);
      inputRow.appendChild(fetchBtn);
      wrap.appendChild(inputRow);
      const hint = document.createElement('p');
      hint.className = 'text-xs text-slate-500';
      hint.textContent = 'เลือก User ที่มี FB Access Token และเข้ากลุ่มนี้ได้';
      wrap.appendChild(hint);
      div.innerHTML = `<label class="block text-sm font-medium text-slate-700 mb-1.5">${f.label}</label>`;
      div.appendChild(wrap);
      form.appendChild(div);
      continue;
    }
    if (input.placeholder !== undefined) input.placeholder = f.placeholder || '';
    if (f.required && input.required !== undefined) input.required = true;
    if (item && item[f.key] !== undefined && f.type !== 'selectFrom' && f.type !== 'multiselectFrom') {
      if (f.key === 'password' || f.key === 'fb_access_token') {
        input.placeholder = '•••••••• (เว้นว่าง = ไม่เปลี่ยน)';
      } else if (f.key === 'group_ids' && Array.isArray(item[f.key])) {
        input.value = item[f.key].join(', ');
      } else if (f.key === 'blacklist_groups' && Array.isArray(item[f.key])) {
        input.value = item[f.key].join(', ');
      } else if (typeof item[f.key] === 'string' || typeof item[f.key] === 'number') {
        input.value = item[f.key];
      }
    }
    div.innerHTML = `<label class="block text-sm font-medium text-slate-700 mb-1.5">${f.label}</label>`;
    div.appendChild(input);
    form.appendChild(div);
  }

  if (cfg.note) {
    const note = document.createElement('p');
    note.className = 'text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100';
    note.textContent = cfg.note;
    form.appendChild(note);
  }

  actions.innerHTML = '';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = item ? 'บันทึก' : 'เพิ่ม';
  saveBtn.onclick = () => submitForm(item?.id);
  actions.appendChild(saveBtn);

  if (item) {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'ยกเลิก';
    cancelBtn.onclick = () => {
      editingId = null;
      closeFormModal();
    };
    actions.appendChild(cancelBtn);
  }

  // Extra actions for jobs/templates
  if (item && cfg.extraActions) {
    cfg.extraActions.forEach(({ label, action }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary text-sm';
      btn.textContent = label;
      btn.onclick = () => handleExtraAction(action, item);
      actions.appendChild(btn);
    });
  }
}

async function submitForm(id) {
  const cfg = TAB_CONFIG[currentTab];
  const form = document.getElementById('crud-form');
  const data = {};
  cfg.fields.forEach((f) => {
    let val;
    if (f.type === 'multiselectFrom') {
      const checkboxes = form.querySelectorAll(`[name="${f.key}[]"]:checked`);
      val = Array.from(checkboxes).map((cb) => cb.value);
    } else {
      const el = form.querySelector(`[name="${f.key}"]`);
      if (!el) return;
      val = el.value?.trim();
    }
    if (f.key === 'group_ids' || f.key === 'blacklist_groups' || f.key === 'job_ids') {
      if (typeof val === 'string') val = val ? val.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) : [];
    }
    data[f.key] = val;
  });

  try {
    if (id) {
      await apiPut(cfg.api, id, data);
      alert('บันทึกสำเร็จ');
    } else {
      await apiPost(cfg.api, data);
      alert('เพิ่มสำเร็จ');
    }
    editingId = null;
    closeFormModal();
    loadList();
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

async function handleExtraAction(action, item) {
  try {
    if (action === 'saveAsTemplate') {
      const name = prompt('ชื่อ Template:', item.title?.slice(0, 30) || 'Template');
      if (!name) return;
      await apiPost('templates', {
        name,
        title: item.title,
        owner: item.owner,
        company: item.company,
        caption: item.caption,
        apply_link: item.apply_link || '',
        comment_reply: item.comment_reply || '',
      });
      alert('บันทึกเป็น Template สำเร็จ');
      if (currentTab === 'templates') loadList();
    } else     if (action === 'createJobFromTemplate') {
      const job = await fetch(`${API}/templates/${item.id}/create-job`, { method: 'POST' }).then((r) => r.json());
      alert('สร้าง Job สำเร็จ (ID: ' + job.id + ')');
      currentTab = 'jobs';
      await setActiveTab('jobs');
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

async function loadLogsTab() {
  const card = document.querySelector('.card.overflow-hidden');
  const container = document.getElementById('list-container');
  const runIdInput = document.getElementById('logs-run-id');
  const runId = runIdInput?.value?.trim() || '';
  container.innerHTML = '<div class="p-8 text-center"><p class="text-sm text-slate-500">กำลังโหลด...</p></div>';

  // Build logs header (filter + export) - ใส่ในแถวเดียวกับ list-title
  const headerRow = container.previousElementSibling;
  if (headerRow) {
    let filterWrap = document.getElementById('logs-filter-wrap');
    if (!filterWrap) {
      filterWrap = document.createElement('div');
      filterWrap.id = 'logs-filter-wrap';
      filterWrap.className = 'flex flex-col sm:flex-row gap-2 sm:items-center';
      filterWrap.innerHTML = `
        <input id="logs-run-id" type="text" placeholder="Run ID (เว้นว่าง = ทั้งหมด)" class="input py-1.5 text-sm max-w-xs">
        <button id="logs-refresh" class="btn-secondary text-sm py-1.5 px-3">โหลดใหม่</button>
        <button id="logs-export" class="btn-secondary text-sm py-1.5 px-3">Export CSV</button>
      `;
      headerRow.appendChild(filterWrap);
      document.getElementById('logs-refresh').onclick = () => loadLogsTab();
      document.getElementById('logs-export').onclick = () => exportLogsCsv();
    }
  }

  try {
    const url = runId ? `${API}/post-logs?run_id=${encodeURIComponent(runId)}&limit=500` : `${API}/post-logs?limit=500`;
    const logs = await fetch(url).then((r) => r.json());
    if (logs.length === 0) {
      container.innerHTML = '<div class="p-8 text-center"><p class="text-sm text-slate-500">ยังไม่มี Post Log</p><p class="text-xs text-slate-400 mt-1">Log จะแสดงหลังโพสต์งานสำเร็จ</p></div>';
      return;
    }
    const cols = ['created_at', 'poster_name', 'owner', 'job_title', 'company', 'group_name', 'member_count', 'post_link', 'post_status', 'comment_count', 'customer_phone'];
    const colLabels = ['วันที่-เวลา', 'ผู้โพสต์', 'เจ้าของงาน', 'ชื่องาน', 'หน่วยงาน/บริษัท', 'ชื่อกลุ่ม', 'จำนวนสมาชิก', 'ลิงก์โพสต์', 'สถานะการโพสต์', 'จำนวน Comment', 'เบอร์โทรลูกค้า'];
    let html = '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-200 bg-slate-50/80">';
    colLabels.forEach((l) => { html += `<th class="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">${escapeHtml(l)}</th>`; });
    html += '</tr></thead><tbody>';
    logs.forEach((row) => {
      html += '<tr class="border-b border-slate-100 hover:bg-slate-50/50">';
      cols.forEach((k) => {
        let v = row[k] ?? '';
        if (k === 'created_at' && v) {
          const d = new Date(v);
          v = d.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        if (k === 'post_link' && v) v = `<a href="${escapeHtml(v)}" target="_blank" rel="noopener" class="text-emerald-600 hover:underline truncate max-w-[200px] block">${escapeHtml(v)}</a>`;
        else v = escapeHtml(String(v));
        html += `<td class="py-2 px-3 text-slate-700">${v}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div class="p-8 text-center"><p class="text-sm text-red-600">โหลดไม่สำเร็จ: ' + escapeHtml(e.message) + '</p></div>';
  }
}

function exportLogsCsv() {
  const runId = document.getElementById('logs-run-id')?.value?.trim() || '';
  const url = runId ? `${API}/post-logs?run_id=${encodeURIComponent(runId)}&limit=2000` : `${API}/post-logs?limit=2000`;
  fetch(url).then((r) => r.json()).then((logs) => {
    if (logs.length === 0) { alert('ไม่มีข้อมูล'); return; }
    const cols = ['created_at', 'poster_name', 'owner', 'job_title', 'company', 'group_name', 'member_count', 'post_link', 'post_status', 'comment_count', 'customer_phone'];
    const colLabels = ['วันที่-เวลา', 'ผู้โพสต์', 'เจ้าของงาน', 'ชื่องาน', 'หน่วยงาน/บริษัท', 'ชื่อกลุ่ม', 'จำนวนสมาชิก', 'ลิงก์โพสต์', 'สถานะการโพสต์', 'จำนวน Comment', 'เบอร์โทรลูกค้า'];
    let csv = '\uFEFF' + colLabels.join('\t') + '\n';
    logs.forEach((row) => {
      const cells = cols.map((k) => {
        let v = row[k] ?? '';
        if (k === 'created_at' && v) {
          const d = new Date(v);
          v = d.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        return String(v).replace(/\t/g, ' ').replace(/\n/g, ' ');
      });
      csv += cells.join('\t') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `post-logs-${runId || 'all'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }).catch((e) => alert('Export ไม่สำเร็จ: ' + e.message));
}

async function loadList() {
  const cfg = TAB_CONFIG[currentTab];
  const container = document.getElementById('list-container');
    container.innerHTML = '<div class="p-8 text-center"><p class="text-sm text-slate-500">กำลังโหลด...</p></div>';

  try {
    const items = await apiGet(cfg.api);
    if (items.length === 0) {
      container.innerHTML = '<div class="p-8 text-center"><p class="text-sm text-slate-500">ยังไม่มีข้อมูล</p><p class="text-xs text-slate-400 mt-1">กดปุ่ม + เพิ่ม เพื่อสร้างรายการแรก</p></div>';
      return;
    }

    container.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      const preview = cfg.listFields
        .map((k) => {
          const v = item[k];
          if (Array.isArray(v)) return v.join(', ');
          return v;
        })
        .filter(Boolean)
        .join(' · ');
      row.innerHTML = `
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(preview || item.id)}</p>
          ${item.title ? `<p class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(item.title)}</p>` : ''}
        </div>
        <div class="list-row-actions flex gap-2 sm:gap-3 ml-4 shrink-0">
          ${currentTab === 'assignments' ? '<button class="post-btn btn-primary text-sm py-1 px-2 -mx-2">▶ โพสต์</button>' : ''}
          <button class="edit-btn text-emerald-600 hover:text-emerald-700 text-sm font-medium py-1 px-2 -mx-2 rounded hover:bg-emerald-50 transition">แก้ไข</button>
          <button class="delete-btn text-red-600 hover:text-red-700 text-sm font-medium py-1 px-2 -mx-2 rounded hover:bg-red-50 transition">ลบ</button>
        </div>
      `;
      if (currentTab === 'assignments') {
        const postBtn = row.querySelector('.post-btn');
        if (postBtn) {
          postBtn.onclick = async () => {
            const origText = postBtn.textContent;
            try {
              postBtn.disabled = true;
              postBtn.textContent = 'กำลังเริ่ม...';
              await runPost([item.id]);
              alert('กำลังเปิด Browser สำหรับโพสต์ Assignment นี้\n\nกรุณา Login Facebook และกด Resume ใน Playwright Inspector');
            } catch (e) {
              alert('เกิดข้อผิดพลาด: ' + e.message);
            } finally {
              postBtn.disabled = false;
              postBtn.textContent = origText;
            }
          };
        }
      }
      row.querySelector('.edit-btn').onclick = () => editItem(item);
      row.querySelector('.delete-btn').onclick = () => deleteItem(item.id, item);
      container.appendChild(row);
    });
  } catch (e) {
    container.innerHTML = '<div class="p-8 text-center"><p class="text-sm text-red-600">โหลดไม่สำเร็จ: ' + escapeHtml(e.message) + '</p></div>';
  }
}

async function editItem(item) {
  const cfg = TAB_CONFIG[currentTab];
  editingId = item.id;
  document.getElementById('form-title').textContent = cfg.editTitle;
  await renderForm(cfg, item);
  openFormModal();
}

function deleteItem(id, item) {
  openDeleteModal(id, item);
}

// --- Run Post ---
async function runPost(assignmentIds = []) {
  const body = Array.isArray(assignmentIds) && assignmentIds.length > 0
    ? { assignment_ids: assignmentIds }
    : {};
  const res = await fetch('/api/run/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    console.error('API returned non-JSON:', text.substring(0, 300));
    throw new Error(
      'เซิร์ฟเวอร์ส่ง HTML กลับมาแทน JSON - ตรวจสอบว่าเข้า http://localhost:3000 และรัน npm run start'
    );
  }
  if (!res.ok) {
    if (data.running) throw new Error('กำลังรัน Post อยู่แล้ว - ตรวจสอบหน้าต่าง Browser');
    throw new Error(data.error || 'เกิดข้อผิดพลาด');
  }
  return data;
}

document.getElementById('btn-run-post').addEventListener('click', async () => {
  const btn = document.getElementById('btn-run-post');
  const origText = btn.textContent;
  try {
    btn.disabled = true;
    btn.textContent = 'กำลังเริ่ม...';
    await runPost();
    alert('กำลังเปิด Browser สำหรับโพสต์\n\nกรุณา Login Facebook และกด Resume ใน Playwright Inspector');
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

// --- Init ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

document.getElementById('btn-add').addEventListener('click', async () => {
  editingId = null;
  const cfg = TAB_CONFIG[currentTab];
  document.getElementById('form-title').textContent = cfg.addTitle;
  await renderForm(cfg, null);
  openFormModal();
});

document.getElementById('delete-confirm').addEventListener('click', async () => {
  if (!deleteTargetId) return;
  const cfg = TAB_CONFIG[currentTab];
  try {
    await apiDelete(cfg.api, deleteTargetId);
    closeDeleteModal();
    if (editingId === deleteTargetId) {
      editingId = null;
      closeFormModal();
    }
    loadList();
    alert('ลบสำเร็จ');
  } catch (e) {
    alert('ลบไม่สำเร็จ: ' + e.message);
  }
});

setActiveTab('users');
