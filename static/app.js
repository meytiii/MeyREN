let lang = localStorage.getItem('ren_lang') || 'en';
let theme = localStorage.getItem('ren_theme') || 'dark';
let isCompact = localStorage.getItem('ren_compact') === 'true';

let allLinks = [];
let currentFilter = 'all';
let statsData = {};
let trafficChart = null;
let consumersChart = null;

let lastTotalBytes = 0;
let lastTimestamp = 0;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function setLang(l) {
  lang = l;
  document.getElementById('lang-en').classList.toggle('active', l === 'en');
  document.getElementById('lang-fa').classList.toggle('active', l === 'fa');
  document.body.dir = l === 'fa' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-en]').forEach(el => {
    const v = el.getAttribute('data-' + l);
    if (v) el.textContent = v;
  });
  localStorage.setItem('ren_lang', l);
}

function applyTheme(t) {
  theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('ren_theme', t);
  const btn = $('#theme-btn');
  if (btn) {
    btn.innerHTML = t === 'dark'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
  }
}

function toggleTheme() {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
}

function setFilter(f, el) {
  currentFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  filterInbounds();
}

function filterInbounds() {
  const q = ($('#inbound-search')?.value || '').toLowerCase();
  let filtered = allLinks;
  if (currentFilter === 'active') filtered = filtered.filter(l => l.active);
  if (currentFilter === 'disabled') filtered = filtered.filter(l => !l.active);
  if (q) filtered = filtered.filter(l => l.label.toLowerCase().includes(q) || l.uuid.toLowerCase().includes(q));
  renderLinks(filtered);
}

function fmtBytes(b) {
  if (b > 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
  if (b > 1048576) return (b / 1048576).toFixed(2) + ' MB';
  return (b / 1024).toFixed(1) + ' KB';
}

function fmtLimit(b) {
  if (b === 0) return 'Unlimited';
  const gb = b / 1073741824;
  return (gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)) + ' GB';
}

function fmtSpeed(bytesPerSec) {
  if (bytesPerSec > 1048576) return (bytesPerSec / 1048576).toFixed(2) + ' MB/s';
  if (bytesPerSec > 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  return bytesPerSec.toFixed(0) + ' B/s';
}

function switchPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${id}`)?.classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === id));
  $('#sidebar').classList.remove('open');
  $('#sidebar-overlay').classList.remove('show');
}

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' error' : '') + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}

async function loadStats() {
  try {
    const r = await fetch('/stats');
    if (!r.ok) throw new Error();
    statsData = await r.json();

    // Speed calculation
    const now = Date.now();
    const currentBytes = (statsData.total_traffic_mb || 0) * 1024 * 1024;
    if (lastTimestamp > 0 && now > lastTimestamp && currentBytes >= lastTotalBytes) {
      const dt = (now - lastTimestamp) / 1000;
      const speed = (currentBytes - lastTotalBytes) / dt;
      $('#s-speed').textContent = fmtSpeed(speed);
    }
    lastTotalBytes = currentBytes;
    lastTimestamp = now;

    $('#s-traffic').innerHTML = statsData.total_traffic_mb + '<span class="stat-unit"> MB</span>';
    $('#s-links').textContent = statsData.links_count;
    $('#s-uptime').textContent = statsData.uptime;
    $('#s-domain').textContent = statsData.domain;
    $('#links-badge').textContent = statsData.links_count;
    $('#last-update').textContent = (lang === 'fa' ? 'بروزرسانی: ' : 'Updated: ') + new Date().toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US');

    if ($('#t-traffic')) $('#t-traffic').textContent = statsData.total_traffic_mb + ' MB';
    if ($('#t-reqs')) $('#t-reqs').textContent = (statsData.total_requests || 0).toLocaleString();
    if ($('#t-uptime')) $('#t-uptime').textContent = statsData.uptime;

    if (statsData.cpu_percent !== undefined) {
      const c = statsData.cpu_percent;
      const cc = c > 80 ? 'var(--red)' : c > 50 ? 'var(--yellow)' : 'var(--neon-blue)';
      $('#s-cpu-val').textContent = c.toFixed(1) + '%';
      $('#s-cpu-val').style.color = cc;
      $('#s-cpu-bar').style.width = c + '%';
      $('#s-cpu-bar').style.background = cc;
    }
    if (statsData.memory_percent !== undefined) {
      const m = statsData.memory_percent;
      const mc = m > 80 ? 'var(--red)' : m > 50 ? 'var(--yellow)' : 'var(--green)';
      $('#s-mem-val').textContent = m.toFixed(1) + '%';
      $('#s-mem-val').style.color = mc;
      $('#s-mem-bar').style.width = m + '%';
      $('#s-mem-bar').style.background = mc;
    }
    updateHourlyChart();
  } catch (e) {}
}

async function loadLinks() {
  try {
    const r = await fetch('/api/links');
    if (!r.ok) throw new Error();
    const d = await r.json();
    allLinks = d.links || [];
    filterInbounds();
    updateQuotaPool();
    updateConsumersChart();
  } catch (e) {}
}

function updateQuotaPool() {
  let totalUsed = 0;
  let totalLimit = 0;
  allLinks.forEach(l => {
    totalUsed += l.used_bytes || 0;
    totalLimit += l.limit_bytes || 0;
  });

  const usedGB = (totalUsed / (1024 * 1024 * 1024)).toFixed(2);
  const limitGB = totalLimit > 0 ? (totalLimit / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : 'Unlimited';
  const pct = totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0;

  const textEl = $('#quota-pool-text');
  const barEl = $('#quota-pool-bar');
  if (textEl) textEl.textContent = `${usedGB} GB / ${limitGB} (${allLinks.length} Users)`;
  if (barEl) barEl.style.width = pct + '%';
}

function renderLinks(links) {
  const tbody = $('#links-tbody');
  const empty = $('#links-empty');
  const cards = $('#inbound-cards');
  tbody.textContent = '';
  cards.textContent = '';

  if (!links.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const rowTpl = $('#tpl-inbound-row').content;
  const cardTpl = $('#tpl-inbound-card').content;
  const fragTable = document.createDocumentFragment();
  const fragCards = document.createDocumentFragment();
  let idx = links.length;

  links.forEach(l => {
    const u = l.used_bytes || 0;
    const lim = l.limit_bytes || 0;
    const uF = fmtBytes(u);
    const lF = fmtLimit(lim);
    const pct = lim > 0 ? Math.min(100, (u / lim) * 100) : 0;
    const isCapped = lim > 0 && u >= lim;
    const col = isCapped ? 'var(--red)' : pct > 75 ? 'var(--yellow)' : 'var(--neon-blue)';
    const i = idx--;

    // Table Row
    const row = document.importNode(rowTpl, true);
    row.querySelector('.col-id').textContent = i;
    row.querySelector('.col-name').textContent = l.label;
    row.querySelector('.col-used').textContent = uF;
    row.querySelector('.col-limit').textContent = lF;
    row.querySelector('.col-fill').style.width = pct + '%';
    row.querySelector('.col-fill').style.background = col;

    const rStatus = row.querySelector('.col-status');
    if (isCapped) {
      rStatus.textContent = 'Capped';
      rStatus.className = 'col-status tag tag-warning';
    } else {
      rStatus.textContent = l.active ? 'Active' : 'Disabled';
      rStatus.className = 'col-status tag ' + (l.active ? 'tag-active' : 'tag-disabled');
    }

    const rToggle = row.querySelector('.act-toggle');
    rToggle.className = 'act-toggle toggle ' + (l.active ? 'on' : '');
    rToggle.dataset.uid = l.uuid;
    rToggle.onclick = function() { toggleLink(this); };

    row.querySelector('.act-copy').onclick = function() { copyLinkText(l.vless_link, this); };
    row.querySelector('.act-qr').onclick = function() { showQRText(l.vless_link, l.label); };
    row.querySelector('.act-topup').onclick = function() { topUpLink(l.uuid, 1.0); };
    row.querySelector('.act-edit').onclick = function() { openEditModal(l); };
    row.querySelector('.act-info').onclick = function() { showDetail(l.uuid); };
    row.querySelector('.act-del').onclick = function() { deleteLink(l.uuid); };
    fragTable.appendChild(row);

    // Mobile Card
    const card = document.importNode(cardTpl, true);
    card.querySelector('.col-id').textContent = '#' + i;
    card.querySelector('.col-name').textContent = l.label;
    card.querySelector('.col-used').textContent = uF;
    card.querySelector('.col-limit').textContent = lF;
    card.querySelector('.col-fill').style.width = pct + '%';
    card.querySelector('.col-fill').style.background = col;

    const cToggle = card.querySelector('.act-toggle');
    cToggle.className = 'act-toggle toggle ' + (l.active ? 'on' : '');
    cToggle.dataset.uid = l.uuid;
    cToggle.onclick = function() { toggleLink(this); };

    card.querySelector('.act-copy').onclick = function() { copyLinkText(l.vless_link, this); };
    card.querySelector('.act-qr').onclick = function() { showQRText(l.vless_link, l.label); };
    card.querySelector('.act-topup').onclick = function() { topUpLink(l.uuid, 1.0); };
    card.querySelector('.act-edit').onclick = function() { openEditModal(l); };
    card.querySelector('.act-info').onclick = function() { showDetail(l.uuid); };
    card.querySelector('.act-del').onclick = function() { deleteLink(l.uuid); };
    fragCards.appendChild(card);
  });

  tbody.appendChild(fragTable);
  cards.appendChild(fragCards);
}

function showDetail(uid) {
  const l = allLinks.find(x => x.uuid === uid);
  if (!l) return;
  const u = l.used_bytes || 0;
  const lim = l.limit_bytes || 0;
  const uF = fmtBytes(u);
  const lF = fmtLimit(lim);
  const pct = lim > 0 ? Math.min(100, (u / lim) * 100) : 0;
  const col = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--yellow)' : 'var(--neon-blue)';
  const created = l.created_at ? new Date(l.created_at).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US') : '--';

  $('#detail-title').textContent = l.label;
  const stat = $('#det-status');
  stat.textContent = l.active ? 'Active' : 'Disabled';
  stat.className = 'tag ' + (l.active ? 'tag-active' : 'tag-disabled');
  $('#det-uuid').textContent = l.uuid;
  $('#det-used').textContent = uF;
  $('#det-limit').textContent = lF;
  $('#det-pct').textContent = pct.toFixed(1) + '%';
  $('#det-bar').style.width = pct + '%';
  $('#det-bar').style.background = col;
  $('#det-created').textContent = created;
  $('#det-link').textContent = l.vless_link;

  $('#det-act-copy').onclick = function() { copyLinkText(l.vless_link, this); };
  $('#det-act-qr').onclick = function() { showQRText(l.vless_link, l.label); $('#detail-modal').close(); };
  $('#det-act-topup').onclick = function() { topUpLink(l.uuid, 1.0); $('#detail-modal').close(); };
  $('#det-act-reset').onclick = function() { resetUsage(l.uuid); $('#detail-modal').close(); };

  $('#detail-modal').showModal();
}

async function toggleLink(el) {
  const uid = el.dataset.uid;
  const link = allLinks.find(l => l.uuid === uid);
  if (!link) return;
  const newActive = !link.active;
  try {
    await fetch(`/api/links/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: newActive })
    });
    link.active = newActive;
    filterInbounds();
    loadStats();
  } catch (e) {}
}

async function quickCreate(limit, unit) {
  const names = ['Ali', 'Sara', 'Reza', 'Nima', 'Mina', 'Arash', 'Yalda', 'Dariush', 'Cyrus', 'Shirin', 'Neon', 'Speed', 'VIP'];
  const name = names[Math.floor(Math.random() * names.length)] + '-' + Math.floor(Math.random() * 100);
  try {
    const r = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: name, limit_value: limit, limit_unit: unit })
    });
    if (!r.ok) throw new Error();
    toast('Created: ' + name);
    await loadLinks();
    await loadStats();
  } catch (e) {
    toast('Error creating link', true);
  }
}

async function createLink() {
  const label = $('#new-label').value.trim() || 'New Link';
  const val = parseFloat($('#new-limit').value) || 0;
  const unit = $('#new-unit').value || 'GB';
  if (!/^[a-zA-Z0-9\-_. ]+$/.test(label)) {
    toast('Only English letters and numbers allowed in remark', true);
    return;
  }
  try {
    const r = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, limit_value: val, limit_unit: unit })
    });
    if (!r.ok) throw new Error();
    toast('Created successfully');
    $('#new-label').value = '';
    $('#new-limit').value = '';
    $('#add-modal').close();
    await loadLinks();
    await loadStats();
  } catch (e) {
    toast('Error creating inbound', true);
  }
}

function openEditModal(l) {
  $('#edit-uuid').value = l.uuid;
  $('#edit-label').value = l.label;
  const gb = (l.limit_bytes || 0) / (1024 * 1024 * 1024);
  $('#edit-limit').value = gb > 0 ? (gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)) : 0;
  $('#edit-reset-usage').checked = false;
  $('#edit-modal').showModal();
}

async function saveEdit() {
  const uid = $('#edit-uuid').value;
  const label = $('#edit-label').value.trim() || 'Link';
  const limitVal = parseFloat($('#edit-limit').value) || 0;
  const resetUsage = $('#edit-reset-usage').checked;

  try {
    const r = await fetch(`/api/links/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        limit_value: limitVal,
        limit_unit: 'GB',
        reset_usage: resetUsage
      })
    });
    if (!r.ok) throw new Error();
    toast('Saved changes');
    $('#edit-modal').close();
    await loadLinks();
    await loadStats();
  } catch (e) {
    toast('Error saving inbound', true);
  }
}

async function topUpLink(uid, gb = 1.0) {
  try {
    const r = await fetch(`/api/links/${uid}/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gb })
    });
    if (!r.ok) throw new Error();
    toast(`+${gb} GB Added!`);
    await loadLinks();
    await loadStats();
  } catch (e) {
    toast('Top-up failed', true);
  }
}

async function resetUsage(uid) {
  try {
    await fetch(`/api/links/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_usage: true })
    });
    toast('Traffic reset to 0');
    await loadLinks();
  } catch (e) {}
}

async function deleteLink(uid) {
  if (!confirm('Are you sure you want to delete this inbound?')) return;
  try {
    await fetch(`/api/links/${uid}`, { method: 'DELETE' });
    toast('Deleted');
    await loadLinks();
    await loadStats();
  } catch (e) {}
}

function copyLinkText(txt, btn = null) {
  navigator.clipboard.writeText(txt).then(() => {
    toast('Copied to clipboard');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => btn.textContent = orig, 1500);
    }
  }).catch(() => toast('Failed to copy', true));
}

function showQRText(txt, title = 'QR Code') {
  if (!txt) return;
  $('#qr-modal-title').textContent = title;
  $('#qr-img').src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(txt);
  $('#qr-modal').showModal();
}

function downloadQR() {
  const img = $('#qr-img');
  if (!img.src) return;
  const a = document.createElement('a');
  a.href = img.src;
  a.download = 'meyren-qr.png';
  a.click();
}

function openSubModal() {
  const subUrl = location.origin + '/sub';
  $('#sub-url-box').textContent = subUrl;
  $('#sub-modal').showModal();
}

function exportTxt() {
  const activeLinks = allLinks.filter(l => l.active).map(l => l.vless_link);
  if (!activeLinks.length) {
    toast('No active links to export', true);
    return;
  }
  const blob = new Blob([activeLinks.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'MeyREN-Links.txt';
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported ' + activeLinks.length + ' links');
}

function backupJson() {
  if (!allLinks.length) {
    toast('No links to backup', true);
    return;
  }
  const blob = new Blob([JSON.stringify({ links: allLinks }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MeyREN-Backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Downloaded backup');
}

async function doRestore() {
  const fileInput = $('#restore-file-input');
  const textInput = $('#restore-json-text').value.trim();
  let jsonString = textInput;

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    jsonString = await file.text();
  }

  if (!jsonString) {
    toast('Please provide JSON file or text', true);
    return;
  }

  try {
    const parsed = JSON.parse(jsonString);
    const linksArray = Array.isArray(parsed) ? parsed : (parsed.links || []);
    if (!linksArray.length) throw new Error('No links found in JSON');

    const r = await fetch('/api/links/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: linksArray })
    });
    if (!r.ok) throw new Error();
    const res = await r.json();
    toast(`Restored ${res.count} links!`);
    $('#restore-modal').close();
    await loadLinks();
    await loadStats();
  } catch (e) {
    toast('Invalid JSON backup file', true);
  }
}

function toggleCompactView() {
  isCompact = !isCompact;
  localStorage.setItem('ren_compact', isCompact);
  $('#inbounds-table').classList.toggle('compact', isCompact);
  $('#compact-label').textContent = isCompact ? 'Detailed View' : 'Compact View';
}

async function changePassword() {
  const cur = $('#cur-pw').value;
  const nw = $('#new-pw').value;
  if (!cur || !nw) {
    toast('Fill all fields', true);
    return;
  }
  try {
    const r = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: cur, new_password: nw })
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.detail || 'Error');
    }
    toast('Password updated');
    $('#cur-pw').value = '';
    $('#new-pw').value = '';
  } catch (e) {
    toast(e.message, true);
  }
}

function initHourlyChart() {
  const ctx = document.getElementById('trafficChart');
  if (!ctx) return;
  trafficChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'MB',
        data: [],
        backgroundColor: 'rgba(0, 242, 254, 0.65)',
        borderColor: '#00f2fe',
        borderWidth: 1.5,
        borderRadius: 5,
        hoverBackgroundColor: '#a855f7'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, callback: v => v + ' MB' }, beginAtZero: true }
      }
    }
  });
}

function updateHourlyChart() {
  if (!trafficChart || !statsData.hourly_traffic) return;
  const ht = statsData.hourly_traffic;
  const sorted = Object.entries(ht).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  const labels = sorted.map(e => e[0]);
  const data = sorted.map(e => Math.round(e[1] / 1048576));
  trafficChart.data.labels = labels;
  trafficChart.data.datasets[0].data = data;
  trafficChart.update();
}

function initConsumersChart() {
  const ctx = document.getElementById('consumersChart');
  if (!ctx) return;
  consumersChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: ['#00f2fe', '#38bdf8', '#818cf8', '#a855f7', '#d946ef'],
        borderWidth: 2,
        borderColor: 'rgba(15, 16, 33, 0.8)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      cutout: '72%'
    }
  });
}

function updateConsumersChart() {
  if (!consumersChart) return;
  const sorted = [...allLinks].filter(l => (l.used_bytes || 0) > 0).sort((a, b) => b.used_bytes - a.used_bytes).slice(0, 5);
  const listEl = $('#top-consumers-list');
  const countEl = $('#top-consumers-count');

  if (!sorted.length) {
    consumersChart.data.labels = ['No traffic'];
    consumersChart.data.datasets[0].data = [1];
    consumersChart.data.datasets[0].backgroundColor = ['rgba(255,255,255,0.1)'];
    consumersChart.update();
    if (listEl) listEl.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:12px">No traffic data yet</div>';
    return;
  }

  const labels = sorted.map(l => l.label);
  const data = sorted.map(l => +(l.used_bytes / (1024 * 1024)).toFixed(1));
  const colors = ['#00f2fe', '#38bdf8', '#818cf8', '#a855f7', '#d946ef'];

  consumersChart.data.labels = labels;
  consumersChart.data.datasets[0].data = data;
  consumersChart.data.datasets[0].backgroundColor = colors.slice(0, sorted.length);
  consumersChart.update();

  if (countEl) countEl.textContent = `Top ${sorted.length}`;

  if (listEl) {
    listEl.innerHTML = sorted.map((l, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;padding:3px 0">
        <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
          <span style="width:8px;height:8px;border-radius:50%;background:${colors[i]};flex-shrink:0"></span>
          <span style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${l.label}</span>
        </div>
        <span style="color:var(--text2);font-weight:600">${fmtBytes(l.used_bytes)}</span>
      </div>
    `).join('');
  }
}

// Event Listeners
$$('.nav-item').forEach(el => el.addEventListener('click', () => switchPage(el.dataset.page)));
$('#menu-toggle-btn')?.addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
  $('#sidebar-overlay').classList.toggle('show');
});
$('#sidebar-overlay')?.addEventListener('click', () => {
  $('#sidebar').classList.remove('open');
  $('#sidebar-overlay').classList.remove('show');
});

$('#theme-btn')?.addEventListener('click', toggleTheme);
$('#lang-en')?.addEventListener('click', () => setLang('en'));
$('#lang-fa')?.addEventListener('click', () => setLang('fa'));
$('#logout-btn')?.addEventListener('click', () => {
  fetch('/api/logout', { method: 'POST' }).then(() => location.href = '/login');
});

$('#btn-quick-half')?.addEventListener('click', () => quickCreate(0.5, 'GB'));
$('#btn-quick-full')?.addEventListener('click', () => quickCreate(1, 'GB'));
$('#btn-dash-sub')?.addEventListener('click', openSubModal);
$('#btn-inbound-sub')?.addEventListener('click', openSubModal);
$('#btn-add-modal')?.addEventListener('click', () => $('#add-modal').showModal());
$('#inbound-search')?.addEventListener('input', filterInbounds);

$('#filter-all')?.addEventListener('click', function() { setFilter('all', this); });
$('#filter-active')?.addEventListener('click', function() { setFilter('active', this); });
$('#filter-disabled')?.addEventListener('click', function() { setFilter('disabled', this); });
$('#btn-toggle-compact')?.addEventListener('click', toggleCompactView);

$('#btn-export-txt')?.addEventListener('click', exportTxt);
$('#btn-backup-json')?.addEventListener('click', backupJson);
$('#btn-restore-json')?.addEventListener('click', () => $('#restore-modal').showModal());
$('#btn-do-restore')?.addEventListener('click', doRestore);

$('#btn-create-link')?.addEventListener('click', createLink);
$('#btn-save-edit')?.addEventListener('click', saveEdit);
$('#btn-update-pw')?.addEventListener('click', changePassword);

$('#add-modal-close')?.addEventListener('click', () => $('#add-modal').close());
$('#edit-modal-close')?.addEventListener('click', () => $('#edit-modal').close());
$('#sub-modal-close')?.addEventListener('click', () => $('#sub-modal').close());
$('#detail-modal-close')?.addEventListener('click', () => $('#detail-modal').close());
$('#qr-modal-close')?.addEventListener('click', () => $('#qr-modal').close());
$('#restore-modal-close')?.addEventListener('click', () => $('#restore-modal').close());

$('#btn-download-qr')?.addEventListener('click', downloadQR);
$('#btn-close-qr')?.addEventListener('click', () => $('#qr-modal').close());
$('#btn-copy-sub')?.addEventListener('click', function() { copyLinkText($('#sub-url-box').textContent, this); });
$('#btn-qr-sub')?.addEventListener('click', () => showQRText($('#sub-url-box').textContent, 'Subscription QR'));
$('#btn-open-sub-txt')?.addEventListener('click', exportTxt);

// Initialize
applyTheme(theme);
setLang(lang);
if (isCompact) {
  $('#inbounds-table')?.classList.add('compact');
  const lbl = $('#compact-label');
  if (lbl) lbl.textContent = 'Detailed View';
}

initHourlyChart();
initConsumersChart();

loadStats();
loadLinks();
setInterval(loadStats, 10000);