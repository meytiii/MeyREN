let lang=localStorage.getItem('ren_lang')||'en';
let theme=localStorage.getItem('ren_theme')||'dark';
let allLinks=[];let currentFilter='all';let statsData={};let trafficChart=null;

function setLang(l){lang=l;document.getElementById('lang-en').classList.toggle('active',l==='en');document.getElementById('lang-fa').classList.toggle('active',l==='fa');document.body.dir=l==='fa'?'rtl':'ltr';document.querySelectorAll('[data-en]').forEach(el=>{const v=el.getAttribute('data-'+l);if(v)el.textContent=v});localStorage.setItem('ren_lang',l)}
function applyTheme(t){theme=t;document.documentElement.setAttribute('data-theme',t);localStorage.setItem('ren_theme',t);const btn=$('#theme-btn');if(btn)btn.innerHTML=t==='dark'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'}
function toggleTheme(){applyTheme(theme==='dark'?'light':'dark')}
function showAddModal(){$('#add-modal').showModal()}
function setFilter(f,el){currentFilter=f;document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');filterInbounds()}
function filterInbounds(){const q=($('#inbound-search')?.value||'').toLowerCase();let filtered=allLinks;if(currentFilter==='active')filtered=filtered.filter(l=>l.active);if(currentFilter==='disabled')filtered=filtered.filter(l=>!l.active);if(q)filtered=filtered.filter(l=>l.label.toLowerCase().includes(q)||l.uuid.toLowerCase().includes(q));renderLinks(filtered)}
function fmtBytes(b){return b>1073741824?(b/1073741824).toFixed(2)+' GB':b>1048576?(b/1048576).toFixed(2)+' MB':(b/1024).toFixed(1)+' KB'}
function fmtLimit(b){if(b===0)return'Unlimited';const gb=b/1073741824;return(gb%1===0?gb.toFixed(0):gb.toFixed(1))+' GB'}

const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
$$('.nav-item').forEach(el=>el.addEventListener('click',()=>switchPage(el.dataset.page)));
function switchPage(id){$$('.page').forEach(p=>p.classList.remove('active'));$(`#page-${id}`)?.classList.add('active');$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===id));$('#sidebar').classList.remove('open');$('#sidebar-overlay').classList.remove('show')}
function toast(msg,err=false){const t=$('#toast');t.textContent=msg;t.className='toast'+(err?' error':'')+' show';setTimeout(()=>t.classList.remove('show'),3000)}

async function loadStats(){
  try{
    const r=await fetch('/stats');if(!r.ok)throw new Error();statsData=await r.json();
    $('#s-traffic').innerHTML=statsData.total_traffic_mb+'<span class="stat-unit"> MB</span>';
    $('#s-links').textContent=statsData.links_count;
    $('#s-uptime').textContent=statsData.uptime;
    $('#s-domain').textContent=statsData.domain;
    $('#links-badge').textContent=statsData.links_count;
    $('#last-update').textContent=(lang==='fa'?'Last update: ':'Updated: ')+new Date().toLocaleTimeString(lang==='fa'?'fa-IR':'en-US');
    if($('#t-traffic'))$('#t-traffic').textContent=statsData.total_traffic_mb+' MB';
    if($('#t-reqs'))$('#t-reqs').textContent=statsData.total_requests.toLocaleString();
    if($('#t-uptime'))$('#t-uptime').textContent=statsData.uptime;
    if(statsData.cpu_percent!==undefined){const c=statsData.cpu_percent;const cc=c>80?'var(--red)':c>50?'var(--yellow)':'var(--primary)';$('#s-cpu-val').textContent=c.toFixed(1)+'%';$('#s-cpu-val').style.color=cc;$('#s-cpu-bar').style.width=c+'%';$('#s-cpu-bar').style.background=cc}
    if(statsData.memory_percent!==undefined){const m=statsData.memory_percent;const mc=m>80?'var(--red)':m>50?'var(--yellow)':'var(--green)';$('#s-mem-val').textContent=m.toFixed(1)+'%';$('#s-mem-val').style.color=mc;$('#s-mem-bar').style.width=m+'%';$('#s-mem-bar').style.background=mc}
    updateChart();
  }catch(e){}
}

async function loadLinks(){try{const r=await fetch('/api/links');if(!r.ok)throw new Error();const d=await r.json();allLinks=d.links||[];filterInbounds();}catch(e){}}

function renderLinks(links){
  const tbody=$('#links-tbody');const empty=$('#links-empty');const cards=$('#inbound-cards');
  tbody.textContent=''; cards.textContent='';
  if(!links.length){empty.style.display='block';return;}
  empty.style.display='none';
  
  const rowTpl=$('#tpl-inbound-row').content;
  const cardTpl=$('#tpl-inbound-card').content;
  const fragTable=document.createDocumentFragment();
  const fragCards=document.createDocumentFragment();
  let idx=links.length;
  
  links.forEach(l=>{
    const u=l.used_bytes,lim=l.limit_bytes;
    const uF=fmtBytes(u);const lF=fmtLimit(lim);
    const pct=lim>0?Math.min(100,(u/lim)*100):0;
    const col=pct>90?'var(--red)':pct>70?'var(--yellow)':'var(--primary)';
    const i=idx--;
    
    const row = document.importNode(rowTpl, true);
    row.querySelector('.col-id').textContent = i;
    row.querySelector('.col-name').textContent = l.label;
    row.querySelector('.col-used').textContent = uF;
    row.querySelector('.col-limit').textContent = lF;
    row.querySelector('.col-fill').style.width = pct + '%';
    row.querySelector('.col-fill').style.background = col;
    const rStatus = row.querySelector('.col-status');
    rStatus.textContent = l.active ? 'On' : 'Off';
    rStatus.className = 'col-status tag ' + (l.active ? 'tag-active' : 'tag-disabled');
    const rToggle = row.querySelector('.act-toggle');
    rToggle.className = 'act-toggle toggle ' + (l.active ? 'on' : '');
    rToggle.dataset.uid = l.uuid;
    rToggle.onclick = function() { toggleLink(this); };
    row.querySelector('.act-info').onclick = function() { showDetail(l.uuid); };
    row.querySelector('.act-copy').onclick = function() { copyLinkText(l.vless_link); };
    row.querySelector('.act-qr').onclick = function() { showQRText(l.vless_link); };
    row.querySelector('.act-del').onclick = function() { deleteLink(l.uuid); };
    fragTable.appendChild(row);
    
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
    card.querySelector('.act-info').onclick = function() { showDetail(l.uuid); };
    card.querySelector('.act-copy').onclick = function() { copyLinkText(l.vless_link); };
    card.querySelector('.act-qr').onclick = function() { showQRText(l.vless_link); };
    card.querySelector('.act-reset').onclick = function() { resetUsage(l.uuid); };
    card.querySelector('.act-del').onclick = function() { deleteLink(l.uuid); };
    fragCards.appendChild(card);
  });
  
  tbody.appendChild(fragTable);
  cards.appendChild(fragCards);
}

function showDetail(uid){
  const l=allLinks.find(x=>x.uuid===uid);if(!l)return;
  const u=l.used_bytes,lim=l.limit_bytes;const uF=fmtBytes(u);const lF=fmtLimit(lim);
  const pct=lim>0?Math.min(100,(u/lim)*100):0;const col=pct>90?'var(--red)':pct>70?'var(--yellow)':'var(--primary)';
  const created=l.created_at?new Date(l.created_at).toLocaleString(lang==='fa'?'fa-IR':'en-US'):'--';
  
  $('#detail-title').textContent=l.label;
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
  
  $('#det-act-copy').onclick = function() { copyLinkText(l.vless_link); $('#detail-modal').close(); };
  $('#det-act-qr').onclick = function() { showQRText(l.vless_link); $('#detail-modal').close(); };
  $('#det-act-reset').onclick = function() { resetUsage(l.uuid); $('#detail-modal').close(); };
  
  $('#detail-modal').showModal();
}

async function toggleLink(el){
  const uid=el.dataset.uid;
  const link=allLinks.find(l=>l.uuid===uid);
  if(!link)return;
  const newActive=!link.active;
  try{
    await fetch(`/api/links/${uid}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:newActive})});
    link.active=newActive;
    filterInbounds();
    loadStats();
  }catch(e){}
}

async function quickCreate(limit,unit){
  const names=['Ali','Sara','Reza','Nima','Mina','Arash','Yalda','Dariush','Cyrus','Shirin'];
  const name=names[Math.floor(Math.random()*names.length)]+'-'+Math.floor(Math.random()*100);
  try{const r=await fetch('/api/links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:name,limit_value:limit,limit_unit:unit})});if(!r.ok)throw new Error();toast('Created: '+name);await loadLinks();await loadStats();}catch(e){toast('Error',true)}
}

async function createLink(){
  const label=$('#new-label').value.trim()||'New Link';const val=parseFloat($('#new-limit').value)||0;const unit='GB';
  if(!/^[a-zA-Z0-9\-_. ]+$/.test(label)){toast('Only English letters allowed',true);return;}
  try{const r=await fetch('/api/links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label,limit_value:val,limit_unit:unit})});if(!r.ok)throw new Error();toast('Created');$('#new-label').value='';$('#new-limit').value='';$('#add-modal').close();await loadLinks();await loadStats();}catch(e){toast('Error',true)}
}

async function resetUsage(uid){try{await fetch(`/api/links/${uid}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset_usage:true})});toast('Reset');await loadLinks();}catch(e){}}
async function deleteLink(uid){if(!confirm('Delete this inbound?'))return;try{await fetch(`/api/links/${uid}`,{method:'DELETE'});toast('Deleted');await loadLinks();await loadStats();}catch(e){}}

function copyLinkText(txt){navigator.clipboard.writeText(txt).then(()=>toast('Copied to clipboard')).catch(()=>toast('Failed to copy',true))}
function showQRText(txt){if(!txt)return;const box=document.querySelector('.qr-box');box.classList.remove('animate-in','animate-glow');$('#qr-img').src='https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(txt);$('#qr-modal').showModal();requestAnimationFrame(()=>{box.classList.add('animate-in');setTimeout(()=>box.classList.add('animate-glow'),500)})}
function downloadQR(){const img=$('#qr-img');if(!img.src)return;const a=document.createElement('a');a.href=img.src;a.download='ren-qr.png';a.click()}

async function changePassword(){
  const cur=$('#cur-pw').value;const nw=$('#new-pw').value;
  if(!cur||!nw){toast('Fill all fields',true);return;}
  try{const r=await fetch('/api/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_password:cur,new_password:nw})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||'Error');}toast('Updated');$('#cur-pw').value='';$('#new-pw').value='';}catch(e){toast(e.message,true)}
}

applyTheme(theme);setLang(lang);
loadStats();loadLinks();
setInterval(()=>{loadStats()},10000);

let chartLabels=[];let chartData=[];
function initChart(){
  const ctx=document.getElementById('trafficChart');if(!ctx)return;
  trafficChart=new Chart(ctx,{type:'bar',data:{labels:[],datasets:[{label:'MB',data:[],backgroundColor:'rgba(220,38,38,0.7)',borderColor:'#dc2626',borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'rgba(255,255,255,0.3)',font:{size:10}}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},callback:v=>v+' MB'},beginAtZero:true}}}});
}
initChart();
function updateChart(){
  if(!trafficChart||!statsData.hourly_traffic)return;
  const ht=statsData.hourly_traffic;
  const sorted=Object.entries(ht).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
  const labels=sorted.map(e=>e[0]);
  const data=sorted.map(e=>Math.round(e[1]/1048576));
  trafficChart.data.labels=labels;trafficChart.data.datasets[0].data=data;
  trafficChart.update();
}
$('#menu-toggle-btn').addEventListener('click', () => { $('#sidebar').classList.toggle('open'); $('#sidebar-overlay').classList.toggle('show'); });
$('#sidebar-overlay').addEventListener('click', function() { $('#sidebar').classList.remove('open'); this.classList.remove('show'); });
$('#theme-btn').addEventListener('click', toggleTheme);
$('#lang-en').addEventListener('click', () => setLang('en'));
$('#lang-fa').addEventListener('click', () => setLang('fa'));
$('#logout-btn').addEventListener('click', () => { fetch('/api/logout',{method:'POST'}).then(()=>location.href='/login'); });

$('#btn-quick-half').addEventListener('click', () => quickCreate(0.5,'GB'));
$('#btn-quick-full').addEventListener('click', () => quickCreate(1,'GB'));
$('#btn-add-modal').addEventListener('click', () => $('#add-modal').showModal());
$('#inbound-search').addEventListener('input', filterInbounds);

$('#filter-all').addEventListener('click', function() { setFilter('all', this); });
$('#filter-active').addEventListener('click', function() { setFilter('active', this); });
$('#filter-disabled').addEventListener('click', function() { setFilter('disabled', this); });

$('#btn-update-pw').addEventListener('click', changePassword);

$('#add-modal-close').addEventListener('click', () => $('#add-modal').close());
$('#btn-create-link').addEventListener('click', createLink);
$('#add-modal').addEventListener('click', function(e) { if(e.target === this) this.close(); });

$('#detail-modal-close').addEventListener('click', () => $('#detail-modal').close());
$('#detail-modal').addEventListener('click', function(e) { if(e.target === this) this.close(); });

$('#qr-modal-close').addEventListener('click', () => $('#qr-modal').close());
$('#btn-download-qr').addEventListener('click', downloadQR);
$('#btn-close-qr').addEventListener('click', () => $('#qr-modal').close());
$('#qr-modal').addEventListener('click', function(e) { if(e.target === this) this.close(); });