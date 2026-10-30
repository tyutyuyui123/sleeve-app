// 牌套精靈: turn raw Firestore records into display data. JS port of parse.py (keep the two in sync).
(function(root){
'use strict';
var D = '\\p{Nd}', ND = '\\P{Nd}';
function R(src, fl){ return new RegExp(src, 'u' + (fl || '')); }
var NONE_WORDS = {'x':1, 'X':1, '無':1, 'ｘ':1, 'Ｘ':1, '無須牌套':1, '不需要牌套':1, '不用附牌套':1};
var NUM = D + '+(?:\\.' + D + '+)?';
var PRE = '([^' + D + '(（<＜\\s][^' + D + '(（<＜]*?)?\\s*';
var SZ = '(' + NUM + ')\\s*(?:mm)?\\s*[x×X*]\\s*(' + NUM + ')\\s*(?:mm)?';
var ALT = '((?:[(（][^)）]*[)）]\\s*)*)';
var SEP = '(?:\\s*(?:=|-|×)\\s*|\\s+(?=' + D + '+\\s*張))';
var P_PAREN = R('^' + PRE + SZ + '\\s*[(（]\\s*(' + D + '+)\\s*張?\\s*[)）]\\s*(.*)$');
var P_EQ = R('^' + PRE + SZ + '\\s*' + ALT + SEP + '(' + D + '+)\\s*張?(?![' + D + '+=包.])\\s*(.*)$');
var P_NOCOUNT = R('^' + PRE + SZ + '\\s*=\\s*' + ALT + '$');
var P_CNTFIRST = R('^(' + D + '+)\\s*[(（]\\s*' + SZ + '\\s*[)）]\\s*(.*)$');
var P_SUM = R('^' + PRE + SZ + '\\s*=\\s*(' + D + '+(?:\\s*\\+\\s*' + D + '+)+)\\s*(?:=\\s*(' + D + '+))?\\s*(.*)$');
var P_PACK = R('^' + PRE + SZ + '\\s*=\\s*(' + D + '+)\\s*包\\s*(.*)$');
var P_BARE = R('^' + PRE + SZ + '\\s*((?:[(（][^)）]*[)）])?)$');
var P_PRENOTE = R('^[(（]([^)）]*)[)）]\\s*(\\S.*)$');
var P_CARD = R('^卡牌\\s*x(' + D + '+)\\s*[(（]\\s*' + SZ + '\\s*[)）]\\s*(.*)$');
var P_CARDHEAD = R('^卡牌\\s*x' + D + '+\\s*(?=[(（])');
var RE_DIGIT = R(D), RE_NONDIGIT = R(ND);
var OPEN = '(（', CLOSE = ')）';

function g(m, i){ return m[i] === undefined ? '' : m[i]; }
function gn(m, i){ return m[i] === undefined ? null : m[i]; }
function toInt(s){ return parseInt(String(s).replace(/\p{Nd}/gu, function(c){ return String(c.normalize('NFKC').charCodeAt(0) >= 48 && c.normalize('NFKC').charCodeAt(0) <= 57 ? c.normalize('NFKC') : c); }), 10); }

function cell(v){
  if (v === null || v === undefined) return '';
  var s = String(v).replace(/\u00a0/g, ' ').replace(/\r/g, '');
  s = s.split('\n').map(function(l){ return l.trim(); }).join('\n').replace(/^\n+|\n+$/g, '').trim();
  return s;
}
function matchClose(s, i){
  var depth = 0;
  for (var j = i; j < s.length; j++){
    if (OPEN.indexOf(s[j]) >= 0) depth++;
    else if (CLOSE.indexOf(s[j]) >= 0){ depth--; if (depth === 0) return j; }
  }
  return -1;
}
function splitTop(s){
  var out = [], depth = 0, cur = '';
  for (var k = 0; k < s.length; k++){
    var ch = s[k];
    if (OPEN.indexOf(ch) >= 0) depth++;
    else if (CLOSE.indexOf(ch) >= 0) depth = Math.max(0, depth - 1);
    if (ch === '、' && depth === 0){ out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(function(x){ return x.trim(); }).filter(function(x){ return x; });
}
function unwrap(n){
  n = n.trim();
  if (n && OPEN.indexOf(n[0]) >= 0 && matchClose(n, 0) === n.length - 1) n = n.slice(1, -1).trim();
  return n;
}
function cleanNote(n){
  n = n.trim();
  n = n.replace(/^[<＜]+/, '').trim();
  n = n.replace(/^[，,]+/, '').trim();
  return unwrap(n);
}
function fmt(pre, w, h, cnt, note, alt){
  pre = (pre || '').trim();
  if (pre && pre !== 'K' && !/[：:-]$/.test(pre)) pre += ' ';
  var main = pre + w + ' × ' + h + (cnt ? '（' + cnt + ' 張）' : '');
  var notes = (alt && alt.trim()) ? [cleanNote(alt)] : [];
  if (note && cleanNote(note)) notes.push(cleanNote(note));
  return [main, notes.join('；')];
}
function item(s){
  var m = P_CARDHEAD.exec(s);
  if (m){
    var a = m[0].length, b = matchClose(s, a);
    if (b > 0 && s.slice(a + 1, b).indexOf('、') >= 0){
      var res = [], subs = splitTop(s.slice(a + 1, b));
      for (var i = 0; i < subs.length; i++) res = res.concat(item(subs[i]));
      if (s.slice(b + 1).trim()) res.push(['', cleanNote(s.slice(b + 1))]);
      return res;
    }
  }
  if ((m = P_CNTFIRST.exec(s))) return [fmt('', m[2], m[3], m[1], g(m, 4))];
  if ((m = P_CARD.exec(s))) return [fmt('', m[2], m[3], m[1], g(m, 4))];
  if ((m = P_PAREN.exec(s))) return [fmt(g(m, 1), m[2], m[3], m[4], g(m, 5))];
  if ((m = P_EQ.exec(s))) return [fmt(g(m, 1), m[2], m[3], m[5], g(m, 6), g(m, 4))];
  if ((m = P_NOCOUNT.exec(s))) return [fmt(g(m, 1), m[2], m[3], '', '', g(m, 4))];
  if ((m = P_SUM.exec(s))){
    var parts = m[4].match(/\p{Nd}+/gu).map(toInt), tot = parts.reduce(function(x, y){ return x + y; }, 0);
    var m5 = gn(m, 5);
    var note = m[4].replace(/ /g, '') + (m5 && toInt(m5) === tot ? '' : m5 ? '（表格寫 ' + m5 + '）' : '');
    var r = fmt(g(m, 1), m[2], m[3], String(tot), g(m, 6));
    r[1] = [note, r[1]].filter(function(x){ return x; }).join('；');
    return [r];
  }
  if ((m = P_PACK.exec(s))){
    var r2 = fmt(g(m, 1), m[2], m[3], '', g(m, 5)); r2[0] += '（' + m[4] + ' 包）'; return [r2];
  }
  if ((m = P_BARE.exec(s))) return [fmt(g(m, 1), m[2], m[3], '', g(m, 4))];
  m = P_PRENOTE.exec(s);
  if (m && RE_DIGIT.test(m[2])){
    var sub = item(m[2]);
    if (sub.length && sub[0][0].indexOf('×') >= 0){
      sub[0][1] = [cleanNote(m[1]), sub[0][1]].filter(function(x){ return x; }).join('；'); return sub;
    }
  }
  if (/^[<＜]/.test(s) || (OPEN.indexOf(s[0]) >= 0 && matchClose(s, 0) === s.length - 1 && RE_NONDIGIT.test(s.slice(1, -1))))
    return [['', cleanNote(s)]];
  return [[s, '']];
}
function count(s, chars){ var n = 0; for (var i = 0; i < s.length; i++) if (chars.indexOf(s[i]) >= 0) n++; return n; }
function fixBalance(line){
  while (line && CLOSE.indexOf(line[line.length - 1]) >= 0 && count(line, OPEN) < count(line, CLOSE)) line = line.slice(0, -1).trim();
  while (line && OPEN.indexOf(line[0]) >= 0 && count(line, OPEN) > count(line, CLOSE)) line = line.slice(1).trim();
  return line;
}
// Python: re.split(r'(?<=[\d)）張])\s+(?=K?NUM\s*[x×*]\s*NUM)') — done without lookbehind for older iOS.
var SPLIT_SPACE = R('([' + D + ')）張])(\\s+)(?=K?' + NUM + '\\s*[x×*]\\s*' + NUM + ')', 'g');
function splitSpace(seg){
  var out = [], last = 0, m;
  SPLIT_SPACE.lastIndex = 0;
  while ((m = SPLIT_SPACE.exec(seg))){
    var cut = m.index + m[1].length;
    out.push(seg.slice(last, cut)); last = cut + m[2].length;
  }
  out.push(seg.slice(last));
  return out;
}
function parseB(raw){
  var s = cell(raw);
  if (s === '' || NONE_WORDS[s]) return {none: true, items: []};
  if (s === '?' || s === '？') return {none: false, items: [['[?]', '']]};
  var m = /^([xX無])\s*([(（].*[)）])$/.exec(s);
  if (m) return {none: true, items: [['', cleanNote(m[2].slice(1, -1))]]};
  if (s.indexOf('無(') === 0 || s.indexOf('無（') === 0) return {none: true, items: [['', cleanNote(s.slice(2, -1))]]};
  var items = [], lines = s.split('\n');
  for (var i = 0; i < lines.length; i++){
    var line = fixBalance(lines[i].trim());
    if (!line) continue;
    if (OPEN.indexOf(line[0]) >= 0 && CLOSE.indexOf(line[line.length - 1]) >= 0 && line.indexOf('、') >= 0) line = line.slice(1, -1);
    var segs = splitTop(line);
    for (var j = 0; j < segs.length; j++){
      var seg = segs[j], parts = OPEN.indexOf(seg[0]) >= 0 ? [seg] : splitSpace(seg);
      for (var k = 0; k < parts.length; k++){ var p = parts[k].trim(); if (p) items = items.concat(item(p)); }
    }
  }
  return {none: false, items: items};
}
// Python: STAR.sub(r'\1x\2') with STAR = (?<![\dx.])(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)
var STAR = R('(^|[^' + D + 'x.])(' + NUM + ')\\s*\\*\\s*(' + NUM + ')', 'g');
function frontStyle(t){ return t ? t.replace(STAR, function(_, a, w, h){ return a + w + 'x' + h; }) : t; }
function normName(n){ return String(n).normalize('NFKC').replace(/\s+/g, ' ').trim(); }

// records: [{name, sleeves, players, age, time, accessories, notes, sourceRow}] -> [{n, r:[...]}] (same shape as data.js)
function build(records){
  records = records.slice().sort(function(a, b){ return a.sourceRow - b.sourceRow; });
  var groups = {}, out = [];
  for (var i = 0; i < records.length; i++){
    var x = records[i], name = cell(x.name);
    if (!name) continue;
    var pb = parseB(x.sleeves);
    var rec = {row: x.sourceRow};
    if (pb.none) rec.none = true;
    var items = pb.items.map(function(it){ return [frontStyle(it[0]), frontStyle(it[1])]; });
    if (items.length) rec.items = items;
    var c = cell(x.players).replace(/\n/g, ' '), d = cell(x.age), e = cell(x.time), f = cell(x.accessories), gg = cell(x.notes);
    if (c) rec.c = c; if (d) rec.d = d; if (e) rec.e = e; if (f) rec.f = f; if (gg) rec.g = gg;
    var key = normName(name);
    if (!groups[key]){ groups[key] = {n: name, r: []}; out.push(groups[key]); }
    groups[key].r.push(rec);
  }
  return out;
}
root.SleeveParse = {build: build, parseB: parseB, frontStyle: frontStyle};
if (typeof module !== 'undefined') module.exports = root.SleeveParse;
})(typeof window !== 'undefined' ? window : globalThis);
