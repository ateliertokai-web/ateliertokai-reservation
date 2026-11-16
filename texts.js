/* お客様画面の文言。
   ・コードの中では T('もとの文') と書く。管理画面で直した文言があればそれを、なければ、もとの文を返す
     （同じ文は、どこに出ていても、1か所直せば全部直る）
   ・文中に {名前} がある文（お連れ様のページ）は、キー付きで TXT.add(グループ名, {キー: '文'}) に登録し、T('キー', {名前: 値}) で取り出す
   ・直した文言は、データベース（config/texts の v）に保存される。TXT.load(db) で読み込む。読み込めないときは、もとの文
   ・直した文言は、画面に出す前に無害化する（< > & " ' を全角にする）。管理画面側の入力が、お客様画面の動きを変えないため
   ・管理画面の「お客様画面の文言」で使う編集モード（?edit=1）では、文言をタップして書き換えられる */
(function (root) {
  'use strict';
  var TX = {}, TXO = {}, CK = 'rv_texts_v1', EDIT = /[?&]edit=1(&|$)/.test(root.location ? root.location.search : '');
  var SEEN = {}, VARS = {}, VID = 0;
  // 文のキー：もとの文の短い符号（FNV-1a）。管理画面でも同じ計算で一覧を作る
  function h(s) { var x = 0x811c9dc5; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return 't' + x.toString(36); }
  function clean(s) { return String(s).replace(/[<>&"'`\\]/g, function (c) { return { '<': '＜', '>': '＞', '&': '＆', '"': '”', "'": '’', '`': '’', '\\': '＼' }[c]; }); }
  function add(group, obj) { Object.keys(obj).forEach(function (k) { TX[k] = { t: obj[k], g: group }; }); }
  function keyOf(a) { return TX[a] ? a : h(a); }                                  // キー付きの文はそのまま、ふつうの文は符号に
  function defOf(a) { return TX[a] ? TX[a].t : a; }
  function raw(a) { var k = keyOf(a), o = TXO[k]; return (typeof o === 'string' && o.trim() !== '') ? o : defOf(a); }
  function fill(s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; }
  function T(a, vars) {
    var s = fill(raw(a), vars);
    if (!EDIT) return s;
    var k = keyOf(a), id = ++VID; SEEN[k] = defOf(a); VARS[id] = vars || null;
    return '' + k + '' + id + '' + s + '';              // 編集モード：あとで画面上の「書き換えられる文字」に変える印
  }
  function sanitizeAll(o) { var r = {}; Object.keys(o || {}).forEach(function (k) { if (typeof o[k] === 'string') r[k] = clean(o[k]).slice(0, 800); }); return r; }
  function setAll(o) { TXO = sanitizeAll(o); }
  // 前回の文言を、端末に覚えておく（次に開いたとき、すぐに反映するため）
  try { var c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c && typeof c === 'object') setAll(c); } catch (e) {}
  function load(db) {
    return db.collection('config').doc('texts').get().then(function (s) {
      setAll((s.exists && s.data().v) || {});
      try { localStorage.setItem(CK, JSON.stringify(TXO)); } catch (e) {}
    }).catch(function () {});
  }
  root.TXT = { add: add, T: T, h: h, raw: raw, load: load, clean: clean, all: TX, edit: EDIT, overrides: function () { return TXO; }, setAll: setAll, _seen: SEEN, _vars: VARS, _fill: fill, _defOf: defOf, _keyOf: keyOf };
  root.T = T;
  if (typeof module !== 'undefined') module.exports = root.TXT;

  /* ---------------- 編集モード（?edit=1）：画面の文言をタップして書き換える ---------------- */
  if (!EDIT || typeof document === 'undefined') return;
  var RE = /([^]*)(\d+)([\s\S]*?)/g, CH = {}, pop = null;
  function plain(s) { return s.replace(RE, '$3'); }
  function strip(el) {                          // 属性（入力欄のヒントなど）は、印を外して、ふつうの文にする。書き換えは右の一覧から
    ['placeholder', 'title', 'alt', 'aria-label'].forEach(function (a) { var v = el.getAttribute && el.getAttribute(a); if (v && v.indexOf('') >= 0) el.setAttribute(a, plain(v)); });
  }
  function mark(node) {
    if (node.nodeType === 1) {
      strip(node); node.querySelectorAll && node.querySelectorAll('[placeholder],[title],[alt],[aria-label]').forEach(strip);
      var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null), list = [], n;
      while ((n = w.nextNode())) if (n.nodeValue.indexOf('') >= 0) list.push(n);
      list.forEach(markText);
    } else if (node.nodeType === 3 && node.nodeValue.indexOf('') >= 0) markText(node);
  }
  function markText(n) {
    var p = n.parentNode, s = n.nodeValue; if (!p) return;
    if (/^(OPTION|TEXTAREA|TITLE|SCRIPT|STYLE|BUTTON)$/.test(p.nodeName) && p.nodeName !== 'BUTTON') { n.nodeValue = plain(s); return; }
    var frag = document.createDocumentFragment(), last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      var sp = document.createElement('span'); sp.className = 'txe' + (CH[m[1]] != null ? ' txc' : ''); sp.setAttribute('data-k', m[1]); sp.setAttribute('data-i', m[2]); sp.textContent = m[3];
      frag.appendChild(sp); last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    p.replaceChild(frag, n);
  }
  function refresh(key) {                       // 書き換えたあと、同じ文を使っているすべての場所を、新しい文に
    document.querySelectorAll('.txe[data-k="' + key + '"]').forEach(function (sp) {
      var a = TX[key] ? key : (SEEN[key] || ''); sp.textContent = fill(raw(TX[key] ? key : SEEN[key]), VARS[sp.getAttribute('data-i')]);
      if (CH[key] != null) sp.classList.add('txc'); else sp.classList.remove('txc');
    });
  }
  function notify(key, val) { try { root.parent.postMessage({ type: 'tx-edit', key: key, value: val }, location.origin); } catch (e) {} }
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(sp) {
    closePop();
    var k = sp.getAttribute('data-k'), def = TX[k] ? TX[k].t : (SEEN[k] || ''), cur = (typeof TXO[k] === 'string' && TXO[k].trim() !== '') ? TXO[k] : def;
    pop = document.createElement('div'); pop.className = 'txp';
    pop.innerHTML = '<b>この文言を書き換える</b>' +
      (/\{\w+\}/.test(def) ? '<small>{…} の部分は、名前などに置き換わります。消さずに残してください。</small>' : '') +
      '<textarea rows="3" maxlength="800"></textarea><small class="txd">もとの文言：</small>' +
      '<div class="txb"><button type="button" data-a="ok">保存</button><button type="button" data-a="rs">元に戻す</button><button type="button" data-a="cl">閉じる</button></div>';
    pop.querySelector('textarea').value = cur; pop.querySelector('.txd').appendChild(document.createTextNode(def));
    document.body.appendChild(pop);
    var r = sp.getBoundingClientRect(), vw = document.documentElement.clientWidth, top = r.bottom + 6;
    if (top + 190 > window.innerHeight) top = Math.max(6, r.top - 196);
    pop.style.top = top + 'px'; pop.style.left = Math.max(6, Math.min(r.left, vw - 290)) + 'px';
    pop.querySelector('textarea').focus();
    pop.onclick = function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return;
      if (a === 'cl') return closePop();
      var v = a === 'rs' ? '' : pop.querySelector('textarea').value.trim();
      if (v === def) v = '';
      if (v === '') { delete TXO[k]; CH[k] = ''; } else { TXO[k] = clean(v).slice(0, 800); CH[k] = TXO[k]; }
      refresh(k); notify(k, v === '' ? '' : TXO[k]); closePop();
    };
  }
  document.addEventListener('click', function (e) {
    var sp = e.target.closest && e.target.closest('.txe');
    if (pop && !(e.target.closest && e.target.closest('.txp')) && !sp) closePop();
    if (!sp) return;
    e.preventDefault(); e.stopPropagation(); openPop(sp);
  }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); }, true);
  root.confirm = function () { return false; }; root.alert = function () {}; root.prompt = function () { return null; };
  var st = document.createElement('style');
  st.textContent = '.txe{cursor:pointer;outline:1px dashed rgba(184,149,90,.8);outline-offset:1px;border-radius:2px}.txe:hover{background:#fff3c4}.txe.txc{background:#e3f4e8}' +
    '.txp{position:fixed;z-index:99999;width:280px;background:#fff;border:1px solid #b8955a;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);padding:10px;font:13px/1.5 sans-serif;color:#222;display:grid;gap:6px}' +
    '.txp textarea{width:100%;font:inherit;padding:6px;border:1px solid #ccc;border-radius:6px}.txp small{color:#666}.txp .txb{display:flex;gap:6px}.txp button{font:inherit;padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer}.txp button[data-a=ok]{background:#111;color:#e8c872;border-color:#111}';
  document.head.appendChild(st);
  new MutationObserver(function (recs) { recs.forEach(function (r) { r.addedNodes.forEach(function (n) { mark(n); }); if (r.type === 'characterData') mark(r.target); }); })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  // 管理画面（親）からの指示：文言の一括設定・1件の更新
  root.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'tx-all') { setAll(e.data.v); CH = {}; Object.keys(TXO).forEach(function (k) { CH[k] = TXO[k]; }); document.querySelectorAll('.txe').forEach(function (s) { refresh(s.getAttribute('data-k')); }); }
    if (e.data.type === 'tx-set') { var k = e.data.key; if (e.data.value) { TXO[k] = clean(e.data.value).slice(0, 800); CH[k] = TXO[k]; } else { delete TXO[k]; delete CH[k]; } refresh(k); }
  });
  try { root.parent.postMessage({ type: 'tx-ready' }, location.origin); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
