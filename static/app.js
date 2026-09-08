let lang = localStorage.getItem('ren_lang') || 'fa';
let theme = localStorage.getItem('ren_theme') || 'dark';
let isCompact = localStorage.getItem('ren_compact') === 'true';
let lastStatsTime = null;

let allLinks = [];
let allDomains = [];
let defaultDomain = '';
let currentFilter = 'all';
let statsData = {};
let trafficChart = null;
let consumersChart = null;

let lastTotalBytes = 0;
let lastTimestamp = 0;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

async function loadDomains() {
  try {
    const r = await fetch('/api/domains');
    if (!r.ok) throw new Error();
    const d = await r.json();
    defaultDomain = d.default || location.hostname || 'localhost';
    allDomains = d.domains && d.domains.length ? d.domains : [defaultDomain];

    const curHost = location.host;
    if (curHost && !allDomains.includes(curHost) && curHost !== '127.0.0.1' && curHost !== 'localhost' && !curHost.startsWith('127.')) {
      allDomains.push(curHost);
    }

    updateDomainSelects();
    renderDomainList();
    if ($('#s-domain-count')) $('#s-domain-count').textContent = allDomains.length;
    if ($('#domains-modal-count')) $('#domains-modal-count').textContent = allDomains.length;
  } catch (e) {
    if (!allDomains.length) {
      allDomains = [location.hostname || 'localhost'];
      defaultDomain = allDomains[0];
      updateDomainSelects();
    }
  }
}

function updateDomainSelects() {
  const newDomainSel = $('#new-domain');
  const editDomainSel = $('#edit-domain');
  const subDomainSel = $('#sub-domain-select');

  const domainOptions = allDomains.map(d => {
    const isDef = d === defaultDomain;
    const label = d + (isDef ? (lang === 'fa' ? ' (پیش‌فرض)' : ' (Default)') : '');
    return `<option value="${d}">${label}</option>`;
  }).join('');

  if (newDomainSel) {
    const curVal = newDomainSel.value;
    newDomainSel.innerHTML = domainOptions;
    if (curVal && allDomains.includes(curVal)) newDomainSel.value = curVal;
    else if (defaultDomain) newDomainSel.value = defaultDomain;
  }

  if (editDomainSel) {
    const curVal = editDomainSel.value;
    editDomainSel.innerHTML = domainOptions;
    if (curVal && allDomains.includes(curVal)) editDomainSel.value = curVal;
    else if (defaultDomain) editDomainSel.value = defaultDomain;
  }

  if (subDomainSel) {
    const curVal = subDomainSel.value;
    const assignedOpt = `<option value="assigned">${lang === 'fa' ? 'دامنه‌های متصل به هر کانفیگ' : 'Config Assigned Domains (Per-Config)'}</option>`;
    subDomainSel.innerHTML = assignedOpt + domainOptions;
    if (curVal && (curVal === 'assigned' || allDomains.includes(curVal))) {
      subDomainSel.value = curVal;
    } else {
      subDomainSel.value = defaultDomain || 'assigned';
    }
    updateSubUrl();
  }
}

function updateSubUrl() {
  const subSel = $('#sub-domain-select');
  const selVal = subSel ? subSel.value : 'assigned';
  let subUrl = '';
  if (!selVal || selVal === 'assigned') {
    subUrl = location.origin + '/sub';
  } else {
    const proto = location.protocol || 'https:';
    subUrl = `${proto}//${selVal}/sub?domain=${encodeURIComponent(selVal)}`;
  }
  if ($('#sub-url-box')) $('#sub-url-box').textContent = subUrl;
  return subUrl;
}

function renderDomainList() {
  const container = $('#domain-list-container');
  if (!container) return;
  container.innerHTML = '';

  if (!allDomains.length) {
    container.innerHTML = `<div style="text-align:center;padding:16px;font-size:12px;color:var(--text3)">${lang === 'fa' ? 'هیچ دامنه‌ای یافت نشد' : 'No domains configured'}</div>`;
    return;
  }

  allDomains.forEach(d => {
    const isDef = d === defaultDomain;
    const item = document.createElement('div');
    item.className = 'domain-item';

    let badgeClass = 'badge-custom';
    let badgeText = lang === 'fa' ? 'اختصاصی' : 'CUSTOM';
    if (isDef) {
      badgeClass = 'badge-default';
      badgeText = lang === 'fa' ? 'پیش‌فرض' : 'DEFAULT';
    } else if (d.includes('railway') || d.includes('onrender')) {
      badgeClass = 'badge-env';
      badgeText = 'HOST';
    }

    item.innerHTML = `
      <div class="domain-item-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--neon-blue);flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span class="domain-item-name" title="${d}">${d}</span>
        <span class="domain-item-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="domain-item-actions">
        ${!isDef ? `<button class="btn-domain-action btn-set-default" data-domain="${d}" title="Set as default">${lang === 'fa' ? 'تنظیم پیش‌فرض' : 'Make Default'}</button>` : ''}
        ${!isDef ? `<button class="btn-domain-action btn-domain-delete" data-domain="${d}" title="Delete">&#x2715;</button>` : ''}
      </div>
    `;

    const setDefaultBtn = item.querySelector('.btn-set-default');
    if (setDefaultBtn) {
      setDefaultBtn.onclick = () => setDefaultDomain(d);
    }
    const delBtn = item.querySelector('.btn-domain-delete');
    if (delBtn) {
      delBtn.onclick = () => deleteDomain(d);
    }

    container.appendChild(item);
  });
}

async function addCustomDomain() {
  const input = $('#new-custom-domain-input');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) {
    toast(lang === 'fa' ? 'لطفاً نام دامنه را وارد کنید' : 'Please enter domain name', true);
    return;
  }
  try {
    const r = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: raw })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || 'Error adding domain');
    }
    input.value = '';
    toast(lang === 'fa' ? 'دامنه با موفقیت اضافه شد' : 'Domain added successfully');
    await loadDomains();
    if ($('#add-modal')?.open && $('#new-domain')) {
      $('#new-domain').value = raw;
    }
    if ($('#edit-modal')?.open && $('#edit-domain')) {
      $('#edit-domain').value = raw;
    }
    await loadStats();
  } catch (e) {
    toast(e.message || (lang === 'fa' ? 'خطا در افزودن دامنه' : 'Error adding domain'), true);
  }
}

async function deleteDomain(domain) {
  if (!confirm(lang === 'fa' ? `آیا از حذف دامنه ${domain} مطمئن هستید؟` : `Are you sure you want to delete domain ${domain}?`)) return;
  try {
    const r = await fetch(`/api/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error();
    toast(lang === 'fa' ? 'دامنه حذف شد' : 'Domain deleted');
    await loadDomains();
    await loadStats();
  } catch (e) {
    toast(lang === 'fa' ? 'خطا در حذف دامنه' : 'Error deleting domain', true);
  }
}

async function setDefaultDomain(domain) {
  try {
    const r = await fetch('/api/domains/default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
    if (!r.ok) throw new Error();
    toast(lang === 'fa' ? `دامنه پیش‌فرض به ${domain} تغییر کرد` : `Default domain set to ${domain}`);
    await loadDomains();
    await loadLinks();
    await loadStats();
  } catch (e) {
    toast(lang === 'fa' ? 'خطا در تعیین دامنه پیش‌فرض' : 'Error setting default domain', true);
  }
}

function updateLastUpdateDisplay() {
  const el = $('#last-update');
  if (!el) return;
  if (!lastStatsTime) {
    el.textContent = lang === 'fa' ? 'بروزرسانی: --' : 'Updated: --';
    return;
  }
  const timeStr = lastStatsTime.toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US');
  const label = lang === 'fa' ? 'بروزرسانی: ' : 'Updated: ';
  el.innerHTML = `${label}<bdi class="bidi-safe">${timeStr}</bdi>`;
}

function setLang(l) {
  lang = l;
  document.getElementById('lang-en').classList.toggle('active', l === 'en');
  document.getElementById('lang-fa').classList.toggle('active', l === 'fa');
  document.body.dir = l === 'fa' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-en]').forEach(el => {
    const v = el.getAttribute('data-' + l);
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-placeholder-en]').forEach(el => {
    const p = el.getAttribute('data-placeholder-' + l);
    if (p) el.placeholder = p;
  });
  localStorage.setItem('ren_lang', l);
  updateLastUpdateDisplay();
  updateDomainSelects();
  renderDomainList();
  updateQuotaPool();
  filterInbounds();
  updateConsumersChart();
}

function updateChartThemes() {
  const isDark = (theme === 'dark');
  const tickColor = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
  const doughnutBorder = isDark ? 'rgba(15, 16, 33, 0.8)' : 'rgba(255, 255, 255, 0.95)';

  if (trafficChart) {
    if (trafficChart.options.scales.x) trafficChart.options.scales.x.ticks.color = tickColor;
    if (trafficChart.options.scales.y) {
      trafficChart.options.scales.y.ticks.color = tickColor;
      trafficChart.options.scales.y.grid.color = gridColor;
    }
    trafficChart.update('none');
  }

  if (consumersChart) {
    consumersChart.data.datasets[0].borderColor = doughnutBorder;
    if (consumersChart.data.labels && consumersChart.data.labels[0] === 'No traffic') {
      consumersChart.data.datasets[0].backgroundColor = [isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'];
    }
    consumersChart.update('none');
  }
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
  updateChartThemes();
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
  if (b === 0) return lang === 'fa' ? 'نامحدود' : 'Unlimited';
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
      $('#s-speed').innerHTML = `<bdi>${fmtSpeed(speed)}</bdi>`;
    }
    lastTotalBytes = currentBytes;
    lastTimestamp = now;

    $('#s-traffic').innerHTML = `<bdi>${statsData.total_traffic_mb} MB</bdi>`;
    $('#s-links').innerHTML = `<bdi>${statsData.links_count}</bdi>`;
    $('#s-uptime').innerHTML = `<bdi>${statsData.uptime}</bdi>`;
    $('#s-domain').innerHTML = `<bdi>${statsData.domain}</bdi>`;
    if (statsData.domains && Array.isArray(statsData.domains)) {
      let changed = false;
      statsData.domains.forEach(d => {
        if (!allDomains.includes(d)) {
          allDomains.push(d);
          changed = true;
        }
      });
      if (changed) updateDomainSelects();
      if ($('#s-domain-count')) $('#s-domain-count').textContent = allDomains.length;
      if ($('#domains-modal-count')) $('#domains-modal-count').textContent = allDomains.length;
    }
    $('#links-badge').textContent = statsData.links_count;
    lastStatsTime = new Date();
    updateLastUpdateDisplay();

    if ($('#t-traffic')) $('#t-traffic').innerHTML = `<bdi>${statsData.total_traffic_mb} MB</bdi>`;
    if ($('#t-reqs')) $('#t-reqs').innerHTML = `<bdi>${(statsData.total_requests || 0).toLocaleString()}</bdi>`;
    if ($('#t-uptime')) $('#t-uptime').innerHTML = `<bdi>${statsData.uptime}</bdi>`;

    if (statsData.cpu_percent !== undefined) {
      const c = statsData.cpu_percent;
      const cc = c > 80 ? 'var(--red)' : c > 50 ? 'var(--yellow)' : 'var(--neon-blue)';
      $('#s-cpu-val').innerHTML = `<bdi>${c.toFixed(1)}%</bdi>`;
      $('#s-cpu-val').style.color = cc;
      $('#s-cpu-bar').style.width = c + '%';
      $('#s-cpu-bar').style.background = cc;
    }
    if (statsData.memory_percent !== undefined) {
      const m = statsData.memory_percent;
      const mc = m > 80 ? 'var(--red)' : m > 50 ? 'var(--yellow)' : 'var(--green)';
      $('#s-mem-val').innerHTML = `<bdi>${m.toFixed(1)}%</bdi>`;
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
  const limitGB = totalLimit > 0 ? (totalLimit / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : (lang === 'fa' ? 'نامحدود' : 'Unlimited');
  const pct = totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0;

  const textEl = $('#quota-pool-text');
  const barEl = $('#quota-pool-bar');
  if (textEl) {
    const userWord = lang === 'fa' ? 'کاربر' : 'Users';
    textEl.innerHTML = `<bdi>${usedGB} GB / ${limitGB}</bdi> <span style="font-size:11px;opacity:0.85">(${allLinks.length} ${userWord})</span>`;
  }
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
    const dPill = row.querySelector('.col-domain-pill');
    if (dPill) {
      const linkDomain = l.domain || defaultDomain || location.host;
      dPill.textContent = linkDomain;
      dPill.title = 'Domain: ' + linkDomain;
      if (linkDomain === defaultDomain) dPill.classList.add('tag-domain-default');
    }
    row.querySelector('.col-used').innerHTML = `<bdi>${uF}</bdi>`;
    row.querySelector('.col-limit').innerHTML = `<bdi>${lF}</bdi>`;
    row.querySelector('.col-fill').style.width = pct + '%';
    row.querySelector('.col-fill').style.background = col;

    const rStatus = row.querySelector('.col-status');
    if (isCapped) {
      rStatus.textContent = lang === 'fa' ? 'اتمام حجم' : 'Capped';
      rStatus.className = 'col-status tag tag-warning';
    } else {
      rStatus.textContent = l.active ? (lang === 'fa' ? 'فعال' : 'Active') : (lang === 'fa' ? 'غیرفعال' : 'Disabled');
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
    const cDPill = card.querySelector('.col-domain-pill');
    if (cDPill) {
      const linkDomain = l.domain || defaultDomain || location.host;
      cDPill.textContent = linkDomain;
      cDPill.title = 'Domain: ' + linkDomain;
      if (linkDomain === defaultDomain) cDPill.classList.add('tag-domain-default');
    }
    card.querySelector('.col-used').innerHTML = `<bdi>${uF}</bdi>`;
    card.querySelector('.col-limit').innerHTML = `<bdi>${lF}</bdi>`;
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
  const linkDomain = l.domain || defaultDomain || location.host;

  $('#detail-title').textContent = l.label;
  const stat = $('#det-status');
  stat.textContent = l.active ? (lang === 'fa' ? 'فعال' : 'Active') : (lang === 'fa' ? 'غیرفعال' : 'Disabled');
  stat.className = 'tag ' + (l.active ? 'tag-active' : 'tag-disabled');
  $('#det-uuid').innerHTML = `<bdi>${l.uuid}</bdi>`;
  if ($('#det-domain')) $('#det-domain').innerHTML = `<bdi>${linkDomain}</bdi>`;
  $('#det-used').innerHTML = `<bdi>${uF}</bdi>`;
  $('#det-limit').innerHTML = `<bdi>${lF}</bdi>`;
  $('#det-pct').innerHTML = `<bdi>${pct.toFixed(1)}%</bdi>`;
  $('#det-bar').style.width = pct + '%';
  $('#det-bar').style.background = col;
  $('#det-created').innerHTML = `<bdi>${created}</bdi>`;
  $('#det-link').innerHTML = `<bdi>${l.vless_link}</bdi>`;

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
      body: JSON.stringify({ label: name, limit_value: limit, limit_unit: unit, domain: defaultDomain })
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
  const domain = $('#new-domain')?.value || defaultDomain;
  if (!/^[a-zA-Z0-9\-_. ]+$/.test(label)) {
    toast('Only English letters and numbers allowed in remark', true);
    return;
  }
  try {
    const r = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, limit_value: val, limit_unit: unit, domain })
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
  if ($('#edit-domain')) {
    const linkDomain = l.domain || defaultDomain;
    if (linkDomain && !allDomains.includes(linkDomain)) {
      allDomains.push(linkDomain);
      updateDomainSelects();
    }
    $('#edit-domain').value = linkDomain;
  }
  $('#edit-modal').showModal();
}

async function saveEdit() {
  const uid = $('#edit-uuid').value;
  const label = $('#edit-label').value.trim() || 'Link';
  const limitVal = parseFloat($('#edit-limit').value) || 0;
  const resetUsage = $('#edit-reset-usage').checked;
  const domain = $('#edit-domain')?.value || defaultDomain;

  try {
    const r = await fetch(`/api/links/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        limit_value: limitVal,
        limit_unit: 'GB',
        reset_usage: resetUsage,
        domain
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
  updateDomainSelects();
  updateSubUrl();
  $('#sub-modal').showModal();
}

async function downloadSubTxt() {
  const subSel = $('#sub-domain-select');
  const selVal = subSel ? subSel.value : 'assigned';
  let url = '/sub';
  if (selVal && selVal !== 'assigned') {
    url = `/sub?domain=${encodeURIComponent(selVal)}`;
  }
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error();
    const txtBase64 = await r.text();
    const rawTxt = atob(txtBase64.trim());
    const blob = new Blob([rawTxt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `MeyREN-Sub-${selVal || 'all'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(lang === 'fa' ? 'فایل اشتراک دانلود شد' : 'Subscription downloaded');
  } catch (e) {
    toast(lang === 'fa' ? 'خطا در دانلود اشتراک' : 'Error downloading subscription', true);
  }
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
  const isDark = (theme === 'dark');
  const tickColor = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.55)';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';

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
        x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, callback: v => v + ' MB' }, beginAtZero: true }
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
  const isDark = (theme === 'dark');
  const borderColor = isDark ? 'rgba(15, 16, 33, 0.8)' : 'rgba(255, 255, 255, 0.95)';

  consumersChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: ['#00f2fe', '#38bdf8', '#818cf8', '#a855f7', '#d946ef'],
        borderWidth: 2,
        borderColor: borderColor
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
  const isDark = (theme === 'dark');

  if (!sorted.length) {
    consumersChart.data.labels = ['No traffic'];
    consumersChart.data.datasets[0].data = [1];
    consumersChart.data.datasets[0].backgroundColor = [isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'];
    consumersChart.update();
    if (listEl) listEl.innerHTML = `<div style="font-size:11px;color:var(--text3);text-align:center;padding:12px" data-en="No traffic data yet" data-fa="هنوز داده‌ای ثبت نشده است">${lang === 'fa' ? 'هنوز داده‌ای ثبت نشده است' : 'No traffic data yet'}</div>`;
    return;
  }

  const labels = sorted.map(l => l.label);
  const data = sorted.map(l => +(l.used_bytes / (1024 * 1024)).toFixed(1));
  const colors = ['#00f2fe', '#38bdf8', '#818cf8', '#a855f7', '#d946ef'];

  consumersChart.data.labels = labels;
  consumersChart.data.datasets[0].data = data;
  consumersChart.data.datasets[0].backgroundColor = colors.slice(0, sorted.length);
  consumersChart.update();

  if (countEl) countEl.textContent = lang === 'fa' ? `${sorted.length} کاربر برتر` : `Top ${sorted.length}`;

  if (listEl) {
    listEl.innerHTML = sorted.map((l, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;padding:3px 0">
        <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
          <span style="width:8px;height:8px;border-radius:50%;background:${colors[i]};flex-shrink:0"></span>
          <span style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${l.label}</span>
        </div>
        <span class="bidi-safe" style="color:var(--text2);font-weight:600"><bdi>${fmtBytes(l.used_bytes)}</bdi></span>
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

$('#security-form')?.addEventListener('submit', (e) => { e.preventDefault(); changePassword(); });
$('#add-inbound-form')?.addEventListener('submit', (e) => { e.preventDefault(); createLink(); });
$('#edit-inbound-form')?.addEventListener('submit', (e) => { e.preventDefault(); saveEdit(); });

$('#btn-create-link')?.addEventListener('click', createLink);
$('#btn-save-edit')?.addEventListener('click', saveEdit);
$('#btn-update-pw')?.addEventListener('click', changePassword);

$('#add-modal-close')?.addEventListener('click', () => $('#add-modal').close());
$('#edit-modal-close')?.addEventListener('click', () => $('#edit-modal').close());
$('#sub-modal-close')?.addEventListener('click', () => $('#sub-modal').close());
$('#detail-modal-close')?.addEventListener('click', () => $('#detail-modal').close());
$('#qr-modal-close')?.addEventListener('click', () => $('#qr-modal').close());
$('#restore-modal-close')?.addEventListener('click', () => $('#restore-modal').close());

// Backdrop click closes dialog
$$('.modal-dialog').forEach(dlg => {
  dlg.addEventListener('click', e => {
    const rect = dlg.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) dlg.close();
  });
});

// File upload dropzone handler
const restoreDropzone = $('#restore-dropzone');
const restoreFileInput = $('#restore-file-input');
const restoreFileName = $('#restore-file-name');

if (restoreDropzone && restoreFileInput) {
  restoreDropzone.addEventListener('click', () => restoreFileInput.click());
  restoreFileInput.addEventListener('change', () => {
    if (restoreFileInput.files && restoreFileInput.files[0]) {
      restoreFileName.textContent = restoreFileInput.files[0].name;
    }
  });
  restoreDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    restoreDropzone.style.borderColor = 'var(--neon-blue)';
  });
  restoreDropzone.addEventListener('dragleave', () => {
    restoreDropzone.style.borderColor = '';
  });
  restoreDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    restoreDropzone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      restoreFileInput.files = e.dataTransfer.files;
      restoreFileName.textContent = e.dataTransfer.files[0].name;
    }
  });
}

function openDomainsModal() {
  renderDomainList();
  $('#domains-modal').showModal();
}

$('#btn-domains-modal')?.addEventListener('click', openDomainsModal);
$('#stat-domain-card')?.addEventListener('click', openDomainsModal);
$('#btn-add-modal-manage-domains')?.addEventListener('click', openDomainsModal);
$('#btn-edit-modal-manage-domains')?.addEventListener('click', openDomainsModal);
$('#btn-sub-modal-manage-domains')?.addEventListener('click', openDomainsModal);
$('#domains-modal-close')?.addEventListener('click', () => $('#domains-modal').close());
$('#btn-add-custom-domain')?.addEventListener('click', addCustomDomain);
$('#new-custom-domain-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustomDomain(); });
$('#sub-domain-select')?.addEventListener('change', updateSubUrl);

$('#btn-download-qr')?.addEventListener('click', downloadQR);
$('#btn-close-qr')?.addEventListener('click', () => $('#qr-modal').close());
$('#btn-copy-sub')?.addEventListener('click', function() { copyLinkText($('#sub-url-box').textContent, this); });
$('#btn-qr-sub')?.addEventListener('click', () => showQRText($('#sub-url-box').textContent, 'Subscription QR'));
$('#btn-open-sub-txt')?.addEventListener('click', downloadSubTxt);

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

loadDomains();
loadStats();
loadLinks();
setInterval(loadStats, 10000);