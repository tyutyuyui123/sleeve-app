(function(){
'use strict';
var DATA = window.SLEEVE_DATA || [];
var q = document.getElementById('q'), pane = document.getElementById('pane'),
    clr = document.getElementById('clr'), track = document.getElementById('track'), thumb = document.getElementById('thumb');

function norm(s){
  s = String(s || '');
  if (s.normalize) s = s.normalize('NFKC');
  return s.toLowerCase().replace(/[\s\u00a0\u3000]+/g, '');
}
for (var i = 0; i < DATA.length; i++) DATA[i].k = norm(DATA[i].n);

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
window.__test = {showInfo: showInfo, search: search, data: DATA};
renderList(false);
})();
