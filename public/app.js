/**
 * AUTO-POST Admin - Frontend
 */
const API = '/api';

/** POST เช็ค Facebook session — ลอง path สั้นก่อน แล้วค่อยสำรอง (กันพลาดเซิร์ฟเวอร์เก่า / cache) */
async function postFacebookSessionCheck(userId) {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const paths = ['/api/fb-session-check', '/api/user/facebook-check-session'];
  const urls = origin ? paths.map((p) => `${origin}${p}`) : paths;
  let lastRes = null;
  let lastData = {};
  for (const url of urls) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    lastData = await r.json().catch(() => ({}));
    lastRes = r;
    if (r.ok) return { res: r, data: lastData };
    const isApiNotFound =
      r.status === 404 && String(lastData.error || '').toLowerCase().includes('api not found');
    if (!isApiNotFound) {
      throw new Error(lastData.error || r.statusText || 'check-session failed');
    }
  }
  const hint = origin
    ? `${origin}/api/fb-session-health`
    : '/api/fb-session-health';
  const srvHint = lastData.hint ? `\n\n${lastData.hint}` : '';
  throw new Error(
    `API not found — โปรเซสบน ${origin || 'เซิร์ฟเวอร์นี้'} ไม่ใช่โค้ดล่าสุด หรือพอร์ตนี้ถูกโปรแกรมอื่นใช้\n\n` +
      `1) ปิด Terminal เก่าทั้งหมด แล้วในโฟลเดอร์โปรเจกต์ AUTO-POST รัน: npm start\n` +
      `2) ดูใน Terminal บรรทัด [AUTO-POST] ว่าฟังพอร์ตไหน — เปิด Admin ที่ URL นั้น (ถ้า 3000 ถูกยึด อาจเป็น 3001)\n` +
      `3) ลองเปิด: ${hint}\n   ต้องเห็น "ok": true และ "build": "fb-session-..."${srvHint}`
  );
}

let collectStatusPollTimer = null;

function stopCollectStatusPoll() {
  if (collectStatusPollTimer) {
    clearInterval(collectStatusPollTimer);
    collectStatusPollTimer = null;
  }
}
const DEFAULT_BLACKLIST_GROUP_IDS = ['1073449637181260', '550295531832556'];
const DEFAULT_JOB_OWNERS = ['แบงค์', 'อ้น', 'เล็ก', 'คิว', 'ตี้', 'หมี', 'ตั้ม'];
const DEFAULT_JOB_POSITIONS = [
  'ขับรถผู้บริหาร (ไทย)',
  'ขับรถผู้บริหาร (ต่างชาติ)',
  'ขับรถส่วนกลาง',
  'ขับรถบรรทุก (ท.2)',
  'ขับรถบรรทุก + เครน',
  'Valet-Parking',
  'ขับรถกอล์ฟ',
  'ขับรถส่งของ',
];
const ASSIGNMENT_DOER_CACHE_KEY = 'assignment_doer_cache_v1';
const JOB_POSITION_LOCAL_KEY = 'job_position_options_custom_v1';
const JOB_TYPE_LOCAL_KEY = 'job_type_options_custom_v1';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formFieldLabelHtml(f) {
  const req = f.required
    ? '<abbr class="form-label-req" title="จำเป็น">*</abbr>'
    : '';
  return `<label class="form-label">${escapeHtml(f.label)}${req}</label>`;
}

function listLoadingHtml(message) {
  const rows = Array.from(
    { length: 8 },
    () =>
      '<div class="list-skeleton-row"><span class="sk-line sk-line--title"></span><span class="sk-line sk-line--meta"></span></div>'
  ).join('');
  return `<div class="list-state list-state--loading" role="status" aria-live="polite" aria-busy="true"><div class="list-skeleton" aria-hidden="true">${rows}</div><p class="list-state-msg">${escapeHtml(message)}...</p></div>`;
}

function listEmptyHtml(title, hint) {
  const t = title != null ? title : 'ยังไม่มีข้อมูล';
  const h = hint != null ? hint : 'กดปุ่ม + เพิ่มรายการ ด้านบนเพื่อเริ่มต้น';
  return `<div class="list-state list-state--empty" role="status"><div class="empty-illustration" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9h8M8 13h5"/></svg></div><p class="empty-title">${escapeHtml(t)}</p><p class="empty-hint">${escapeHtml(h)}</p></div>`;
}

function listErrorHtml(msg) {
  return `<div class="list-state list-state--error" role="alert"><div class="state-icon" aria-hidden="true">!</div><p class="empty-title list-error-title">โหลดไม่สำเร็จ</p><p class="empty-hint list-error-msg">${escapeHtml(msg)}</p></div>`;
}

/** ป้องกัน path ที่ไม่ใช่ slug กลุ่ม */
const FB_GROUP_SEGMENT_DENYLIST = new Set([
  'feed', 'discover', 'following', 'pending', 'people', 'search', 'yourgroups',
]);

function normalizeFbGroupSegment(seg) {
  try {
    return decodeURIComponent(String(seg).trim());
  } catch {
    return String(seg).trim();
  }
}

/** รับทั้งเลข id (อย่างน้อย 5 หลัก) และชื่อกลุ่มแบบ vanity (มีอักษร a-z) */
function isValidFbGroupKey(keyRaw) {
  const key = normalizeFbGroupSegment(keyRaw);
  if (!key || key.length > 100) return false;
  if (FB_GROUP_SEGMENT_DENYLIST.has(key.toLowerCase())) return false;
  if (/^\d{5,}$/.test(key)) return true;
  if (/^[a-zA-Z0-9._-]+$/.test(key) && /[a-zA-Z]/.test(key)) return true;
  return false;
}

/** ดึงรายการ Group ID / slug จากข้อความในช่อง group_inputs (ใช้ทั้งเพิ่มและแก้ไขหมวดหมู่) */
function parseGroupInputsToIds(rawText) {
  const raw = (rawText || '')
    .toString()
    .replace(/^\uFEFF/, '')
    .replace(/^\s*\[|\]\s*$/g, '');
  const idsSet = new Set();
  for (const m of raw.matchAll(/facebook\.com\/groups\/([^/?\s&#]+)/gi)) {
    if (isValidFbGroupKey(m[1])) idsSet.add(normalizeFbGroupSegment(m[1]));
  }
  for (const m of raw.matchAll(/\/groups\/([^/?\s&#]+)/gi)) {
    if (isValidFbGroupKey(m[1])) idsSet.add(normalizeFbGroupSegment(m[1]));
  }
  for (const line of raw.split(/[,\n\r]+/)) {
    const s = line.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
    if (isValidFbGroupKey(s)) idsSet.add(normalizeFbGroupSegment(s));
  }
  return Array.from(idsSet);
}

/** นับบรรทัดที่ไม่ว่างในช่องวางลิงก์/ID กลุ่ม (สรุปหลังเพิ่ม) */
function countNonEmptyGroupInputLines(rawText) {
  return String(rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;
}

const GROUPS_LIST_HIGHLIGHT_KEY = 'groups_list_highlight_v1';

function rememberGroupsFolderHighlight(data, provinceParsed) {
  try {
    sessionStorage.setItem(
      GROUPS_LIST_HIGHLIGHT_KEY,
      JSON.stringify({
        departmentKey: String(data.department || '').trim() || '__none__',
        jobType: String(data.job_type || '').trim(),
        provinceLabel: formatProvinceLabel(provinceParsed.province, provinceParsed.province_note),
        adder: String(data.added_by || '').trim(),
        ts: Date.now(),
      })
    );
  } catch (_) {
    /* ignore */
  }
}

function consumeGroupsFolderHighlight() {
  try {
    const raw = sessionStorage.getItem(GROUPS_LIST_HIGHLIGHT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(GROUPS_LIST_HIGHLIGHT_KEY);
    const o = JSON.parse(raw);
    if (!o || Date.now() - (o.ts || 0) > 120000) return null;
    return o;
  } catch (_) {
    return null;
  }
}

function applyGroupsFolderHighlight(container) {
  const h = consumeGroupsFolderHighlight();
  if (!h) return;
  requestAnimationFrame(() => {
    const deptSec = Array.from(container.querySelectorAll('.group-dept-section')).find(
      (el) => String(el.dataset.department || '') === h.departmentKey
    );
    if (!deptSec) return;
    const secs = deptSec.querySelectorAll('.group-section');
    for (const sec of secs) {
      const jt = String(sec.dataset.jobType || '').trim();
      const prov = String(sec.dataset.province || '').trim();
      const ad = String(sec.dataset.adder || '').trim();
      if (jt === h.jobType && prov === h.provinceLabel && ad === h.adder) {
        sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sec.classList.add('group-section--highlight');
        setTimeout(() => sec.classList.remove('group-section--highlight'), 4500);
        break;
      }
    }
  });
}

function formatProvinceLabel(province, provinceNote) {
  const parsed = parseProvinceWithInlineNote(province, provinceNote);
  const p = parsed.province;
  const note = parsed.province_note;
  if (!note) return p || '-';
  return `${p || '-'} (${note})`;
}

function withDefaultBlacklistGroups(val) {
  const set = new Set(DEFAULT_BLACKLIST_GROUP_IDS);
  const arr = Array.isArray(val) ? val : [];
  arr.map((x) => String(x || '').trim()).filter(Boolean).forEach((x) => set.add(x));
  return Array.from(set);
}

function readAssignmentDoerCache() {
  try {
    return JSON.parse(localStorage.getItem(ASSIGNMENT_DOER_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function getCachedAssignmentDoer(assignmentId) {
  const cache = readAssignmentDoerCache();
  return String(cache[String(assignmentId)] || '').trim();
}

function setCachedAssignmentDoer(assignmentId, doerName) {
  const id = String(assignmentId || '').trim();
  const name = String(doerName || '').trim();
  if (!id) return;
  const cache = readAssignmentDoerCache();
  if (!name) {
    delete cache[id];
  } else {
    cache[id] = name;
  }
  localStorage.setItem(ASSIGNMENT_DOER_CACHE_KEY, JSON.stringify(cache));
}

function getLocalJobPositions() {
  try {
    const arr = JSON.parse(localStorage.getItem(JOB_POSITION_LOCAL_KEY) || '[]');
    return Array.isArray(arr) ? arr.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function addLocalJobPosition(name) {
  const n = String(name || '').trim();
  if (!n) return;
  const set = new Set(getLocalJobPositions());
  set.add(n);
  localStorage.setItem(JOB_POSITION_LOCAL_KEY, JSON.stringify(Array.from(set)));
}

function removeLocalJobPosition(name) {
  const n = String(name || '').trim();
  const next = getLocalJobPositions().filter((x) => x !== n);
  localStorage.setItem(JOB_POSITION_LOCAL_KEY, JSON.stringify(next));
}

function getLocalJobTypes() {
  try {
    const arr = JSON.parse(localStorage.getItem(JOB_TYPE_LOCAL_KEY) || '[]');
    return Array.isArray(arr) ? arr.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function addLocalJobType(name) {
  const n = String(name || '').trim();
  if (!n) return;
  const set = new Set(getLocalJobTypes());
  set.add(n);
  localStorage.setItem(JOB_TYPE_LOCAL_KEY, JSON.stringify(Array.from(set)));
}

function removeLocalJobType(name) {
  const n = String(name || '').trim();
  const next = getLocalJobTypes().filter((x) => x !== n);
  localStorage.setItem(JOB_TYPE_LOCAL_KEY, JSON.stringify(next));
}

function parseProvinceWithInlineNote(provinceRaw, provinceNoteRaw) {
  const directProvince = String(provinceRaw || '').trim();
  const directNote = String(provinceNoteRaw || '').trim();
  if (directNote) {
    const m = directProvince.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (m && String(m[2] || '').trim() === directNote) {
      return { province: String(m[1] || '').trim(), province_note: directNote };
    }
    return { province: directProvince, province_note: directNote };
  }
  const m = directProvince.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (!m) return { province: directProvince, province_note: '' };
  return { province: String(m[1] || '').trim(), province_note: String(m[2] || '').trim() };
}

let currentTab = 'users';
let editingId = null;
/** แก้ไขหมวดหมู่ Groups แบบรวมช่อง group_inputs - { items: group[] } */
let editingGroupFolder = null;
/** กัน async renderForm ซ้อนกันจนฟิลด์ซ้ำ */
let renderFormVersion = 0;
const TAB_WITH_LIST_TOOLS = new Set(['groups', 'jobs', 'assignments']);
const BULK_MODE = { jobs: false, assignments: false };

function createListTools(tab, container, apiEntity, sourceItems = [], meta = {}) {
  if (!TAB_WITH_LIST_TOOLS.has(tab)) return null;
  const tools = document.createElement('div');
  if (tab === 'groups') {
    const jobTypes = Array.from(new Set((sourceItems || []).map((x) => String(x?.job_type || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
    const provinces = Array.from(new Set((sourceItems || []).map((x) => formatProvinceLabel(x?.province, x?.province_note)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
    const adders = Array.from(new Set((sourceItems || []).map((x) => String(x?.added_by || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
    tools.className = 'list-toolbar p-3 sm:p-4 space-y-2';
    tools.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <select id="group-filter-dept" class="input py-1.5 text-sm">
          <option value="">แผนก: ทั้งหมด</option>
          ${DEPARTMENTS.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
          <option value="__none__">ไม่ระบุแผนก</option>
        </select>
        <select id="group-filter-job" class="input py-1.5 text-sm">
          <option value="">ประเภทงาน: ทั้งหมด</option>
          ${jobTypes.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
        </select>
        <select id="group-filter-province" class="input py-1.5 text-sm">
          <option value="">จังหวัด: ทั้งหมด</option>
          ${provinces.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
        </select>
        <select id="group-filter-adder" class="input py-1.5 text-sm">
          <option value="">ชื่อผู้เพิ่ม Group: ทั้งหมด</option>
          ${adders.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
        </select>
      </div>
      <input id="list-search-input" type="text" placeholder="ค้นหา..." class="input py-1.5 text-sm sm:max-w-md">
    `;
  } else if (tab === 'jobs') {
    const owners = Array.from(new Set((sourceItems || []).map((x) => String(x?.owner || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
    const fromJobs = (sourceItems || [])
      .map((x) => formatProvinceLabel(x?.province, x?.province_note))
      .filter((v) => v && v !== '-');
    const provinces = Array.from(new Set([...(THAI_PROVINCES || []), ...fromJobs])).sort((a, b) => a.localeCompare(b, 'th'));
    const positions = Array.from(new Set((sourceItems || []).map((x) => String(x?.job_position || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
    tools.className = 'list-toolbar p-3 sm:p-4 space-y-2';
    const ownerOpts = owners
      .map((v) => `<option value="${escapeHtml(v.toLowerCase())}">${escapeHtml(v)}</option>`)
      .join('');
    const provOpts = provinces
      .map((v) => `<option value="${escapeHtml(v.toLowerCase())}">${escapeHtml(v)}</option>`)
      .join('');
    const posOpts = positions
      .map((v) => `<option value="${escapeHtml(v.toLowerCase())}">${escapeHtml(v)}</option>`)
      .join('');
    tools.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <select id="job-filter-dept" class="input py-1.5 text-sm">
          <option value="">แผนก: ทั้งหมด</option>
          ${DEPARTMENTS.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
          <option value="__none__">ไม่ระบุแผนก</option>
        </select>
        <select id="job-filter-owner" class="input py-1.5 text-sm">
          <option value="">เจ้าของงาน: ทั้งหมด</option>
          ${ownerOpts}
        </select>
        <select id="job-filter-province" class="input py-1.5 text-sm">
          <option value="">จังหวัด: ทั้งหมด</option>
          ${provOpts}
        </select>
        <select id="job-filter-position" class="input py-1.5 text-sm">
          <option value="">ตำแหน่งงาน: ทั้งหมด</option>
          ${posOpts}
        </select>
      </div>
      <div class="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <input id="list-search-input" type="text" placeholder="ค้นหา (ชื่องาน, บริษัท, ...)" class="input py-1.5 text-sm sm:max-w-md flex-1 min-w-0">
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <button type="button" id="bulk-mode-btn" class="btn-secondary text-sm py-1.5 px-3">เลือกหลายรายการ</button>
          <button type="button" id="select-all-btn" class="btn-secondary text-sm py-1.5 px-3 hidden">ติ๊กทั้งหมด</button>
          <button type="button" id="delete-selected-btn" class="text-sm py-1.5 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition hidden">ลบที่เลือก</button>
        </div>
      </div>
    `;
  } else if (tab === 'assignments') {
    const { userMap = new Map(), jobMap = new Map(), jobOwnerById = new Map() } = meta;
    const doers = Array.from(
      new Set((sourceItems || []).map((a) => String(a.doer_name || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'th'));
    const userOpts = [];
    const uidSeen = new Set();
    (sourceItems || []).forEach((a) => {
      const id = String(a.user_id || '');
      if (!id || uidSeen.has(id)) return;
      uidSeen.add(id);
      const label = userMap.get(id) || id;
      userOpts.push({ id, label });
    });
    userOpts.sort((a, b) => String(a.label).localeCompare(String(b.label), 'th'));
    if (userOpts.length === 0 && userMap && typeof userMap.forEach === 'function') {
      userMap.forEach((label, id) => {
        userOpts.push({ id: String(id), label: label || String(id) });
      });
      userOpts.sort((a, b) => String(a.label).localeCompare(String(b.label), 'th'));
    }
    const assignOwners = Array.from(
      new Set(
        Array.from(jobOwnerById.values())
          .map((o) => String(o || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'th'));
    const jobOwnerOpts = assignOwners
      .map((v) => `<option value="${escapeHtml(v.toLowerCase())}">${escapeHtml(v)}</option>`)
      .join('');
    const doerOpts = doers
      .map((v) => `<option value="${escapeHtml(v.toLowerCase())}">${escapeHtml(v)}</option>`)
      .join('');
    tools.className = 'list-toolbar p-3 sm:p-4 space-y-2';
    tools.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <select id="assign-filter-dept" class="input py-1.5 text-sm">
          <option value="">แผนก: ทั้งหมด</option>
          ${DEPARTMENTS.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
          <option value="__none__">ไม่ระบุแผนก</option>
        </select>
        <select id="assign-filter-user" class="input py-1.5 text-sm">
          <option value="">User (Facebook): ทั้งหมด</option>
          ${userOpts.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join('')}
        </select>
        <select id="assign-filter-doer" class="input py-1.5 text-sm">
          <option value="">ผู้ทำ Assignment: ทั้งหมด</option>
          ${doerOpts}
        </select>
        <select id="assign-filter-job-owner" class="input py-1.5 text-sm">
          <option value="">เจ้าของงาน: ทั้งหมด</option>
          ${jobOwnerOpts}
        </select>
      </div>
      <div class="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <input id="list-search-input" type="text" placeholder="ค้นหา..." class="input py-1.5 text-sm sm:max-w-md flex-1 min-w-0">
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <button type="button" id="bulk-mode-btn" class="btn-secondary text-sm py-1.5 px-3">เลือกหลายรายการ</button>
          <button type="button" id="select-all-btn" class="btn-secondary text-sm py-1.5 px-3 hidden">ติ๊กทั้งหมด</button>
          <button type="button" id="delete-selected-btn" class="text-sm py-1.5 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition hidden">ลบที่เลือก</button>
        </div>
      </div>
    `;
  }
  container.appendChild(tools);

  const searchInput = tools.querySelector('#list-search-input');
  const groupDeptSel = tools.querySelector('#group-filter-dept');
  const groupJobSel = tools.querySelector('#group-filter-job');
  const groupProvinceSel = tools.querySelector('#group-filter-province');
  const groupAdderSel = tools.querySelector('#group-filter-adder');
  const jobDeptSel = tools.querySelector('#job-filter-dept');
  const jobOwnerSel = tools.querySelector('#job-filter-owner');
  const jobProvinceSel = tools.querySelector('#job-filter-province');
  const jobPositionSel = tools.querySelector('#job-filter-position');
  const assignDeptSel = tools.querySelector('#assign-filter-dept');
  const assignUserSel = tools.querySelector('#assign-filter-user');
  const assignDoerSel = tools.querySelector('#assign-filter-doer');
  const assignJobOwnerSel = tools.querySelector('#assign-filter-job-owner');
  const applyFilter = () => {
    const q = String(searchInput?.value || '').trim().toLowerCase();
    if (tab === 'groups') {
      const fDept = String(groupDeptSel?.value || '').trim();
      const fJob = String(groupJobSel?.value || '').trim().toLowerCase();
      const fProvince = String(groupProvinceSel?.value || '').trim().toLowerCase();
      const fAdder = String(groupAdderSel?.value || '').trim().toLowerCase();
      container.querySelectorAll('.group-dept-section').forEach((deptSec) => {
        const deptKey = String(deptSec.dataset.department || '');
        const okDept = !fDept || deptKey === fDept;
        let anyVisible = false;
        deptSec.querySelectorAll('.group-section').forEach((sec) => {
          const txt = sec.textContent?.toLowerCase() || '';
          const secJob = String(sec.dataset.jobType || '').toLowerCase();
          const secProvince = String(sec.dataset.province || '').toLowerCase();
          const secAdder = String(sec.dataset.adder || '').toLowerCase();
          const okJob = !fJob || secJob === fJob;
          const okProvince = !fProvince || secProvince === fProvince;
          const okAdder = !fAdder || secAdder === fAdder;
          const okText = !q || txt.includes(q);
          const visible = okDept && okJob && okProvince && okAdder && okText;
          sec.style.display = visible ? '' : 'none';
          if (visible) anyVisible = true;
        });
        deptSec.style.display = anyVisible ? '' : 'none';
      });
      return;
    }
    if (tab === 'jobs') {
      const fDept = String(jobDeptSel?.value || '').trim();
      const fOwner = String(jobOwnerSel?.value || '').trim().toLowerCase();
      const fProv = String(jobProvinceSel?.value || '').trim().toLowerCase();
      const fPos = String(jobPositionSel?.value || '').trim().toLowerCase();
      container.querySelectorAll('.list-row').forEach((row) => {
        const okDept = !fDept || String(row.dataset.department || '') === fDept;
        const okOwner = !fOwner || String(row.dataset.filterOwner || '').toLowerCase() === fOwner;
        const okProv = !fProv || String(row.dataset.filterProvince || '').toLowerCase() === fProv;
        const okPos = !fPos || String(row.dataset.filterJobPosition || '').toLowerCase() === fPos;
        const txt = row.textContent?.toLowerCase() || '';
        const okText = !q || txt.includes(q);
        row.style.display = okDept && okOwner && okProv && okPos && okText ? '' : 'none';
      });
      return;
    }
    if (tab === 'assignments') {
      const fDept = String(assignDeptSel?.value || '').trim();
      const fUser = String(assignUserSel?.value || '').trim();
      const fDoer = String(assignDoerSel?.value || '').trim().toLowerCase();
      const fJobOwner = String(assignJobOwnerSel?.value || '').trim().toLowerCase();
      container.querySelectorAll('.list-row').forEach((row) => {
        const okDept = !fDept || String(row.dataset.department || '') === fDept;
        const okUser = !fUser || String(row.dataset.assignUserId || '') === fUser;
        const okDoer = !fDoer || String(row.dataset.filterDoer || '') === fDoer;
        const ownerKeys = String(row.dataset.assignJobOwners || '')
          .split('|')
          .map((x) => x.trim())
          .filter(Boolean);
        const okJobOwner = !fJobOwner || ownerKeys.includes(fJobOwner);
        const txt = row.textContent?.toLowerCase() || '';
        const okText = !q || txt.includes(q);
        row.style.display = okDept && okUser && okDoer && okJobOwner && okText ? '' : 'none';
      });
      return;
    }
    container.querySelectorAll('.list-row').forEach((row) => {
      const txt = row.textContent?.toLowerCase() || '';
      row.style.display = !q || txt.includes(q) ? '' : 'none';
    });
  };
  searchInput?.addEventListener('input', applyFilter);
  groupDeptSel?.addEventListener('change', applyFilter);
  groupJobSel?.addEventListener('change', applyFilter);
  groupProvinceSel?.addEventListener('change', applyFilter);
  groupAdderSel?.addEventListener('change', applyFilter);
  jobDeptSel?.addEventListener('change', applyFilter);
  jobOwnerSel?.addEventListener('change', applyFilter);
  jobProvinceSel?.addEventListener('change', applyFilter);
  jobPositionSel?.addEventListener('change', applyFilter);
  assignDeptSel?.addEventListener('change', applyFilter);
  assignUserSel?.addEventListener('change', applyFilter);
  assignDoerSel?.addEventListener('change', applyFilter);
  assignJobOwnerSel?.addEventListener('change', applyFilter);

  if (tab === 'jobs' || tab === 'assignments') {
    const bulkBtn = tools.querySelector('#bulk-mode-btn');
    const selectAllBtn = tools.querySelector('#select-all-btn');
    const deleteBtn = tools.querySelector('#delete-selected-btn');
    const getVisibleRowChecks = () =>
      Array.from(container.querySelectorAll('.list-row'))
        .filter((row) => row.style.display !== 'none')
        .map((row) => row.querySelector('.row-select'))
        .filter(Boolean);
    const refreshBulkButtons = () => {
      const checks = getVisibleRowChecks();
      const checkedCount = checks.filter((cb) => cb.checked).length;
      const total = checks.length;
      if (deleteBtn) {
        deleteBtn.disabled = checkedCount === 0;
        deleteBtn.classList.toggle('opacity-50', checkedCount === 0);
        deleteBtn.classList.toggle('cursor-not-allowed', checkedCount === 0);
        deleteBtn.textContent = checkedCount > 0 ? `ลบที่เลือก (${checkedCount})` : 'ลบที่เลือก';
      }
      if (selectAllBtn) {
        selectAllBtn.textContent = total > 0 && checkedCount === total ? 'ยกเลิกติ๊กทั้งหมด' : 'ติ๊กทั้งหมด';
      }
    };
    const applyBulkMode = (enabled) => {
      BULK_MODE[tab] = !!enabled;
      if (bulkBtn) bulkBtn.textContent = BULK_MODE[tab] ? 'ยกเลิกเลือกหลายรายการ' : 'เลือกหลายรายการ';
      selectAllBtn?.classList.toggle('hidden', !BULK_MODE[tab]);
      deleteBtn?.classList.toggle('hidden', !BULK_MODE[tab]);
      /* Jobs ใช้ CSS grid: ห้ามใช้ hidden (display:none) เพราะจะทำให้ช่องแรกหาย ข้อมูลเลื่อนไม่ตรงหัวตาราง */
      container.querySelectorAll('.row-select-wrap').forEach((el) => {
        if (tab === 'jobs' && el.classList.contains('jobs-row-check')) {
          el.classList.remove('hidden');
          el.classList.toggle('jobs-bulk-off', !BULK_MODE[tab]);
        } else {
          el.classList.remove('jobs-bulk-off');
          el.classList.toggle('hidden', !BULK_MODE[tab]);
        }
      });
      if (!BULK_MODE[tab]) {
        container.querySelectorAll('.row-select:checked').forEach((el) => { el.checked = false; });
      }
      refreshBulkButtons();
    };
    bulkBtn.onclick = () => applyBulkMode(!BULK_MODE[tab]);
    selectAllBtn.onclick = () => {
      const checks = getVisibleRowChecks();
      const allChecked = checks.length > 0 && checks.every((cb) => cb.checked);
      checks.forEach((cb) => { cb.checked = !allChecked; });
      refreshBulkButtons();
    };
    deleteBtn.onclick = async () => {
      const checked = Array.from(container.querySelectorAll('.row-select:checked'));
      const ids = checked.map((el) => el.dataset.rowId).filter(Boolean);
      if (ids.length === 0) {
        alert('กรุณาเลือกรายการที่ต้องการลบก่อน');
        return;
      }
      if (!confirm(`ต้องการลบ ${ids.length} รายการใช่หรือไม่?`)) return;
      try {
        for (const id of ids) {
          await apiDelete(apiEntity, id);
        }
        alert(`ลบสำเร็จ ${ids.length} รายการ`);
        loadList();
      } catch (e) {
        alert('ลบไม่สำเร็จ: ' + e.message);
      }
    };
    container.addEventListener('change', (e) => {
      if (e.target && e.target.classList?.contains('row-select')) {
        refreshBulkButtons();
      }
    });
    return { applyFilter, applyBulkMode };
  }
  return { applyFilter };
}


const THAI_PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา',
  'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก',
  'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน',
  'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา',
  'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'พะเยา', 'ภูเก็ต',
  'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยะลา', 'ยโสธร', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี',
  'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี',
  'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
];

const DEPARTMENTS = ['LBA', 'LBD', 'LM', 'DS', 'WL'];

// สถานที่/แลนด์มาร์ก -> จังหวัด (ลำดับบนมาก่อน = เฉพาะเจาะจงกว่า)
const LANDMARK_TO_PROVINCE = [
  { province: 'กรุงเทพมหานคร', patterns: [/เอเชียทีค/i, /asiatique/i, /ไอคอนสยาม/i, /iconsiam/i] },
  { province: 'ชลบุรี', patterns: [/พัทยา/i, /ศรีราชา/i] },
];

// mapping คำสำคัญ (เขต/พื้นที่) -> จังหวัด - ใช้หลังสแกนชื่อจังหวัดเต็ม และหลังกรองบรรทัดรอง
const AREA_KEYWORD_TO_PROVINCE = [
  { province: 'ปทุมธานี', keywords: ['รังสิต', 'คลองหนึ่ง', 'คลอง 1', 'คลองสอง', 'คลอง 2', 'คลองสาม', 'คลอง 3'] },
  {
    province: 'กรุงเทพมหานคร',
    keywords: ['บางนา', 'ลาดพร้าว', 'บางแค', 'พระราม 2', 'บางเขน', 'สุขุมวิท', 'พระโขนง', 'คลองเตย', 'ห้วยขวาง'],
  },
];

/** บรรทัดที่บอกแค่ทักษะ/พื้นที่คุ้นเคย ไม่ใช่ที่ทำงานหลัก - ไม่ใช้เดาจังหวัด */
const PROVINCE_SECONDARY_SKILL_LINE =
  /ชำนาญพื้นที่|คุ้นเคยพื้นที่|รู้เส้นทาง|พื้นที่ใกล้เคียง|เดินทางสะดวกใน/i;

/** บรรทัดที่น่าจะเป็นที่ตั้งงานจริง - ให้น้ำหนักก่อน */
const PROVINCE_PRIMARY_LINE =
  /ปฏิบัติงาน|สถานที่ปฏิบัติงาน|สถานที่ทำงาน|พิกัด|ทำงานที่|ที่ทำงาน|สาขา|ทำงาน\s*@|^\s*๐“/i;

function splitCaptionLines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function matchProvinceNameInText(t) {
  const s = String(t || '').replace(/\s+/g, ' ');
  for (const p of THAI_PROVINCES) {
    if (!p) continue;
    if (s.includes(p)) return p;
  }
  return '';
}

function matchAreaKeywordsInText(t) {
  const lower = String(t || '').toLowerCase();
  for (const rule of AREA_KEYWORD_TO_PROVINCE) {
    for (const kw of rule.keywords) {
      if (!kw) continue;
      if (lower.includes(kw.toLowerCase())) return rule.province;
    }
  }
  return '';
}

function matchLandmarksInText(t) {
  const s = String(t || '');
  for (const { province, patterns } of LANDMARK_TO_PROVINCE) {
    for (const re of patterns) {
      if (re.test(s)) return province;
    }
  }
  return '';
}

/**
 * เดาจังหวัดจาก Caption: ให้ความสำคัญแลนด์มาร์ก โ’ บรรทัดปฏิบัติงาน/พิกัด โ’
 * ข้อความที่ตัดบรรทัด "ชำนาญพื้นที่..." แล้ว โ’ ทั้งข้อความ
 */
function detectProvinceFromText(text) {
  const full = String(text || '').replace(/\s+/g, ' ');
  const lines = splitCaptionLines(text);

  const primaryLines = lines.filter((line) => PROVINCE_PRIMARY_LINE.test(line));
  const withoutSecondary = lines.filter((line) => !PROVINCE_SECONDARY_SKILL_LINE.test(line)).join('\n');

  // 1) แลนด์มาร์กชัดเจน (ทั้งข้อความ - เอเชียทีค ชนะ รังสิต ในรายการคุณสมบัติ)
  const landmark = matchLandmarksInText(full);
  if (landmark) return landmark;

  // 2) ชื่อจังหวัดเต็มในบรรทัด "ปฏิบัติงาน / พิกัด / ..."
  if (primaryLines.length) {
    const primaryJoined = primaryLines.join('\n');
    const p1 = matchProvinceNameInText(primaryJoined);
    if (p1) return p1;
    const a1 = matchAreaKeywordsInText(primaryJoined);
    if (a1) return a1;
  }

  // 3) ชื่อจังหวัดเต็ม โดยตัดบรรทัดทักษะพื้นที่รอง
  const p2 = matchProvinceNameInText(withoutSecondary);
  if (p2) return p2;

  // 4) คีย์เวิร์ดเขต (ไม่รวมบรรทัดชำนาญพื้นที่)
  const a2 = matchAreaKeywordsInText(withoutSecondary);
  if (a2) return a2;

  // 5) สำรอง: ทั้งข้อความ
  const p3 = matchProvinceNameInText(full);
  if (p3) return p3;
  return matchAreaKeywordsInText(full);
}

const TAB_CONFIG = {
  dashboard: {
    title: 'Dashboard',
  },
  users: {
    title: 'Users',
    addTitle: 'Add User',
    editTitle: 'Edit User',
    api: 'users',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'email', label: 'Email (Facebook)', type: 'email', required: true },
      { key: 'password', label: 'Password (Facebook)', type: 'password', required: false, placeholder: 'Leave blank = keep unchanged (edit mode)' },
      { key: 'poster_name', label: 'Poster Name (Facebook display name)', type: 'text' },
    ],
    listFields: ['name', 'email', 'poster_name'],
    note:
      'ก่อนกดโพสต์ใน Assignments: กด "ล็อกอิน Facebook" ในรายการ — เปิด Chrome ล็อกอิน/ยืนยันตัวตน แล้วบันทึก session ลง .auth (เซิร์ฟเวอร์ต้องรันจากโฟลเดอร์โปรเจกต์นี้ ถ้า API error ให้รีสตาร์ท npm start)',
  },
  groups: {
    title: 'Groups',
    addTitle: 'Add Group',
    editTitle: 'Edit Group',
    api: 'groups',
    fields: [
      { key: 'job_type', label: 'Job Type', type: 'jobTypeSelect', options: ['Driver', 'Admin', 'Warehouse', 'Technician', 'Sales/Marketing', 'Accounting/Finance', 'Other', 'Truck/Crane', 'Coordinator'], required: true },
      { key: 'group_inputs', label: 'Group Links or Group IDs (multiple)', type: 'textarea', required: true, placeholder: 'https://www.facebook.com/groups/1833374556703242\nhttps://www.facebook.com/groups/konkubrod\nor enter only Group ID / slug' },
      { key: 'province', label: 'Province', type: 'datalist', options: THAI_PROVINCES, required: true, placeholder: 'Type to search province' },
      { key: 'province_note', label: 'Province Note (shown in parentheses)', type: 'text', placeholder: 'e.g. Bangna' },
      { key: 'blacklist_groups', label: 'Blacklist Groups (cannot use post link)', type: 'text', placeholder: '1073449637181260,550295531832556' },
      { key: 'added_by', label: 'Added By', type: 'groupAddedBySelect', required: true },
      { key: 'department', label: 'Department', type: 'select', options: DEPARTMENTS, required: false },
    ],
    listFields: ['fb_group_id', 'province', 'job_type', 'department', 'added_by'],
  },
  jobs: {
    title: 'Jobs',
    addTitle: 'Add Job',
    editTitle: 'Edit Job',
    api: 'jobs',
    fields: [
      { key: 'title', label: 'Job Title', type: 'text', required: true },
      { key: 'job_position', label: 'Job Position', type: 'jobPositionSelect', required: true },
      { key: 'owner', label: 'Owner', type: 'ownerSelect', required: true },
      { key: 'company', label: 'Company/Unit', type: 'text', required: true },
      { key: 'department', label: 'Department', type: 'select', options: DEPARTMENTS, required: false },
      {
        key: 'province',
        label: 'Province',
        type: 'jobProvinceSelect',
        options: THAI_PROVINCES,
        required: true,
      },
      { key: 'province_note', label: 'Province Note (shown in parentheses)', type: 'text', placeholder: 'e.g. Bangna' },
      { key: 'caption', label: 'Caption', type: 'textarea', required: true },
      { key: 'apply_link', label: 'Apply Link', type: 'url' },
      { key: 'comment_reply', label: 'Comment Reply', type: 'text' },
    ],
    listFields: ['title', 'owner', 'company', 'department'],
    extraActions: [
      { label: 'Save as Template', action: 'saveAsTemplate' },
    ],
  },
  templates: {
    title: 'Templates',
    addTitle: 'Add Template',
    editTitle: 'Edit Template',
    api: 'templates',
    fields: [
      { key: 'name', label: 'Template Name', type: 'text', required: true },
      { key: 'title', label: 'Job Title', type: 'text', required: true },
      { key: 'job_position', label: 'Job Position', type: 'jobPositionSelect', required: false },
      { key: 'owner', label: 'Owner', type: 'ownerSelect', required: true },
      { key: 'company', label: 'Company/Unit', type: 'text', required: true },
      { key: 'caption', label: 'Caption', type: 'textarea', required: true },
      { key: 'apply_link', label: 'Apply Link', type: 'url' },
      { key: 'comment_reply', label: 'Comment Reply', type: 'text' },
    ],
    listFields: ['id', 'name', 'title', 'owner', 'company'],
    extraActions: [
      { label: 'Create Job from Template', action: 'createJobFromTemplate' },
    ],
  },
  reports: {
    title: 'Reports',
  },
  schedules: {
    title: 'Schedules',
    addTitle: 'Schedule Post',
    editTitle: 'Edit Schedule',
    api: 'schedules',
    fields: [
      { key: 'name', label: 'Schedule Name', type: 'text', required: true, placeholder: 'e.g. Morning batch' },
      { key: 'assignment_ids', label: 'Assignments (multi-select)', type: 'multiselectFrom', optionsFrom: 'assignments', optionLabel: 'id', optionValue: 'id', required: true },
      { key: 'scheduled_for', label: 'Scheduled Date/Time', type: 'datetime-local', required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['pending', 'cancelled'] },
    ],
    listFields: ['name', 'scheduled_for', 'status'],
  },
  assignments: {
    title: 'Assignments',
    addTitle: 'Add Assignment',
    editTitle: 'Edit Assignment',
    api: 'assignments',
    fields: [
      { key: 'user_id', label: 'User', type: 'selectFrom', optionsFrom: 'users', optionLabel: 'name', required: true },
      { key: 'doer_name', label: 'Assignee', type: 'assignmentDoerSelect', required: true },
      { key: 'department', label: 'Department', type: 'select', options: DEPARTMENTS, required: false },
      { key: 'job_ids', label: 'Jobs (multi-select)', type: 'multiselectFrom', optionsFrom: 'jobs', optionLabel: 'title', optionValue: 'id', required: true },
      { key: 'group_ids', label: 'Groups (multi-select)', type: 'multiselectFrom', optionsFrom: 'groups', optionLabel: 'name', optionValue: 'id', required: false },
    ],
    listFields: ['id', 'user_id', 'doer_name', 'department', 'job_ids', 'group_ids'],
    note: 'If group is empty in assignment, system uses groups from user config',
  },
  lead_collect: {
    title: 'Collect Comments from Posts',
  },
};

// --- API helpers ---
async function readFetchErrorMessage(res) {
  const text = await res.text();
  const t = String(text || '').trim();
  if (!t) return res.statusText || `HTTP ${res.status}`;
  try {
    const j = JSON.parse(t);
    if (j && typeof j.error === 'string' && j.error) return j.error;
    if (j && typeof j.message === 'string' && j.message) return j.message;
  } catch (_) {
    /* plain text / HTML */
  }
  return t.length > 400 ? `${t.slice(0, 400)}…` : t;
}

async function apiGet(entity) {
  const res = await fetch(`${API}/${entity}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await readFetchErrorMessage(res));
  return res.json();
}

async function apiPost(entity, body) {
  const res = await fetch(`${API}/${entity}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readFetchErrorMessage(res));
  return res.json();
}

async function apiPut(entity, id, body) {
  const sid = encodeURIComponent(String(id));
  const res = await fetch(`${API}/${entity}/${sid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readFetchErrorMessage(res));
  return res.json();
}

async function apiDelete(entity, id) {
  const sid = encodeURIComponent(String(id));
  const res = await fetch(`${API}/${entity}/${sid}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await readFetchErrorMessage(res));
}

let appToastHideTimer = null;

/** แจ้งผลเหนือ modal (กันกรณี alert ถูกบัง / ไม่โผล่บนมือถือหรือ in-app browser) */
function showAppToast(message, kind = 'success') {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  const variant = kind === 'error' ? 'error' : 'success';
  el.className = `app-toast app-toast--${variant}`;
  el.textContent = message;
  el.removeAttribute('hidden');
  requestAnimationFrame(() => {
    el.classList.add('app-toast--visible');
  });
  clearTimeout(appToastHideTimer);
  appToastHideTimer = setTimeout(() => {
    el.classList.remove('app-toast--visible');
    setTimeout(() => el.setAttribute('hidden', ''), 280);
  }, 7500);
}

async function getOwnerOptionsFallback() {
  const [jobs, templates] = await Promise.all([
    apiGet('jobs').catch(() => []),
    apiGet('templates').catch(() => []),
  ]);
  const names = new Set();
  jobs.forEach((j) => {
    const name = String(j?.owner || '').trim();
    if (name) names.add(name);
  });
  templates.forEach((t) => {
    const name = String(t?.owner || '').trim();
    if (name) names.add(name);
  });
  DEFAULT_JOB_OWNERS.forEach((name) => names.add(name));
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'));
}

async function getJobOwnerOptions() {
  try {
    const owners = await apiGet('job-owners');
    if (Array.isArray(owners)) {
      const names = new Set(owners.map((o) => String(o?.name || '').trim()).filter(Boolean));
      DEFAULT_JOB_OWNERS.forEach((name) => names.add(name));
      return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'));
    }
  } catch (_) {
    // fallback when backend route is unavailable or server not restarted
  }
  return getOwnerOptionsFallback();
}

async function getJobPositionOptionsFallback() {
  const [jobs, templates] = await Promise.all([
    apiGet('jobs').catch(() => []),
    apiGet('templates').catch(() => []),
  ]);
  const names = new Set([...DEFAULT_JOB_POSITIONS, ...getLocalJobPositions()]);
  jobs.forEach((j) => {
    const name = String(j?.job_position || '').trim();
    if (name) names.add(name);
  });
  templates.forEach((t) => {
    const name = String(t?.job_position || '').trim();
    if (name) names.add(name);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'));
}

async function getJobPositionOptions() {
  try {
    const rows = await apiGet('job-positions');
    if (Array.isArray(rows)) {
      const names = new Set(rows.map((o) => String(o?.name || '').trim()).filter(Boolean));
      DEFAULT_JOB_POSITIONS.forEach((name) => names.add(name));
      getLocalJobPositions().forEach((name) => names.add(name));
      return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'));
    }
  } catch (_) {}
  return getJobPositionOptionsFallback();
}

async function getGroupAdderOptionsFallback() {
  const groups = await apiGet('groups').catch(() => []);
  const names = new Set();
  (groups || []).forEach((g) => {
    const name = String(g?.added_by || '').trim();
    if (name) names.add(name);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'));
}

async function getGroupAdderOptions() {
  try {
    const rows = await apiGet('group-adders');
    if (Array.isArray(rows)) {
      return rows.map((o) => String(o?.name || '').trim()).filter(Boolean);
    }
  } catch (_) {}
  return getGroupAdderOptionsFallback();
}

async function getAssignmentDoerOptionsFallback() {
  const assignments = await apiGet('assignments').catch(() => []);
  const names = new Set();
  (assignments || []).forEach((a) => {
    const name = String(a?.doer_name || '').trim();
    if (name) names.add(name);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'));
}

async function getAssignmentDoerOptions() {
  try {
    const rows = await apiGet('assignment-doers');
    if (Array.isArray(rows)) {
      return rows.map((o) => String(o?.name || '').trim()).filter(Boolean);
    }
  } catch (_) {
    // fallback สำหรับ server เก่าที่ยังไม่มี /api/assignment-doers
    try {
      const rows = await apiGet('group-adders');
      if (Array.isArray(rows)) {
        return rows.map((o) => String(o?.name || '').trim()).filter(Boolean);
      }
    } catch (_) {}
  }
  return getAssignmentDoerOptionsFallback();
}

function normalizeSpaceText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function captionHasApplyLinkLine(caption) {
  return /(?:^|\n)\s*(?:๐‘\s*)?(?:หรือ)?สมัครงานได้ที่\s*:?\s*/i.test(caption || '');
}

function captionContainsUrl(caption, url) {
  if (!caption || !url) return false;
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i').test(caption);
}

function buildCaptionWithApplyLink(caption, applyLink) {
  const cleanCaption = normalizeSpaceText(caption);
  const cleanApplyLink = normalizeSpaceText(applyLink);
  if (!cleanApplyLink) return cleanCaption;
  if (captionContainsUrl(cleanCaption, cleanApplyLink)) return cleanCaption;
  if (captionHasApplyLinkLine(cleanCaption)) return cleanCaption;
  if (!cleanCaption) return `หรือสมัครงานได้ที่ : ${cleanApplyLink}`;
  return `${cleanCaption}\n\nหรือสมัครงานได้ที่ : ${cleanApplyLink}`;
}

function extractPrimaryPhone(text) {
  const matches = String(text || '').match(/(?:\+66|0)\d[\d\s-]{7,14}\d/g);
  if (!matches || matches.length === 0) return '';
  return matches[0].replace(/\s+/g, ' ').trim();
}

function generateCommentReplyFromCaption(caption) {
  const text = normalizeSpaceText(caption || '');
  if (!text) return '';
  const phone = extractPrimaryPhone(caption);
  const firstMeaningfulLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^[-*]/.test(l) && !/สมัครงานได้ที่/i.test(l)) || '';
  if (phone) return `หากสนใจงานนี้ ติดต่อ โทรติดต่อ ${phone}`;
  if (firstMeaningfulLine) {
    return `ขอบคุณที่สนใจงาน "${firstMeaningfulLine}" นะครับ หากสนใจสามารถคอมเมนต์ใต้โพสต์หรือทักข้อความมาได้เลยครับ`;
  }
  return 'ขอบคุณที่สนใจงานนี้ครับ หากสนใจสามารถคอมเมนต์ใต้โพสต์หรือทักข้อความมาได้เลยครับ';
}

function attachCaptionAutofill(form, cfg) {
  if (cfg.api !== 'jobs' && cfg.api !== 'templates') return;
  const captionEl = form.querySelector('[name="caption"]');
  const applyLinkEl = form.querySelector('[name="apply_link"]');
  const commentEl = form.querySelector('[name="comment_reply"]');
  const provinceEl = form.querySelector('[name="province"]');
  if (!captionEl || !commentEl) return;

  const autofill = () => {
    const hasCaption = !!normalizeSpaceText(captionEl.value);
    const mergedCaption = buildCaptionWithApplyLink(captionEl.value, applyLinkEl?.value || '');
    if (mergedCaption !== captionEl.value) captionEl.value = mergedCaption;
    if (!hasCaption) return;
    const suggestion = generateCommentReplyFromCaption(captionEl.value);
    if (!suggestion) return;
    const shouldUpdateComment = !commentEl.value.trim() || commentEl.dataset.aiGenerated === 'true';
    if (shouldUpdateComment) {
      commentEl.value = suggestion;
      commentEl.dataset.aiGenerated = 'true';
    }

    if (provinceEl) {
      const detected = detectProvinceFromText(mergedCaption);
      if (detected) {
        const current = String(provinceEl.value || '').trim();
        const canUpdate = !current || provinceEl.dataset.aiProvince !== 'false';
        if (canUpdate) {
          if (provinceEl.tagName === 'SELECT' && ![...provinceEl.options].some((o) => o.value === detected)) {
            provinceEl.appendChild(new Option(detected, detected));
          }
          provinceEl.value = detected;
          provinceEl.dataset.aiProvince = 'true';
        }
      }
    }
  };

  if (commentEl.value.trim()) {
    commentEl.dataset.aiGenerated = 'false';
  } else {
    // ไม่เด้งข้อความอัตโนมัติตั้งแต่เปิดฟอร์ม ให้เกิดหลังผู้ใช้เริ่มใส่ Caption
    commentEl.dataset.aiGenerated = 'true';
  }

  captionEl.addEventListener('input', autofill);
  captionEl.addEventListener('blur', autofill);
  if (applyLinkEl) {
    applyLinkEl.addEventListener('input', autofill);
    applyLinkEl.addEventListener('blur', autofill);
  }
  commentEl.addEventListener('input', () => {
    commentEl.dataset.aiGenerated = 'false';
  });
  if (provinceEl) {
    const markManualProvince = () => {
      provinceEl.dataset.aiProvince = 'false';
    };
    provinceEl.addEventListener('input', markManualProvince);
    provinceEl.addEventListener('change', markManualProvince);
  }
}

// --- Modal ---
const formModal = document.getElementById('form-modal');
const deleteModal = document.getElementById('delete-modal');
let deleteTargetId = null;
let deleteTargetItem = null;
let formDirty = false;
/** กำลัง submit ฟอร์ม CRUD — กันปิด modal พลาดระหว่างเรียก API */
let crudFormSubmitBusy = false;

function markFormDirty() {
  formDirty = true;
}

function attachDirtyWatchers() {
  const content = formModal?.querySelector('.modal-content, form, .space-y-4') || formModal;
  if (!content) return;
  const inputs = content.querySelectorAll('input, textarea, select');
  inputs.forEach((el) => {
    el.removeEventListener('input', markFormDirty);
    el.removeEventListener('change', markFormDirty);
    el.addEventListener('input', markFormDirty);
    el.addEventListener('change', markFormDirty);
  });
}

function resetFormDirty() {
  formDirty = false;
}

function confirmCloseFormModal() {
  if (crudFormSubmitBusy) {
    alert('กำลังบันทึกข้อมูล กรุณารอจนเสร็จก่อนปิดหน้าต่าง');
    return false;
  }
  if (!formDirty) return true;
  // ยืนยันก่อนปิด เมื่อกรอกข้อมูลอยู่
  return window.confirm('คุณยังไม่ได้บันทึกข้อมูล ฟอร์มนี้จะถูกปิดและข้อมูลที่กรอกจะหายไป ต้องการออกจากหน้านี้หรือไม่?');
}

function setCrudFormSubmitting(busy) {
  crudFormSubmitBusy = !!busy;
  const modal = document.getElementById('form-modal');
  if (modal) modal.setAttribute('aria-busy', busy ? 'true' : 'false');
  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) closeBtn.disabled = busy;
  document.querySelectorAll('#form-actions button').forEach((b) => {
    b.disabled = busy;
  });
}

function applyCrudSaveLoading(btn, labelText) {
  if (!btn) return;
  if (!btn.dataset.saveIdleHtml) btn.dataset.saveIdleHtml = btn.innerHTML;
  btn.classList.add('btn-primary--busy');
  btn.innerHTML = '';
  const sp = document.createElement('span');
  sp.className = 'btn-busy-spinner';
  sp.setAttribute('aria-hidden', 'true');
  const lab = document.createElement('span');
  lab.className = 'btn-busy-label';
  lab.textContent = labelText;
  btn.appendChild(sp);
  btn.appendChild(lab);
}

function updateCrudSaveLoadingLabel(btn, labelText) {
  const lab = btn?.querySelector?.('.btn-busy-label');
  if (lab) lab.textContent = labelText;
}

function clearCrudSaveLoading(btn) {
  if (!btn) return;
  if (btn.dataset.saveIdleHtml) {
    btn.innerHTML = btn.dataset.saveIdleHtml;
    delete btn.dataset.saveIdleHtml;
  }
  btn.classList.remove('btn-primary--busy');
}

function openFormModal() {
  formModal.classList.remove('hidden');
  formModal.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  resetFormDirty();
  setTimeout(attachDirtyWatchers, 0);
}
function closeFormModal() {
  formModal.classList.remove('modal-open');
  formModal.classList.add('hidden');
  document.body.style.overflow = '';
  editingId = null;
  editingGroupFolder = null;
  resetFormDirty();
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
  deleteModal.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
}
function closeDeleteModal() {
  deleteTargetId = null;
  deleteTargetItem = null;
  deleteModal.classList.remove('modal-open');
  deleteModal.classList.add('hidden');
  document.body.style.overflow = '';
}

formModal.addEventListener('click', (e) => {
  if (e.target === formModal) {
    if (!confirmCloseFormModal()) return;
    closeFormModal();
  }
});
deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(); });
document.getElementById('modal-close').addEventListener('click', () => {
  if (!confirmCloseFormModal()) return;
  closeFormModal();
});
document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!formModal.classList.contains('hidden')) {
      if (!confirmCloseFormModal()) return;
      closeFormModal();
    }
    if (!deleteModal.classList.contains('hidden')) {
      closeDeleteModal();
    }
  }
});

// --- UI ---
async function setActiveTab(tab) {
  currentTab = tab;
  if (tab !== 'lead_collect') stopCollectStatusPoll();
  editingId = null;
  editingGroupFolder = null;
  closeFormModal();
  closeDeleteModal();
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('tab-active', btn.dataset.tab === tab);
  });
  const cfg = TAB_CONFIG[tab];
  document.getElementById('list-title').textContent = cfg.title;
  const listSub = document.getElementById('list-subtitle');
  if (listSub) {
    if (tab === 'users') {
      listSub.textContent =
        'ปุ่ม "ล็อกอิน Facebook" เปิด Google Chrome ให้ล็อกอินหรือยืนยันตัวตน — ระบบบันทึก session ลงโฟลเดอร์ .auth ของโปรเจกต์นี้ แล้วตอนกดโพสต์ใน Assignments จะใช้ session เดียวกัน (ไม่ต้องล็อกอินซ้ำถ้า session ยังใช้ได้)';
      listSub.classList.remove('hidden');
    } else {
      listSub.textContent = '';
      listSub.classList.add('hidden');
    }
  }
  const mobileLabel = document.getElementById('mobile-page-label');
  if (mobileLabel) mobileLabel.textContent = cfg.title;
  const desktopLabel = document.getElementById('desktop-page-label');
  if (desktopLabel) desktopLabel.textContent = cfg.title;
  document.getElementById('form-title').textContent = cfg.addTitle || cfg.title;
  const addBtn = document.getElementById('btn-add');
  const logsFilter = document.getElementById('logs-filter-wrap');
  if (addBtn)
    addBtn.style.display =
      tab === 'dashboard' || tab === 'reports' || tab === 'lead_collect' ? 'none' : '';
  if (logsFilter) logsFilter.style.display = 'none';
  if (tab === 'dashboard') {
    loadDashboardTab();
    return;
  }
  if (tab === 'lead_collect') {
    loadLeadCollectTab();
    return;
  }
  if (tab === 'reports') {
    loadReportsTab();
    return;
  }
  try {
    await renderForm(cfg, null);
  } catch (e) {
    console.error('renderForm failed:', e);
    const form = document.getElementById('crud-form');
    if (form) form.innerHTML = '<p class="text-sm text-amber-600">โหลดฟอร์มไม่สำเร็จ แต่ยังดูรายการได้ตามปกติ</p>';
  }
  loadList();
}

async function renderForm(cfg, item) {
  const version = ++renderFormVersion;
  const form = document.getElementById('crud-form');
  const actions = document.getElementById('form-actions');
  form.innerHTML = '';
  form.dataset.crudApi = String(cfg.api || '')
    .trim()
    .toLowerCase();

  for (const f of cfg.fields) {
    if (version !== renderFormVersion) return;
    const div = document.createElement('div');
    div.className = 'field-group';
    let input;
    let datalistEl = null;
    let provinceDropdownEl = null;
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
    } else if (f.type === 'ownerSelect') {
      input = document.createElement('select');
      input.className = 'input';
      input.appendChild(new Option('-- เลือกเจ้าของงาน --', ''));
      const owners = await getJobOwnerOptions();
      owners.forEach((ownerName) => {
        input.appendChild(new Option(ownerName, ownerName));
      });
      if (item && item[f.key] !== undefined && item[f.key] !== null) {
        const val = String(item[f.key]).trim();
        if (val && !owners.includes(val)) {
          input.appendChild(new Option(val, val));
        }
        input.value = val;
      }
    } else if (f.type === 'groupAddedBySelect') {
      input = document.createElement('select');
      input.className = 'input';
      input.appendChild(new Option('-- เลือกผู้เพิ่ม Group --', ''));
      const adders = await getGroupAdderOptions();
      adders.forEach((name) => {
        input.appendChild(new Option(name, name));
      });
      if (item && item[f.key] !== undefined && item[f.key] !== null) {
        const val = String(item[f.key]).trim();
        if (val && !adders.includes(val)) {
          input.appendChild(new Option(val, val));
        }
        input.value = val;
      }
    } else if (f.type === 'jobPositionSelect') {
      input = document.createElement('select');
      input.className = 'input';
      input.appendChild(new Option('-- เลือกตำแหน่งงาน --', ''));
      const positions = await getJobPositionOptions();
      positions.forEach((name) => {
        input.appendChild(new Option(name, name));
      });
      if (item && item[f.key] !== undefined && item[f.key] !== null) {
        const val = String(item[f.key]).trim();
        if (val && !positions.includes(val)) {
          input.appendChild(new Option(val, val));
        }
        input.value = val;
      }
    } else if (f.type === 'assignmentDoerSelect') {
      input = document.createElement('select');
      input.className = 'input';
      input.appendChild(new Option('-- เลือกผู้ทำ Assignment --', ''));
      const doers = await getAssignmentDoerOptions();
      doers.forEach((name) => {
        input.appendChild(new Option(name, name));
      });
      if (item && item[f.key] !== undefined && item[f.key] !== null) {
        const val = String(item[f.key]).trim();
        if (val && !doers.includes(val)) {
          input.appendChild(new Option(val, val));
        }
        input.value = val;
      } else if (item && item.id) {
        const fallback = getCachedAssignmentDoer(item.id);
        if (fallback) {
          if (![...input.options].some((o) => o.value === fallback)) {
            input.appendChild(new Option(fallback, fallback));
          }
          input.value = fallback;
        }
      }
    } else if (f.type === 'jobTypeSelect') {
      input = document.createElement('select');
      input.className = 'input';
      input.appendChild(new Option('-- เลือกประเภทงาน --', ''));
      const baseTypes = Array.isArray(f.options) ? f.options : [];
      const customTypes = getLocalJobTypes();
      const allTypes = Array.from(new Set([...baseTypes, ...customTypes]));
      allTypes.forEach((name) => {
        input.appendChild(new Option(name, name));
      });
      if (item && item[f.key] !== undefined && item[f.key] !== null) {
        const val = String(item[f.key]).trim();
        if (val && !allTypes.includes(val)) {
          input.appendChild(new Option(val, val));
        }
        input.value = val;
      }
    } else if (f.type === 'jobProvinceSelect') {
      input = document.createElement('select');
      input.className = 'input';
      input.appendChild(new Option('-- เลือกจังหวัด --', ''));
      const provinces = Array.isArray(f.options) ? f.options : THAI_PROVINCES;
      provinces.forEach((name) => {
        input.appendChild(new Option(name, name));
      });
    } else if (f.type === 'datalist' || f.type === 'provinceSelect') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'input';
      const listId = `${f.key}-list`;
      input.setAttribute('list', listId);
      datalistEl = document.createElement('datalist');
      datalistEl.id = listId;
      (f.options || []).forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt;
        datalistEl.appendChild(o);
      });
    } else if (f.type === 'selectFrom' && f.optionsFrom) {
      input = document.createElement('select');
      input.className = 'input';
      const opts = await apiGet(f.optionsFrom);
      input.appendChild(new Option('-- เลือก --', ''));
      opts.forEach((opt) => {
        const val = opt.id;
        let label;
        if (f.optionsFrom === 'users') {
          label = opt.poster_name || opt.name || opt.email || val;
        } else {
          label = opt[f.optionLabel || 'name'] || val;
        }
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
      const searchRow = document.createElement('div');
      searchRow.className = 'flex items-center gap-2';
      searchInput.classList.add('flex-1');
      searchRow.appendChild(searchInput);
      if (f.key === 'job_ids' || f.key === 'group_ids') {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn-secondary text-xs py-1.5 px-2.5 shrink-0';
        clearBtn.textContent = 'ล้าง';
        clearBtn.title = f.key === 'job_ids' ? 'ยกเลิกการเลือกงานทั้งหมด' : 'ยกเลิกการเลือกกลุ่มทั้งหมด';
        clearBtn.onclick = () => {
          input.querySelectorAll(`[name="${f.key}[]"]`).forEach((cb) => {
            cb.checked = false;
          });
        };
        searchRow.appendChild(clearBtn);
      }
      searchWrap.appendChild(searchRow);
      input.appendChild(searchWrap);
      const listWrap = document.createElement('div');
      listWrap.className = 'space-y-0.5 max-h-40 overflow-y-auto p-2';
      if (f.optionsFrom === 'groups') {
        const folderMap = new Map();
        opts.forEach((opt) => {
          const key = JSON.stringify([opt.job_type || '-', opt.province || '-', opt.province_note || '', opt.added_by || '-']);
          if (!folderMap.has(key)) folderMap.set(key, []);
          folderMap.get(key).push(opt);
        });
        const folderKeys = Array.from(folderMap.keys()).sort((a, b) => {
          const [jtA, pvA, pnA, adA] = JSON.parse(a);
          const [jtB, pvB, pnB, adB] = JSON.parse(b);
          const c1 = String(jtA).localeCompare(String(jtB), 'th');
          if (c1 !== 0) return c1;
          const c2 = String(pvA).localeCompare(String(pvB), 'th');
          if (c2 !== 0) return c2;
          const c3 = String(pnA).localeCompare(String(pnB), 'th');
          if (c3 !== 0) return c3;
          return String(adA).localeCompare(String(adB), 'th');
        });
        folderKeys.forEach((folderKey) => {
          const [jt, pv, pn, ad] = JSON.parse(folderKey);
          const folder = document.createElement('div');
          folder.className = 'border border-slate-200 rounded-lg bg-white mb-2 last:mb-0 group-folder';
          const details = document.createElement('details');
          details.className = 'group-folder-details';
          const summary = document.createElement('summary');
          summary.className = 'list-none cursor-pointer px-2 py-1.5 border-b border-slate-100';
          summary.innerHTML = `
            <div class="flex items-start gap-2">
              <input type="checkbox" class="folder-check rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5">
              <span class="text-xs font-medium text-slate-700">ประเภทงาน: ${escapeHtml(jt)} -- จังหวัด: ${escapeHtml(formatProvinceLabel(pv, pn))} -- ชื่อผู้เพิ่ม Group : ${escapeHtml(ad)}</span>
              <span class="ml-auto text-slate-400 text-xs select-none folder-arrow">โ–ธ</span>
            </div>
          `;
          details.appendChild(summary);
          const itemWrap = document.createElement('div');
          itemWrap.className = 'p-1.5 space-y-0.5 hidden';
          const groupsInFolder = folderMap.get(folderKey) || [];
          groupsInFolder.forEach((opt) => {
            const val = opt[f.optionValue || 'id'];
            const gid = opt.fb_group_id || opt.id || '';
            const label = `${gid}`;
            const searchText = `${jt} ${pv} ${pn} ${ad} ${label} ${val}`.toLowerCase();
            const cb = document.createElement('label');
            cb.className = 'flex items-center gap-3 cursor-pointer py-1.5 px-2 rounded hover:bg-slate-50 transition multiselect-option';
            cb.dataset.search = searchText;
            cb.innerHTML = `<input type="checkbox" name="${f.key}[]" value="${val}" ${selected.includes(String(val)) ? 'checked' : ''} class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0 member-check"> <span class="text-sm text-slate-700 truncate">${escapeHtml(label)}</span>`;
            itemWrap.appendChild(cb);
          });
          details.appendChild(itemWrap);
          folder.appendChild(details);
          const folderCheck = summary.querySelector('.folder-check');
          const arrow = summary.querySelector('.folder-arrow');
          const memberChecks = itemWrap.querySelectorAll('.member-check');
          const refreshFolderState = () => {
            const checked = Array.from(memberChecks).filter((x) => x.checked).length;
            folderCheck.checked = checked > 0 && checked === memberChecks.length;
            folderCheck.indeterminate = checked > 0 && checked < memberChecks.length;
          };
          details.addEventListener('toggle', () => {
            itemWrap.classList.toggle('hidden', !details.open);
            if (arrow) arrow.textContent = details.open ? 'โ–พ' : 'โ–ธ';
          });
          folderCheck.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          folderCheck.addEventListener('change', () => {
            memberChecks.forEach((x) => { x.checked = folderCheck.checked; });
            refreshFolderState();
          });
          memberChecks.forEach((x) => x.addEventListener('change', refreshFolderState));
          refreshFolderState();
          listWrap.appendChild(folder);
        });
      } else {
        let assignmentLabelMap = null;
        if (f.optionsFrom === 'assignments') {
          const [usersForAssignments, jobsForAssignments] = await Promise.all([
            apiGet('users').catch(() => []),
            apiGet('jobs').catch(() => []),
          ]);
          const userNameMap = new Map(usersForAssignments.map((u) => [String(u.id), u.poster_name || u.name || u.email || u.id]));
          const jobTitleMap = new Map(jobsForAssignments.map((j) => [String(j.id), j.title || j.id]));
          assignmentLabelMap = new Map(
            opts.map((a) => {
              const userLabel = userNameMap.get(String(a.user_id || '')) || a.user_id || '-';
              const jobs = Array.isArray(a.job_ids) ? a.job_ids : [];
              const jobTitles = jobs.map((id) => jobTitleMap.get(String(id)) || String(id)).filter(Boolean);
              const label = `Facebook: ${userLabel} · งาน: ${jobTitles.join(', ') || '-'}`;
              return [String(a.id), label];
            })
          );
        }
        opts.forEach((opt) => {
          const val = opt[f.optionValue || 'id'];
          const label = (assignmentLabelMap && assignmentLabelMap.get(String(val))) || opt[f.optionLabel || 'name'] || val;
          const searchText = `${label} ${val} ${opt.name || ''} ${opt.fb_group_id || ''} ${opt.province || ''}`.toLowerCase();
          const cb = document.createElement('label');
          cb.className = 'flex items-center gap-3 cursor-pointer py-2 px-2 -mx-2 rounded hover:bg-slate-100/50 transition multiselect-option';
          cb.dataset.search = searchText;
          cb.innerHTML = `<input type="checkbox" name="${f.key}[]" value="${val}" ${selected.includes(String(val)) ? 'checked' : ''} class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"> <span class="text-sm text-slate-700 truncate">${escapeHtml(label)}</span>`;
          listWrap.appendChild(cb);
        });
      }
      input.appendChild(listWrap);
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        listWrap.querySelectorAll('.multiselect-option').forEach((el) => {
          el.style.display = !q || el.dataset.search.includes(q) ? '' : 'none';
        });
        listWrap.querySelectorAll('.group-folder').forEach((folder) => {
          const visibleCount = folder.querySelectorAll('.multiselect-option:not([style*="display: none"])').length;
          folder.style.display = visibleCount > 0 || !q ? '' : 'none';
        });
      });
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      input.className = 'input';
    }
    // เบราว์เซอร์ให้ name เป็น '' ไม่ใช่ undefined - ต้องตั้ง name เสมอ ไม่งั้น querySelector('[name="group_inputs"]') หา textarea ไม่เจอ
    if (f.type !== 'multiselectFrom') {
      input.name = f.key;
      if (cfg.api === 'jobs' && (f.key === 'province' || f.key === 'province_note')) {
        input.id = f.key === 'province' ? 'crud-job-province' : 'crud-job-province-note';
      }
    }
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
        opt.textContent = `${u.name || u.id}${u.has_fb_token ? ' โ“' : ''}`;
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
          if (data.name) fetchBtn.textContent = 'โ“ ดึงแล้ว';
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
      div.innerHTML = formFieldLabelHtml(f);
      div.appendChild(wrap);
      form.appendChild(div);
      continue;
    }
    if (input.placeholder !== undefined) input.placeholder = f.placeholder || '';
    if (f.required && input.required !== undefined) input.required = true;
    if (item && item[f.key] !== undefined && f.type !== 'selectFrom' && f.type !== 'multiselectFrom') {
      if (f.key === 'password' || f.key === 'fb_access_token') {
        input.placeholder = '******** (เว้นว่าง = ไม่เปลี่ยน)';
      } else if (f.key === 'group_ids' && Array.isArray(item[f.key])) {
        input.value = item[f.key].join(', ');
      } else if (f.key === 'blacklist_groups' && Array.isArray(item[f.key])) {
        input.value = withDefaultBlacklistGroups(item[f.key]).join(', ');
      } else if (f.key === 'group_inputs') {
        if (item && item.group_inputs != null && String(item.group_inputs).trim() !== '') {
          input.value = item.group_inputs;
        } else if (item?.fb_group_id) {
          input.value = item.fb_group_id;
        }
      } else if (item[f.key] === null) {
        input.value = '';
      } else if (typeof item[f.key] === 'string' || typeof item[f.key] === 'number') {
        if (f.type === 'datetime-local' && item[f.key]) {
          const dt = new Date(item[f.key]);
          if (!Number.isNaN(dt.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            input.value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
          } else {
            input.value = item[f.key];
          }
        } else {
          input.value = item[f.key];
        }
      }
    }
    if (item && cfg.api === 'jobs') {
      if (f.key === 'province' && f.type === 'jobProvinceSelect') {
        const parsed = parseProvinceWithInlineNote(item.province, item.province_note);
        const val = String(parsed.province || '').trim();
        if (val && ![...input.options].some((o) => o.value === val)) {
          input.appendChild(new Option(val, val));
        }
        input.value = val;
      }
      if (f.key === 'province' && (f.type === 'datalist' || f.type === 'provinceSelect')) {
        const parsed = parseProvinceWithInlineNote(item.province, item.province_note);
        input.value = parsed.province || '';
      }
      if (f.key === 'province_note' && f.type === 'text') {
        const parsed = parseProvinceWithInlineNote(item.province, item.province_note);
        const note = String(item.province_note ?? '').trim();
        input.value = note || parsed.province_note || '';
      }
    }
    if (f.key === 'blacklist_groups' && !String(input.value || '').trim()) {
      input.value = DEFAULT_BLACKLIST_GROUP_IDS.join(', ');
    }
    div.innerHTML = formFieldLabelHtml(f);
    if (f.type === 'ownerSelect') {
      const wrap = document.createElement('div');
      wrap.className = 'space-y-2';
      wrap.appendChild(input);

      const controls = document.createElement('div');
      controls.className = 'flex flex-wrap gap-2';

      const addOwnerBtn = document.createElement('button');
      addOwnerBtn.type = 'button';
      addOwnerBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      addOwnerBtn.textContent = '+ เพิ่มชื่อเจ้าของงาน';
      addOwnerBtn.onclick = async () => {
        const name = prompt('ชื่อเจ้าของงานใหม่');
        const trimmed = name ? name.trim() : '';
        if (!trimmed) return;
        try {
          await apiPost('job-owners', { name: trimmed });
          if (![...input.options].some((o) => o.value === trimmed)) {
            input.appendChild(new Option(trimmed, trimmed));
          }
          input.value = trimmed;
        } catch (e) {
          // if backend route not ready, still allow current form to use the new name
          if (![...input.options].some((o) => o.value === trimmed)) {
            input.appendChild(new Option(trimmed, trimmed));
          }
          input.value = trimmed;
          alert('เพิ่มเข้ารายการชั่วคราวในฟอร์มแล้ว (ยังไม่บันทึกลงระบบ): ' + e.message);
        }
      };

      const removeOwnerBtn = document.createElement('button');
      removeOwnerBtn.type = 'button';
      removeOwnerBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      removeOwnerBtn.textContent = 'ลบชื่อที่เลือก';
      removeOwnerBtn.onclick = async () => {
        const selectedName = (input.value || '').trim();
        if (!selectedName) {
          alert('กรุณาเลือกชื่อเจ้าของงานก่อน');
          return;
        }
        if (!confirm(`ต้องการลบชื่อเจ้าของงาน "${selectedName}" ออกจากรายการใช่หรือไม่?`)) {
          return;
        }
        try {
          const candidates = Array.from(new Set([
            selectedName,
            selectedName.replace(/^คุณ\s*/i, '').trim(),
            (`คุณ${selectedName}`).trim(),
          ])).filter(Boolean);
          let ok = false;
          let lastError = '';
          for (const name of candidates) {
            const res = await fetch(`${API}/job-owners`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            if (res.ok) {
              ok = true;
              break;
            }
            lastError = await res.text();
          }
          if (!ok) throw new Error(lastError || 'Owner not found');
          const selectedIndex = input.selectedIndex;
          if (selectedIndex >= 0) input.remove(selectedIndex);
          input.value = '';
        } catch (e) {
          const selectedIndex = input.selectedIndex;
          if (selectedIndex >= 0) input.remove(selectedIndex);
          input.value = '';
          alert('ลบได้เฉพาะในฟอร์มชั่วคราว (ระบบหลักยังไม่อัปเดต): ' + e.message);
        }
      };

      controls.appendChild(addOwnerBtn);
      controls.appendChild(removeOwnerBtn);
      wrap.appendChild(controls);
      div.appendChild(wrap);
    } else if (f.type === 'jobPositionSelect') {
      const wrap = document.createElement('div');
      wrap.className = 'space-y-2';
      wrap.appendChild(input);

      const controls = document.createElement('div');
      controls.className = 'flex flex-wrap gap-2';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      addBtn.textContent = '+ เพิ่มตำแหน่งงาน';
      addBtn.onclick = async () => {
        const name = prompt('ตำแหน่งงานใหม่');
        const trimmed = name ? name.trim() : '';
        if (!trimmed) return;
        try {
          await apiPost('job-positions', { name: trimmed });
          if (![...input.options].some((o) => o.value === trimmed)) {
            input.appendChild(new Option(trimmed, trimmed));
          }
          input.value = trimmed;
        } catch (e) {
          addLocalJobPosition(trimmed);
          if (![...input.options].some((o) => o.value === trimmed)) {
            input.appendChild(new Option(trimmed, trimmed));
          }
          input.value = trimmed;
          alert('เพิ่มตำแหน่งงานในเครื่องนี้แล้ว (fallback): ' + e.message);
        }
      };

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      removeBtn.textContent = 'ลบตำแหน่งที่เลือก';
      removeBtn.onclick = async () => {
        const selectedName = (input.value || '').trim();
        if (!selectedName) {
          alert('กรุณาเลือกตำแหน่งงานก่อน');
          return;
        }
        if (!confirm(`ต้องการลบตำแหน่งงาน "${selectedName}" ออกจากรายการใช่หรือไม่?`)) {
          return;
        }
        try {
          const res = await fetch(`${API}/job-positions`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: selectedName }),
          });
          if (!res.ok) {
            removeLocalJobPosition(selectedName);
            throw new Error(await res.text());
          }
          const selectedIndex = input.selectedIndex;
          if (selectedIndex >= 0) input.remove(selectedIndex);
          input.value = '';
        } catch (e) {
          removeLocalJobPosition(selectedName);
          const selectedIndex = input.selectedIndex;
          if (selectedIndex >= 0) input.remove(selectedIndex);
          input.value = '';
          alert('ลบจากรายการในเครื่องนี้แล้ว (fallback): ' + e.message);
        }
      };

      controls.appendChild(addBtn);
      controls.appendChild(removeBtn);
      wrap.appendChild(controls);
      div.appendChild(wrap);
    } else if (f.type === 'jobTypeSelect') {
      const wrap = document.createElement('div');
      wrap.className = 'space-y-2';
      wrap.appendChild(input);

      const controls = document.createElement('div');
      controls.className = 'flex flex-wrap gap-2';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      addBtn.textContent = '+ เพิ่มประเภทงาน';
      addBtn.onclick = () => {
        const name = prompt('ประเภทงานใหม่');
        const trimmed = name ? name.trim() : '';
        if (!trimmed) return;
        addLocalJobType(trimmed);
        if (![...input.options].some((o) => o.value === trimmed)) {
          input.appendChild(new Option(trimmed, trimmed));
        }
        input.value = trimmed;
      };

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      removeBtn.textContent = 'ลบประเภทที่เลือก';
      removeBtn.onclick = () => {
        const selectedName = (input.value || '').trim();
        if (!selectedName) {
          alert('กรุณาเลือกประเภทงานก่อน');
          return;
        }
        if (!confirm(`ต้องการลบประเภทงาน "${selectedName}" ออกจากรายการในเครื่องนี้ใช่หรือไม่?`)) {
          return;
        }
        removeLocalJobType(selectedName);
        const selectedIndex = input.selectedIndex;
        if (selectedIndex >= 0) input.remove(selectedIndex);
        input.value = '';
      };

      controls.appendChild(addBtn);
      controls.appendChild(removeBtn);
      wrap.appendChild(controls);
      div.appendChild(wrap);
    } else if (f.type === 'groupAddedBySelect') {
      const wrap = document.createElement('div');
      wrap.className = 'space-y-2';
      wrap.appendChild(input);

      const controls = document.createElement('div');
      controls.className = 'flex flex-wrap gap-2';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      addBtn.textContent = '+ เพิ่มชื่อผู้เพิ่ม Group';
      addBtn.onclick = async () => {
        const name = prompt('ชื่อผู้เพิ่ม Group ใหม่');
        const trimmed = name ? name.trim() : '';
        if (!trimmed) return;
        try {
          await apiPost('group-adders', { name: trimmed });
          if (![...input.options].some((o) => o.value === trimmed)) {
            input.appendChild(new Option(trimmed, trimmed));
          }
          input.value = trimmed;
        } catch (e) {
          if (![...input.options].some((o) => o.value === trimmed)) {
            input.appendChild(new Option(trimmed, trimmed));
          }
          input.value = trimmed;
          alert('เพิ่มเข้ารายการชั่วคราวในฟอร์มแล้ว (ยังไม่บันทึกลงระบบ): ' + e.message);
        }
      };

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      removeBtn.textContent = 'ลบชื่อที่เลือก';
      removeBtn.onclick = async () => {
        const selectedName = (input.value || '').trim();
        if (!selectedName) {
          alert('กรุณาเลือกชื่อผู้เพิ่ม Group ก่อน');
          return;
        }
        if (!confirm(`ต้องการลบชื่อ "${selectedName}" ออกจากรายการใช่หรือไม่?`)) {
          return;
        }
        try {
          const res = await fetch(`${API}/group-adders`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: selectedName }),
          });
          if (!res.ok) throw new Error(await res.text());
          const selectedIndex = input.selectedIndex;
          if (selectedIndex >= 0) input.remove(selectedIndex);
          input.value = '';
        } catch (e) {
          const selectedIndex = input.selectedIndex;
          if (selectedIndex >= 0) input.remove(selectedIndex);
          input.value = '';
          alert('ลบได้เฉพาะในฟอร์มชั่วคราว (ระบบหลักยังไม่อัปเดต): ' + e.message);
        }
      };

      controls.appendChild(addBtn);
      controls.appendChild(removeBtn);
      wrap.appendChild(controls);
      div.appendChild(wrap);
    } else if (f.type === 'assignmentDoerSelect') {
      const wrap = document.createElement('div');
      wrap.className = 'space-y-2';
      wrap.appendChild(input);

      const controls = document.createElement('div');
      controls.className = 'flex flex-wrap gap-2';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      addBtn.textContent = '+ เพิ่มชื่อผู้ทำ Assignment';
      addBtn.onclick = async () => {
        const name = prompt('ชื่อผู้ทำ Assignment ใหม่');
        const trimmed = name ? name.trim() : '';
        if (!trimmed) return;
        try {
          try {
            await apiPost('assignment-doers', { name: trimmed });
          } catch (e) {
            // fallback สำหรับ server เก่าที่ยังไม่มี endpoint นี้
            await apiPost('group-adders', { name: trimmed });
          }
          if (![...input.options].some((o) => o.value === trimmed)) {
            input.appendChild(new Option(trimmed, trimmed));
          }
          input.value = trimmed;
        } catch (e) {
          if (![...input.options].some((o) => o.value === trimmed)) {
            input.appendChild(new Option(trimmed, trimmed));
          }
          input.value = trimmed;
          alert('เพิ่มเข้ารายการชั่วคราวในฟอร์มแล้ว (ยังไม่บันทึกลงระบบ): ' + e.message);
        }
      };

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-secondary text-sm py-1.5 px-3';
      removeBtn.textContent = 'ลบชื่อที่เลือก';
      removeBtn.onclick = async () => {
        const selectedName = (input.value || '').trim();
        if (!selectedName) {
          alert('กรุณาเลือกชื่อผู้ทำ Assignment ก่อน');
          return;
        }
        if (!confirm(`ต้องการลบชื่อ "${selectedName}" ออกจากรายการใช่หรือไม่?`)) {
          return;
        }
        try {
          let res = await fetch(`${API}/assignment-doers`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: selectedName }),
          });
          if (!res.ok) {
            // fallback สำหรับ server เก่าที่ไม่มี endpoint นี้
            res = await fetch(`${API}/group-adders`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: selectedName }),
            });
          }
          if (!res.ok) throw new Error(await res.text());
          const selectedIndex = input.selectedIndex;
          if (selectedIndex >= 0) input.remove(selectedIndex);
          input.value = '';
        } catch (e) {
          const selectedIndex = input.selectedIndex;
          if (selectedIndex >= 0) input.remove(selectedIndex);
          input.value = '';
          alert('ลบได้เฉพาะในฟอร์มชั่วคราว (ระบบหลักยังไม่อัปเดต): ' + e.message);
        }
      };

      controls.appendChild(addBtn);
      controls.appendChild(removeBtn);
      wrap.appendChild(controls);
      div.appendChild(wrap);
    } else {
      div.appendChild(input);
    }
    if (version !== renderFormVersion) return;
    if (datalistEl) div.appendChild(datalistEl);
    form.appendChild(div);
  }

  if (version !== renderFormVersion) return;
  if (cfg.note) {
    const note = document.createElement('p');
    note.className = 'text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100';
    note.textContent = cfg.note;
    form.appendChild(note);
  }

  attachCaptionAutofill(form, cfg);

  if (version !== renderFormVersion) return;
  actions.innerHTML = '';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.setAttribute('form', 'crud-form');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = item ? 'บันทึก' : 'เพิ่ม';
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

function getModalCrudConfig() {
  const form = document.getElementById('crud-form');
  const api = String(form?.dataset?.crudApi || '')
    .trim()
    .toLowerCase();
  if (api) {
    const cfg = Object.values(TAB_CONFIG).find(
      (c) => c && String(c.api || '').trim().toLowerCase() === api && Array.isArray(c.fields)
    );
    if (cfg) return cfg;
  }
  return TAB_CONFIG[currentTab];
}

async function submitForm(id) {
  const saveBtn = document.querySelector('#form-actions .btn-primary');
  const formId = id !== undefined && id !== null ? id : editingId;

  setCrudFormSubmitting(true);
  applyCrudSaveLoading(saveBtn, 'กำลังบันทึก…');
  try {
    const form = document.getElementById('crud-form');
    const cfg = getModalCrudConfig();
    if (!cfg || !Array.isArray(cfg.fields)) {
      throw new Error('โหลดฟอร์มไม่สำเร็จ กรุณาปิดหน้าต่างแล้วลองใหม่');
    }
    if (!form) {
      throw new Error('ไม่พบฟอร์ม');
    }

    const data = {};
    cfg.fields.forEach((f) => {
      let val;
      if (f.type === 'multiselectFrom') {
        const multiselectName = `${f.key}[]`;
        val = Array.from(form.querySelectorAll('input[type="checkbox"]:checked'))
          .filter((cb) => cb.name === multiselectName)
          .map((cb) => cb.value);
      } else {
        const el = form.querySelector(`[name="${f.key}"]`);
        if (!el) {
          val = '';
        } else {
          val = el.value?.trim();
        }
      }
      if (f.key === 'group_ids' || f.key === 'blacklist_groups' || f.key === 'job_ids' || f.key === 'job_positions' || f.key === 'assignment_ids') {
        if (typeof val === 'string') val = val ? val.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) : [];
      }
      data[f.key] = val;
    });

    if (cfg.api === 'groups') {
      const ids = parseGroupInputsToIds(data.group_inputs);

      if (!String(data.added_by || '').trim()) {
        throw new Error('กรุณาเลือกผู้เพิ่ม Group');
      }
      if (!String(data.job_type || '').trim()) {
        throw new Error('กรุณาเลือกประเภทงาน (Job Type)');
      }
      if (!String(data.province || '').trim()) {
        throw new Error('กรุณาระบุหรือเลือกจังหวัด');
      }

      const provinceParsed = parseProvinceWithInlineNote(data.province, data.province_note);
      const bodyBase = {
        // เก็บ province แบบมีวงเล็บไว้ด้วย เพื่อรองรับ server เก่าที่ยังไม่มีคอลัมน์ province_note
        province: formatProvinceLabel(provinceParsed.province, provinceParsed.province_note),
        province_note: provinceParsed.province_note || '',
        blacklist_groups: withDefaultBlacklistGroups(Array.isArray(data.blacklist_groups) ? data.blacklist_groups : []),
        job_type: data.job_type || '',
        job_positions: Array.isArray(data.job_positions) ? data.job_positions : [],
        added_by: String(data.added_by).trim(),
        department: String(data.department || '').trim(),
      };

      if (editingGroupFolder) {
        const oldItems = editingGroupFolder.items;
        const oldByFb = new Map(
          oldItems.map((i) => [normalizeFbGroupSegment(String(i.fb_group_id || '')), i])
        );
        const newSet = new Set(ids);

        if (ids.length === 0) {
          updateCrudSaveLoadingLabel(saveBtn, 'กำลังลบกลุ่มในโฟลเดอร์…');
          for (const it of oldItems) {
            await apiDelete(cfg.api, it.id);
          }
          editingId = null;
          closeFormModal();
          await loadList();
          showAppToast('ลบกลุ่มทั้งหมดในโฟลเดอร์แล้ว · รายการอัปเดตแล้ว');
          return;
        }

        let step = 0;
        const totalFolderOps = oldItems.filter((it) => {
          const k = normalizeFbGroupSegment(String(it.fb_group_id || ''));
          return !newSet.has(k);
        }).length;
        for (const it of oldItems) {
          const k = normalizeFbGroupSegment(String(it.fb_group_id || ''));
          if (!newSet.has(k)) {
            step += 1;
            updateCrudSaveLoadingLabel(saveBtn, `กำลังลบกลุ่มที่ไม่มีในรายการใหม่ (${step}/${totalFolderOps})…`);
            await apiDelete(cfg.api, it.id);
          }
        }

        for (let i = 0; i < ids.length; i++) {
          const gid = ids[i];
          updateCrudSaveLoadingLabel(saveBtn, `กำลังบันทึกกลุ่ม ${i + 1}/${ids.length}…`);
          const old = oldByFb.get(gid);
          if (old) {
            await apiPut(cfg.api, old.id, {
              ...bodyBase,
              fb_group_id: gid,
              name: `Group ${gid}`,
            });
          } else {
            await apiPost(cfg.api, {
              ...bodyBase,
              fb_group_id: gid,
              name: `Group ${gid}`,
            });
          }
        }

        rememberGroupsFolderHighlight(data, provinceParsed);
        editingId = null;
        closeFormModal();
        await loadList();
        showAppToast(`บันทึกโฟลเดอร์สำเร็จ · อัปเดต ${ids.length} กลุ่มในรายการแล้ว`);
        return;
      }

      if (ids.length === 0) {
        throw new Error('กรุณาใส่ลิงก์กลุ่ม หรือ Group ID อย่างน้อย 1 รายการ');
      }

      if (formId) {
        updateCrudSaveLoadingLabel(saveBtn, 'กำลังบันทึกกลุ่ม…');
        const gid = ids[0];
        await apiPut(cfg.api, formId, {
          ...bodyBase,
          fb_group_id: gid,
          name: `Group ${gid}`,
        });
      } else {
        for (let i = 0; i < ids.length; i++) {
          const gid = ids[i];
          updateCrudSaveLoadingLabel(saveBtn, `กำลังเพิ่มกลุ่ม ${i + 1}/${ids.length}…`);
          await apiPost(cfg.api, {
            ...bodyBase,
            fb_group_id: gid,
            name: `Group ${gid}`,
          });
        }
      }

      rememberGroupsFolderHighlight(data, provinceParsed);
      editingId = null;
      closeFormModal();
      await loadList();
      if (formId) {
        showAppToast('บันทึกกลุ่มสำเร็จ · รายการด้านล่างอัปเดตแล้ว');
      } else {
        const lines = countNonEmptyGroupInputLines(data.group_inputs);
        let msg = `เพิ่มกลุ่มสำเร็จ ${ids.length} รายการ · รายการด้านล่างอัปเดตแล้ว`;
        if (lines > ids.length) {
          msg += ` · กรอก ${lines} บรรทัด → ใช้ได้ ${ids.length} ID ไม่ซ้ำ (ส่วนที่เหลือซ้ำหรือรูปแบบไม่ถูก)`;
        } else if (lines < ids.length) {
          msg += ` · มีหลาย ID/ลิงก์ในบรรทัดเดียว (รวม ${ids.length} กลุ่ม)`;
        }
        showAppToast(msg);
      }
      return;
    }

    if (cfg.api === 'jobs' || cfg.api === 'templates') {
      data.apply_link = normalizeSpaceText(data.apply_link || '');
      data.caption = buildCaptionWithApplyLink(data.caption || '', data.apply_link);
      if (!normalizeSpaceText(data.comment_reply || '')) {
        data.comment_reply = generateCommentReplyFromCaption(data.caption);
      }
    }
    if (cfg.api === 'jobs') {
      const pv =
        document.getElementById('crud-job-province') ||
        (form && form.querySelector('[name="province"]'));
      const pn =
        document.getElementById('crud-job-province-note') ||
        (form && form.querySelector('[name="province_note"]'));
      const rawP = (pv ? String(pv.value || '') : String(data.province || '')).trim();
      const rawN = (pn ? String(pn.value || '') : String(data.province_note || '')).trim();
      const pp = parseProvinceWithInlineNote(rawP, rawN);
      data.province = pp.province || '';
      data.province_note = pp.province_note || '';
      if (!String(data.province || '').trim()) {
        throw new Error('กรุณาเลือกจังหวัด');
      }
    }

    if (cfg.api === 'assignments' && !String(data.doer_name || '').trim()) {
      throw new Error('กรุณาเลือกผู้ทำ Assignment');
    }
    if (cfg.api === 'assignments') {
      const jids = Array.isArray(data.job_ids) ? data.job_ids : [];
      if (jids.length === 0) {
        throw new Error('กรุณาเลือกงาน (Jobs) อย่างน้อย 1 รายการ');
      }
      data.job_id = jids[0];
    }

    let saved = null;
    if (cfg.api === 'jobs') {
      const dept =
        data.department != null && String(data.department).trim() !== ''
          ? String(data.department).trim()
          : null;
      const jobPayload = {
        title: data.title,
        job_position: data.job_position,
        owner: data.owner,
        company: data.company,
        department: dept,
        province: data.province,
        province_note: data.province_note,
        caption: data.caption,
        apply_link: data.apply_link || null,
        comment_reply: data.comment_reply || null,
        job_type: data.job_type || null,
      };
      if (formId) {
        saved = await apiPut('jobs', formId, jobPayload);
        alert('บันทึกสำเร็จ');
      } else {
        saved = await apiPost('jobs', jobPayload);
        alert('เพิ่มสำเร็จ');
      }
    } else if (formId) {
      saved = await apiPut(cfg.api, formId, data);
      alert('บันทึกสำเร็จ');
    } else {
      saved = await apiPost(cfg.api, data);
      alert('เพิ่มสำเร็จ');
    }
    if (cfg.api === 'assignments') {
      const assignmentId = (saved && saved.id) || formId;
      if (assignmentId) {
        setCachedAssignmentDoer(assignmentId, data.doer_name || '');
      }
    }
    editingId = null;
    closeFormModal();
    loadList();
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + (e && e.message ? e.message : String(e)));
  } finally {
    setCrudFormSubmitting(false);
    clearCrudSaveLoading(saveBtn);
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
        job_position: item.job_position || '',
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
  container.className = 'min-h-[240px]';
  const runIdInput = document.getElementById('logs-run-id');
  const runId = runIdInput?.value?.trim() || '';
  container.innerHTML = listLoadingHtml('กำลังโหลดข้อมูล');

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
      container.innerHTML = listEmptyHtml('ยังไม่มี Post Log', 'Log จะแสดงหลังโพสต์งานสำเร็จ');
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
    container.innerHTML = listErrorHtml(e.message);
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

async function loadDashboardTab() {
  const container = document.getElementById('list-container');
  container.className = 'min-h-[240px] p-4 sm:p-6';
  container.innerHTML = listLoadingHtml('กำลังโหลด Dashboard');
  try {
    const selectedStart = document.getElementById('dashboard-start-date')?.value || '';
    const selectedEnd = document.getElementById('dashboard-end-date')?.value || '';
    const selectedOwner = document.getElementById('dashboard-owner-filter')?.value || '';
    const query = new URLSearchParams();
    if (selectedStart) query.set('start_date', `${selectedStart}T00:00:00`);
    if (selectedEnd) query.set('end_date', `${selectedEnd}T23:59:59`);
    if (selectedOwner) query.set('owner', selectedOwner);
    const qs = query.toString();
    const summary = await fetch(`${API}/dashboard/summary${qs ? `?${qs}` : ''}`).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    });
    const statusRows = Array.isArray(summary?.status_breakdown) ? summary.status_breakdown : [];
    const ownerRows = Array.isArray(summary?.top_owners) ? summary.top_owners : [];
    const dailyRows = Array.isArray(summary?.daily_breakdown) ? summary.daily_breakdown : [];
    const ownerOptions = Array.isArray(summary?.owner_options) ? summary.owner_options : [];
    const recentRows = Array.isArray(summary?.recent_posts) ? summary.recent_posts : [];
    const activeStart = selectedStart || (summary?.filters?.start_date ? String(summary.filters.start_date).slice(0, 10) : '');
    const activeEnd = selectedEnd || (summary?.filters?.end_date ? String(summary.filters.end_date).slice(0, 10) : '');
    const activeOwner = selectedOwner || summary?.filters?.owner || '';
    container.innerHTML = `
      <div class="rounded-xl border border-slate-200 bg-white p-4 mb-4">
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div>
            <label class="block text-xs text-slate-500 mb-1">วันที่เริ่มต้น</label>
            <input id="dashboard-start-date" type="date" class="input py-1.5 text-sm" value="${escapeHtml(activeStart)}">
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">วันที่สิ้นสุด</label>
            <input id="dashboard-end-date" type="date" class="input py-1.5 text-sm" value="${escapeHtml(activeEnd)}">
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">เจ้าของงาน</label>
            <select id="dashboard-owner-filter" class="input py-1.5 text-sm">
              <option value="">ทั้งหมด</option>
              ${ownerOptions.map((o) => `<option value="${escapeHtml(String(o))}" ${String(o) === String(activeOwner) ? 'selected' : ''}>${escapeHtml(String(o))}</option>`).join('')}
            </select>
          </div>
          <div class="flex gap-2">
            <button id="dashboard-apply-filter" class="btn-primary text-sm w-full">ดูข้อมูล</button>
            <button id="dashboard-clear-filter" class="btn-secondary text-sm w-full">ล้าง</button>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">โพสต์ทั้งหมด</p>
          <p class="text-2xl font-semibold text-slate-900 mt-1">${escapeHtml(String(summary?.total_posts || 0))}</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">โพสต์วันนี้</p>
          <p class="text-2xl font-semibold text-slate-900 mt-1">${escapeHtml(String(summary?.today_posts || 0))}</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">สถานะล่าสุด</p>
          <p class="text-sm font-medium text-slate-800 mt-2">${statusRows.slice(0, 1).map((r) => `${r.post_status}: ${r.count}`).join('') || '-'}</p>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <h3 class="text-sm font-semibold text-slate-800 mb-2">สัดส่วนสถานะโพสต์</h3>
          <div class="space-y-2">
            ${statusRows.length > 0 ? statusRows.map((r) => `
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600">${escapeHtml(String(r.post_status || '-'))}</span>
                <span class="font-medium text-slate-800">${escapeHtml(String(r.count || 0))}</span>
              </div>
            `).join('') : '<p class="text-sm text-slate-500">ยังไม่มีข้อมูล</p>'}
          </div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <h3 class="text-sm font-semibold text-slate-800 mb-2">เจ้าของงานที่โพสต์มากสุด</h3>
          <div class="space-y-2">
            ${ownerRows.length > 0 ? ownerRows.map((r) => `
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600">${escapeHtml(String(r.owner || '-'))}</span>
                <span class="font-medium text-slate-800">${escapeHtml(String(r.count || 0))}</span>
              </div>
            `).join('') : '<p class="text-sm text-slate-500">ยังไม่มีข้อมูล</p>'}
          </div>
        </div>
      </div>
      <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h3 class="text-sm font-semibold text-slate-800 mb-2">จำนวนโพสต์แยกตามวัน</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200">
                <th class="text-left py-2 pr-3">วันที่</th>
                <th class="text-left py-2 pr-3">จำนวนโพสต์</th>
              </tr>
            </thead>
            <tbody>
              ${dailyRows.length > 0 ? dailyRows.map((r) => `
                <tr class="border-b border-slate-100">
                  <td class="py-2 pr-3 text-slate-700">${escapeHtml(String(r.post_date || '-'))}</td>
                  <td class="py-2 pr-3 font-medium text-slate-800">${escapeHtml(String(r.count || 0))}</td>
                </tr>
              `).join('') : '<tr><td class="py-2 text-slate-500" colspan="2">ยังไม่มีข้อมูล</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h3 class="text-sm font-semibold text-slate-800 mb-2">โพสต์ล่าสุด 10 รายการ</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200">
                <th class="text-left py-2 pr-3">เวลา</th>
                <th class="text-left py-2 pr-3">ผู้โพสต์</th>
                <th class="text-left py-2 pr-3">งาน</th>
                <th class="text-left py-2 pr-3">กลุ่ม</th>
              </tr>
            </thead>
            <tbody>
              ${recentRows.length > 0 ? recentRows.map((r) => `
                <tr class="border-b border-slate-100">
                  <td class="py-2 pr-3 text-slate-600">${escapeHtml(new Date(r.created_at).toLocaleString('th-TH'))}</td>
                  <td class="py-2 pr-3 text-slate-700">${escapeHtml(String(r.poster_name || '-'))}</td>
                  <td class="py-2 pr-3 text-slate-700">${escapeHtml(String(r.job_title || '-'))}</td>
                  <td class="py-2 pr-3 text-slate-700">${escapeHtml(String(r.group_name || '-'))}</td>
                </tr>
              `).join('') : '<tr><td class="py-2 text-slate-500" colspan="4">ยังไม่มีข้อมูล</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById('dashboard-apply-filter')?.addEventListener('click', () => loadDashboardTab());
    document.getElementById('dashboard-clear-filter')?.addEventListener('click', () => {
      const startEl = document.getElementById('dashboard-start-date');
      const endEl = document.getElementById('dashboard-end-date');
      const ownerEl = document.getElementById('dashboard-owner-filter');
      if (startEl) startEl.value = '';
      if (endEl) endEl.value = '';
      if (ownerEl) ownerEl.value = '';
      loadDashboardTab();
    });
  } catch (e) {
    container.innerHTML = listErrorHtml(e.message);
  }
}

function formatThaiDateFromInput(ymd) {
  if (!ymd || typeof ymd !== 'string') return '';
  const p = ymd.split('-').map((x) => parseInt(x, 10));
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  const [y, m, d] = p;
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatReportDateRangeLabel(start, end) {
  const s = String(start || '').trim();
  const e = String(end || '').trim();
  if (!s && !e) return 'ทั้งหมด (ไม่กรองช่วงวันที่)';
  if (s && !e) return `ตั้งแต่ ${formatThaiDateFromInput(s)}`;
  if (!s && e) return `จนถึง ${formatThaiDateFromInput(e)}`;
  return `${formatThaiDateFromInput(s)} - ${formatThaiDateFromInput(e)}`;
}

function getBangkokDateKey(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  } catch {
    return '';
  }
}

function formatBangkokDayTitle(key) {
  if (!key || key === 'unknown') return 'ไม่ระบุวันที่';
  const parts = key.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return key;
  const [y, m, d] = parts;
  const local = new Date(y, m - 1, d);
  return local.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function groupReportRowsByBangkokDay(rows) {
  const order = [];
  const byDay = new Map();
  for (const r of rows) {
    const k = getBangkokDateKey(r.created_at) || 'unknown';
    if (!byDay.has(k)) {
      byDay.set(k, []);
      order.push(k);
    }
    byDay.get(k).push(r);
  }
  return order.map((k) => [k, byDay.get(k)]);
}

function hasReportFilters(start, end, owner, doer) {
  return Boolean(
    String(start || '').trim() ||
      String(end || '').trim() ||
      String(owner || '').trim() ||
      String(doer || '').trim()
  );
}

function formatReportPostDateLabel(yyyyMmDd) {
  if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) return escapeHtml(yyyyMmDd);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return escapeHtml(yyyyMmDd);
  return escapeHtml(
    d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  );
}

function buildReportStatsHtml({
  total,
  daily_breakdown,
  owner_breakdown,
  selectedStart,
  selectedEnd,
  selectedOwner,
  selectedDoer,
  rowsLen,
  hasFilters,
}) {
  const dateRangeText = formatReportDateRangeLabel(selectedStart, selectedEnd);
  const filterBits = [];
  if (selectedOwner) filterBits.push(`เจ้าของงาน: ${selectedOwner}`);
  if (selectedDoer) filterBits.push(`ผู้ทำ Assignment: ${selectedDoer}`);
  const filterLine = filterBits.length ? filterBits.join(' · ') : 'ทั้งหมด (ไม่กรองเจ้าของงาน / ผู้ทำ)';

  const scopeHint = hasFilters
    ? 'ตัวเลขด้านล่างสะท้อนตามตัวกรองด้านบน (ช่วงวันที่ / เจ้าของงาน / ผู้ทำ)'
    : 'ตัวเลขด้านล่างคือโพสต์ทั้งหมดในระบบ - ยังไม่ได้กรอง';

  const capNote =
    total > rowsLen
      ? `<p class="text-xs text-amber-700 mt-2">แสดงในตารางรายละเอียด ${rowsLen.toLocaleString('th-TH')} รายการล่าสุดจากทั้งหมด ${total.toLocaleString('th-TH')} รายการ - กรองให้แคบลงหรือดาวน์โหลด CSV เพื่อดูครบ</p>`
      : '';

  const daily = Array.isArray(daily_breakdown) ? daily_breakdown : [];
    const owners = Array.isArray(owner_breakdown) ? owner_breakdown : [];

  const dailyRows =
    daily.length === 0
      ? '<tr><td colspan="2" class="py-3 px-3 text-slate-500 text-sm">ไม่มีข้อมูล</td></tr>'
      : daily
          .map(
            (d) =>
              `<tr class="border-b border-slate-100"><td class="py-2 px-3 text-slate-700">${formatReportPostDateLabel(d.post_date)}</td><td class="py-2 px-3 text-right font-medium text-slate-900">${Number(d.count || 0).toLocaleString('th-TH')}</td></tr>`
          )
          .join('');

  const ownerRows =
    owners.length === 0
      ? '<tr><td colspan="2" class="py-3 px-3 text-slate-500 text-sm">ไม่มีข้อมูล</td></tr>'
      : owners
          .map(
            (o) =>
              `<tr class="border-b border-slate-100"><td class="py-2 px-3 text-slate-700">${escapeHtml(String(o.owner || '-'))}</td><td class="py-2 px-3 text-right font-medium text-slate-900">${Number(o.count || 0).toLocaleString('th-TH')}</td></tr>`
          )
          .join('');

  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm text-slate-500">โพสต์ทั้งหมด</p>
        <p class="text-3xl font-bold text-slate-900 mt-1">${Number(total).toLocaleString('th-TH')}</p>
        <p class="text-xs text-slate-600 mt-2">${escapeHtml(scopeHint)}</p>
        <p class="text-xs text-slate-500 mt-2">${escapeHtml(dateRangeText)}</p>
        <p class="text-xs text-slate-400 mt-1">${escapeHtml(filterLine)}</p>
        ${capNote}
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 class="text-sm font-semibold text-slate-800 mb-2">โพสต์แยกตามวัน</h4>
            <div class="overflow-x-auto max-h-56 overflow-y-auto rounded-lg border border-slate-100">
              <table class="w-full text-sm">
                <thead><tr class="bg-slate-50 text-left text-xs text-slate-500"><th class="py-2 px-3">วันที่</th><th class="py-2 px-3 text-right">จำนวน</th></tr></thead>
                <tbody>${dailyRows}</tbody>
              </table>
            </div>
          </div>
          <div>
            <h4 class="text-sm font-semibold text-slate-800 mb-2">โพสต์แยกตามเจ้าของงาน</h4>
            <div class="overflow-x-auto max-h-56 overflow-y-auto rounded-lg border border-slate-100">
              <table class="w-full text-sm">
                <thead><tr class="bg-slate-50 text-left text-xs text-slate-500"><th class="py-2 px-3">เจ้าของงาน</th><th class="py-2 px-3 text-right">จำนวน</th></tr></thead>
                <tbody>${ownerRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function localDateISO(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadLeadCollectTab() {
  const container = document.getElementById('list-container');
  container.className = 'min-h-[240px] p-4 sm:p-6';

  const today = new Date();
  const defaultDate = localDateISO(today);
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
      <p class="text-sm font-semibold text-slate-800 mb-1">เลือกช่วงวันที่โพสต์และบัญชี</p>
      <p class="text-xs text-slate-500 mb-3">เลือกทีละบัญชีแล้วกดเก็บ Comment จากนั้นเปลี่ยนบัญชีแล้วกดรันต่อได้ โดยสถานะจะแยกเป็นกล่องรายบัญชีอัตโนมัติ</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label class="block text-xs text-slate-500 mb-1">วันที่โพสต์เริ่ม (ไทย)</label>
          <input id="collect-date-start" type="date" class="input py-1.5 text-sm" value="${escapeHtml(selStartDate)}">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">วันที่โพสต์สิ้นสุด (ไทย)</label>
          <input id="collect-date-end" type="date" class="input py-1.5 text-sm" value="${escapeHtml(selEndDate)}">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-slate-500 mb-1">บัญชี Facebook ที่ใช้โพสต์</label>
          <select id="collect-user-id" class="input py-1.5 text-sm">
            <option value="">-- เลือกบัญชี --</option>
            ${userOptsHtml}
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">ค้นหาในตาราง</label>
          <input id="collect-search" type="text" class="input py-1.5 text-sm" placeholder="ชื่องาน, กลุ่ม, ลิงก์..." value="${escapeHtml(qFilter)}">
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        <button type="button" id="collect-clear-search" class="btn-secondary text-sm">ล้างช่องค้นหา</button>
        <button type="button" id="collect-select-all-btn" class="btn-secondary text-sm">เลือกทั้งหมดที่แสดง</button>
        <button type="button" id="collect-download-report-btn" class="btn-secondary text-sm">ดาวน์โหลดรายงาน (CSV)</button>
        <button type="button" id="collect-run-headless-btn" class="btn-primary text-sm">เก็บ Comment</button>
        <span id="collect-selected-count" class="text-xs text-slate-600 self-center">เลือก 0 รายการ</span>
      </div>
    </div>
    <button type="button" id="collect-status-open" class="btn-secondary text-xs fixed right-4 bottom-4 z-40 hidden">แสดงสถานะเก็บ Comment</button>
    <div id="collect-status-stack" class="fixed right-4 bottom-4 w-[min(520px,94vw)] max-h-[72vh] overflow-y-auto space-y-2 z-40 pr-1"></div>
    <div id="collect-table-wrap" class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm min-h-[120px]">
      <div class="p-6 text-center text-sm text-slate-500">เลือกบัญชีและช่วงวันที่ — ระบบโหลดรายการอัตโนมัติ</div>
    </div>`;

  let cachedRows = [];
  /** จาก API: total_in_range = โพสต์ที่ตรงวัน+บัญชี, with_link = ที่มีลิงก์ */
  let cachedCollectStats = null;

  const updateSelectedCount = () => {
    const n = document.querySelectorAll('.collect-post-check:checked').length;
    const el = document.getElementById('collect-selected-count');
    if (el) el.textContent = 'เลือก ' + n + ' รายการ';
    const btn = document.getElementById('collect-run-headless-btn');
    if (btn) btn.disabled = n === 0;
  };

  const escCsv = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadCollectCsv = (rows) => {
    const headers = ['เวลา', 'บัญชี', 'เจ้าของงาน', 'ชื่องาน', 'ชื่อกลุ่ม', 'ลิงก์', 'เบอร์โทรศัพท์ที่เก็บได้'];
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
      const ok = confirm(`ยืนยันยกเลิกงานเก็บ Comment ของบัญชี ${uid} ?`);
      if (!ok) return;
    }
    const r = await fetch(`${API}/run/collect-comments/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `สั่ง ${action} ไม่สำเร็จ`);
  };
  const getProgressFromLogs = (logs, isRunning, runMessage = '') => {
    const arr = Array.isArray(logs) ? logs : [];
    let bestProgress = null;
    for (const l of arr) {
      const msg = String(l?.message || '');
      const m = msg.match(/\[(\d+)\/(\d+)\]/);
      if (m) {
        const cur = Math.max(0, parseInt(m[1], 10) || 0);
        const tot = Math.max(0, parseInt(m[2], 10) || 0);
        if (tot > 0) {
          const p = Math.min(100, Math.round((cur / tot) * 100));
          if (bestProgress == null || p > bestProgress) bestProgress = p;
        }
      }
    }
    if (!isRunning && /จบรอบ|เสร็จ|completed|done/i.test(String(runMessage || ''))) return 100;
    if (bestProgress != null) return bestProgress;
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
        const topProgress = Math.max(...hiddenRuns.map((r) => getProgressFromLogs(r.recent_logs, !!r.running, r.message)));
        const short = hiddenRuns
          .slice(0, 2)
          .map((r) => `${String(r.user_name || r.user_id || '-')} ${getProgressFromLogs(r.recent_logs, !!r.running, r.message)}%`)
          .join(' | ');
        openBtn.textContent = hiddenRuns.length > 2 ? `แสดงสถานะ: ${short} +${hiddenRuns.length - 2}` : `แสดงสถานะ: ${short}`;
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
        const isSuccessDone =
          !isRunning &&
          (Number(run.exit_code) === 0 || /เสร็จ|จบรอบ|completed|done/i.test(String(run.message || '')));
        const isFailedDone = !isRunning && !isSuccessDone;
        const progress = getProgressFromLogs(run.recent_logs, isRunning, run.message);
        const title = `${escapeHtml(run.user_name || run.user_id || '-')} (${isRunning ? 'กำลังรัน' : (isSuccessDone ? 'เสร็จสมบูรณ์' : 'สิ้นสุดการทำงาน')})`;
        const logs = Array.isArray(run.recent_logs) ? run.recent_logs : [];
        const uid = escapeHtml(String(run.user_id || ''));
        const canPause = isRunning && !run.paused;
        const canResume = isRunning && !!run.paused;
        const canCancel = isRunning;
        const logHtml = logs.slice(-3).map((l) => `<li>${escapeHtml(l.message || '')}</li>`).join('');
        const progressTone = progress >= 100
          ? 'border-emerald-200 bg-emerald-50'
          : progress >= 70
            ? 'border-cyan-200 bg-cyan-50'
            : progress >= 35
              ? 'border-amber-200 bg-amber-50'
              : 'border-slate-200 bg-white';
        const cardTone = isSuccessDone
          ? 'border-emerald-200 bg-emerald-50'
          : (isFailedDone ? 'border-rose-200 bg-rose-50' : progressTone);
        return `<div class="rounded-xl border ${cardTone} p-3 text-sm shadow-sm">
          <div class="flex items-start justify-between gap-2 mb-1">
            <p class="text-xs font-semibold text-slate-600">${title}</p>
            <button type="button" class="collect-status-hide-one text-sm text-slate-500 hover:text-slate-700" data-run-id="${rid}" aria-label="close-status">ปิด</button>
          </div>
          <p class="text-sm mb-1 text-slate-700">${escapeHtml(run.message || '-')} · ${progress}%</p>
          <div class="mb-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2">
            <button type="button" class="collect-status-action rounded-lg px-2 py-1 text-xs border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40" data-action="pause" data-user-id="${uid}" ${canPause ? '' : 'disabled'}>Pause</button>
            <button type="button" class="collect-status-action rounded-lg px-2 py-1 text-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40" data-action="resume" data-user-id="${uid}" ${canResume ? '' : 'disabled'}>Play</button>
            <button type="button" class="collect-status-action rounded-lg px-2 py-1 text-xs border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40" data-action="cancel" data-user-id="${uid}" ${canCancel ? '' : 'disabled'}>ยกเลิกงาน</button>
          </div>
          <ul class="max-h-32 overflow-y-auto text-xs space-y-0.5 list-disc pl-4 text-slate-600">${logHtml || '<li>ยังไม่มี log ล่าสุด</li>'}</ul>
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

  const groupKey = (r) => `${String(r.user_id || '-')}:${String(r.job_id || 'nojob')}::${String(r.job_title || '(ไม่มีชื่องาน)').slice(0, 120)}`;

  const renderRows = (rows) => {
    const wrap = document.getElementById('collect-table-wrap');
    if (!wrap) return;
    const f = String(document.getElementById('collect-search')?.value || '').trim().toLowerCase();
    const filtered = !f
      ? rows
      : rows.filter((r) => [r.job_title, r.group_name, r.post_link, r.owner, r.company, r.poster_name, r.job_id, r.assignment_id, r.fb_account_name]
        .map((x) => String(x || '').toLowerCase()).join(' ').includes(f));
    if (!filtered.length) {
      let hint = '';
      if (f && rows.length) {
        hint = 'ลองล้างช่องค้นหา หรือเปลี่ยนคำค้น';
      } else if (cachedCollectStats && cachedCollectStats.total_in_range === 0) {
        hint =
          'ไม่มี Post Log ในช่วงวันที่และบัญชีนี้ (ยังไม่ถูกบันทึกลงฐานข้อมูลจากตอนโพสต์ผ่านระบบ หรือวันที่โพสต์จริงไม่ตรงกับปฏิทินไทย) — ถ้ารัน playwright จากเครื่อง ให้ตั้ง RUN_LOG_API_URL ให้ตรงพอร์ตเซิร์ฟเวอร์';
      } else if (
        cachedCollectStats &&
        cachedCollectStats.total_in_range > 0 &&
        cachedCollectStats.with_link === 0
      ) {
        hint = `พบ ${cachedCollectStats.total_in_range} รายการในระบบแต่ยังไม่มีลิงก์โพสต์ — มักเกิดจากการเก็บลิงก์หลังโพสต์ไม่สำเร็จ (ดู log บอท) หรือบันทึก Log ก่อนได้ลิงก์`;
      } else {
        hint =
          'รายการมาจาก Post Log (วันที่ตามเวลาไทย + บัญชีที่เลือก + ต้องมีลิงก์โพสต์) — ถ้ารันโพสต์จากเครื่องโดยตรง ให้ตั้ง RUN_LOG_API_URL ให้ตรงพอร์ตเซิร์ฟเวอร์';
      }
      wrap.innerHTML = `<div class="p-8 text-center text-sm text-slate-500 space-y-2 max-w-lg mx-auto">
        <p>ไม่พบโพสต์ตามเงื่อนไข</p>
        <p class="text-xs text-slate-400">${escapeHtml(hint)}</p>
      </div>`;
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
      const title = list[0].job_title || '(ไม่มีชื่องาน)';
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
          <td class="py-2 px-3 text-xs"><a class="text-red-600 hover:underline break-all" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">เปิดโพสต์</a></td>
          <td class="py-2 px-3 text-xs text-slate-500 font-mono">${escapeHtml(r.job_id || '-')}</td>
          <td class="py-2 px-3 text-center text-xs">${escapeHtml(String(r.comment_count ?? 0))}</td>
          <td class="py-2 px-3 text-xs text-slate-600 max-w-[10rem] truncate" title="${escapeHtml(r.customer_phone || '')}">${escapeHtml(r.customer_phone || '-')}</td>
        </tr>`;
      }).join('');
      parts.push(`<details class="border border-slate-200 rounded-lg mb-2 overflow-hidden" open>
        <summary class="cursor-pointer px-3 py-2.5 bg-slate-50 font-medium text-sm flex flex-wrap items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
          <input type="checkbox" class="collect-group-check mt-0.5" aria-label="close-status">
          <span class="text-slate-800">${escapeHtml(title)}</span>
          <span class="text-xs font-normal text-slate-500">(${list.length} ลิงก์)</span>
        </summary>
        <div class="overflow-x-auto border-t border-slate-100">
          <table class="w-full text-left">
            <thead><tr class="bg-white text-xs text-slate-500">
              <th class="py-2 px-2 w-10"></th>
              <th class="py-2 px-3">เวลา</th>
              <th class="py-2 px-3">บัญชี</th>
              <th class="py-2 px-3">กลุ่ม</th>
              <th class="py-2 px-3">ลิงก์</th>
              <th class="py-2 px-3">Job ID</th>
              <th class="py-2 px-3 text-center">Comment</th>
              <th class="py-2 px-3">เบอร์โทรที่เก็บได้</th>
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
    if (!uid) return alert('กรุณาเลือกบัญชี');
    if (!startDate || !endDate) return alert('กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด');
    if (startDate > endDate) return alert('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');

    if (tw) tw.innerHTML = '<div class="p-6 text-center text-sm text-slate-500">กำลังโหลด...</div>';
    try {
      const url = `${API}/post-logs/for-comment-collect?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&user_id=${encodeURIComponent(uid)}`;
      const merged = await fetch(url).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.error) || res.statusText);
        if (Array.isArray(data)) return { rows: data, stats: null };
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const stats = data.stats && typeof data.stats === 'object' ? data.stats : null;
        return { rows, stats };
      });
      cachedCollectStats = merged.stats;
      const byId = new Map(merged.rows.map((r) => [String(r.id), r]));
      cachedRows = [...byId.values()].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      renderRows(cachedRows);
    } catch (e) {
      if (tw) tw.innerHTML = `<div class="p-6 text-center text-sm text-red-600">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</div>`;
    }
  };

  document.getElementById('collect-download-report-btn')?.addEventListener('click', () => {
    if (!cachedRows.length) return alert('ยังไม่มีข้อมูลสำหรับดาวน์โหลด');
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
    if (!selected.length) return alert('กรุณาเลือกอย่างน้อย 1 ลิงก์');

    const grouped = new Map();
    for (const it of selected) {
      if (!grouped.has(it.user_id)) grouped.set(it.user_id, []);
      grouped.get(it.user_id).push(it.id);
    }
    const runs = [...grouped.entries()].map(([user_id, post_log_ids]) => ({ user_id, post_log_ids }));

    if (!confirm(`รันเก็บ Comment ${selected.length} โพสต์ จาก ${runs.length} บัญชี?`)) return;
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
      alert('สั่งรันไม่สำเร็จ: ' + e.message);
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

async function loadReportsTab() {
  const container = document.getElementById('list-container');
  container.className = 'min-h-[240px] p-4 sm:p-6';
  const selectedStart = document.getElementById('report-start-date')?.value || '';
  const selectedEnd = document.getElementById('report-end-date')?.value || '';
  const selectedOwner = document.getElementById('report-owner-filter')?.value || '';
  const selectedDoer = document.getElementById('report-doer-filter')?.value || '';
   const selectedDept = document.getElementById('report-dept-filter')?.value || '';

  let ownerOptions = [];
  let doerOptions = [];
  const deptOptions = ['LBA', 'LBD', 'LM', 'DS', 'WL'];
  try {
    const [summary, doerRows] = await Promise.all([
      fetch(`${API}/dashboard/summary`).then((r) => r.json()),
      fetch(`${API}/assignment-doers`).then((r) => r.json()),
    ]);
    ownerOptions = Array.isArray(summary?.owner_options) ? summary.owner_options : [];
    doerOptions = Array.isArray(doerRows) ? doerRows.map((x) => x?.name).filter(Boolean) : [];
  } catch {
    ownerOptions = [];
    doerOptions = [];
  }

  const query = new URLSearchParams();
  if (selectedStart) query.set('start_date', `${selectedStart}T00:00:00`);
  if (selectedEnd) query.set('end_date', `${selectedEnd}T23:59:59`);
  if (selectedOwner) query.set('owner', selectedOwner);
  if (selectedDoer) query.set('doer', selectedDoer);
  if (selectedDept) query.set('department', selectedDept);
  query.set('limit', '12000');
  const reportHasFilters = hasReportFilters(selectedStart, selectedEnd, selectedOwner, selectedDoer);

  container.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-4 mb-4 shadow-sm">
      <p class="text-sm font-semibold text-slate-800 mb-3">ตัวกรองรายงาน</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div>
          <label class="block text-xs text-slate-500 mb-1">วันที่เริ่ม</label>
          <input id="report-start-date" type="date" class="input py-1.5 text-sm" value="${escapeHtml(selectedStart)}">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">วันที่สิ้นสุด</label>
          <input id="report-end-date" type="date" class="input py-1.5 text-sm" value="${escapeHtml(selectedEnd)}">
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">เจ้าของงาน</label>
          <select id="report-owner-filter" class="input py-1.5 text-sm">
            <option value="">ทั้งหมด</option>
            ${ownerOptions.map((o) => `<option value="${escapeHtml(String(o))}" ${String(o) === String(selectedOwner) ? 'selected' : ''}>${escapeHtml(String(o))}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">ผู้ทำ Assignment</label>
          <select id="report-doer-filter" class="input py-1.5 text-sm">
            <option value="">ทั้งหมด</option>
            ${doerOptions.map((n) => `<option value="${escapeHtml(String(n))}" ${String(n) === String(selectedDoer) ? 'selected' : ''}>${escapeHtml(String(n))}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">แผนก</label>
          <select id="report-dept-filter" class="input py-1.5 text-sm">
            <option value="">ทั้งหมด</option>
            ${deptOptions.map((n) => `<option value="${escapeHtml(String(n))}" ${String(n) === String(selectedDept) ? 'selected' : ''}>${escapeHtml(String(n))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        <button type="button" id="report-apply" class="btn-primary text-sm min-w-[7rem]">โหลดรายงาน</button>
        <button type="button" id="report-clear" class="btn-secondary text-sm min-w-[7rem]">ล้าง</button>
      </div>
      <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
        <button type="button" id="report-download-csv" class="btn-secondary text-sm">ดาวน์โหลด CSV</button>
        <span class="text-xs text-slate-500 self-center">ไฟล์ UTF-8 เปิดใน Excel ได้</span>
      </div>
    </div>
    <div id="report-stats-block" class="mb-4"></div>
    <div id="report-table-wrap" class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div class="p-6 text-center text-sm text-slate-500">กด "โหลดรายงาน" เพื่อแสดงข้อมูล</div>
    </div>
  `;

  const apply = () => loadReportsTab();
  document.getElementById('report-apply')?.addEventListener('click', apply);
  document.getElementById('report-clear')?.addEventListener('click', () => {
    document.getElementById('report-start-date').value = '';
    document.getElementById('report-end-date').value = '';
    document.getElementById('report-owner-filter').value = '';
    document.getElementById('report-doer-filter').value = '';
    const deptEl = document.getElementById('report-dept-filter');
    if (deptEl) deptEl.value = '';
    loadReportsTab();
  });

  document.getElementById('report-download-csv')?.addEventListener('click', async () => {
    const q = new URLSearchParams();
    const s = document.getElementById('report-start-date')?.value;
    const e = document.getElementById('report-end-date')?.value;
    const o = document.getElementById('report-owner-filter')?.value;
    const d = document.getElementById('report-doer-filter')?.value;
    const dept = document.getElementById('report-dept-filter')?.value;
    if (s) q.set('start_date', `${s}T00:00:00`);
    if (e) q.set('end_date', `${e}T23:59:59`);
    if (o) q.set('owner', o);
    if (d) q.set('doer', d);
    if (dept) q.set('department', dept);
    q.set('limit', '15000');
    q.set('format', 'csv');
    try {
      const url = `${API}/reports/posts?${q.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `รายงานโพสต์-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert('ดาวน์โหลดไม่สำเร็จ: ' + err.message);
    }
  });

  const tableWrap = document.getElementById('report-table-wrap');
  const statsBlock = document.getElementById('report-stats-block');
  tableWrap.innerHTML = listLoadingHtml('กำลังโหลดรายงาน');
  if (statsBlock) statsBlock.innerHTML = '';

  try {
    const data = await fetch(`${API}/reports/posts?${query.toString()}`).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    });
    const rows = Array.isArray(data) ? data : data.rows || [];
    const total = typeof data.total === 'number' ? data.total : rows.length;
    const daily_breakdown = data.daily_breakdown;
    const owner_breakdown = data.owner_breakdown;

    if (statsBlock) {
      statsBlock.innerHTML = buildReportStatsHtml({
        total,
        daily_breakdown,
        owner_breakdown,
        selectedStart,
        selectedEnd,
        selectedOwner,
        selectedDoer,
        rowsLen: rows.length,
        hasFilters: reportHasFilters,
      });
    }

    if (rows.length === 0) {
      const emptyMsg = reportHasFilters
        ? 'ไม่มีข้อมูลตามตัวกรองที่เลือก'
        : 'ยังไม่มีโพสต์ในระบบ';
      tableWrap.innerHTML = `<div class="p-8 text-center text-sm text-slate-500">${escapeHtml(emptyMsg)}</div>`;
      return;
    }

    const groups = groupReportRowsByBangkokDay(rows);
    let html =
      '<div class="px-4 py-3 border-b border-slate-200 bg-slate-50 text-sm text-slate-600">แสดงในตารางนี้ <strong class="text-slate-800">' +
      rows.length.toLocaleString('th-TH') +
      '</strong> รายการ</div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-200 bg-white">';
    const th = (t) => `<th class="text-left py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">${t}</th>`;
    html += [
      th('เวลา'),
      th('ชื่องาน'),
      th('เจ้าของงาน'),
      th('ผู้ทำ Assignment'),
      th('แผนก'),
      th('Facebook (ชื่อ / อีเมล)'),
      th('หน่วยงาน'),
      th('ชื่อกลุ่ม'),
      th('ลิงก์โพสต์'),
      th('สถานะ'),
    ].join('');
    html += '</tr></thead><tbody>';

    for (const [dayKey, dayRows] of groups) {
      html += `<tr class="bg-slate-100 border-y border-slate-200"><td colspan="9" class="py-2 px-3 font-semibold text-slate-800">${escapeHtml(formatBangkokDayTitle(dayKey))}</td></tr>`;
      for (const r of dayRows) {
        const t = r.created_at
          ? new Date(r.created_at).toLocaleString('th-TH', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          : '-';
        const fb = [r.fb_account_name, r.fb_account_email].filter(Boolean).join(' · ') || r.user_id || '-';
        const doer = String(r.assignment_doer || '').trim() || '-';
        const dept = String(r.assignment_department || '').trim() || '-';
        const link = r.post_link
          ? `<a href="${escapeHtml(r.post_link)}" target="_blank" rel="noopener" class="text-emerald-600 hover:underline max-w-[200px] truncate inline-block align-bottom">${escapeHtml(r.post_link)}</a>`
          : '-';
        html += `<tr class="border-b border-slate-100 hover:bg-slate-50/80 align-top">
          <td class="py-2 px-3 text-slate-600 whitespace-nowrap">${escapeHtml(t)}</td>
          <td class="py-2 px-3 text-slate-800 max-w-[14rem]">${escapeHtml(r.job_title || '-')}</td>
          <td class="py-2 px-3 text-slate-700">${escapeHtml(r.owner || '-')}</td>
          <td class="py-2 px-3 text-slate-700 font-medium">${escapeHtml(doer)}</td>
          <td class="py-2 px-3 text-slate-700">${escapeHtml(dept)}</td>
          <td class="py-2 px-3 text-slate-700 max-w-[12rem] break-words">${escapeHtml(fb)}</td>
          <td class="py-2 px-3 text-slate-600 max-w-[10rem]">${escapeHtml(r.company || '-')}</td>
          <td class="py-2 px-3 text-slate-700 max-w-[12rem]">${escapeHtml(r.group_name || '-')}</td>
          <td class="py-2 px-3">${link}</td>
          <td class="py-2 px-3 text-slate-600 whitespace-nowrap">${escapeHtml(r.post_status || '-')}</td>
        </tr>`;
      }
    }
    html += '</tbody></table></div>';
    tableWrap.innerHTML = html;
  } catch (e) {
    if (statsBlock) statsBlock.innerHTML = '';
    tableWrap.innerHTML = listErrorHtml(e.message);
  }
}

function formatJobListDisplayValue(value) {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) {
    const joined = value.join(', ').trim();
    return joined || '—';
  }
  const s = String(value).trim();
  return s || '—';
}

/** แถวรายการ Jobs: หนึ่งคอลัมน์ (มีป้ายกำกับบนจอแคบ) */
function jobProvinceSubtitleHtml(sub) {
  const t = String(sub ?? '').trim();
  if (!t || t === '-' || t === '—') return '';
  return `<span class="block text-xs text-emerald-800 font-semibold mt-1 leading-snug">${escapeHtml(t)}</span>`;
}

function jobListCellHtml(label, value, isTitleCol = false, provinceSubtitle = null) {
  const v = formatJobListDisplayValue(value);
  const raw =
    value == null || value === ''
      ? ''
      : Array.isArray(value)
        ? value.join(', ')
        : String(value);
  const tip = raw.trim().length > 0 ? escapeHtml(raw.trim()) : '';
  const titleAttr = tip ? ` title="${tip}"` : '';
  const cellCls = isTitleCol ? 'job-list-cell job-list-cell--title min-w-0' : 'job-list-cell min-w-0';
  const sub = isTitleCol && provinceSubtitle ? jobProvinceSubtitleHtml(provinceSubtitle) : '';
  return `<div class="${cellCls}"${titleAttr}>
    <span class="job-list-cell-label">${escapeHtml(label)}</span>
    <span class="job-list-cell-value">${escapeHtml(v)}</span>${sub}
  </div>`;
}

async function loadList() {
  const cfg = TAB_CONFIG[currentTab];
  const container = document.getElementById('list-container');
  container.className =
    currentTab === 'groups' ? 'min-h-[240px] p-4 sm:p-6' : 'min-h-[240px]';
  container.innerHTML = listLoadingHtml('กำลังโหลดข้อมูล');

  try {
    const items = await apiGet(cfg.api);
    let userMap = null;
    let jobMap = null;
    let groupMap = null;
    let jobOwnerById = null;
    if (currentTab === 'assignments') {
      const [users, jobs, groups] = await Promise.all([
        apiGet('users').catch(() => []),
        apiGet('jobs').catch(() => []),
        apiGet('groups').catch(() => []),
      ]);
      userMap = new Map(users.map((u) => [String(u.id), u.poster_name || u.name || u.email || u.id]));
      jobMap = new Map(jobs.map((j) => [String(j.id), j.title || j.id]));
      jobOwnerById = new Map(jobs.map((j) => [String(j.id), String(j?.owner || '').trim()]));
      groupMap = new Map(
        groups.map((g) => [
          String(g.id),
          {
            folderLabel: `ประเภทงาน: ${g.job_type || '-'} -- จังหวัด: ${formatProvinceLabel(g.province, g.province_note)}`,
            itemLabel: `${g.fb_group_id || g.id}`,
          },
        ])
      );
    }
    if (items.length === 0) {
      container.innerHTML = '';
      if (TAB_WITH_LIST_TOOLS.has(currentTab)) {
        const listToolsEmpty = createListTools(
          currentTab,
          container,
          cfg.api,
          items,
          currentTab === 'assignments' ? { userMap, jobMap, jobOwnerById } : {}
        );
        container.insertAdjacentHTML('beforeend', listEmptyHtml());
        listToolsEmpty?.applyBulkMode?.(BULK_MODE[currentTab]);
      } else {
        container.innerHTML = listEmptyHtml();
      }
      return;
    }

    container.innerHTML = '';
    const listTools = createListTools(
      currentTab,
      container,
      cfg.api,
      items,
      currentTab === 'assignments' ? { userMap, jobMap, jobOwnerById } : {}
    );
    let listAppendTarget = container;
    if (currentTab === 'jobs') {
      const jobScroll = document.createElement('div');
      jobScroll.className = 'jobs-list-scroll';
      container.appendChild(jobScroll);
      const jobHeader = document.createElement('div');
      jobHeader.className = 'jobs-list-header';
      jobHeader.innerHTML = `
        <span class="jobs-h-spacer" aria-hidden="true"></span>
        <span>ชื่องาน</span>
        <span>ตำแหน่ง</span>
        <span>จังหวัด</span>
        <span>เจ้าของงาน</span>
        <span>บริษัท/หน่วย</span>
        <span>แผนก</span>
        <span class="jobs-h-actions">การทำงาน</span>
      `;
      jobScroll.appendChild(jobHeader);
      listAppendTarget = jobScroll;
    }
    if (currentTab === 'groups') {
      const deptStorageKey = (item) => {
        const d = String(item.department || '').trim();
        return d || '__none__';
      };
      const deptDisplayLabel = (key) => (key === '__none__' ? 'ไม่ระบุแผนก' : key);
      const deptOrder = new Map(DEPARTMENTS.map((d, i) => [d, i]));
      const sortDeptKeys = (keys) =>
        [...keys].sort((a, b) => {
          if (a === '__none__') return 1;
          if (b === '__none__') return -1;
          const ia = deptOrder.has(a);
          const ib = deptOrder.has(b);
          if (ia && ib) return deptOrder.get(a) - deptOrder.get(b);
          if (ia) return -1;
          if (ib) return 1;
          return String(a).localeCompare(String(b), 'th');
        });

      const groupKey = (item) => {
        const pv = parseProvinceWithInlineNote(item.province, item.province_note);
        return JSON.stringify([item.job_type || '', pv.province || '', pv.province_note || '', item.added_by || '']);
      };
      const byDept = new Map();
      items.forEach((item) => {
        const dk = deptStorageKey(item);
        if (!byDept.has(dk)) byDept.set(dk, []);
        byDept.get(dk).push(item);
      });

      sortDeptKeys(Array.from(byDept.keys())).forEach((deptK) => {
        const deptItems = byDept.get(deptK);
        const deptSection = document.createElement('div');
        deptSection.className = 'group-dept-section mb-6 last:mb-0';
        deptSection.dataset.department = deptK;
        const deptHeader = document.createElement('div');
        deptHeader.className =
          'group-dept-bar text-base font-semibold text-slate-800 mb-3 px-1 pb-2 border-b-2 border-emerald-600/25';
        deptHeader.textContent = `แผนก: ${deptDisplayLabel(deptK)}`;
        deptSection.appendChild(deptHeader);
        const innerWrap = document.createElement('div');
        innerWrap.className = 'space-y-4';

        const buckets = new Map();
        deptItems.forEach((item) => {
          const k = groupKey(item);
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push(item);
        });
        const sortedKeys = Array.from(buckets.keys()).sort((a, b) => {
          const [jtA, pA, pnA, abA] = JSON.parse(a);
          const [jtB, pB, pnB, abB] = JSON.parse(b);
          const c1 = jtA.localeCompare(jtB, 'th');
          if (c1 !== 0) return c1;
          const c2 = pA.localeCompare(pB, 'th');
          if (c2 !== 0) return c2;
          const c3 = pnA.localeCompare(pnB, 'th');
          if (c3 !== 0) return c3;
          return abA.localeCompare(abB, 'th');
        });
        sortedKeys.forEach((k) => {
          const [jt, pv, pn, ab] = JSON.parse(k);
          const section = document.createElement('div');
          section.className = 'group-section mb-4 last:mb-0 rounded-lg border border-slate-200 overflow-hidden bg-white shadow-sm';
          section.dataset.jobType = String(jt || '').trim();
          section.dataset.province = String(formatProvinceLabel(pv, pn) || '').trim();
          section.dataset.adder = String(ab || '').trim();
          const header = document.createElement('div');
          header.className = 'px-3 py-2.5 bg-slate-100 border-b border-slate-200 text-sm font-semibold text-slate-800';
          const adder = (ab && String(ab).trim()) || '-';
          header.textContent = `ประเภทงาน: ${jt || '-'} -- จังหวัด: ${formatProvinceLabel(pv, pn)} -- ชื่อผู้เพิ่ม Group : ${adder}`;
          section.appendChild(header);
          const bucket = buckets.get(k);
          bucket.sort((a, b) =>
            String(b.fb_group_id || '').localeCompare(String(a.fb_group_id || ''), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          );
          const body = document.createElement('div');
          body.className = 'px-3 py-2 bg-slate-50/80 flex flex-wrap items-center gap-3';
          const count = document.createElement('span');
          count.className = 'text-sm text-slate-600';
          count.textContent = `${bucket.length} กลุ่มในโฟลเดอร์นี้`;
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'btn-secondary text-sm py-1.5 px-3';
          editBtn.textContent = 'แก้ไข';
          editBtn.onclick = () => openEditGroupFolder(bucket);
          const delAllBtn = document.createElement('button');
          delAllBtn.type = 'button';
          delAllBtn.className =
            'text-sm py-1.5 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition';
          delAllBtn.textContent = 'ลบทั้งหมด';
          delAllBtn.onclick = () => deleteGroupFolder(bucket);
          body.appendChild(count);
          body.appendChild(editBtn);
          body.appendChild(delAllBtn);
          section.appendChild(body);
          const idDetails = document.createElement('details');
          idDetails.className = 'group-section-ids border-t border-slate-200 bg-white';
          const idSumm = document.createElement('summary');
          idSumm.className =
            'px-3 py-2 text-sm text-slate-600 font-medium cursor-pointer select-none hover:bg-slate-50 hover:text-slate-900';
          idSumm.textContent = `ดูรายการ Group ID (${bucket.length})`;
          idDetails.appendChild(idSumm);
          const idWrap = document.createElement('div');
          idWrap.className =
            'px-3 pb-3 pt-0 max-h-56 overflow-y-auto space-y-1 font-mono text-xs text-slate-700 break-all';
          bucket.forEach((g) => {
            const line = document.createElement('div');
            const gid = String(g.fb_group_id || g.id || '').trim();
            line.textContent = gid || '—';
            idWrap.appendChild(line);
          });
          idDetails.appendChild(idWrap);
          section.appendChild(idDetails);
          innerWrap.appendChild(section);
        });
        deptSection.appendChild(innerWrap);
        container.appendChild(deptSection);
      });
      applyGroupsFolderHighlight(container);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = currentTab === 'jobs' ? 'list-row list-row--jobs' : 'list-row';
      let preview = '';
      let assignmentGroupsHtml = '';
      let assignmentDoerBadgeHtml = '';
      if (currentTab === 'assignments') {
        const userLabel = userMap?.get(String(item.user_id || '')) || item.user_id || '-';
        const fallbackDoer = item.id ? getCachedAssignmentDoer(item.id) : '';
        const doerValue = String(item.doer_name || fallbackDoer || '').trim();
        assignmentDoerBadgeHtml = doerValue
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs border border-indigo-200 mb-1">${escapeHtml(doerValue)}</span>`
          : '';
        const selectedJobIds = Array.isArray(item.job_ids) ? item.job_ids : [];
        const selectedJobTitles = selectedJobIds
          .map((id) => jobMap?.get(String(id)) || String(id))
          .filter(Boolean);
        const selectedGroupIds = Array.isArray(item.group_ids) ? item.group_ids : [];
        const jobsLabel = selectedJobTitles.length > 0
          ? selectedJobTitles.join(', ')
          : 'ยังไม่ได้เลือกงาน';
        preview = `Facebook: ${userLabel} · งาน: ${jobsLabel}`;
        if (selectedGroupIds.length > 0) {
          const folderSet = new Set();
          selectedGroupIds.forEach((id) => {
            const meta = groupMap?.get(String(id));
            if (meta?.folderLabel) folderSet.add(meta.folderLabel);
          });
          const folderLabels = Array.from(folderSet);
          const chips = folderLabels.length > 0
            ? folderLabels
            : selectedGroupIds.map((id) => `กลุ่ม: ${id}`);
          assignmentGroupsHtml = `
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              ${chips.map((txt) => `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs border border-emerald-200">${escapeHtml(txt)}</span>`).join('')}
            </div>
          `;
        } else {
          assignmentGroupsHtml = '<p class="text-xs text-slate-500 mt-1">กลุ่มที่จะโพสต์: ใช้กลุ่มจาก User</p>';
        }
      } else if (currentTab === 'schedules') {
        const whenText = item.scheduled_for ? new Date(item.scheduled_for).toLocaleString('th-TH') : '-';
        const count = Array.isArray(item.assignment_ids) ? item.assignment_ids.length : 0;
        preview = `${item.name || '-'} · เวลา: ${whenText} · ${count} assignments · สถานะ: ${item.status || '-'}`;
      } else {
        preview = cfg.listFields
          .map((k) => {
            const v = item[k];
            if (Array.isArray(v)) return v.join(', ');
            return v;
          })
          .filter(Boolean)
          .join(' · ');
      }
      const canMultiDelete = currentTab === 'jobs' || currentTab === 'assignments';
      const bulkSelectLabel = canMultiDelete
        ? `<label class="row-select-wrap shrink-0 flex items-center ${currentTab === 'jobs' ? 'jobs-row-check' : 'mr-2'} ${
            currentTab === 'jobs'
              ? (BULK_MODE[currentTab] ? '' : 'jobs-bulk-off')
              : BULK_MODE[currentTab]
                ? ''
                : 'hidden'
          }"><input type="checkbox" class="row-select w-4 h-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" data-row-id="${escapeHtml(String(item.id || ''))}"></label>`
        : '';
      const actionsBlock = `<div class="list-row-actions flex gap-2 sm:gap-3 flex-wrap justify-end ${currentTab === 'jobs' ? 'ml-0 shrink-0 flex-row flex-nowrap items-center gap-2' : 'ml-4 shrink-0'}">
          ${currentTab === 'schedules' ? '<button class="run-now-btn btn-secondary text-sm py-1 px-2 -mx-2">รันทันที</button>' : ''}
          ${currentTab === 'assignments' ? '<button class="post-btn btn-primary text-sm py-1 px-2 -mx-2">โพสต์</button>' : ''}
          ${currentTab === 'users' ? '<button type="button" class="check-session-btn text-sky-600 hover:text-sky-800 text-sm font-medium py-1 px-2 -mx-2 rounded hover:bg-sky-50 transition" title="เปิด Chrome ไป Facebook ล็อกอินหรือยืนยันตัวตน แล้วบันทึก session สำหรับโพสต์จาก Assignments">ล็อกอิน Facebook</button>' : ''}
          <button class="edit-btn text-emerald-600 hover:text-emerald-700 text-sm font-medium py-1 px-2 -mx-2 rounded hover:bg-emerald-50 transition">แก้ไข</button>
          <button class="delete-btn text-red-600 hover:text-red-700 text-sm font-medium py-1 px-2 -mx-2 rounded hover:bg-red-50 transition">ลบ</button>
        </div>`;
      if (currentTab === 'jobs') {
        const jobProvLabel = formatProvinceLabel(item.province, item.province_note);
        row.innerHTML = `
        ${bulkSelectLabel}
        ${jobListCellHtml('ชื่องาน', item.title, true, jobProvLabel)}
        ${jobListCellHtml('ตำแหน่ง', item.job_position)}
        ${jobListCellHtml('จังหวัด', jobProvLabel)}
        ${jobListCellHtml('เจ้าของงาน', item.owner)}
        ${jobListCellHtml('บริษัท/หน่วย', item.company)}
        ${jobListCellHtml('แผนก', item.department)}
        ${actionsBlock}
      `;
      } else {
        row.innerHTML = `
        ${bulkSelectLabel}
        <div class="flex-1 min-w-0">
          ${currentTab === 'assignments' ? assignmentDoerBadgeHtml : ''}
          <p class="text-sm font-medium text-slate-800 truncate">${escapeHtml(preview || item.id)}</p>
          ${currentTab === 'assignments' ? assignmentGroupsHtml : ''}
          ${item.title && !cfg.listFields.includes('title') ? `<p class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(item.title)}</p>` : ''}
        </div>
        ${actionsBlock}
      `;
      }
      if (currentTab === 'jobs') {
        const pvRow = formatProvinceLabel(item.province, item.province_note);
        row.dataset.department = String(item.department || '').trim() || '__none__';
        row.dataset.filterOwner = String(item.owner || '').trim().toLowerCase();
        row.dataset.filterProvince = String(pvRow || '').trim().toLowerCase();
        row.dataset.filterJobPosition = String(item.job_position || '').trim().toLowerCase();
      }
      if (currentTab === 'assignments') {
        const jidsRow = Array.isArray(item.job_ids) ? item.job_ids : [];
        const fbDoerRow = item.id ? getCachedAssignmentDoer(item.id) : '';
        const doerRow = String(item.doer_name || fbDoerRow || '').trim();
        row.dataset.department = String(item.department || '').trim() || '__none__';
        row.dataset.assignUserId = String(item.user_id || '');
        row.dataset.filterDoer = doerRow.toLowerCase();
        row.dataset.assignJobIds = jidsRow.map(String).join(',');
        const ownersLowerSet = new Set();
        jidsRow.forEach((jid) => {
          const o = jobOwnerById?.get(String(jid));
          if (o) ownersLowerSet.add(String(o).trim().toLowerCase());
        });
        row.dataset.assignJobOwners = Array.from(ownersLowerSet).join('|');
        const postBtn = row.querySelector('.post-btn');
        if (postBtn) {
          postBtn.onclick = async () => {
            const origText = postBtn.textContent;
            try {
              postBtn.disabled = true;
              postBtn.textContent = 'กำลังเริ่ม...';
              await runPost([item.id]);
              alert('กำลังสั่งเปิด Google Chrome สำหรับโพสต์ Assignment นี้\n\nถ้าไม่มีหน้าต่างขึ้น: ต้องติดตั้ง Google Chrome ในเครื่อง และดูหน้าต่าง Terminal ที่รัน npm start ว่ามี error หรือไม่');
            } catch (e) {
              alert('เกิดข้อผิดพลาด: ' + e.message);
            } finally {
              postBtn.disabled = false;
              postBtn.textContent = origText;
            }
          };
        }
      }
      if (currentTab === 'schedules') {
        const runNowBtn = row.querySelector('.run-now-btn');
        if (runNowBtn) {
          runNowBtn.onclick = async () => {
            if (!confirm('ต้องการรันตารางนี้ทันทีใช่หรือไม่?')) return;
            try {
              runNowBtn.disabled = true;
              await fetch(`${API}/schedules/${item.id}/run-now`, { method: 'POST' }).then(async (r) => {
                if (!r.ok) throw new Error((await r.json()).error || 'run-now failed');
              });
              alert('สั่งรันแล้ว');
              loadList();
            } catch (e) {
              alert('รันไม่สำเร็จ: ' + e.message);
            } finally {
              runNowBtn.disabled = false;
            }
          };
        }
      }
      if (currentTab === 'users') {
        const checkSessionBtn = row.querySelector('.check-session-btn');
        if (checkSessionBtn) {
          checkSessionBtn.onclick = async () => {
            if (
              !confirm(
                'จะเปิด Google Chrome ไปหน้า Facebook ของบัญชีนี้\n' +
                  '• ถ้ายังไม่ล็อกอิน ระบบจะกรอกอีเมล/รหัสจากข้อมูล User (หรือ .env)\n' +
                  '• ถ้ามีหน้ายืนยันตัวตน ให้ทำใน Chrome ให้จบ\n' +
                  '• เมื่อเข้า Facebook ได้แล้ว ระบบบันทึก session ลงโฟลเดอร์ .auth\n\n' +
                  'หลังจากนี้ กด "โพสต์" ใน Assignments จะใช้ session นี้ — ไม่ต้องล็อกอินซ้ำจนกว่า session หมดอายุ\n\n' +
                  'ดำเนินการต่อ?'
              )
            ) {
              return;
            }
            const orig = checkSessionBtn.textContent;
            try {
              checkSessionBtn.disabled = true;
              checkSessionBtn.textContent = 'กำลังสั่งงาน...';
              const { res: r, data } = await postFacebookSessionCheck(item.id);
              if (!r.ok) throw new Error(data.error || r.statusText || 'check-session failed');
              alert(
                data.message ||
                  'สั่งเปิด Chrome แล้ว — ล็อกอินหรือยืนยันตัวตนใน Facebook ให้เสร็จ\nดู Terminal ที่รัน npm start ด้วย (ถ้ามี error จะขึ้นที่นั่น)'
              );
            } catch (e) {
              alert('เปิดล็อกอิน Facebook ไม่สำเร็จ: ' + e.message);
            } finally {
              checkSessionBtn.disabled = false;
              checkSessionBtn.textContent = orig;
            }
          };
        }
      }
      row.querySelector('.edit-btn').onclick = () => editItem(item);
      row.querySelector('.delete-btn').onclick = () => deleteItem(item.id, item);
      listAppendTarget.appendChild(row);
    });
    listTools?.applyBulkMode?.(BULK_MODE[currentTab]);
  } catch (e) {
    container.innerHTML = listErrorHtml(e.message);
  }
}

async function editItem(item) {
  const cfg = TAB_CONFIG[currentTab];
  editingId = item.id;
  document.getElementById('form-title').textContent = cfg.editTitle;
  let row = item;
  if (cfg.api === 'jobs' && item?.id) {
    try {
      const res = await fetch(`${API}/jobs/${encodeURIComponent(item.id)}`);
      if (res.ok) {
        const j = await res.json();
        if (j && j.id) row = j;
      }
    } catch (_) {
      /* ใช้ข้อมูลจากแถวในรายการ */
    }
  }
  await renderForm(cfg, row);
  openFormModal();
}

/** แก้ไขหมวดหมู่ Groups แบบเดียว - ช่อง group_inputs รวมทุก ID ในโฟลเดอร์ */
async function openEditGroupFolder(bucket) {
  if (!bucket.length) return;
  editingId = null;
  editingGroupFolder = { items: [...bucket] };
  document.getElementById('form-title').textContent = 'แก้ไขกลุ่ม (หมวดหมู่)';
  const cfg = TAB_CONFIG.groups;
  const first = bucket[0];
  const firstProvince = parseProvinceWithInlineNote(first.province, first.province_note);
  const groupInputs = bucket.map((g) => g.fb_group_id || '').filter(Boolean).join('\n');
  await renderForm(cfg, {
    job_type: first.job_type,
    province: firstProvince.province,
    province_note: firstProvince.province_note,
    blacklist_groups: first.blacklist_groups,
    added_by: first.added_by,
    department: first.department || '',
    group_inputs: groupInputs,
  });
  openFormModal();
}

async function deleteGroupFolder(bucket) {
  if (!bucket.length) return;
  if (!confirm(`ลบกลุ่มทั้งหมด ${bucket.length} รายการในโฟลเดอร์นี้?`)) return;
  const cfg = TAB_CONFIG.groups;
  try {
    for (const it of bucket) {
      await apiDelete(cfg.api, it.id);
    }
    loadList();
    alert('ลบสำเร็จ');
  } catch (e) {
    alert('ลบไม่สำเร็จ: ' + e.message);
  }
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
    const out = await runPost();
    if (out?.queued) {
      alert('รับคิวโพสต์แล้ว\n\nถ้าต้องการให้ Chrome เด้งบนเครื่องคุณ ให้เปิด worker ที่เครื่องจริง:\n`npm run worker:post`\n(ต้องตั้ง WORKER_API_BASE และ POST_WORKER_TOKEN ใน .env)');
    } else {
      alert('กำลังสั่งเปิด Google Chrome สำหรับโพสต์\n\nถ้าไม่มีหน้าต่างขึ้น: ต้องติดตั้ง Google Chrome ในเครื่อง และดู Terminal ที่รัน npm start ว่ามี error หรือไม่');
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

// --- Shell: sidebar (mobile) ---
function closeAppSidebar() {
  document.getElementById('app-sidebar')?.classList.remove('is-open');
  document.getElementById('sidebar-overlay')?.classList.remove('is-open');
}
function openAppSidebar() {
  document.getElementById('app-sidebar')?.classList.add('is-open');
  document.getElementById('sidebar-overlay')?.classList.add('is-open');
}
document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  const side = document.getElementById('app-sidebar');
  if (side?.classList.contains('is-open')) closeAppSidebar();
  else openAppSidebar();
});
document.getElementById('sidebar-overlay')?.addEventListener('click', closeAppSidebar);

// --- Init ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    closeAppSidebar();
    setActiveTab(btn.dataset.tab);
  });
});

document.getElementById('btn-add').addEventListener('click', async () => {
  editingId = null;
  editingGroupFolder = null;
  const cfg = TAB_CONFIG[currentTab];
  document.getElementById('form-title').textContent = cfg.addTitle;
  await renderForm(cfg, null);
  openFormModal();
});

document.getElementById('crud-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  submitForm(editingId);
});

document.getElementById('delete-confirm').addEventListener('click', async () => {
  if (!deleteTargetId) return;
  const cfg = TAB_CONFIG[currentTab];
  const idToDelete = deleteTargetId;
  try {
    await apiDelete(cfg.api, idToDelete);
    closeDeleteModal();
    if (editingId === idToDelete) {
      editingId = null;
      closeFormModal();
    }
    loadList();
    alert('ลบสำเร็จ');
  } catch (e) {
    alert('ลบไม่สำเร็จ: ' + e.message);
  }
});

async function refreshRunStatusBanner() {
  const el = document.getElementById('run-status-text');
  if (!el) return;
  try {
    const r = await fetch(`${API}/run/status`);
    if (!r.ok) return;
    const s = await r.json();
    const parts = [s.message || '-'];
    if (s.running) parts.push('(กำลังทำงาน)');
    if (s.run_id) parts.push(`Run: ${String(s.run_id).slice(0, 10)}...`);
    el.textContent = `สถานะ: ${parts.join(' ')}`;
    if (s.running && s.run_id) {
      activePostRunId = String(s.run_id);
    }
    const showPostCards = !!s.running || (!!activePostRunId && String(s.run_id || '') === activePostRunId);
    renderPostStatusCards(showPostCards ? s : { ...s, user_runs: [] });
  } catch {
    /* ignore */
  }
}

const hiddenPostStatusUsers = new Set();
const minimizedPostStatusUsers = new Set();
const postStatusHiddenSnapshot = new Map();
let activePostRunId = null;
/** snapshot ล่าสุดสำหรับ re-render หลังกดย่อ/ซ่อน */
let lastPostStatusForRender = null;

function postOpenBtnToneClass(progress) {
  if (progress >= 100) return 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm';
  if (progress >= 70) return 'bg-cyan-50 text-cyan-800 border-cyan-300 shadow-sm';
  if (progress >= 35) return 'bg-amber-50 text-amber-800 border-amber-300 shadow-sm';
  return 'bg-slate-100 text-slate-700 border-slate-300 shadow-sm';
}

function ensurePostStatusDock() {
  let dock = document.getElementById('post-status-dock');
  if (dock) {
    return {
      stack: document.getElementById('post-status-stack'),
      openBtn: document.getElementById('post-status-open'),
    };
  }
  document.getElementById('post-status-stack')?.remove();
  document.getElementById('post-status-open')?.remove();

  dock = document.createElement('div');
  dock.id = 'post-status-dock';
  dock.className =
    'fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2 w-[min(400px,calc(100vw-1.25rem))] pointer-events-none max-h-[min(560px,calc(100vh-1.5rem))]';

  const stack = document.createElement('div');
  stack.id = 'post-status-stack';
  stack.className =
    'flex flex-col-reverse gap-2.5 w-full max-h-[min(480px,calc(100vh-5.5rem))] overflow-y-auto overflow-x-hidden pointer-events-auto pr-0.5';

  const btn = document.createElement('button');
  btn.id = 'post-status-open';
  btn.type = 'button';
  btn.className =
    'btn-secondary pointer-events-auto hidden rounded-full px-4 py-2 text-xs font-semibold shadow-panel-md border transition-all';
  btn.textContent = 'แสดงสถานะโพสต์';
  btn.addEventListener('click', () => {
    hiddenPostStatusUsers.clear();
    postStatusHiddenSnapshot.clear();
    btn.classList.add('hidden');
    refreshRunStatusBanner();
  });

  dock.appendChild(stack);
  dock.appendChild(btn);
  document.body.appendChild(dock);
  return { stack, openBtn: btn };
}

function ensurePostStatusStack() {
  return ensurePostStatusDock().stack;
}

function ensurePostStatusOpenBtn() {
  return ensurePostStatusDock().openBtn;
}

function getPostProgressFromLogs(logs, isRunning) {
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
}

async function postRunControl(action) {
  if (action === 'cancel') {
    const ok = confirm('ยืนยันยกเลิกงานโพสต์นี้ ?');
    if (!ok) return;
  }
  const r = await fetch(`${API}/run/post/${action}`, { method: 'POST' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `สั่ง ${action} ไม่สำเร็จ`);
}

function renderPostStatusCards(status) {
  lastPostStatusForRender = status;
  const stack = ensurePostStatusStack();
  const openBtn = ensurePostStatusOpenBtn();
  const runs = Array.isArray(status?.user_runs) ? status.user_runs : [];
  const runKeys = new Set(runs.map((u) => String(u.user_id || '__unknown__')));
  for (const k of [...minimizedPostStatusUsers]) {
    if (!runKeys.has(k)) minimizedPostStatusUsers.delete(k);
  }
  const visible = runs.filter((u) => {
    const key = String(u.user_id || '__unknown__');
    return !hiddenPostStatusUsers.has(key);
  });
  const hidden = runs.filter((u) => hiddenPostStatusUsers.has(String(u.user_id || '__unknown__')));
  if (hidden.length > 0) {
    hidden.forEach((u) => {
      const key = String(u.user_id || '__unknown__');
      postStatusHiddenSnapshot.set(key, {
        name: String(u.user_name || u.user_id || 'ไม่ระบุบัญชี'),
        progress: getPostProgressFromLogs(u.recent_logs, !!status?.running),
      });
    });
  }
  if (postStatusHiddenSnapshot.size > 0) {
    const arr = [...postStatusHiddenSnapshot.values()];
    const topProgress = Math.max(...arr.map((x) => Number(x.progress || 0)));
    const short = arr.slice(0, 2).map((x) => `${x.name} ${x.progress}%`).join(' | ');
    openBtn.textContent = arr.length > 2 ? `แสดงสถานะโพสต์: ${short} +${arr.length - 2}` : `แสดงสถานะโพสต์: ${short}`;
    openBtn.className = `btn-secondary pointer-events-auto rounded-full px-4 py-2 text-xs font-semibold shadow-panel-md border transition-all ${postOpenBtnToneClass(topProgress)}`;
    openBtn.classList.remove('hidden');
  } else {
    openBtn.classList.add('hidden');
  }
  if (!visible.length) {
    stack.innerHTML = '';
    return;
  }
  const btnBase =
    'inline-flex flex-1 min-w-0 items-center justify-center rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors disabled:opacity-35 disabled:pointer-events-none';
  stack.innerHTML = visible
    .map((u) => {
      const rawKey = String(u.user_id || '__unknown__');
      const key = escapeHtml(rawKey);
      const title = escapeHtml(String(u.user_name || u.user_id || 'ไม่ระบุบัญชี'));
      const logs = Array.isArray(u.recent_logs) ? u.recent_logs : [];
      const isRunning = !!status?.running;
      const isSuccessDone = !isRunning && Number(status?.exit_code) === 0;
      const isFailedDone = !isRunning && !isSuccessDone;
      const progress = getPostProgressFromLogs(logs, isRunning);
      const canPause = isRunning && !status?.paused;
      const canResume = isRunning && !!status?.paused;
      const canCancel = isRunning;
      const logHtml = logs.slice(0, 5).map((l) => `<li class="pl-0.5">${escapeHtml(l.message || '')}</li>`).join('');
      const statusDot =
        isRunning
          ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)] animate-pulse'
          : isSuccessDone
            ? 'bg-emerald-500'
            : isFailedDone
              ? 'bg-rose-500'
              : 'bg-slate-500';
      const stateBadge = isRunning
        ? 'กำลังโพสต์'
        : isSuccessDone
          ? 'สำเร็จ'
          : isFailedDone
            ? 'มีปัญหา'
            : 'จบแล้ว';
      const barColor =
        progress >= 100
          ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
          : progress >= 70
            ? 'bg-gradient-to-r from-cyan-600 to-cyan-400'
            : progress >= 35
              ? 'bg-gradient-to-r from-amber-600 to-amber-400'
              : 'bg-gradient-to-r from-slate-600 to-slate-400';
      const headline = escapeHtml(String(u.message || status.message || '-'));

      if (minimizedPostStatusUsers.has(rawKey)) {
        return `<div class="post-status-minimized w-full flex items-stretch gap-2 rounded-2xl border border-slate-600/45 bg-slate-900/95 backdrop-blur-md shadow-2xl ring-1 ring-white/[0.06] overflow-hidden" data-user-key="${key}">
          <div class="w-1 shrink-0 ${isRunning ? 'bg-emerald-500' : isSuccessDone ? 'bg-emerald-600' : isFailedDone ? 'bg-rose-600' : 'bg-slate-600'}"></div>
          <div class="flex flex-1 items-center gap-2 min-w-0 py-2.5 pr-1">
            <span class="h-2 w-2 rounded-full shrink-0 ${statusDot}" aria-hidden="true"></span>
            <button type="button" class="post-status-expand flex-1 min-w-0 text-left truncate font-semibold text-slate-100 text-sm hover:text-white">${title}<span class="text-slate-500 font-normal"> · </span><span class="tabular-nums text-slate-400">${progress}%</span></button>
            <button type="button" class="post-status-expand shrink-0 rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 text-sm font-medium" title="ขยาย" aria-label="ขยาย">⌃</button>
            <button type="button" class="post-status-hide-one shrink-0 rounded-lg px-2 py-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-300 text-lg leading-none" data-user-key="${key}" aria-label="ซ่อน">×</button>
          </div>
        </div>`;
      }

      return `<div class="post-status-card w-full rounded-2xl border border-slate-600/40 bg-slate-900/95 backdrop-blur-md text-slate-100 text-sm shadow-2xl ring-1 ring-white/[0.06] overflow-hidden" data-user-key="${key}">
        <header class="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-700/55 bg-slate-950/40">
          <div class="flex items-center gap-2 min-w-0">
            <span class="h-2 w-2 rounded-full shrink-0 ${statusDot}" aria-hidden="true"></span>
            <div class="min-w-0">
              <p class="truncate font-semibold text-slate-100 leading-tight">${title}</p>
              <p class="text-[10px] font-medium uppercase tracking-wider text-slate-500">${stateBadge}</p>
            </div>
          </div>
          <div class="flex items-center gap-0.5 shrink-0">
            <button type="button" class="post-status-minimize rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200" data-user-key="${key}" title="ย่อ" aria-label="ย่อ">
              <span class="block text-sm font-bold leading-none pb-0.5">─</span>
            </button>
            <button type="button" class="post-status-hide-one rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-rose-300" data-user-key="${key}" title="ซ่อนการ์ด" aria-label="ซ่อน">×</button>
          </div>
        </header>
        <div class="px-3 py-3 space-y-3">
          <p class="text-xs text-slate-400 leading-relaxed line-clamp-3">${headline}</p>
          <div>
            <div class="flex justify-between items-baseline gap-2 text-[11px] text-slate-500 mb-1.5">
              <span>ความคืบหน้า</span>
              <span class="tabular-nums font-semibold text-slate-300">${progress}%</span>
            </div>
            <div class="h-2 rounded-full bg-slate-800/90 overflow-hidden">
              <div class="h-full rounded-full ${barColor} transition-[width] duration-500 ease-out" style="width: ${Math.min(100, Math.max(0, progress))}%"></div>
            </div>
          </div>
          <div class="flex gap-2">
            <button type="button" class="post-status-action ${btnBase} bg-amber-500/15 text-amber-100 border border-amber-500/35 hover:bg-amber-500/25" data-action="pause" ${canPause ? '' : 'disabled'}>Pause</button>
            <button type="button" class="post-status-action ${btnBase} bg-emerald-500/15 text-emerald-100 border border-emerald-500/35 hover:bg-emerald-500/25" data-action="resume" ${canResume ? '' : 'disabled'}>Play</button>
            <button type="button" class="post-status-action ${btnBase} bg-rose-500/15 text-rose-100 border border-rose-500/35 hover:bg-rose-500/25" data-action="cancel" ${canCancel ? '' : 'disabled'}>ยกเลิก</button>
          </div>
          <ul class="max-h-24 overflow-y-auto text-[11px] space-y-1 list-none border-t border-slate-800/80 pt-2 text-slate-400">${logHtml || '<li class="text-slate-600">ยังไม่มี log ล่าสุด</li>'}</ul>
        </div>
      </div>`;
    })
    .join('');
  stack.querySelectorAll('.post-status-hide-one').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = String(btn.getAttribute('data-user-key') || '').trim();
      if (!key) return;
      hiddenPostStatusUsers.add(key);
      const user = runs.find((u) => String(u.user_id || '__unknown__') === key);
      if (user) {
        postStatusHiddenSnapshot.set(key, {
          name: String(user.user_name || user.user_id || 'ไม่ระบุบัญชี'),
          progress: getPostProgressFromLogs(user.recent_logs, !!status?.running),
        });
      }
      renderPostStatusCards(status);
    });
  });
  stack.querySelectorAll('.post-status-action').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const action = String(btn.getAttribute('data-action') || '').trim();
        if (!action) return;
        btn.disabled = true;
        await postRunControl(action);
        await refreshRunStatusBanner();
      } catch (e) {
        alert(e.message || String(e));
      } finally {
        btn.disabled = false;
      }
    });
  });
  stack.querySelectorAll('.post-status-minimize').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = String(btn.getAttribute('data-user-key') || '').trim();
      if (!key) return;
      minimizedPostStatusUsers.add(key);
      renderPostStatusCards(lastPostStatusForRender || status);
    });
  });
  stack.querySelectorAll('.post-status-expand').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = btn.closest('.post-status-minimized');
      const key = String(wrap?.getAttribute('data-user-key') || '').trim();
      if (!key) return;
      minimizedPostStatusUsers.delete(key);
      renderPostStatusCards(lastPostStatusForRender || status);
    });
  });
}
setInterval(refreshRunStatusBanner, 4000);
refreshRunStatusBanner();

setActiveTab('users');

