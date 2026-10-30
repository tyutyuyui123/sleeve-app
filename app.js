(function(){
'use strict';
// ---- data: bundled snapshot / localStorage cache + delta sync from Firestore (public read, REST) ----
// Local store = {at, rows}. `at` = newest server updatedAt seen (never the device clock).
// Each launch asks Firestore only for records with updatedAt > at (1 read if nothing changed).
var FS_PROJECT = 'sleeve-app-b369e0', FS_KEY = 'AIzaSyAEVVx1_tifxb23JifyUPcXTTji1Z2di7E';
var FS_URL = window.SLEEVE_FS_URL || ('https://firestore.googleapis.com/v1/projects/' + FS_PROJECT + '/databases/(default)/documents');
var CACHE_KEY = 'sleeve.sync.v2';
var FIELDS = ['name', 'sleeves', 'players', 'age', 'time', 'accessories', 'notes', 'sourceRow'];
try { localStorage.removeItem('sleeve.records.v1'); } catch (e) {}   // TEST 4 cache format
var SOURCE = 'bundled', store = {at: '', map: {}};
function loadStore(){
  try {
    var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.at && c.rows && c.rows.length) { SOURCE = 'cache'; return c; }
  } catch (e) {}
  var b = window.SLEEVE_RECORDS;
  SOURCE = 'bundled';
  return b && b.rows ? {at: b.at || '', rows: b.rows} : {at: '', rows: []};
}
function toRecs(map){
  var out = [];
  for (var id in map) { var a = map[id], o = {}; for (var i = 0; i < FIELDS.length; i++) o[FIELDS[i]] = a[i + 1]; out.push(o); }
  return out;
}
// RFC3339 with 0/3/6/9 fraction digits -> comparable string
function tsKey(t){ var m = /^(.*?)(?:\.(\d+))?Z$/.exec(t || ''); return m ? m[1] + '.' + ((m[2] || '') + '000000000').slice(0, 9) : ''; }
var DATA = [];
(function(){
  var c = loadStore();
  store.at = c.at;
  for (var i = 0; i < c.rows.length; i++) store.map[c.rows[i][0]] = c.rows[i];
  try { DATA = SleeveParse.build(toRecs(store.map)); } catch (e) { DATA = []; }
})();
var q = document.getElementById('q'), pane = document.getElementById('pane'),
    clr = document.getElementById('clr'), track = document.getElementById('track'), thumb = document.getElementById('thumb');

function norm(s){
  s = String(s || '');
  if (s.normalize) s = s.normalize('NFKC');
  return s.toLowerCase().replace(/[\s\u00a0\u3000]+/g, '');
}
function addKeys(d){ for (var i = 0; i < d.length; i++) d[i].k = norm(d[i].n); return d; }
addKeys(DATA);

function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

var mode = 'list', listScroll = 0, lastResults = [];

function search(text){
  var k = norm(text);
  if (!k) return [];
  var pre = [], mid = [];
  for (var i = 0; i < DATA.length; i++){
    var p = DATA[i].k.indexOf(k);
    if (p === 0) pre.push(i); else if (p > 0) mid.push(i);
  }
  return pre.concat(mid);
}

function renderList(keepScroll){
  mode = 'list';
  var text = q.value;
  clr.hidden = !text;
  lastResults = search(text);
  var h = '';
  if (norm(text)){
    if (!lastResults.length) h = '<div class="empty">找不到符合的桌遊</div>';
    else {
      h = '<div class="count">共 ' + lastResults.length + ' 筆</div>';
      for (var j = 0; j < lastResults.length; j++){
        var g = DATA[lastResults[j]];
        h += '<div class="item" data-i="' + lastResults[j] + '">' + esc(g.n.replace(/\n/g, ' ')) + '</div>';
      }
    }
  }
  pane.innerHTML = h;
  pane.scrollTop = keepScroll ? listScroll : 0;
  updateBar();
}

function fmtAge(d){ return /^\d+$/.test(d) ? d + '+' : d; }
function fmtTime(e){ var t = e.replace(/\s+/g, ''); return /^\d+(-\d+)?$/.test(t) ? t + ' 分鐘' : e; }

function renderRec(r){
  var h = '<div class="sleeves">';
  var items = r.items || [];
  if (r.none) h += '<div class="sl none">無須牌套</div>';
  for (var i = 0; i < items.length; i++){
    var m = items[i][0], n = items[i][1];
    if (m) h += '<div class="sl">' + esc(m) + (n ? '<span class="note">' + esc(n) + '</span>' : '') + '</div>';
    else if (n) h += '<div class="sl onlynote">' + esc(n) + '</div>';
  }
  h += '</div>';
  var meta = [];
  if (r.c) meta.push('<b>人數</b> ' + esc(r.c));
  if (r.d) meta.push('<b>年齡</b> ' + esc(fmtAge(r.d)));
  if (r.e) meta.push('<b>時間</b> ' + esc(fmtTime(r.e)));
  if (meta.length) h += '<div class="meta">' + meta.join('<span class="sep">｜</span>') + '</div>';
  if (r.f) h += '<div class="blk"><b>額外附件</b>' + esc(r.f) + '</div>';
  if (r.g) h += '<div class="blk"><b>備註</b>' + esc(r.g) + '</div>';
  return h;
}

function showInfo(idx){
  listScroll = pane.scrollTop;
  mode = 'info';
  var g = DATA[idx];
  var h = '<div class="info"><div class="name">' + esc(g.n) + '</div>';
  if (g.r.length === 1) h += '<div class="rec">' + renderRec(g.r[0]) + '</div>';
  else for (var i = 0; i < g.r.length; i++)
    h += '<div class="rec"><div class="rech' + (i ? '' : ' first') + '">資料 ' + (i + 1) + ' / ' + g.r.length + '（表格第 ' + g.r[i].row + ' 列）</div>' + renderRec(g.r[i]) + '</div>';
  h += '</div>';
  pane.innerHTML = h;
  pane.scrollTop = 0;
  q.blur();
  try { window.getSelection().removeAllRanges(); } catch (e) {}
  updateBar();
}

// Only real user edits fire 'input'; we never change q.value programmatically while info is shown.
q.addEventListener('input', function(){ renderList(false); });
clr.addEventListener('click', function(){ q.value = ''; renderList(false); q.focus(); });
q.addEventListener('keydown', function(e){ if (e.key === 'Enter') q.blur(); });
pane.addEventListener('click', function(e){
  var t = e.target.closest ? e.target.closest('.item') : null;
  if (t) showInfo(+t.getAttribute('data-i'));
});

// Always-visible custom scrollbar (Android WebView hides native ones).
function updateBar(){
  var sh = pane.scrollHeight, ch = pane.clientHeight;
  if (sh <= ch + 2){ track.style.display = 'none'; return; }
  track.style.display = 'block';
  var th = track.clientHeight, size = Math.max(28, th * ch / sh);
  thumb.style.height = size + 'px';
  thumb.style.transform = 'translateY(' + ((th - size) * pane.scrollTop / (sh - ch)) + 'px)';
}
pane.addEventListener('scroll', updateBar, {passive: true});
window.addEventListener('resize', updateBar);

// Called by the Android activity on back press. Returns true if handled.
window.onBack = function(){
  if (mode === 'info'){ renderList(true); return true; }
  return false;
};
function fsVal(v){
  if (!v) return '';
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('booleanValue' in v) return v.booleanValue;
  return '';
}
function req(url, body){
  var opt = body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {};
  opt.cache = 'no-store';
  return fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'key=' + FS_KEY, opt).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  });
}
function setData(d, src){
  DATA = addKeys(d); SOURCE = src;
  window.__test.data = DATA; window.__test.source = SOURCE;
  if (mode === 'list'){ var st = pane.scrollTop; renderList(false); pane.scrollTop = st; updateBar(); }  // info view stays; back re-searches new data
}
// Background delta sync on every launch. Cost = number of changed/added/deleted records (min 1 read).
// Without any `at` (no cache and no bundled snapshot) it downloads everything once.
function refresh(){
  if (!window.fetch || !window.SleeveParse) return;
  window.__test.refresh = 'checking';
  var sq = {from: [{collectionId: 'records'}],
    select: {fields: FIELDS.concat(['deleted', 'updatedAt']).map(function(f){ return {fieldPath: f}; })}};
  var full = !store.at;
  if (!full){
    sq.where = {fieldFilter: {field: {fieldPath: 'updatedAt'}, op: 'GREATER_THAN', value: {timestampValue: store.at}}};
    sq.orderBy = [{field: {fieldPath: 'updatedAt'}, direction: 'ASCENDING'}];
  }
  req(FS_URL + ':runQuery', {structuredQuery: sq}).then(function(res){
    var map = full ? {} : store.map, at = store.at, n = 0, changed = 0;
    for (var i = 0; i < res.length; i++){
      var doc = res[i].document; if (!doc) continue;
      n++;
      var id = doc.name.split('/').pop(), f = doc.fields || {}, up = fsVal(f.updatedAt);
      if (up && tsKey(up) > tsKey(at)) at = up;
      if (fsVal(f.deleted) === true){ if (map[id]) { delete map[id]; changed++; } continue; }
      var row = [id];
      for (var j = 0; j < FIELDS.length; j++) row.push(fsVal(f[FIELDS[j]]));
      map[id] = row; changed++;
    }
    window.__test.docsRead = n;
    if (full && !changed) throw new Error('empty');
    var atChanged = at !== store.at;
    store.map = map; store.at = at;
    if (changed || atChanged || SOURCE === 'bundled'){
      var rows = []; for (var k in map) rows.push(map[k]);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({at: at, rows: rows})); } catch (e) {}
    }
    if (changed){ setData(SleeveParse.build(toRecs(map)), 'firestore'); window.__test.refresh = 'updated: ' + n + ' docs'; }
    else window.__test.refresh = 'up-to-date';
    window.__test.at = store.at;
  }).catch(function(e){ window.__test.refresh = 'offline: ' + e.message; });
}
window.__test = {showInfo: showInfo, search: search, data: DATA, source: SOURCE};
renderList(false);
refresh();
})();
