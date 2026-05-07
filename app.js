// エンジフェア デジタルマップ（オフライン対応）
// - 事前にチェックしたブースは localStorage に保存
// - 地図上に丸マーク（座標は booths.json の x,y で指定）
// - ルートは routes.json の polyline（％座標）を描画

const STORAGE_KEY = 'engi_fair_selected_v1';

const elList = document.getElementById('list');
const elQ = document.getElementById('q');
const elOnlySelected = document.getElementById('onlySelected');
const elMap = document.getElementById('mapImg');
const elOverlay = document.getElementById('overlay');
const marksLayer = document.getElementById('marksLayer');
const routesLayer = document.getElementById('routesLayer');
const offlineHint = document.getElementById('offlineHint');

const modal = document.getElementById('modal');
const btnHelp = document.getElementById('btnHelp');
const btnClose = document.getElementById('btnClose');
const btnClear = document.getElementById('btnClear');

// Edit mode UI
const isEdit = new URLSearchParams(location.search).get('edit') === '1';
const editBox = document.getElementById('editBox');
const editBooth = document.getElementById('editBooth');
const btnSetPoint = document.getElementById('btnSetPoint');
const btnRouteAdd = document.getElementById('btnRouteAdd');
const btnRouteUndo = document.getElementById('btnRouteUndo');
const btnCopyJson = document.getElementById('btnCopyJson');

let booths = [];
let routes = {};
let selected = loadSelected();

// Edit state
let pendingSetPoint = false;
let addingRoute = false;

function loadSelected(){
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveSelected(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));
}

function isOffline(){
  return typeof navigator.onLine === 'boolean' ? !navigator.onLine : false;
}

function showOfflineHint(){
  offlineHint.hidden = !isOffline();
}

async function loadData(){
  booths = await (await fetch('./booths.json', {cache:'no-store'})).json();
  routes = await (await fetch('./routes.json', {cache:'no-store'})).json();
}

function normalize(str){
  return (str || '').toString().toLowerCase();
}

function renderList(){
  const q = normalize(elQ.value);
  const onlySel = elOnlySelected.checked;

  const rows = booths.filter(b => {
    const inSel = selected.has(b.id);
    if (onlySel && !inSel) return false;
    if (!q) return true;
    return normalize(b.label).includes(q) || normalize(b.area).includes(q) || normalize(b.id).includes(q);
  });

  elList.innerHTML = '';
  for (const b of rows){
    const wrap = document.createElement('label');
    wrap.className = 'item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(b.id);
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(b.id); else selected.delete(b.id);
      saveSelected();
      renderMarksAndRoutes();
      if (elOnlySelected.checked) renderList();
    });

    const meta = document.createElement('div');
    meta.innerHTML = `<div>${escapeHtml(b.label)}</div><small>${escapeHtml(b.area)} / ID:${b.id}</small>`;

    wrap.appendChild(cb);
    wrap.appendChild(meta);
    elList.appendChild(wrap);
  }
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',''':'&#39;'}[c]));
}

// Convert percent coords (0..1) to overlay viewBox coords (0..1000)
function p2v(p){
  return { x: Math.round(p.x * 1000), y: Math.round(p.y * 1000) };
}

function clearLayers(){
  marksLayer.innerHTML = '';
  routesLayer.innerHTML = '';
}

function renderMarksAndRoutes(){
  clearLayers();

  for (const id of selected){
    const b = booths.find(x => x.id === id);
    if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') continue;

    const v = p2v({x:b.x, y:b.y});

    // mark fill + ring
    const fill = document.createElementNS('http://www.w3.org/2000/svg','circle');
    fill.setAttribute('cx', v.x);
    fill.setAttribute('cy', v.y);
    fill.setAttribute('r', 26);
    fill.setAttribute('class','markFill');

    const ring = document.createElementNS('http://www.w3.org/2000/svg','circle');
    ring.setAttribute('cx', v.x);
    ring.setAttribute('cy', v.y);
    ring.setAttribute('r', 30);
    ring.setAttribute('class','mark');

    marksLayer.appendChild(fill);
    marksLayer.appendChild(ring);

    // route (optional)
    const pts = routes[id];
    if (Array.isArray(pts) && pts.length >= 2){
      const d = pts.map(p => {
        const vv = p2v(p);
        return `${vv.x},${vv.y}`;
      }).join(' ');
      const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
      poly.setAttribute('points', d);
      poly.setAttribute('class','route');
      routesLayer.appendChild(poly);
    }
  }
}

// --- Edit mode ---
function initEditMode(){
  if (!isEdit) return;
  editBox.hidden = false;

  // Populate select
  for (const b of booths){
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = `${b.id} ${b.label}`;
    editBooth.appendChild(opt);
  }

  btnSetPoint.addEventListener('click', () => {
    pendingSetPoint = true;
    addingRoute = false;
    toast('地図を1回タップして、このブースの位置を設定します');
  });

  btnRouteAdd.addEventListener('click', () => {
    addingRoute = !addingRoute;
    pendingSetPoint = false;
    toast(addingRoute ? 'ルート点追加：地図タップで点を追加します（終了はもう一度ボタン）' : 'ルート点追加を終了しました');
  });

  btnRouteUndo.addEventListener('click', () => {
    const id = editBooth.value;
    if (!Array.isArray(routes[id])) routes[id] = [];
    routes[id].pop();
    renderMarksAndRoutes();
  });

  btnCopyJson.addEventListener('click', async () => {
    const payload = {
      booths: booths.map(b => ({id:b.id, x:b.x, y:b.y})),
      routes
    };
    const txt = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(txt);
      toast('クリップボードにコピーしました');
    } catch {
      prompt('コピーしてください', txt);
    }
  });

  // Tap on map to set coord or add route point
  document.getElementById('stage').addEventListener('click', (e) => {
    const rect = elMap.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;

    const id = editBooth.value;

    if (pendingSetPoint){
      const b = booths.find(bb => bb.id === id);
      if (b){ b.x = +x.toFixed(4); b.y = +y.toFixed(4); }
      selected.add(id);
      saveSelected();
      pendingSetPoint = false;
      toast(`位置設定: ${id} x=${x.toFixed(4)} y=${y.toFixed(4)}`);
      renderList();
      renderMarksAndRoutes();
      return;
    }

    if (addingRoute){
      if (!Array.isArray(routes[id])) routes[id] = [];
      routes[id].push({x:+x.toFixed(4), y:+y.toFixed(4)});
      toast(`ルート点追加: ${id} (${x.toFixed(4)}, ${y.toFixed(4)})`);
      renderMarksAndRoutes();
    }
  });
}

function toast(msg){
  const t = document.createElement('div');
  t.style.position='fixed';
  t.style.left='50%';
  t.style.bottom='18px';
  t.style.transform='translateX(-50%)';
  t.style.background='rgba(0,0,0,.75)';
  t.style.color='white';
  t.style.padding='10px 12px';
  t.style.borderRadius='12px';
  t.style.zIndex='30';
  t.style.fontSize='13px';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1600);
}

// --- modal ---
btnHelp.addEventListener('click', () => { modal.hidden = false; });
btnClose.addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

btnClear.addEventListener('click', () => {
  selected = new Set();
  saveSelected();
  renderList();
  renderMarksAndRoutes();
});

elQ.addEventListener('input', renderList);
elOnlySelected.addEventListener('change', renderList);
window.addEventListener('online', showOfflineHint);
window.addEventListener('offline', showOfflineHint);

(async function main(){
  showOfflineHint();
  await loadData();
  renderList();
  renderMarksAndRoutes();
  initEditMode();
})();