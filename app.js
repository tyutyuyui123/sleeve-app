(function(){
'use strict';
// ---- data: bundled snapshot / localStorage cache + delta sync from Firestore (public read, REST) ----
// Local store = {at, rows}. `at` = newest server updatedAt seen (never the device clock).
// Each launch asks Firestore only for records with updatedAt > at (1 read if nothing changed).
var FS_PROJECT = 'sleeve-app-b369e0', FS_KEY = 'AIzaSyAEVVx1_tifxb23JifyUPcXTTji1Z2di7E';
var FS_URL = window.SLEEVE_FS_URL || ('https://firestore.googleapis.com/v1/projects/' + FS_PROJECT + '/databases/(default)/documents');
var CACHE_KEY = 'sleeve.sync.v3';   // v3 (TEST 7): rows carry barcodes; older caches are dropped and rebuilt from data.js
var FIELDS = ['name', 'sleeves', 'players', 'age', 'time', 'accessories', 'notes', 'sourceRow', 'barcodes'];
try { localStorage.removeItem('sleeve.records.v1'); localStorage.removeItem('sleeve.sync.v2'); } catch (e) {}   // older cache formats
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
  for (var id in map) { var a = map[id], o = {}; o.id = id; for (var i = 0; i < FIELDS.length; i++) o[FIELDS[i]] = a[i + 1]; out.push(o); }
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

var codeView = null;   // {code, idxs}: result of the last scan, shown while the search box is empty
function renderList(keepScroll){
  mode = 'list';
  var text = q.value;
  clr.hidden = !text;
  lastResults = search(text);
  var h = '';
  if (codeView && !norm(text)){
    lastResults = codeView.idxs;
    if (!lastResults.length) h = '<div class="empty">查無此條碼：' + esc(codeView.code) + '</div>';
    else {
      h = '<div class="count">條碼 ' + esc(codeView.code) + ' 共 ' + lastResults.length + ' 筆</div>';
      for (var j0 = 0; j0 < lastResults.length; j0++)
        h += '<div class="item" data-i="' + lastResults[j0] + '">' + esc(DATA[lastResults[j0]].n.replace(/\n/g, ' ')) + '</div>';
    }
  }
  else if (norm(text)){
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
  var h = '';
  var items = r.items || [];
  // Empty 牌套 cell -> no sleeve box at all (not 無須牌套).
  if (r.none || items.length) h += '<div class="sleeves">';
  if (r.none) h += '<div class="sl none">無須牌套</div>';
  for (var i = 0; i < items.length; i++){
    var m = items[i][0], n = items[i][1];
    if (m) h += '<div class="sl">' + esc(m) + (n ? '<span class="note">' + esc(n) + '</span>' : '') + '</div>';
    else if (n) h += '<div class="sl onlynote">' + esc(n) + '</div>';
  }
  if (r.none || items.length) h += '</div>';
  var meta = [];
  if (r.c) meta.push('<b>人數</b> ' + esc(r.c));
  if (r.d) meta.push('<b>年齡</b> ' + esc(fmtAge(r.d)));
  if (r.e) meta.push('<b>時間</b> ' + esc(fmtTime(r.e)));
  if (meta.length) h += '<div class="meta">' + meta.join('<span class="sep">｜</span>') + '</div>';
  if (r.f) h += '<div class="blk"><b>額外附件</b>' + esc(r.f) + '</div>';
  if (r.g) h += '<div class="blk"><b>備註</b>' + esc(r.g) + '</div>';
  return h;
}

var infoIdx = -1;
function showInfo(idx, keepListScroll){
  if (!keepListScroll && mode === 'list') listScroll = pane.scrollTop;
  mode = 'info'; infoIdx = idx;
  var g = DATA[idx];
  var h = '<div class="info"><div class="name">' + esc(g.n) + '</div>';
  if (g.r.length === 1) h += '<div class="rec">' + renderRec(g.r[0]) + actsHtml(g.r[0]) + '</div>';
  else for (var i = 0; i < g.r.length; i++)
    h += '<div class="rec"><div class="rech' + (i ? '' : ' first') + '">資料 ' + (i + 1) + ' / ' + g.r.length + (g.r[i].row < 100000 ? '（表格第 ' + g.r[i].row + ' 列）' : '') + '</div>' + renderRec(g.r[i]) + actsHtml(g.r[i]) + '</div>';
  h += '</div>';
  pane.innerHTML = h;
  pane.scrollTop = 0;
  q.blur();
  try { window.getSelection().removeAllRanges(); } catch (e) {}
  updateBar();
}

// Only real user edits fire 'input'; we never change q.value programmatically while info is shown.
q.addEventListener('input', function(){ codeView = null; renderList(false); });
clr.addEventListener('click', function(){ q.value = ''; codeView = null; renderList(false); q.focus(); });
q.addEventListener('keydown', function(e){ if (e.key === 'Enter') q.blur(); });
pane.addEventListener('click', function(e){
  var t = e.target.closest ? e.target.closest('.item') : null;
  if (t) { showInfo(+t.getAttribute('data-i')); return; }
  var b = e.target.closest ? e.target.closest('[data-act]') : null;
  if (b && auth) { if (b.getAttribute('data-act') === 'edit') openEdit(b.getAttribute('data-id')); else askDelete(b.getAttribute('data-id')); }
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
  if (dialogOpen()){ dialogAnswer(document.querySelector('#sdlg [data-d=no]') ? 'no' : 'ok'); return true; }
  if (scanEl && !scanEl.hidden){ closeScanner(); return true; }
  if (!modal.hidden){ closeModal(); return true; }
  if (!scr.hidden){ closeScreen(); return true; }
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
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsVal);
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
  if (codeView) codeView.idxs = findCode(codeView.code);   // indexes changed
  window.__test.data = DATA; window.__test.source = SOURCE;
  if (mode === 'list'){ var st = pane.scrollTop; renderList(false); pane.scrollTop = st; updateBar(); }  // info view stays; back re-searches new data
}
// Background delta sync on every launch. Cost = number of changed/added/deleted records (min 1 read).
// Without any `at` (no cache and no bundled snapshot) it downloads everything once.
function refresh(){
  if (!window.fetch || !window.SleeveParse) return Promise.resolve();
  window.__test.refresh = 'checking';
  var sq = {from: [{collectionId: 'records'}],
    select: {fields: FIELDS.concat(['deleted', 'updatedAt']).map(function(f){ return {fieldPath: f}; })}};
  var full = !store.at;
  if (!full){
    sq.where = {fieldFilter: {field: {fieldPath: 'updatedAt'}, op: 'GREATER_THAN', value: {timestampValue: store.at}}};
    sq.orderBy = [{field: {fieldPath: 'updatedAt'}, direction: 'ASCENDING'}];
  }
  return req(FS_URL + ':runQuery', {structuredQuery: sq}).then(function(res){
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
// ---- TEST 6: accounts + editing. Every write goes through Cloud Functions, which check the codes
// server-side; the codes are never in this file. Session token kept in localStorage.
var FN_URL = window.SLEEVE_FN_URL || 'https://asia-east1-sleeve-app-b369e0.cloudfunctions.net/';
var AUTH_KEY = 'sleeve.auth.v1', auth = null;
try { auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); if (!auth || !auth.token) auth = null; } catch (e) { auth = null; }
var authEl = document.getElementById('auth'), scr = document.getElementById('scr'), modal = document.getElementById('modal'),
    mcode = document.getElementById('mcode'), mok = document.getElementById('mok');
function setAuth(a){
  auth = a;
  try { if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); } catch (e) {}
  renderAuth();
  if (mode === 'info' && infoIdx >= 0 && DATA[infoIdx]) { var st = pane.scrollTop; showInfo(infoIdx, true); pane.scrollTop = st; updateBar(); }
}
function renderAuth(){
  authEl.innerHTML = auth
    ? '<span class="nick">' + esc(auth.nickname) + '</span>' + SCAN_BTN + '<button class="btn" type="button" data-a="logout">登出</button><button class="btn pri" type="button" data-a="add">新增</button>'
    : SCAN_BTN + '<button class="btn" type="button" data-a="register">註冊</button><button class="btn pri" type="button" data-a="login">登入</button>';
}
authEl.addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('[data-a]') : null; if (!b) return;
  var a = b.getAttribute('data-a');
  if (a === 'scan') openScanner();
  else if (a === 'register') openRegister(); else if (a === 'login') openLogin(); else if (a === 'add') openEdit(null);
  else if (a === 'logout') { var t = auth && auth.token; setAuth(null); if (t) callFn('logout', {token: t}).catch(function(){}); }
});
function actsHtml(r){
  return auth && r.id ? '<div class="acts"><button class="btn" type="button" data-act="edit" data-id="' + esc(r.id) + '">更改</button>' +
    '<button class="btn dng" type="button" data-act="del" data-id="' + esc(r.id) + '">刪除</button></div>' : '';
}
// Callable protocol over plain fetch: POST {data} -> {result} | {error:{status,message}}
function callFn(name, data){
  return fetch(FN_URL + name, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({data: data}), cache: 'no-store'})
    .then(function(r){ return r.json().catch(function(){ return {error: {status: 'HTTP', message: 'http-' + r.status}}; }); },
          function(){ return {error: {status: 'NETWORK', message: 'network'}}; })
    .then(function(j){
      if (j && j.error){ var e = new Error(j.error.message || j.error.status); e.status = j.error.status; throw e; }
      return j ? j.result : null;
    });
}
function errText(e){
  var m = e && e.message || '';
  if (m === 'network' || /^http-/.test(m)) return '連線失敗，請檢查網路後再試';
  if (m === 'too-many-attempts') return '嘗試次數過多，請 15 分鐘後再試';
  if (m === 'login-required') return '登入已失效，請重新登入';
  if (m === 'not-found') return '這筆資料已不存在';
  if (m === 'name-required') return '請輸入遊戲名稱';
  if (m === 'bad-barcode') return '條碼號碼只能是 8–14 位數字';
  if (m === 'too-many-barcodes') return '條碼號碼最多 ' + MAX_CODES + ' 個';
  if (/^too-long:/.test(m)) return '「' + LABELS[m.slice(9)] + '」太長了';
  return '操作失敗，請稍後再試';
}
// ---- full-screen form screens ----
var screenKind = '';
function openScreen(kind, html){
  screenKind = kind; scr.innerHTML = html; scr.hidden = false; scr.scrollTop = 0;
  q.blur();
}
function closeScreen(){
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  scr.hidden = true; scr.innerHTML = ''; screenKind = ''; closeModal();
}
function head(title){ return '<div class="shead"><button class="btn" type="button" data-s="back">退回</button><h2>' + title + '</h2></div>'; }
function fld(id, label, type, attrs, hint){
  var inp = type === 'textarea' ? '<textarea id="' + id + '" ' + (attrs || '') + '></textarea>'
    : '<input id="' + id + '" type="' + type + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ' + (attrs || '') + '>';
  return '<div class="fld" data-f="' + id + '"><label for="' + id + '">' + label + '</label>' + inp + (hint ? '<div class="hint">' + hint + '</div>' : '') + '<div class="msg"></div></div>';
}
function $(id){ return document.getElementById(id); }
function setMsg(id, text){
  var f = scr.querySelector('[data-f="' + id + '"]'); if (!f) return;
  f.className = text ? 'fld bad' : 'fld'; f.querySelector('.msg').textContent = text || '';
}
function formMsg(t){ var m = scr.querySelector('.fmsg'); if (m) m.textContent = t || ''; }
function busy(on){ var bs = scr.querySelectorAll('button'); for (var i = 0; i < bs.length; i++) bs[i].disabled = !!on; }
scr.addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('[data-s]') : null; if (!b) return;
  var a = b.getAttribute('data-s');
  if (a === 'back') closeScreen(); else if (a === 'register') doRegister(); else if (a === 'login') doLogin(); else if (a === 'save') doSave();
});
var NICK_RE = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaffA-Za-z0-9]+$/, AN_RE = /^[A-Za-z0-9]+$/;
function cpLen(s){ var n = 0; for (var i = 0; i < s.length; i++){ var c = s.charCodeAt(i); if (c < 0xdc00 || c > 0xdfff) n++; } return n; }
function openRegister(){
  openScreen('register', head('註冊') +
    fld('rNick', '暱稱 <i>（中文、英文或數字，最多 7 字）</i>', 'text', 'maxlength="7"') +
    fld('rAcct', '帳號 <i>（英文或數字，最多 15 字）</i>', 'text', 'maxlength="15" inputmode="text"') +
    fld('rPass', '密碼 <i>（英文或數字，6–15 字）</i>', 'password', 'maxlength="15"') +
    fld('rCode', '註冊碼', 'text', 'maxlength="30"') +
    '<div class="fmsg"></div><button class="btn pri fbtn" type="button" data-s="register">註冊</button>');
}
function doRegister(){
  var nick = $('rNick').value.trim(), acct = $('rAcct').value.trim(), pass = $('rPass').value, code = $('rCode').value.trim(), ok = true;
  ['rNick', 'rAcct', 'rPass', 'rCode'].forEach(function(i){ setMsg(i, ''); }); formMsg('');
  if (!nick) { setMsg('rNick', '請輸入暱稱'); ok = false; }
  else if (!NICK_RE.test(nick) || cpLen(nick) > 7) { setMsg('rNick', '暱稱只能用中文、英文或數字，最多 7 字'); ok = false; }
  if (!acct) { setMsg('rAcct', '請輸入帳號'); ok = false; }
  else if (!AN_RE.test(acct) || acct.length > 15) { setMsg('rAcct', '帳號只能用英文或數字，最多 15 字'); ok = false; }
  if (!pass) { setMsg('rPass', '請輸入密碼'); ok = false; }
  else if (!AN_RE.test(pass) || pass.length > 15) { setMsg('rPass', '密碼只能用英文或數字，最多 15 字'); ok = false; }
  else if (pass.length < 6) { setMsg('rPass', '密碼至少要 6 個字'); ok = false; }
  if (!code) { setMsg('rCode', '請輸入註冊碼'); ok = false; }
  if (!ok) return;
  busy(true);
  callFn('register', {nickname: nick, account: acct, password: pass, code: code}).then(function(r){
    setAuth({token: r.token, nickname: r.nickname, account: r.account}); closeScreen();
  }, function(e){
    busy(false);
    var m = e.message;
    if (m === 'wrong-code') setMsg('rCode', '註冊碼錯誤');
    else if (m === 'account-taken') setMsg('rAcct', '這個帳號已經有人使用');
    else if (m === 'invalid:nickname') setMsg('rNick', '暱稱只能用中文、英文或數字，最多 7 字');
    else if (m === 'invalid:account') setMsg('rAcct', '帳號只能用英文或數字，最多 15 字');
    else if (m === 'invalid:password') setMsg('rPass', '密碼需為 6–15 個英文或數字');
    else formMsg(errText(e));
  });
}
function openLogin(){
  openScreen('login', head('登入') + fld('lAcct', '帳號', 'text', 'maxlength="15"') + fld('lPass', '密碼', 'password', 'maxlength="15"') +
    '<div class="fmsg"></div><button class="btn pri fbtn" type="button" data-s="login">登入</button>');
}
function doLogin(){
  var acct = $('lAcct').value.trim(), pass = $('lPass').value;
  formMsg('');
  if (!acct || !pass) { formMsg('請輸入帳號和密碼'); return; }
  busy(true);
  callFn('login', {account: acct, password: pass}).then(function(r){
    setAuth({token: r.token, nickname: r.nickname, account: r.account}); closeScreen();
  }, function(e){ busy(false); formMsg(e.message === 'bad-login' ? '帳號或密碼錯誤' : errText(e)); });
}
// ---- add / edit ----
var LABELS = {name: '遊戲名稱', sleeves: '牌套資訊', players: '人數', age: '年齡', time: '時間', accessories: '額外配件', notes: '備註'};
var EDIT_FIELDS = ['name', 'sleeves', 'players', 'age', 'time', 'accessories', 'notes'];
var editing = null;   // {id, raw:{}, base:{}, codes:[]}
// 條碼號碼: one box, several codes split by comma / space / newline -> array of digit strings (8–14 digits, max MAX_CODES).
var MAX_CODES = 10;
function parseCodes(text){
  var parts = String(text || '').split(/[\s,，、;；]+/), out = [];
  for (var i = 0; i < parts.length; i++){
    var c = parts[i]; if (!c) continue;
    if (!/^\d{8,14}$/.test(c)) return {err: '「' + c + '」不是有效的條碼號碼（只能是 8–14 位數字）'};
    if (out.indexOf(c) < 0) out.push(c);
  }
  if (out.length > MAX_CODES) return {err: '條碼號碼最多 ' + MAX_CODES + ' 個'};
  return {codes: out};
}
function openEdit(id){
  var raw = {}, row = id ? store.map[id] : null;
  if (id && !row) return;
  for (var i = 0; i < EDIT_FIELDS.length; i++) raw[EDIT_FIELDS[i]] = row ? String(row[i + 1] == null ? '' : row[i + 1]) : '';
  var codes = row && row[9] && typeof row[9] !== 'string' ? row[9].slice() : [];
  editing = {id: id, raw: raw, base: {}, codes: codes};
  openScreen(id ? 'edit' : 'add', head(id ? '更改資料' : '新增遊戲') +
    fld('e_name', '遊戲名稱 <i>（必填）</i>', 'text', 'maxlength="100"') +
    fld('e_sleeves', '牌套資訊', 'textarea', 'class="big" maxlength="1000" placeholder="每行一種，例如：63.5x88(50)"', '每行一種牌套，格式：寬x高(張數)；不需牌套請填「x」；不清楚就留空') +
    fld('e_barcodes', '條碼號碼', 'textarea', 'class="codes" inputmode="numeric" maxlength="200" placeholder="例如：4710000000001"', '只填數字；多個條碼用逗號、空白或換行分開；沒有就留空') +
    fld('e_players', '人數', 'text', 'maxlength="50"') +
    fld('e_age', '年齡', 'text', 'maxlength="50"') +
    fld('e_time', '時間', 'text', 'maxlength="50"') +
    fld('e_accessories', '額外配件', 'textarea', 'maxlength="1000"') +
    fld('e_notes', '備註', 'textarea', 'maxlength="1000"') +
    '<div class="fmsg"></div><button class="btn pri fbtn" type="button" data-s="save">' + (id ? '確認更新' : '確定新增') + '</button>');
  for (var j = 0; j < EDIT_FIELDS.length; j++){
    var k = EDIT_FIELDS[j], el = $('e_' + k);
    el.value = k === 'sleeves' && window.SleeveParse.editForm ? SleeveParse.editForm(raw[k]) : raw[k];
    editing.base[k] = el.value;   // what the field shows before the user touches it
  }
  $('e_barcodes').value = codes.join('\n');
  $('e_barcodes').oninput = function(){ setMsg('e_barcodes', ''); };
}
function collect(){
  var f = {};
  for (var i = 0; i < EDIT_FIELDS.length; i++){
    var k = EDIT_FIELDS[i], v = $('e_' + k).value;
    f[k] = editing.id && v === editing.base[k] ? editing.raw[k] : v;   // untouched -> keep stored value exactly
  }
  return f;
}
function doSave(){
  setMsg('e_name', ''); formMsg('');
  setMsg('e_barcodes', '');
  if (!$('e_name').value.trim()) { setMsg('e_name', '請輸入遊戲名稱'); $('e_name').focus(); return; }
  var pc = parseCodes($('e_barcodes').value);
  if (pc.err) { setMsg('e_barcodes', pc.err); $('e_barcodes').focus(); return; }
  var f = collect();
  f.barcodes = pc.codes;
  if (!editing.id){
    busy(true);
    callFn('addRecord', {token: auth && auth.token, fields: f}).then(function(r){ return afterWrite(r.id, 'info'); }, function(e){ busy(false); writeFail(e); });
    return;
  }
  openModal(function(code){
    return callFn('updateRecord', {token: auth && auth.token, id: editing.id, code: code, fields: f}).then(function(r){ closeModal(); return afterWrite(r.id, 'info'); });
  });
}
function writeFail(e){
  if (e.message === 'login-required') { setAuth(null); }
  formMsg(errText(e));
}
function groupOf(id){ for (var i = 0; i < DATA.length; i++) for (var j = 0; j < DATA[i].r.length; j++) if (DATA[i].r[j].id === id) return i; return -1; }
function afterWrite(id, then){
  return refresh().then(function(){
    closeScreen();
    var gi = id ? groupOf(id) : -1;
    if (then === 'info' && gi >= 0) showInfo(gi, true); else renderList(true);
  });
}
function askDelete(id){
  openModal(function(code){
    return callFn('deleteRecord', {token: auth && auth.token, id: id, code: code}).then(function(){ closeModal(); return afterWrite(null, 'list'); });
  });
}
// ---- code popup: one input + OK, no text. Wrong code -> red shake only. ----
var modalAction = null;
function openModal(action){
  modalAction = action; mcode.value = ''; mcode.className = ''; mok.disabled = false; modal.hidden = false;
  setTimeout(function(){ mcode.focus(); }, 50);
}
function closeModal(){ modal.hidden = true; modalAction = null; mcode.blur(); }
function modalOk(){
  var code = mcode.value.trim();
  if (!modalAction || mok.disabled) return;
  if (!code) { failShake(); return; }
  mok.disabled = true;
  modalAction(code).catch(function(e){
    mok.disabled = false;
    var m = e && e.message;
    if (m === 'wrong-code' || m === 'too-many-attempts') { mcode.value = ''; failShake(); return; }
    closeModal();
    if (m === 'login-required') setAuth(null);
    if (!scr.hidden) formMsg(errText(e)); else alertMsg(errText(e));
  });
}
function failShake(){
  var b = document.getElementById('mbox');
  mcode.className = 'bad'; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
}
function alertMsg(t){ var n = pane.querySelector('.info'); if (n) { var d = document.createElement('div'); d.className = 'fmsg'; d.textContent = t; n.appendChild(d); pane.scrollTop = pane.scrollHeight; } }
mok.addEventListener('click', modalOk);
mcode.addEventListener('keydown', function(e){ if (e.key === 'Enter') modalOk(); });
mcode.addEventListener('input', function(){ mcode.className = ''; });
modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
// ---- TEST 7: barcode scanner (rear camera, full screen). Works offline:
// BarcodeDetector (built into Android Chrome/WebView) when it supports EAN/UPC; otherwise the bundled
// ZXing decoder (zxing.min.js, loaded only when needed, precached by the PWA service worker).
var SCAN_BTN = '<button class="btn" type="button" data-a="scan">掃條碼</button>';
var SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
var scanEl = null, scanState = {engine: '', stream: null, timer: 0, busy: false, gen: 0, last: '', paused: false, ignore: '', ignoreSeen: 0, engineObj: null};
var IGNORE_MS = 2000;   // after OK/否, the same code is ignored while it stays in view and for 2 s after it was last seen
function digitsOnly(s){ return String(s || '').replace(/\D/g, ''); }
// UPC-E (8 digits incl. number system + check) -> UPC-A (12 digits)
function upcEtoA(e){
  if (!/^[01]\d{7}$/.test(e)) return '';
  var d = e.split(''), l = d[6], m, p;
  if (l < '3') { m = d[1] + d[2] + l + '00'; p = '00' + d[3] + d[4] + d[5]; }
  else if (l === '3') { m = d[1] + d[2] + d[3] + '00'; p = '000' + d[4] + d[5]; }
  else if (l === '4') { m = d[1] + d[2] + d[3] + d[4] + '0'; p = '0000' + d[5]; }
  else { m = d[1] + d[2] + d[3] + d[4] + d[5]; p = '0000' + l; }
  return d[0] + m + p + d[7];
}
// All spellings of one code that may be stored (UPC-A 12 digits <-> EAN-13 with a leading 0, UPC-E -> UPC-A).
function codeKeys(code, fmt){
  var c = String(code || '').trim(), k = [c], dg = digitsOnly(c);
  if (dg && dg === c){
    if (dg.length === 8 && fmt === 'upc_e') { var a = upcEtoA(dg); if (a) k.push(a, '0' + a); }
    if (dg.length === 12) k.push('0' + dg);
    if (dg.length === 13 && dg[0] === '0') k.push(dg.slice(1));
  }
  return k;
}
// -> DATA indexes of the games that have this barcode
function findCode(code, fmt){
  var keys = codeKeys(code, fmt), out = [];
  for (var i = 0; i < DATA.length; i++){
    var r = DATA[i].r, hit = false;
    for (var j = 0; j < r.length && !hit; j++)
      if (r[j].bc) for (var k = 0; k < keys.length; k++) if (r[j].bc.indexOf(keys[k]) >= 0) { hit = true; break; }
    if (hit) out.push(i);
  }
  return out;
}
// A code was read: back to the main screen; 1 game -> its info, several -> their list, none -> message.
function onCode(code, fmt){
  code = String(code || '').trim();
  var idxs = findCode(code, fmt);
  window.__test.lastCode = {code: code, fmt: fmt || '', matches: idxs.length};
  if (!idxs.length) { noMatch(code); return; }
  closeScanner();
  closeScreen();
  listScroll = 0;
  if (idxs.length === 1){
    codeView = null;
    q.value = DATA[idxs[0]].n.replace(/\n/g, ' ');
    renderList(false);
    showInfo(idxs[0], true);
  } else {
    codeView = {code: code, idxs: idxs};
    q.value = '';
    renderList(false);
    q.blur();
  }
}
// TEST 8: code not in the database -> in-app dialog over the scanner (decoding paused while it shows).
// Logged out: 「沒有關於這個條碼的資料」 [OK] -> back to scanning.  Logged in: … 是否要直接使用這個條碼來新增 [否] [是];
// 否 -> back to scanning, 是 -> 新增遊戲 with the code in 條碼號碼.
function noMatch(code){
  if (!scanEl) buildScanner();
  scanState.paused = true; clearTimeout(scanState.timer);
  var d = document.getElementById('sdlg'), li = !!auth;
  d.querySelector('.st').innerHTML = '沒有關於這個條碼的資料' + (li ? '<br>是否要直接使用這個條碼來新增' : '');
  d.querySelector('.sc').textContent = '條碼：' + code;
  d.querySelector('.sb').innerHTML = li ? '<button class="btn" type="button" data-d="no">否</button><button class="btn pri" type="button" data-d="yes">是</button>'
    : '<button class="btn pri" type="button" data-d="ok">OK</button>';
  d.dataset.code = code;
  d.hidden = false;
  window.__test.dialog = {code: code, loggedIn: li};
}
function dialogOpen(){ var d = document.getElementById('sdlg'); return !!d && !d.hidden; }
function hideDialog(){ var d = document.getElementById('sdlg'); if (d) d.hidden = true; }
function dialogAnswer(a){
  var d = document.getElementById('sdlg'), code = d.dataset.code || '';
  hideDialog();
  if (a === 'yes'){
    closeScanner();
    openEdit(null);
    $('e_barcodes').value = code;
    return;
  }
  // OK / 否: back to the scanner. Ignore this code until it has been out of view for IGNORE_MS.
  scanState.ignore = code; scanState.ignoreSeen = Date.now();
  resumeScan();
}
function resumeScan(){
  scanState.paused = false;
  if (!scanEl || scanEl.hidden) return;
  if (scanState.engineObj && scanState.stream) { clearTimeout(scanState.timer); loop(scanState.engineObj, document.getElementById('scanv'), scanState.gen); }
}
function scanMsg(t, err){ var m = document.getElementById('scanmsg'); if (m) { m.textContent = t; m.className = err ? 'err' : ''; } }
function buildScanner(){
  scanEl = document.createElement('div');
  scanEl.id = 'scan'; scanEl.hidden = true;
  scanEl.innerHTML = '<video id="scanv" playsinline muted autoplay></video><div id="scanframe"><i></i></div>' +
    '<div class="shead"><button class="btn" type="button" data-x="back">退回</button><h2>掃條碼</h2></div>' +
    '<div id="scanmsg"></div>';
  document.body.appendChild(scanEl);
  var dlg = document.createElement('div');   // 「沒有關於這個條碼的資料」 dialog, above the scanner
  dlg.id = 'sdlg'; dlg.hidden = true;
  dlg.innerHTML = '<div class="sbox" role="dialog" aria-modal="true"><div class="st"></div><div class="sc"></div><div class="sb"></div></div>';
  document.body.appendChild(dlg);
  dlg.addEventListener('click', function(e){
    var a = e.target.closest ? e.target.closest('[data-d]') : null;
    if (a) dialogAnswer(a.getAttribute('data-d'));
  });
  scanEl.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('[data-x]') : null;
    if (b) closeScanner();
  });
}
function openScanner(){
  if (!scanEl) buildScanner();
  if (!scanEl.hidden) return;
  q.blur(); closeModal();
  scanEl.hidden = false;
  var gen = ++scanState.gen;
  scanState.last = ''; scanState.paused = false; scanState.engineObj = null; hideDialog();
  scanMsg('正在開啟相機…');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ scanMsg('這個裝置無法使用相機掃描', true); return; }
  var video = document.getElementById('scanv');
  navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}})
    .then(function(stream){
      if (gen !== scanState.gen || scanEl.hidden){ stopStream(stream); return; }
      scanState.stream = stream;
      video.srcObject = stream;
      var p = video.play(); if (p && p.catch) p.catch(function(){});
      return pickEngine().then(function(engine){
        if (gen !== scanState.gen || scanEl.hidden) return;
        if (!engine){ scanMsg('無法載入條碼辨識功能', true); return; }
        scanState.engine = engine.name; scanState.engineObj = engine;
        scanMsg('將條碼對準框內');
        loop(engine, video, gen);
      });
    })
    .catch(function(e){
      if (gen !== scanState.gen) return;
      var n = e && e.name;
      scanMsg(n === 'NotAllowedError' || n === 'SecurityError' ? '沒有相機權限，請到設定允許「相機」後再試'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? '找不到相機' : '無法開啟相機', true);
    });
}
function stopStream(st){ if (st) st.getTracks().forEach(function(t){ try { t.stop(); } catch (e) {} }); }
function closeScanner(){
  if (!scanEl || scanEl.hidden) return;
  scanState.gen++;
  clearTimeout(scanState.timer);
  hideDialog(); scanState.paused = false; scanState.ignore = '';
  stopStream(scanState.stream); scanState.stream = null;
  var v = document.getElementById('scanv'); if (v) { try { v.pause(); } catch (e) {} v.srcObject = null; }
  scanEl.hidden = true;
}
document.addEventListener('visibilitychange', function(){ if (document.hidden) closeScanner(); });
// Detection engines: {name, detect(video) -> Promise<{code, fmt}|null>}
var zxingLoad = null;
function pickEngine(){
  if (window.BarcodeDetector && BarcodeDetector.getSupportedFormats){
    return BarcodeDetector.getSupportedFormats().then(function(sup){
      var f = SCAN_FORMATS.filter(function(x){ return sup.indexOf(x) >= 0; });
      if (f.indexOf('ean_13') < 0) return zxingEngine();
      var det = new BarcodeDetector({formats: f});
      return {name: 'BarcodeDetector', detect: function(v){
        return det.detect(v).then(function(res){ return res && res.length ? {code: res[0].rawValue, fmt: res[0].format} : null; });
      }};
    }, zxingEngine);
  }
  return zxingEngine();
}
function zxingEngine(){
  if (!zxingLoad) zxingLoad = new Promise(function(ok, bad){
    if (window.ZXing) return ok();
    var s = document.createElement('script'); s.src = 'zxing.min.js';
    s.onload = function(){ ok(); }; s.onerror = function(){ zxingLoad = null; bad(new Error('zxing')); };
    document.head.appendChild(s);
  });
  return zxingLoad.then(function(){
    var Z = window.ZXing, hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    var reader = new Z.MultiFormatReader(); reader.setHints(hints);
    var cv = document.createElement('canvas'), cx = cv.getContext('2d', {willReadFrequently: true});
    var FMT = {}; FMT[Z.BarcodeFormat.EAN_13] = 'ean_13'; FMT[Z.BarcodeFormat.EAN_8] = 'ean_8'; FMT[Z.BarcodeFormat.UPC_A] = 'upc_a';
    FMT[Z.BarcodeFormat.UPC_E] = 'upc_e'; FMT[Z.BarcodeFormat.CODE_128] = 'code_128';
    return {name: 'ZXing', detect: function(v){
      var w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return Promise.resolve(null);
      var sc = Math.min(1, 960 / w); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
      cx.drawImage(v, 0, 0, cv.width, cv.height);
      try {
        var bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)));
        var r = reader.decodeWithState(bmp);
        return Promise.resolve({code: r.getText(), fmt: FMT[r.getBarcodeFormat()] || ''});
      } catch (e) { reader.reset(); return Promise.resolve(null); }
    }};
  }, function(){ return null; });
}
function loop(engine, video, gen){
  if (gen !== scanState.gen || scanState.paused) return;
  scanState.frames = (scanState.frames || 0) + 1;
  var p = video.readyState >= 2 ? engine.detect(video) : Promise.resolve(null);
  p.then(function(r){
    if (gen !== scanState.gen || scanState.paused) return;
    if (r && r.code && scanState.ignore && String(r.code).trim() === scanState.ignore){
      var now = Date.now();
      if (now - scanState.ignoreSeen < IGNORE_MS) { scanState.ignoreSeen = now; r = null; }   // still in view: keep ignoring
      else scanState.ignore = '';
    }
    if (r && r.code && validCode(r.code, r.fmt)) { onCode(r.code, r.fmt); if (scanState.paused || scanEl.hidden) return; }
    scanState.timer = setTimeout(function(){ loop(engine, video, gen); }, 120);
  }, function(){ if (gen === scanState.gen) scanState.timer = setTimeout(function(){ loop(engine, video, gen); }, 300); });
}
// EAN/UPC check digit (ZXing and BarcodeDetector already verify it; this guards against odd engines)
function validCode(c, fmt){
  if (fmt === 'code_128') return String(c).trim().length > 0;
  if (fmt === 'upc_e') return /^\d{8}$/.test(c) && validCode(upcEtoA(c) || '1', 'upc_a');
  if (!/^\d{8}$|^\d{12,13}$/.test(c)) return !fmt && String(c).trim().length > 0;
  var s = 0, n = c.length;
  for (var i = 0; i < n - 1; i++) s += (+c[n - 2 - i]) * (i % 2 ? 1 : 3);
  return (10 - s % 10) % 10 === +c[n - 1];
}
renderAuth();
window.__test = {showInfo: showInfo, search: search, data: DATA, source: SOURCE, doRefresh: function(){ return refresh(); },
  onCode: onCode, findCode: findCode, dialogAnswer: dialogAnswer, openScanner: openScanner, closeScanner: closeScanner, scan: scanState, validCode: validCode, upcEtoA: upcEtoA};
renderList(false);
refresh();
})();
