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
q.addEventListener('input', function(){ renderList(false); });
clr.addEventListener('click', function(){ q.value = ''; renderList(false); q.focus(); });
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
    ? '<span class="nick">' + esc(auth.nickname) + '</span><button class="btn" type="button" data-a="logout">登出</button><button class="btn pri" type="button" data-a="add">新增</button>'
    : '<button class="btn" type="button" data-a="register">註冊</button><button class="btn pri" type="button" data-a="login">登入</button>';
}
authEl.addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('[data-a]') : null; if (!b) return;
  var a = b.getAttribute('data-a');
  if (a === 'register') openRegister(); else if (a === 'login') openLogin(); else if (a === 'add') openEdit(null);
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
var editing = null;   // {id, raw:{}, base:{}}
function openEdit(id){
  var raw = {}, row = id ? store.map[id] : null;
  if (id && !row) return;
  for (var i = 0; i < EDIT_FIELDS.length; i++) raw[EDIT_FIELDS[i]] = row ? String(row[i + 1] == null ? '' : row[i + 1]) : '';
  editing = {id: id, raw: raw, base: {}};
  openScreen(id ? 'edit' : 'add', head(id ? '更改資料' : '新增遊戲') +
    fld('e_name', '遊戲名稱 <i>（必填）</i>', 'text', 'maxlength="100"') +
    fld('e_sleeves', '牌套資訊', 'textarea', 'class="big" maxlength="1000" placeholder="每行一種，例如：63.5x88(50)"', '每行一種牌套，格式：寬x高(張數)；不需牌套請填「x」') +
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
  if (!$('e_name').value.trim()) { setMsg('e_name', '請輸入遊戲名稱'); $('e_name').focus(); return; }
  var f = collect();
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
renderAuth();
window.__test = {showInfo: showInfo, search: search, data: DATA, source: SOURCE, doRefresh: function(){ return refresh(); }};
renderList(false);
refresh();
})();
