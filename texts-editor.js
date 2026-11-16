/* 管理画面「お客様画面の文言」：擬似お客様画面（iframe）の文字をタップして書き換える。
   ・画面の見本は index.html?edit=1 / guest.html?edit=1&sample=… （データベースにはつながない）
   ・書き換えた文言は、画面の中で、すぐ見える。「保存する」を押すと config/texts に保存され、お客様画面に反映される
   ・エラーや確認ダイアログなど、画面に常には出ない文言は、右の一覧（検索つき）から書き換える */
(function (root) {
  'use strict';
  var H = root.TXH, CLEAN = root.TXC;
  var SCREENS = [
    ['お客様画面', [['home', 'トップ'], ['pick', '日時を選ぶ'], ['pickLot', '日時を選ぶ（抽選）'], ['form', '申し込み入力'], ['formFull', '申し込み入力（満席）'], ['formLot', '申し込み入力（抽選）'], ['formGolf', '申し込み入力（ゴルフ）'],
      ['done', '予約完了'], ['doneWait', '予約完了（キャンセル待ち）'], ['doneLot', '予約完了（抽選）'], ['doneGuest', '予約完了（お連れ様のご案内・ゴルフ）'], ['lookup', '予約の確認（ログイン）'], ['owner', 'オーナーズカードIDで探す'],
      ['detail', '予約内容'], ['detailWait', '予約内容（キャンセル待ち）'], ['detailLot', '予約内容（抽選待ち）'], ['detailLost', '予約内容（落選）'], ['detailCancel', '予約内容（キャンセル済み）'], ['detailGolf', '予約内容（ゴルフ・お連れ様の入力）'], ['edit', '予約内容の変更']]],
    ['お連れ様の入力ページ', [['g:form', '入力画面'], ['g:saved', '入力済み'], ['g:canceled', '取り消し済み'], ['g:byowner', '代表者が取り消した場合'], ['g:invalid', '開けないURL']]]
  ];
  var FILES = [['index.html', 'お客様画面'], ['core.js', 'エラー・お知らせ'], ['guest.html', 'お連れ様ページ']];
  var JA = /[぀-ヿ㐀-鿿]/;
  function unesc(s) { return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, function (m, c) { return c[0] === 'u' && c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : ({ n: '\n', r: '\r', t: '\t' }[c] || c); }); }
  var DEFS = null;
  function scan() {
    if (DEFS) return Promise.resolve(DEFS);
    var out = {};
    return Promise.all(FILES.map(function (f) {
      return fetch(f[0] + '?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
        var re = /\b_?T\(\s*'((?:[^'\\\n]|\\.)*)'/g, m, k;
        while ((m = re.exec(t))) { var s = unesc(m[1]); if (JA.test(s)) { k = H(s); if (!out[k]) out[k] = { t: s, src: f[1] }; } }
        if (f[0] === 'guest.html') { var r2 = /'(gp\.[\w.]+)'\s*:\s*'((?:[^'\\\n]|\\.)*)'/g; while ((m = r2.exec(t))) out[m[1]] = { t: unesc(m[2]), src: 'お連れ様ページ' }; }
      }).catch(function () {});
    })).then(function () { DEFS = out; return out; });
  }

  function view(pane, env) {
    var C = env.C, say = env.say, esc = env.esc, OV = {}, SAVED = {}, dirty = false, cur = 'home', ready = false, mode = '', limit = 60;
    pane.innerHTML = '<div class="loading sm" role="status"><span class="spin"></span>読み込み中…</div>';
    Promise.all([C.cfg.doc('texts').get(), scan()]).then(function (r) {
      var d = r[0].exists ? (r[0].data().v || {}) : {};
      Object.keys(d).forEach(function (k) { if (typeof d[k] === 'string' && d[k].trim()) OV[k] = d[k]; });
      SAVED = JSON.parse(JSON.stringify(OV)); draw();
    }).catch(function (e) { pane.innerHTML = ''; say('読み込めませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「config」の設定がありません' : e.message)); });

    function defOf(k) { return DEFS[k] ? DEFS[k].t : ''; }
    function same() { return JSON.stringify(OV) === JSON.stringify(SAVED); }
    function mark() { dirty = !same(); var b = pane.querySelector('#txBar'); if (b) { b.hidden = !dirty; } var c = pane.querySelector('#txCnt'); if (c) c.textContent = Object.keys(OV).length; }
    function ifr() { return pane.querySelector('#txF'); }
    function post(m) { var f = ifr(); if (f && f.contentWindow) f.contentWindow.postMessage(m, location.origin); }
    function go(id) {
      cur = id;
      var isG = id.indexOf('g:') === 0, want = isG ? 'guest.html?edit=1&sample=' + id.slice(2) : 'index.html?edit=1', f = ifr(), now = f.getAttribute('data-src') || '';
      if (isG || now !== want) { ready = false; f.setAttribute('data-src', want); f.src = want; }
      else post({ type: 'tx-go', screen: id });
    }
    function onMsg(e) {
      if (e.origin !== location.origin || !e.data || !pane.isConnected) return;
      var m = e.data;
      if (m.type === 'tx-ready') { ready = true; post({ type: 'tx-all', v: OV }); if (cur.indexOf('g:') !== 0) post({ type: 'tx-go', screen: cur }); if (m.defs) Object.keys(m.defs).forEach(function (k) { if (!DEFS[k]) DEFS[k] = { t: m.defs[k].t, src: 'お連れ様ページ' }; }); }
      if (m.type === 'tx-edit' && typeof m.key === 'string') { setOv(m.key, m.value || '', true); }
    }
    if (root.__txMsg) root.removeEventListener('message', root.__txMsg);
    root.__txMsg = onMsg; root.addEventListener('message', onMsg);
    function setOv(k, v, fromFrame) {
      v = (v || '').trim();
      if (v && CLEAN) v = CLEAN(v).slice(0, 800);
      if (!v || v === defOf(k)) delete OV[k]; else OV[k] = v;
      mark(); renderList();
      if (!fromFrame) post({ type: 'tx-set', key: k, value: OV[k] || '' });
    }

    function rows() {
      var s = (pane.querySelector('#txS') || {}).value || '', g = (pane.querySelector('#txG') || {}).value || '', a = [];
      Object.keys(DEFS).forEach(function (k) { a.push([k, DEFS[k].t, DEFS[k].src]); });
      Object.keys(OV).forEach(function (k) { if (!DEFS[k]) a.push([k, OV[k], '（いまは使われていない文言）']); });
      s = s.trim();
      return a.filter(function (x) {
        if (g === 'chg') { if (OV[x[0]] == null) return false; } else if (g && x[2] !== g) return false;
        if (!s) return true; return (x[1] + (OV[x[0]] || '')).indexOf(s) >= 0;
      });
    }
    function renderList() {
      var box = pane.querySelector('#txL'); if (!box) return;
      var a = rows(), h = '', shown = a.slice(0, limit);
      shown.forEach(function (x) {
        var k = x[0], ov = OV[k], chg = ov != null;
        h += '<div class="txr' + (chg ? ' chg' : '') + '"><small class="txsrc">' + esc(x[2]) + '</small><div class="txdef">' + esc(x[1]).replace(/\n/g, '<br>') + '</div>' +
          '<textarea data-k="' + esc(k) + '" rows="' + Math.min(6, Math.max(2, Math.ceil((ov || x[1]).length / 28))) + '" maxlength="800">' + esc(chg ? ov : x[1]) + '</textarea>' +
          (chg ? '<button type="button" class="s" data-r="' + esc(k) + '">この文言を元に戻す</button>' : '') + '</div>';
      });
      if (!shown.length) h = '<p class="note">該当する文言はありません。</p>';
      if (a.length > limit) h += '<button type="button" class="s" id="txMore">もっと見る（残り ' + (a.length - limit) + ' 件）</button>';
      box.innerHTML = h;
      box.querySelectorAll('textarea').forEach(function (t) { t.onchange = function () { setOv(t.getAttribute('data-k'), t.value); }; });
      box.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = function () { setOv(b.getAttribute('data-r'), ''); }; });
      var mo = box.querySelector('#txMore'); if (mo) mo.onclick = function () { limit += 60; renderList(); };
    }
    function draw() {
      var opt = SCREENS.map(function (g) { return '<optgroup label="' + g[0] + '">' + g[1].map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('') + '</optgroup>'; }).join('');
      pane.innerHTML = '<style>.txw{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:18px;align-items:start}@media(max-width:900px){.txw{grid-template-columns:1fr}}' +
        '.txph{border:2px solid #111;border-radius:22px;overflow:hidden;background:#fff;width:100%;max-width:420px}.txph iframe{width:100%;height:720px;border:0;display:block}' +
        '.txr{border:1px solid var(--line,#ddd);border-radius:9px;padding:9px;margin:0 0 8px;background:#fff}.txr.chg{border-color:#2e8b57;background:#f2fbf5}.txr textarea{width:100%;margin-top:4px}.txdef{font-size:12px;color:#666;margin-top:2px}.txsrc{color:#8a6d2f}' +
        '#txBar{position:sticky;top:0;z-index:5;background:#fff8e1;border:1px solid #e0b84c;border-radius:9px;padding:9px 12px;margin:0 0 10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}</style>' +
        '<h2 style="margin:0 0 4px">お客様画面の文言</h2>' +
        '<p class="note" style="margin:0 0 10px">左の見本画面の<b>点線で囲まれた文字をタップ</b>すると、書き換えられます（同じ文言は、画面のどこに出ていても、まとめて変わります）。エラーや確認メッセージなど、普段は出ない文言は、右の一覧から書き換えてください。<b>「保存する」を押すまで、お客様画面は変わりません。</b></p>' +
        '<div id="txBar" hidden><b>保存していない変更があります</b><button class="p" id="txSave" type="button" style="max-width:200px">保存する</button><button class="s" id="txDis" type="button">変更を取り消す</button></div>' +
        '<div class="txw"><div><label>見本の画面<select id="txSel">' + opt + '</select></label><div class="tools" style="margin:6px 0"><button class="s" id="txPrev" type="button">← 前の画面</button><button class="s" id="txNext" type="button">次の画面 →</button></div>' +
        '<div class="txph"><iframe id="txF" title="お客様画面の見本" src="about:blank"></iframe></div><p class="note">見本の画面です。ここでの操作は保存されません（予約は入りません）。</p></div>' +
        '<div><div class="card" style="margin:0 0 10px"><b>書き換えた文言：<span id="txCnt">' + Object.keys(OV).length + '</span> 件</b>' +
        '<div class="tools" style="margin-top:8px"><button class="s" id="txAllReset" type="button">すべて初期の文言に戻す</button></div></div>' +
        '<div class="tools"><input id="txS" placeholder="文言を検索" style="flex:1;min-width:140px"><select id="txG"><option value="">すべて</option><option value="chg">書き換えた文言</option><option>お客様画面</option><option>エラー・お知らせ</option><option>お連れ様ページ</option></select></div>' +
        '<div id="txL" style="margin-top:8px"></div></div></div>';
      var sel = pane.querySelector('#txSel');
      sel.onchange = function () { go(sel.value); };
      function step(d) { var all = []; SCREENS.forEach(function (g) { g[1].forEach(function (s) { all.push(s[0]); }); }); var i = all.indexOf(sel.value) + d; if (i < 0) i = all.length - 1; if (i >= all.length) i = 0; sel.value = all[i]; go(all[i]); }
      pane.querySelector('#txPrev').onclick = function () { step(-1); }; pane.querySelector('#txNext').onclick = function () { step(1); };
      pane.querySelector('#txS').oninput = function () { limit = 60; renderList(); }; pane.querySelector('#txG').onchange = function () { limit = 60; renderList(); };
      pane.querySelector('#txAllReset').onclick = function () { if (!Object.keys(OV).length) return; if (!confirm('書き換えた文言を、すべて初期の文言に戻します（「保存する」を押すまで、お客様画面は変わりません）。よろしいですか？')) return; OV = {}; mark(); renderList(); post({ type: 'tx-all', v: OV }); };
      pane.querySelector('#txDis').onclick = function () { OV = JSON.parse(JSON.stringify(SAVED)); mark(); renderList(); post({ type: 'tx-all', v: OV }); };
      pane.querySelector('#txSave').onclick = async function () {
        var b = this; b.disabled = true;
        try { await C.cfg.doc('texts').set({ v: OV, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); SAVED = JSON.parse(JSON.stringify(OV)); mark(); say('保存しました（お客様画面に反映されます。開いたままの画面は、再読み込みで変わります）'); }
        catch (e) { say('保存できませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「config」の設定がありません' : e.message)); }
        b.disabled = false;
      };
      renderList(); mark(); go('home');
    }
    return { dirty: function () { return dirty; } };
  }
  root.TXED = { view: view };
})(window);
