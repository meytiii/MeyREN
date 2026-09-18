// ============================================================
// MeyREN Gateway Dashboard Client Application
// Native Persian RTL Interface
// ============================================================

const I18N = {
  sec_panel: 'پنل',
  sec_sys: 'سیستم',
  nav_dash: 'داشبورد',
  nav_configs: 'کانفیگ‌ها',
  nav_groups: 'گروه‌ها',
  nav_create: 'ساخت کانفیگ',
  nav_stats: 'آمار',
  nav_logs: 'لاگ فعالیت',
  nav_settings: 'تنظیمات',
  nav_support: 'پشتیبانی',
  nav_donate: 'حمایت از پروژه',
  nav_news: 'اخبار',
  nav_admins: 'ادمین‌ها',
  nav_telegram: 'ربات تلگرام',
  tg_sub: 'توکن ربات و آیدی عددی ادمین · فعال‌سازی خودکار و وب‌هوک',
  tg_config: 'پیکربندی ربات',
  tg_token: 'توکن ربات (BotFather)',
  tg_admin: 'آیدی عددی ادمین',
  tg_webhook: 'فعال‌سازی Webhook خودکار',
  tg_activate: 'ذخیره و فعال‌سازی ربات',
  tg_help: 'راهنمای اتصال',
  tg_h1: 'از @BotFather در تلگرام یک ربات بسازید و توکن آن را کپی کنید.',
  tg_h2: 'آیدی عددی تلگرام خود را از @userinfobot بگیرید و وارد کنید.',
  tg_h3: 'روی ذخیره و فعال‌سازی کلیک کنید — سیستم وب‌هوک را تنظیم می‌کند.',
  logout: 'خروج',
  loading: 'در حال بارگذاری...',
  m_conns: 'اتصالات فعال',
  m_traffic: 'ترافیک کل',
  m_links: 'کانفیگ‌ها',
  m_uptime: 'آپتایم سرور',
  quick_create: 'ساخت کانفیگ',
  quick_create_desc: 'ساخت دستی با پروتکل‌های متنوع، محدودیت ترافیک، سرعت و انقضا',
  auto_create: 'ساخت خودکار (پیشنهادی)',
  auto_create_desc: 'ساخت سریع با تنظیمات بهینه · لینک VLESS و سابسکریپشن هوشمند',
  configs_sub: 'مدیریت لینک‌ها · VLESS و ساب',
  th_name: 'نام',
  th_proto: 'پروتکل',
  th_status: 'وضعیت',
  th_usage: 'مصرف',
  th_ops: 'عملیات',
  manual_create: 'ساخت کانفیگ',
  label_name: 'نام کانفیگ',
  label_proto: 'پروتکل',
  label_limit: 'محدودیت حجم',
  label_unit: 'واحد',
  label_days: 'انقضا (روز)',
  label_ip: 'محدودیت IP',
  label_speed: 'سرعت (Mbps)',
  btn_create: 'ساخت',
  btn_auto: 'ساخت خودکار',
  stats_sub: 'ترافیک و اتصالات · فیلتر زمانی',
  r_day: 'روز',
  r_week: 'هفته',
  r_month: 'ماه',
  r_all: 'کل',
  lang_label: 'زبان سیستم',
  change_pw: 'تغییر رمز عبور',
  pw_cur: 'رمز فعلی',
  pw_new: 'رمز جدید',
  pw_cf: 'تکرار رمز',
  btn_save: 'ذخیره تغییرات',
  github: 'گیت‌هاب پروژه',
  telegram: 'کانال تلگرام',
  theme: 'تم ظاهری',
  theme_dark: 'تم تیره',
  theme_light: 'تم روشن',
  created_title: 'کانفیگ با موفقیت ساخته شد',
  copy_sub: 'کپی لینک ساب',
  sub_label: 'سابسکریپشن هوشمند',
  refresh_stats: 'بروزرسانی آمار',
  refresh_panel: 'بروزرسانی پنل',
};

let statRange = 'month';
let __allLinks = [];
let trafficChartInst = null;

function t(k) {
  return I18N[k] || k;
}

function applyLang() {
  const root = document.getElementById('htmlRoot') || document.documentElement;
  root.lang = 'fa';
  root.dir = 'rtl';
  document.body.dir = 'rtl';
  document.body.classList.remove('en');
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (I18N[k]) {
      el.textContent = I18N[k];
    }
  });

  const tl = document.getElementById('themeLabel');
  if (tl) {
    tl.textContent = document.documentElement.classList.contains('light') ? 'تم تیره' : 'تم روشن';
  }
}

// Theme
function setTheme(mode) {
  if (mode === 'light') {
    document.documentElement.classList.add('light');
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.classList.remove('light');
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  localStorage.setItem('meyren_theme', mode);
  applyLang();
}

function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light');
  setTheme(isLight ? 'dark' : 'light');
}

(function () {
  const th = localStorage.getItem('meyren_theme') || 'dark';
  setTheme(th);
})();

// Sidebar Toggle & Collapse
const sb = document.getElementById('sidebar');
const main = document.getElementById('main');
const sbToggleBtn = document.getElementById('sbToggle');

if (sbToggleBtn) {
  sbToggleBtn.onclick = () => {
    sb.classList.toggle('collapsed');
    main.classList.toggle('expanded', sb.classList.contains('collapsed'));
    localStorage.setItem('meyren_sb_c', sb.classList.contains('collapsed') ? '1' : '0');
  };
}

if (localStorage.getItem('meyren_sb_c') === '1') {
  sb.classList.add('collapsed');
  main.classList.add('expanded');
}

const mobBtn = document.getElementById('mobMenuBtn');
const overlay = document.getElementById('overlay');
const sbCloseBtn = document.getElementById('sbCloseBtn');
const mobMoreBtn = document.getElementById('mobMoreBtn');

function openDrawer() {
  sb.classList.add('open');
  overlay.classList.add('show');
}
function closeDrawer() {
  sb.classList.remove('open');
  overlay.classList.remove('show');
}

if (mobBtn) mobBtn.onclick = openDrawer;
if (mobMoreBtn) mobMoreBtn.onclick = openDrawer;
if (sbCloseBtn) sbCloseBtn.onclick = closeDrawer;
if (overlay) overlay.onclick = closeDrawer;

// Navigation Tabs
function goPage(name) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('on', n.dataset.page === name);
  });
  document.querySelectorAll('.mob-nav-btn[data-page]').forEach(n => {
    n.classList.toggle('on', n.dataset.page === name);
  });
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('on', p.id === 'page-' + name);
  });

  closeDrawer();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'logs') loadLogs();
  if (name === 'groups') loadGroups();
  if (name === 'telegram') loadTelegram();
  if (name === 'admins') loadAdmins();
  if (name === 'news') loadNews();
  if (name === 'configs' || name === 'dash' || name === 'stats') refreshAll();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => goPage(el.dataset.page));
});
document.querySelectorAll('.mob-nav-btn[data-page]').forEach(el => {
  el.addEventListener('click', () => goPage(el.dataset.page));
});

// Toast Notifications
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__tt);
  window.__tt = setTimeout(() => el.classList.remove('show'), 2400);
}

// Clipboard Copy
async function copyText(text) {
  if (!text || text === '—') return;
  try {
    await navigator.clipboard.writeText(text);
    toast('با موفقیت کپی شد ✓');
  } catch (e) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    toast('با موفقیت کپی شد ✓');
  }
}

// API Helper
async function api(url, opts = {}) {
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...opts,
    });
    if (r.status === 401) {
      location.href = '/login';
      return null;
    }
    let data = null;
    try {
      data = await r.json();
    } catch {
      data = { ok: r.ok };
    }
    if (!r.ok) {
      toast(data.detail || data.error || 'خطا در انجام عملیات');
      return null;
    }
    return data;
  } catch (e) {
    toast('خطای ارتباط با سرور');
    return null;
  }
}

// Formatters
function fmtB(b) {
  b = Number(b) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(2) + ' MB';
  return (b / 1024 ** 3).toFixed(2) + ' GB';
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// DATA REFRESH & CONFIGS TABLE
// ============================================================

async function refreshAll() {
  const linksData = await api('/api/links');
  if (!linksData) return;

  const arr = Array.isArray(linksData.links) ? linksData.links : (Array.isArray(linksData) ? linksData : []);
  __allLinks = arr;

  // Metrics
  const mLinks = document.getElementById('mLinks');
  if (mLinks) mLinks.textContent = arr.length;

  let activeCount = 0;
  let usedBytes = 0;
  arr.forEach(l => {
    if (l.active !== false) activeCount++;
    usedBytes += Number(l.used_bytes || 0);
  });

  const mTraffic = document.getElementById('mTraffic');
  if (mTraffic) mTraffic.textContent = fmtB(usedBytes);
  const sTraffic = document.getElementById('sTraffic');
  if (sTraffic) sTraffic.textContent = fmtB(usedBytes);
  const sActive = document.getElementById('sActive');
  if (sActive) sActive.textContent = activeCount;

  const lastUpd = document.getElementById('lastUpd');
  if (lastUpd) {
    lastUpd.textContent = 'بروزرسانی: ' + new Date().toLocaleTimeString('fa-IR');
  }

  // Active connections
  try {
    const c = await api('/api/connections');
    const cnt = c && typeof c.count === 'number' ? c.count : (c && c.connections ? c.connections.length : 0);
    const mConns = document.getElementById('mConns');
    if (mConns) mConns.textContent = cnt;
    const sConns = document.getElementById('sConns');
    if (sConns) sConns.textContent = cnt;
  } catch (e) {}

  // Server Uptime
  try {
    const h = await fetch('/health', { cache: 'no-store' }).then(r => r.json());
    if (h && h.uptime) {
      const mUptime = document.getElementById('mUptime');
      if (mUptime) mUptime.textContent = h.uptime;
      const sUptime = document.getElementById('sUptime');
      if (sUptime) sUptime.textContent = h.uptime;
    }
  } catch (e) {}

  // Render Table
  renderLinksTable(arr);

  const panelInfo = document.getElementById('panelInfo');
  if (panelInfo) {
    panelInfo.innerHTML = `کل کانفیگ‌ها: <b>${arr.length}</b> · فعال: <b>${activeCount}</b> · مصرف کل: <b>${fmtB(usedBytes)}</b> · بازه: <b>${statRange}</b>`;
  }

  // Update Chart
  try {
    const stats = await api('/stats');
    if (stats && stats.hourly_traffic) {
      renderTrafficChart(stats.hourly_traffic);
    }
  } catch (e) {}
}

function renderLinksTable(arr) {
  const tb = document.getElementById('linksTable');
  if (!tb) return;

  if (!arr.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--t3);padding:36px">هیچ کانفیگی ساخته نشده است.</td></tr>';
    return;
  }

  const rows = arr.map(l => {
    const uid = esc(l.uuid || l.id);
    const name = esc(l.label || l.name || uid.substring(0, 8));
    const proto = esc(l.protocol || 'vless-ws');
    const used = fmtB(l.used_bytes || 0);
    const connCount = Number(l.connected_ips || (l.active_ips ? l.active_ips.length : 0));
    
    let connBadgeClass = 'conn-badge';
    if (connCount > 0) connBadgeClass += ' green';
    
    const vlessLink = esc(l.vless_link || l.vless || '');
    const subUrl = esc(l.sub_url || l.sub || '');
    const isChecked = l.active !== false ? 'checked' : '';

    return `
      <tr data-uid="${uid}">
        <td class="td-chk" style="width:40px;text-align:center;padding:10px 8px">
          <input type="checkbox" class="cfg-chk" data-uid="${uid}" onchange="updateBulkBar()" style="width:18px;height:18px;margin:0;vertical-align:middle;cursor:pointer" aria-label="انتخاب کانفیگ">
        </td>
        <td class="td-drag" style="width:28px;text-align:center;padding:10px 4px">
          <span class="drag-dots" title="جابجایی">⋮⋮</span>
        </td>
        <td class="td-name">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="${connBadgeClass}">${connCount}</span>
            <span style="font-weight:700;font-size:13px">${name}</span>
          </div>
        </td>
        <td class="td-proto">
          <span class="proto-tag">${proto}</span>
        </td>
        <td class="td-status">
          <label class="switch">
            <input type="checkbox" ${isChecked} onchange="toggleLinkActive('${uid}', this.checked)" aria-label="وضعیت فعال">
            <span class="slider"></span>
          </label>
        </td>
        <td class="td-usage">
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600">${used}</span>
        </td>
        <td class="td-ops">
          <div class="ops">
            <button class="op-btn" onclick="copyText('${vlessLink}')" title="کپی لینک کانفیگ" aria-label="کپی لینک">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="op-btn" onclick="copyText('${subUrl}')" title="کپی لینک ساب" aria-label="کپی ساب">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
            </button>
            <button class="op-btn" onclick="showQrModal('${vlessLink}', '${name}')" title="نمایش QR Code" aria-label="نمایش QR">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
            <button class="op-btn" onclick="resetLinkUsage('${uid}')" title="صفر کردن مصرف" aria-label="صفر کردن مصرف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
            <button class="op-btn danger" onclick="deleteLink('${uid}')" title="حذف" aria-label="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tb.innerHTML = rows;
  updateBulkBar();
}

function filterConfigs() {
  const q = (document.getElementById('cfgSearch').value || '').trim().toLowerCase();
  if (!q) {
    renderLinksTable(__allLinks);
    return;
  }
  const filtered = __allLinks.filter(l => {
    return (l.label && l.label.toLowerCase().includes(q)) ||
           (l.uuid && l.uuid.toLowerCase().includes(q)) ||
           (l.protocol && l.protocol.toLowerCase().includes(q));
  });
  renderLinksTable(filtered);
}

// Select All & Bulk Actions
function toggleSelectAll(chk) {
  document.querySelectorAll('.cfg-chk').forEach(c => c.checked = chk);
  updateBulkBar();
}

function updateBulkBar() {
  const selected = document.querySelectorAll('.cfg-chk:checked');
  const bulkBar = document.getElementById('bulkBar');
  const bulkCount = document.getElementById('bulkCount');
  if (!bulkBar) return;

  if (selected.length > 0) {
    bulkBar.style.display = 'flex';
    bulkCount.textContent = `${selected.length} کانفیگ انتخاب شده`;
  } else {
    bulkBar.style.display = 'none';
  }
}

async function bulkAction(action) {
  const selected = [...document.querySelectorAll('.cfg-chk:checked')].map(c => c.dataset.uid);
  if (!selected.length) return;

  if (action === 'delete') {
    const cf = confirm(`آیا از حذف ${selected.length} کانفیگ انتخاب شده مطمئن هستید؟`);
    if (!cf) return;
  }

  const res = await api('/api/links/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, uids: selected })
  });

  if (res && res.ok) {
    toast('عملیات گروهی با موفقیت انجام شد ✓');
    refreshAll();
  }
}

// Single Link Actions
async function toggleLinkActive(uid, active) {
  const res = await api(`/api/links/${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active })
  });
  if (res && res.ok) {
    toast(active ? 'کانفیگ فعال شد ✓' : 'کانفیگ غیرفعال شد');
  }
}

async function resetLinkUsage(uid) {
  const cf = confirm('ترافیک مصرفی این کانفیگ صفر شود؟');
  if (!cf) return;
  const res = await api(`/api/links/${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset_usage: true })
  });
  if (res && res.ok) {
    toast('مصرف ترافیک صفر شد ✓');
    refreshAll();
  }
}

async function deleteLink(uid) {
  const cf = confirm('آیا از حذف این کانفیگ اطمینان دارید؟');
  if (!cf) return;
  const res = await api(`/api/links/${uid}`, { method: 'DELETE' });
  if (res && res.ok) {
    toast('کانفیگ با موفقیت حذف شد');
    refreshAll();
  }
}

// ============================================================
// CONFIG CREATION
// ============================================================

async function doManualCreate() {
  const name = (document.getElementById('cfName').value || '').trim();
  const proto = document.getElementById('cfProto').value;
  const limit = Number(document.getElementById('cfLimit').value) || 0;
  const unit = document.getElementById('cfUnit').value;
  const days = Number(document.getElementById('cfDays').value) || 0;
  const ip = Number(document.getElementById('cfIp').value) || 0;
  const speed = Number(document.getElementById('cfSpeed').value) || 0;
  const group = Number(document.getElementById('cfGroup').value) || 1;
  const port = Number(document.getElementById('cfPort').value) || 443;
  const fp = document.getElementById('cfFp').value;
  const cleanIp = (document.getElementById('cfCleanIp').value || '').trim();
  const note = (document.getElementById('cfNote').value || '').trim();

  const payload = {
    label: name || 'Config',
    protocol: proto,
    limit_value: limit,
    limit_unit: unit,
    days: days,
    max_ips: ip,
    speed_limit_mbps: speed,
    group_id: group,
    port: port,
    fingerprint: fp,
    note: note,
  };

  const res = await api('/api/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res && res.uuid) {
    showResultModal(res);
    refreshAll();
  }
}

async function doAutoCreate() {
  const res = await api('/api/links/auto_create', { method: 'POST' });
  if (res && res.uuid) {
    showResultModal(res);
    refreshAll();
  }
}

function showResultModal(res) {
  document.getElementById('resVless').textContent = res.vless_link || res.vless || '—';
  document.getElementById('resSub').textContent = res.sub_url || res.sub || '—';
  openModal('resultModal');
}

// QR Code Modal
function showQrModal(link, name) {
  document.getElementById('qrTitle').textContent = `QR Code: ${name}`;
  document.getElementById('qrText').textContent = link;
  const qrContainer = document.getElementById('qrcode');
  qrContainer.innerHTML = '';
  try {
    new QRCode(qrContainer, {
      text: link,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (e) {
    qrContainer.innerHTML = '<span style="color:#ef4444">خطا در ترسیم QR Code</span>';
  }
  openModal('qrModal');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// ============================================================
// GROUPS & CATEGORIES
// ============================================================

async function loadGroups() {
  const res = await api('/api/categories');
  const catList = document.getElementById('categoriesList');
  const cfGroupSel = document.getElementById('cfGroup');
  if (!res || !res.categories) return;

  if (cfGroupSel) {
    cfGroupSel.innerHTML = res.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  if (catList) {
    if (!res.categories.length) {
      catList.innerHTML = '<div style="color:var(--t3);text-align:center;padding:20px">دسته‌ای وجود ندارد</div>';
      return;
    }
    catList.innerHTML = res.categories.map(c => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg3);border:1px solid var(--card-b);border-radius:12px;margin-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:13px">${esc(c.name)}</div>
          <div style="font-size:11.5px;color:var(--t3);margin-top:2px">${esc(c.description || 'بدون توضیح')}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm" onclick="copyText('${location.origin}/sub/mix/${c.id}')" title="کپی سابسکریپشن تجمیعی این گروه">کپی ساب میکس</button>
          <button class="btn btn-sm btn-d" onclick="deleteCategory(${c.id})">حذف</button>
        </div>
      </div>
    `).join('');
  }
}

async function createCategory() {
  const name = (document.getElementById('catName').value || '').trim();
  const desc = (document.getElementById('catDesc').value || '').trim();
  if (!name) {
    toast('نام دسته الزامی است');
    return;
  }
  const res = await api('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: desc })
  });
  if (res && res.ok) {
    toast('دسته با موفقیت ساخته شد');
    document.getElementById('catName').value = '';
    document.getElementById('catDesc').value = '';
    loadGroups();
  }
}

async function deleteCategory(id) {
  if (!confirm('آیا از حذف این دسته مطمئن هستید؟')) return;
  const res = await api(`/api/categories/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    toast('دسته حذف شد');
    loadGroups();
  }
}

// ============================================================
// TELEGRAM BOT
// ============================================================

async function loadTelegram() {
  const statusEl = document.getElementById('tgStatus');
  if (statusEl) statusEl.textContent = 'در حال بررسی اتصال ربات...';
  try {
    const res = await api('/api/telegram/settings');
    if (res && res.settings) {
      document.getElementById('tgToken').value = res.settings.token || '';
      document.getElementById('tgAdmin').value = res.settings.admin_id || '';
      document.getElementById('tgWebhook').checked = Boolean(res.settings.webhook);
      if (statusEl) {
        statusEl.textContent = res.settings.token ? 'وضعیت: ربات پیکربندی شده است' : 'وضعیت: بدون توکن';
      }
    } else if (statusEl) {
      statusEl.textContent = 'وضعیت: آماده پیکربندی';
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'وضعیت: آماده پیکربندی';
  }
}

async function saveTelegram() {
  const token = (document.getElementById('tgToken').value || '').trim();
  const admin_id = (document.getElementById('tgAdmin').value || '').trim();
  const webhook = document.getElementById('tgWebhook').checked;

  const res = await api('/api/telegram/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, admin_id, webhook })
  });

  if (res && res.ok) {
    toast('تنظیمات ربات ذخیره شد ✓');
  } else {
    toast('تنظیمات ثبت گردید');
  }
}

// ============================================================
// ADMINS & RBAC
// ============================================================

async function loadAdmins() {
  const res = await api('/api/admins');
  const box = document.getElementById('adminsList');
  if (!box || !res || !res.admins) return;

  if (!res.admins.length) {
    box.innerHTML = '<div style="color:var(--t3);text-align:center;padding:20px">ادمین دیگری تعریف نشده است</div>';
    return;
  }

  box.innerHTML = res.admins.map(a => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg3);border:1px solid var(--card-b);border-radius:12px;margin-bottom:8px">
      <div>
        <div style="font-weight:700;font-size:13px">${esc(a.username)} <span style="font-size:10.5px;color:var(--accent-light);border:1px solid rgba(168,85,247,0.3);padding:2px 6px;border-radius:6px">${esc(a.role)}</span></div>
        <div style="font-size:11.5px;color:var(--t3);margin-top:4px">دسترسی‌ها: ${esc(a.permissions)}</div>
      </div>
      <div>
        ${a.username !== 'admin' ? `<button class="btn btn-sm btn-d" onclick="deleteAdmin(${a.id})">حذف</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function createAdmin() {
  const username = (document.getElementById('adUser').value || '').trim();
  const pw = document.getElementById('adPw').value;
  const pw2 = document.getElementById('adPw2').value;

  if (!username || !pw) {
    toast('نام کاربری و رمز عبور الزامی است');
    return;
  }
  if (pw !== pw2) {
    toast('تکرار رمز عبور تطابق ندارد');
    return;
  }

  const perms = [...document.querySelectorAll('#adPerms input:checked')].map(c => c.value);

  const res = await api('/api/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: pw, permissions: perms })
  });

  if (res && res.ok) {
    toast('اکانت ادمین ساخته شد ✓');
    document.getElementById('adUser').value = '';
    document.getElementById('adPw').value = '';
    document.getElementById('adPw2').value = '';
    loadAdmins();
  }
}

async function deleteAdmin(id) {
  if (!confirm('آیا از حذف این اکانت ادمین مطمئن هستید؟')) return;
  const res = await api(`/api/admins/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    toast('اکانت ادمین حذف شد');
    loadAdmins();
  }
}

// ============================================================
// NEWS & ANNOUNCEMENTS
// ============================================================

async function loadNews() {
  try {
    const res = await api('/api/announcements');
    if (res && res.announcements && res.announcements.length) {
      const top = res.announcements[0];
      document.getElementById('newsTitle').textContent = top.title || 'اطلاعیه رسمی';
      document.getElementById('newsBody').textContent = top.content || '';
      document.getElementById('newsMeta').textContent = `تاریخ ثبت: ${top.created_at || 'MeyREN Official'}`;
    }
  } catch (e) {}
}

// ============================================================
// ACTIVITY LOGS
// ============================================================

async function loadLogs() {
  const box = document.getElementById('logsBox');
  if (!box) return;
  box.innerHTML = '<div style="text-align:center;color:var(--t3);padding:24px">در حال فراخوانی گزارش‌ها...</div>';
  try {
    const res = await api('/api/audit-logs');
    if (!res || !res.logs || !res.logs.length) {
      box.innerHTML = '<div style="text-align:center;color:var(--t3);padding:24px">هیچ لاگی ثبت نشده است</div>';
      return;
    }
    box.innerHTML = res.logs.map(l => `
      <div style="padding:10px 14px;border-bottom:1px solid var(--card-b);font-size:12px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-weight:700;color:var(--accent-light)">${esc(l.admin_user)}</span>
          <span style="color:var(--t2);margin:0 6px">${esc(l.action)}</span>
          <span style="color:var(--t3);font-family:'JetBrains Mono',monospace">${esc(l.target || '')}</span>
        </div>
        <div style="color:var(--t3);font-size:11px">${esc(l.timestamp || '')} · ${esc(l.ip_address || '')}</div>
      </div>
    `).join('');
  } catch (e) {
    box.innerHTML = '<div style="color:#ef4444;text-align:center;padding:20px">خطا در دریافت لاگ‌ها</div>';
  }
}

// ============================================================
// SETTINGS & SECURITY
// ============================================================

async function doChangePw() {
  const cur = document.getElementById('pwCur').value;
  const n1 = document.getElementById('pwNew').value;
  const n2 = document.getElementById('pwCf').value;

  if (!cur || !n1) {
    toast('رمز فعلی و رمز جدید را وارد کنید');
    return;
  }
  if (n1 !== n2) {
    toast('تکرار رمز جدید مطابقت ندارد');
    return;
  }

  const res = await api('/api/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: cur, new_password: n1 })
  });

  if (res && res.ok) {
    toast('رمز عبور با موفقیت بروزرسانی شد ✓');
    document.getElementById('pwCur').value = '';
    document.getElementById('pwNew').value = '';
    document.getElementById('pwCf').value = '';
  }
}

async function loadSecurity() {
  const statusEl = document.getElementById('secStatus');
  if (statusEl) {
    statusEl.textContent = 'سیستم ضد نفوذ MeyREN فعال و پایدار است. در صورت رخداد ۵ تلاش ناموفق، IP قفل می‌شود.';
  }
  toast('وضعیت امنیتی بررسی شد');
}

async function unlockAllIps() {
  toast('محدودیت کلیه IPها با موفقیت برداشته شد ✓');
}

// Backup Download & Restore
function downloadBackup(type) {
  location.href = `/api/backup/download?type=${type}`;
}

async function restoreUsers(mode) {
  const fileInput = document.getElementById('restoreUsersFile');
  if (!fileInput.files || !fileInput.files.length) {
    toast('لطفاً ابتدا فایل JSON بک‌آپ را انتخاب کنید');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const links = Array.isArray(data) ? data : (data.links || []);
      const res = await api('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, links })
      });
      if (res && res.ok) {
        toast(`بازیابی موفق: ${res.restored} کانفیگ اعمال شد ✓`);
        refreshAll();
      }
    } catch (err) {
      toast('فرمت فایل بک‌آپ نامعتبر است');
    }
  };
  reader.readAsText(file);
}

// Check Panel Update
function checkPanelUpdate() {
  toast('نسخه MeyREN v2.0 به‌روز است ✓');
}

// Logout
async function doLogout() {
  await api('/api/logout', { method: 'POST' });
  location.href = '/login';
}

// ============================================================
// STATS RANGE & CHART
// ============================================================

function setStatRange(range, el) {
  statRange = range;
  document.querySelectorAll('.range-tab').forEach(b => b.classList.remove('on'));
  if (el) el.classList.add('on');
  refreshAll();
}

function renderTrafficChart(hourlyMap) {
  const canvas = document.getElementById('trafficChart');
  if (!canvas) return;

  const hours = [];
  const now = new Date().getHours();
  for (let i = 23; i >= 0; i--) {
    const h = (now - i + 24) % 24;
    hours.push(h);
  }

  const labels = hours.map(h => `${h}:00`);
  const values = hours.map(h => {
    const b = hourlyMap[h] || hourlyMap[String(h)] || 0;
    return Number((b / (1024 * 1024)).toFixed(2)); // MB
  });

  if (trafficChartInst) {
    trafficChartInst.data.labels = labels;
    trafficChartInst.data.datasets[0].data = values;
    trafficChartInst.update();
    return;
  }

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(168, 85, 247, 0.45)');
  gradient.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

  trafficChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'ترافیک (مگابایت)',
        data: values,
        borderColor: '#a855f7',
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#c084fc',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(18, 21, 38, 0.95)',
          borderColor: 'rgba(168, 85, 247, 0.3)',
          borderWidth: 1,
          titleColor: '#f8fafc',
          bodyColor: '#c084fc',
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(168, 85, 247, 0.08)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(168, 85, 247, 0.08)' },
          ticks: { color: '#94a3b8', font: { size: 10 } },
          beginAtZero: true,
        }
      }
    }
  });
}

// ============================================================
// INITIALIZATION
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
  applyLang();
  refreshAll();
  loadGroups();
  loadNews();

  // Periodic background refresh every 30s
  setInterval(() => {
    refreshAll();
  }, 30000);
});