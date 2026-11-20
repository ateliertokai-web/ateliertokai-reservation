/* 管理画面：ゴルフの組み合わせ表。予約一覧（ゴルフ）の「組み合わせ表（Excel出力）」から開く。
   ・左：組み合わせ表（組・スタート時間・参加者4名）。お店で使っている表と同じ形。Excelにもこの形で出力する
   ・右：担当スタッフごとの、組（予約）とレクサスオーナーの一覧（小さいパネル）。担当ごとに色分け、オーナーは★
   ・組を表の行に入れると、お連れ様も同じ行の右へ並ぶ。取り消された予約は表から消え、左に詰める
   ・パソコンはドラッグ、スマホは「タップで選ぶ → 行の『ここに入れる』」。並びは保存できる（pairings/{イベントID}、管理者だけ） */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var PAL = [['#e3f2fd', '#1e88e5'], ['#fce4ec', '#d81b60'], ['#e8f5e9', '#43a047'], ['#fff3e0', '#fb8c00'], ['#ede7f6', '#5e35b1'], ['#e0f7fa', '#00acc1'],
    ['#f9fbe7', '#9e9d24'], ['#fbe9e7', '#e64a19'], ['#eceff1', '#546e7a'], ['#f3e5f5', '#8e24aa'], ['#e0f2f1', '#00897b'], ['#fffde7', '#f9a825']];
  var NONE = ['#f7f6f2', '#9b958a'], CAP = 4, EXCEL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', FONT = 'レクサスロダン Pro L';
  var WD = '日月火水木金土';
  function staffOf(r) { var st = r.staff || {}; return (r.stores || Object.keys(st)).filter(function (k) { return st[k]; }).map(function (k) { return { store: k.replace('鹿児島', ''), name: st[k], key: k + ':' + st[k] }; }); }
  function fw(n) { return String(n || '').trim().replace(/\s+/g, '　'); }   // 氏名の間は全角スペース（表の見た目をそろえる）
  function players(r, gs) {
    var out = [], inv = r.inv || {}, ps = r.participants || [], lx = r.lexus || [];
    for (var i = 0; i < r.n; i++) {
      var g = inv[i + 1] ? gs[inv[i + 1]] : null, gok = g && !g.cx;
      out.push({ name: (gok && g.name) || ps[i] || (i === 0 ? r.name : ''), own: !!lx[i] || !!(gok && g.own), guest: !!g, host: i === 0 });
    }
    return out;
  }
  function reiwa(d) { if (!d) return ''; var p = d.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]); return '令和' + (+p[0] - 2018) + '年' + (+p[1]) + '月' + (+p[2]) + '日（' + WD[dt.getDay()] + '）'; }
  function t2m(t) { var a = String(t || '').split(':'); return a.length === 2 ? +a[0] * 60 + +a[1] : NaN; }
  function m2t(m) { return ('0' + Math.floor(m / 60) % 24).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
  function css() {
    if (document.getElementById('pairCss')) return;
    var s = document.createElement('style'); s.id = 'pairCss';
    s.textContent = '.pair{position:fixed;inset:0;z-index:9000;background:#f5f3ee;overflow:auto;-webkit-overflow-scrolling:touch;font-size:14px}' +
      '.pair .hd{position:sticky;top:0;z-index:6;background:#111;color:#e8c872;padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.pair .hd b{font-size:15px;margin-right:auto}' +
      '.pair .hd button{border:1px solid #b8955a;background:#222;color:#e8c872;border-radius:8px;padding:6px 11px;font:inherit;font-size:13px;cursor:pointer}.pair .hd .sv{background:#e8c872;color:#111;font-weight:700}.pair .hd .dirty{background:#c0392b;color:#fff;border-color:#c0392b}' +
      '.pair .bd{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:12px;padding:12px;align-items:start}@media(max-width:860px){.pair .bd{grid-template-columns:1fr}.pair .side{order:-1}}' +
      '.pair .sheet{background:#fff;border:1px solid #d9d2c1;border-radius:10px;padding:14px;overflow-x:auto}.pair .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin:0 0 10px}.pair .meta label{font-size:11px;color:#6b665d;margin:0}' +
      '.pair .meta input{width:100%;padding:5px 7px;font:inherit;font-size:14px;border:1px solid #d9d2c1;border-radius:7px}.pair .meta .t{grid-column:1/-1}.pair .meta .t input{font-weight:700;font-size:16px;text-align:center}' +
      '.pair .ar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:#6b665d;margin:0 0 8px}.pair .ar input,.pair .ar select{padding:4px 6px;font:inherit;font-size:13px;border:1px solid #d9d2c1;border-radius:7px;width:auto}.pair .ar button{padding:4px 10px;border:1px solid #d9d2c1;background:#fff;border-radius:7px;font:inherit;font-size:13px;cursor:pointer}' +
      '.pair table.pt{border-collapse:collapse;width:100%;min-width:640px;table-layout:fixed}.pair .pt th,.pair .pt td{border:1px solid #444;padding:0;height:38px;text-align:center;vertical-align:middle}.pair .pt th{background:#eee;font-weight:400;font-size:12px;height:24px}' +
      '.pair .pt .h8{text-align:left;padding:4px 10px;font-size:13px;background:#fff}.pair .pt .no{width:52px;font-size:13px}.pair .pt .tm{width:92px}.pair .pt .tm input{width:84px;border:0;font:inherit;font-size:14px;text-align:center;background:transparent;padding:0;height:20px;min-height:0;margin:0}.pair .pt .tm select{border:0;font-size:11px;color:#6b665d;background:transparent;padding:0;height:16px;min-height:0;margin:0;width:auto}.pair .pt .tm br{display:none}.pair .pt .tm{line-height:1.1}' +
      '.pair .pt td.nm{font-size:14px;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:manipulation;position:relative;line-height:1.25;padding:2px 3px}.pair .pt td.nm.em{cursor:default;background:#fff}.pair .pt td.nm .ow{color:#b8955a;font-weight:700}' +
      '.pair .pt td.nm .g{display:block;font-size:9.5px;color:#6b665d}.pair .pt td.nm.on{outline:3px solid #111;outline-offset:-3px}.pair .pt td.over{background:#fdeceb!important;color:#c0392b}.pair .pt tr.ov td{background:#fffaf0}' +
      '.pair .pt .ex{width:30px}.pair .pt .ex button{border:0;background:none;color:#c0392b;font-size:16px;cursor:pointer}.pair .put{display:none;margin:2px auto;border:1px dashed #b8955a;background:#fffaf0;color:#8a5a00;border-radius:7px;padding:3px 6px;font:inherit;font-size:11px;cursor:pointer}.pair.sel .put{display:block}' +
      '.pair .side{background:#fff;border:1px solid #d9d2c1;border-radius:10px;padding:10px;position:sticky;top:52px;max-height:calc(100vh - 70px);overflow:auto}@media(max-width:860px){.pair .side{position:static;max-height:46vh}}' +
      '.pair .side h3{margin:0 0 6px;font-size:13px}.pair .side .back{display:none;width:100%;margin:0 0 6px;border:1px dashed #b8955a;background:#fffaf0;color:#8a5a00;border-radius:7px;padding:6px;font:inherit;font-size:12px;cursor:pointer}.pair.sel .side .back{display:block}' +
      '.pair .sg{margin:0 0 8px}.pair .sg .sh{font-size:12px;font-weight:700;border-radius:6px;padding:2px 8px;color:#fff;display:inline-block;margin:0 0 4px}.pair .sc{border:1px solid;border-left-width:5px;border-radius:7px;padding:3px 7px;margin:0 0 4px;font-size:12px;line-height:1.4;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:manipulation}' +
      '.pair .sc.done{opacity:.55}.pair .sc.on{box-shadow:0 0 0 3px #111}.pair .sc .a{display:flex;gap:6px;align-items:baseline}.pair .sc .a b{font-size:12.5px}.pair .sc .a .w{margin-left:auto;font-size:11px;color:#6b665d}.pair .sc .o{color:#8a6d2f;font-size:11px}.pair .sc .nt{font-size:10.5px;color:#6b665d;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.pair .tip{font-size:12px;color:#6b665d;padding:6px 12px 0}.pair .ghost{position:fixed;z-index:9999;pointer-events:none;opacity:.9;background:#fff;border:2px solid #111;border-radius:8px;padding:4px 8px;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.25)}';
    document.head.appendChild(s);
  }
  function loadExcel() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    return new Promise(function (ok, ng) { var s = document.createElement('script'); s.src = EXCEL; s.onload = function () { ok(root.ExcelJS); }; s.onerror = function () { ng(new Error('Excelの部品を読み込めませんでした（電波をご確認ください）')); }; document.head.appendChild(s); });
  }

  async function open(C, ev, rs, gs, say) {
    css();
    var ref = firebase.firestore().collection('pairings').doc(ev.id);
    var live = rs.filter(function (r) { return r.status === 'confirmed' || r.status === 'won'; });
    var byId = {}; live.forEach(function (r) { byId[r.id] = r; });
    var colors = {}, ci = 0, keys = [];
    live.forEach(function (r) { staffOf(r).forEach(function (s) { if (keys.indexOf(s.key) < 0) keys.push(s.key); }); });
    keys.sort().forEach(function (k) { colors[k] = PAL[ci++ % PAL.length]; });
    function col(r) { var s = staffOf(r)[0]; return s ? colors[s.key] : NONE; }
    var firstDate = live.map(function (r) { return r.date; }).filter(Boolean).sort()[0] || '';
    var meta = { title: 'レクサス鹿児島東開　' + (ev.name || ''), date: reiwa(firstDate), course: ev.place === 'ot' ? (ev.placeName || '') : '', tel: '' };
    var rows = [], dirty = false, sel = '', dropped = 0, t0 = '07:12', iv = 7;
    try {
      var d = await ref.get();
      if (d.exists) {
        var D0 = d.data(); if (D0.meta) meta = Object.assign(meta, D0.meta); if (D0.t0) t0 = D0.t0; if (D0.iv) iv = D0.iv;
        rows = (D0.rows || []).map(function (x) { return { id: x.id || C.newId(), time: x.time || '', course: x.course || 'OUT', items: (x.items || []).filter(function (id) { if (byId[id]) return true; dropped++; return false; }) }; });
      }
    } catch (e) { say('組み合わせ表を読み込めませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「pairings」の設定がまだありません。最新のルールを公開してください' : e.message)); return; }
    var seen = {}; rows.forEach(function (x) { x.items = x.items.filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; }); });
    if (!rows.length) { var tot = live.reduce(function (a, r) { return a + r.n; }, 0), nr = Math.max(5, Math.ceil(tot / CAP) + 1); for (var k = 0; k < nr; k++) rows.push({ id: C.newId(), time: m2t(t2m(t0) + k * iv), course: 'OUT', items: [] }); }
    var wrap = document.createElement('div'); wrap.className = 'pair'; document.body.appendChild(wrap);
    function where() { var w = {}; rows.forEach(function (x, i) { x.items.forEach(function (id) { w[id] = i; }); }); return w; }
    function nOf(x) { return x.items.reduce(function (a, id) { return a + byId[id].n; }, 0); }
    function cells(x) { var out = []; x.items.forEach(function (id) { players(byId[id], gs).forEach(function (p) { out.push({ p: p, r: byId[id] }); }); }); return out; }
    function sideHTML() {
      var w = where(), groups = {}, order = keys.slice();
      live.forEach(function (r) { var s = staffOf(r)[0], k = s ? s.key : ''; (groups[k] = groups[k] || []).push(r); });
      if (groups['']) order.push('');
      var left = live.filter(function (r) { return w[r.id] == null; }).length;
      return '<h3>担当者ごとの組・オーナー（未配置 ' + left + ' / ' + live.length + '組）</h3><button type="button" class="back" data-put="pool">選んだ組を、表から外す</button>' +
        order.map(function (k) {
          var c = k ? colors[k] : NONE, list = (groups[k] || []).sort(function (a, b) { return (w[a.id] == null ? -1 : w[a.id]) - (w[b.id] == null ? -1 : w[b.id]); });
          return '<div class="sg"><span class="sh" style="background:' + c[1] + '">' + esc(k ? k.replace('鹿児島', '').replace(':', '：') : '担当なし') + '（' + list.length + '）</span>' +
            list.map(function (r) {
              var ps = players(r, gs), ow = ps.filter(function (p) { return p.own; });
              return '<div class="sc' + (w[r.id] != null ? ' done' : '') + (sel === r.id ? ' on' : '') + '" data-r="' + r.id + '" style="border-color:' + c[1] + ';background:' + c[0] + '"><div class="a"><b>' + esc(r.name) + '</b><span>' + r.n + '名</span><span class="w">' + (w[r.id] != null ? (w[r.id] + 1) + '組' : '未配置') + '</span></div>' +
                (ow.length ? '<div class="o">★' + ow.map(function (p) { return esc(p.name || '（未入力）'); }).join('・★') + '</div>' : '') + (r.note ? '<div class="nt">備考：' + esc(r.note) + '</div>' : '') + '</div>';
            }).join('') + '</div>';
        }).join('');
    }
    function tableHTML() {
      return '<table class="pt"><colgroup><col class="no"><col class="tm"><col><col><col><col><col class="ex"></colgroup>' +
        '<tr><td colspan="6" class="h8">OUT／IN スタート　　ご参加者名（敬省略・順不同）</td><td class="ex"></td></tr><tr><th></th><th>スタート時間</th><th></th><th></th><th></th><th></th><th></th></tr>' +
        rows.map(function (x, i) {
          var cs = cells(x), td = '';
          for (var j = 0; j < Math.max(CAP, cs.length); j++) {
            var c = cs[j];
            if (!c) { td += '<td class="nm em"></td>'; continue; }
            var cc = col(c.r);
            td += '<td class="nm' + (j >= CAP ? ' over' : '') + (sel === c.r.id ? ' on' : '') + '" data-r="' + c.r.id + '" style="background:' + cc[0] + ';box-shadow:inset 0 -3px 0 ' + cc[1] + '">' + (c.p.own ? '<span class="ow">★</span>' : '') + esc(fw(c.p.name) || '（未入力）') + (c.p.guest && c.p.name ? '<span class="g">お連れ様入力</span>' : '') + '</td>';
          }
          return '<tr data-row="' + i + '"><td class="no">' + (i + 1) + '組<button type="button" class="put" data-put="' + i + '">ここに入れる</button></td><td class="tm"><input type="time" data-f="time" data-i="' + i + '" value="' + esc(x.time) + '"><br><select data-f="course" data-i="' + i + '"><option' + (x.course !== 'IN' ? ' selected' : '') + '>OUT</option><option' + (x.course === 'IN' ? ' selected' : '') + '>IN</option></select></td>' + td +
            '<td class="ex">' + (nOf(x) > CAP ? '<span title="4名をこえています" style="color:#c0392b">!</span>' : '') + '<button type="button" data-del="' + i + '" title="この組（行）を削除">×</button></td></tr>';
        }).join('') + '</table>';
    }
    function draw() {
      var sx = wrap.querySelector('.side'), sy = sx ? sx.scrollTop : 0, py = wrap.scrollTop;
      wrap.className = 'pair' + (sel ? ' sel' : '');
      wrap.innerHTML = '<div class="hd"><b>組み合わせ表</b><button type="button" data-a="auto">未配置を自動で並べる</button><button type="button" data-a="add">＋ 組（行）を追加</button><button type="button" data-a="xls">Excelに出力</button>' +
        '<button type="button" class="sv' + (dirty ? ' dirty' : '') + '" data-a="save">' + (dirty ? '保存する（未保存）' : '保存済み') + '</button><button type="button" data-a="close">閉じる</button></div>' +
        '<div class="tip">パソコン：右の組、または表の名前を、入れたい行へドラッグ。スマホ：組をタップして選び、行の「ここに入れる」をタップ。★＝レクサスオーナー、色＝担当スタッフ。' + (dropped ? '（取り消された予約 ' + dropped + '件は、表から外して左に詰めました）' : '') + '</div>' +
        '<div class="bd"><div class="sheet"><div class="meta"><div class="t"><label>タイトル</label><input data-m="title" value="' + esc(meta.title) + '"></div><div><label>◆開催日</label><input data-m="date" value="' + esc(meta.date) + '"></div><div><label>◆開催コース</label><input data-m="course" value="' + esc(meta.course) + '"></div><div><label>℡（コース）</label><input data-m="tel" value="' + esc(meta.tel) + '" inputmode="tel"></div></div>' +
        '<div class="ar">スタート時間：最初<input type="time" id="pt0" value="' + esc(t0) + '">から<input type="number" id="pti" value="' + iv + '" min="1" style="width:52px">分おきに<button type="button" data-a="times">入れる</button></div>' + tableHTML() +
        '<div class="ar" style="margin-top:8px"><button type="button" data-a="add">＋ 組（行）を追加</button></div></div><div class="side">' + sideHTML() + '</div></div>';
      var sx2 = wrap.querySelector('.side'); if (sx2) sx2.scrollTop = sy; wrap.scrollTop = py;
    }
    function mark() { dirty = true; var b = wrap.querySelector('[data-a=save]'); if (b) { b.classList.add('dirty'); b.textContent = '保存する（未保存）'; } }
    function moveTo(rid, z) {
      rows.forEach(function (x) { x.items = x.items.filter(function (id) { return id !== rid; }); });   // 元の行からは外す（左に詰まる）
      if (z !== 'pool' && rows[+z]) rows[+z].items.push(rid);
      sel = ''; dirty = true; draw();
    }
    function close() { if (dirty && !confirm('組み合わせ表の変更が、まだ保存されていません。保存せずに閉じますか？')) return; wrap.remove(); document.removeEventListener('pointermove', pm); document.removeEventListener('pointerup', pu); }
    async function save() {
      try { await ref.set({ eid: ev.id, meta: meta, t0: t0, iv: iv, rows: rows.map(function (x) { return { id: x.id, time: x.time, course: x.course, items: x.items }; }), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); dirty = false; say('組み合わせ表を保存しました'); draw(); }
      catch (e) { say('保存できませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「pairings」の設定がまだありません' : e.message)); }
    }
    function auto() {
      var w = where(), pool = live.filter(function (r) { return w[r.id] == null; }).sort(function (a, b) { return b.n - a.n; });
      if (!pool.length) { say('未配置の組はありません'); return; }
      pool.forEach(function (r) {
        var x = rows.filter(function (y) { return nOf(y) + r.n <= CAP; })[0];
        if (!x) { var last = rows[rows.length - 1], tm = last && !isNaN(t2m(last.time)) ? m2t(t2m(last.time) + iv) : ''; x = { id: C.newId(), time: tm, course: 'OUT', items: [] }; rows.push(x); }
        x.items.push(r.id);
      });
      dirty = true; draw(); say(pool.length + '組を並べました。必要に応じて、動かして調整してください');
    }
    async function xls() {
      try {
        say('Excelを作っています…');
        var X = await loadExcel(), wb = new X.Workbook();
        var thin = { style: 'thin', color: { argb: 'FF000000' } }, BOX = { top: thin, left: thin, bottom: thin, right: thin };
        var F = function (sz, o) { return Object.assign({ name: FONT, size: sz, family: 1, charset: 128 }, o || {}); };
        ['OUT', 'IN'].forEach(function (course) {
          var list = rows.filter(function (x) { return (x.course || 'OUT') === course; });
          if (!list.length || (course === 'IN' && !list.some(function (x) { return x.items.length; }))) return;
          var ws = wb.addWorksheet(course + 'スタート', { views: [{ showGridLines: false }] });
          ws.columns = [{ width: 5.625 }, { width: 5.375 }, { width: 13.125 }, { width: 17.75 }, { width: 17.75 }, { width: 17.75 }, { width: 17.75 }];
          [21, 21, 16.5, 15, 21, 18, 18, 14.25, 14.25, 8.25, 7.5].forEach(function (h, i) { ws.getRow(i + 1).height = h; });
          ws.mergeCells('B1:G1'); var c1 = ws.getCell('B1'); c1.value = meta.title; c1.font = F(16, { bold: true, italic: true }); c1.alignment = { horizontal: 'center' };
          ws.mergeCells('B2:G2');
          ws.mergeCells('B6:E6'); var c6 = ws.getCell('B6'); c6.value = '◆開催日:' + meta.date; c6.font = F(14); c6.alignment = { horizontal: 'left' };
          ws.mergeCells('B7:E7'); var c7 = ws.getCell('B7'); c7.value = '◆開催コース：' + meta.course; c7.font = F(14); c7.alignment = { horizontal: 'left' };
          ws.mergeCells('F7:G7'); var c7b = ws.getCell('F7'); c7b.value = meta.tel ? ' ℡：' + meta.tel : ''; c7b.font = F(14); c7b.alignment = { horizontal: 'left' };
          ['B7', 'C7', 'D7', 'E7', 'F7', 'G7'].forEach(function (a) { ws.getCell(a).border = { bottom: thin }; });
          ws.mergeCells('B8:G9'); var c8 = ws.getCell('B8'); c8.value = '　　　' + course + 'スタート　　　　　　　　　ご参加者名（敬省略・順不同）'; c8.font = F(12); c8.alignment = { horizontal: 'left', vertical: 'middle' };
          for (var cc = 2; cc <= 7; cc++) { ws.getCell(8, cc).border = BOX; ws.getCell(9, cc).border = BOX; }
          ['B', 'C', 'D', 'E', 'F', 'G'].forEach(function (L) { ws.mergeCells(L + '10:' + L + '11'); var c = ws.getCell(L + '10'); c.font = F(11); c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = { type: 'pattern', pattern: 'lightGray' }; c.border = BOX; ws.getCell(L + '11').border = BOX; });
          ws.getCell('C10').value = 'スタート時間';
          // 時刻：最初の行の時刻＋間隔（お店の表と同じく、最初の時刻を変えると、全部の時刻が変わる式）。間隔がそろっていないときは、時刻をそのまま入れる
          var m0 = t2m(list[0].time), even = !isNaN(m0) && list.every(function (x, i) { return t2m(x.time) === m0 + i * iv; });
          list.forEach(function (x, i) {
            var r1 = 12 + i * 2, r2 = r1 + 1, n = rows.indexOf(x) + 1, cs = cells(x);
            ws.getRow(r1).height = 14.25; ws.getRow(r2).height = 14.25;
            ['B', 'C', 'D', 'E', 'F', 'G'].forEach(function (L) { ws.mergeCells(L + r1 + ':' + L + r2); });
            var b = ws.getCell('B' + r1); b.value = n + '組';
            var tc = ws.getCell('C' + r1), mm = t2m(x.time);
            if (!isNaN(mm)) { if (even && i > 0) tc.value = { formula: '$C$12+TIME(0,' + (i * iv) + ',0)', result: (m0 + i * iv) / 1440 }; else tc.value = mm / 1440; tc.numFmt = 'h:mm'; }
            for (var j = 0; j < CAP; j++) { var nc = ws.getCell(String.fromCharCode(68 + j) + r1); nc.value = cs[j] ? fw(cs[j].p.name) : null; }
            ['B', 'C', 'D', 'E', 'F', 'G'].forEach(function (L) { [r1, r2].forEach(function (rr) { var c = ws.getCell(L + rr); c.font = F(12); c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = BOX; }); });
          });
          var last = 11 + list.length * 2;
          ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, showGridLines: false, printArea: 'B1:G' + last,
            margins: { left: 0.25, right: 0.25, top: 0.2777777777777778, bottom: 0.2777777777777778, header: 0.1111111111111111, footer: 0.1111111111111111 } };
        });
        // 店舗用：担当・オーナー一覧（配布する表には入れない）
        var w2 = wb.addWorksheet('担当・オーナー一覧'), wr = where();
        w2.columns = [{ header: '組', width: 6 }, { header: 'スタート', width: 8 }, { header: 'コース', width: 7 }, { header: '担当', width: 16 }, { header: '代表者', width: 14 }, { header: '区分', width: 9 }, { header: '氏名', width: 16 }, { header: 'オーナー', width: 8 }, { header: '備考', width: 30 }];
        w2.getRow(1).font = { bold: true };
        live.slice().sort(function (a, b) { return (wr[a.id] == null ? 999 : wr[a.id]) - (wr[b.id] == null ? 999 : wr[b.id]); }).forEach(function (r) {
          var i = wr[r.id], x = i != null ? rows[i] : null, c = col(r), st = staffOf(r).map(function (s) { return s.store + '：' + s.name; }).join('・');
          players(r, gs).forEach(function (p, k) {
            var row = w2.addRow([x ? (i + 1) + '組' : '未配置', x ? x.time : '', x ? x.course : '', st, r.name, p.host ? '代表者' : p.guest ? 'お連れ様' : '参加者', fw(p.name) || '（未入力）', p.own ? '★' : '', k ? '' : (r.note || '')]);
            row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c[0].slice(1).toUpperCase() } };
            if (p.own) { row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1C9' } }; row.getCell(7).font = { bold: true }; }
          });
        });
        var buf = await wb.xlsx.writeBuffer(), blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = '組み合わせ表_' + String(ev.name || '').replace(/[\\/:*?"<>|]/g, '') + '.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        say('Excelを出力しました');
      } catch (e) { say('Excelを出力できませんでした: ' + e.message); }
    }
    // ドラッグ（マウス）と、タップで選んで入れる（スマホ）
    var drag = null;
    wrap.addEventListener('pointerdown', function (e) {
      var p = e.target.closest('[data-r]'); if (!p || e.button > 0 || e.target.closest('input,select,button')) return;
      drag = { id: p.dataset.r, x: e.clientX, y: e.clientY, on: false, mouse: e.pointerType === 'mouse' };
    });
    function pm(e) {
      if (!drag || !drag.mouse) return;
      if (!drag.on && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) { drag.on = true; drag.g = document.createElement('div'); drag.g.className = 'ghost'; drag.g.textContent = byId[drag.id].name + ' 様の組（' + byId[drag.id].n + '名）'; wrap.appendChild(drag.g); }
      if (drag.on) {
        drag.g.style.left = (e.clientX + 12) + 'px'; drag.g.style.top = (e.clientY + 8) + 'px';
        wrap.querySelectorAll('tr.ov').forEach(function (z) { z.classList.remove('ov'); });
        var t = document.elementFromPoint(e.clientX, e.clientY), tr = t && t.closest('tr[data-row]'); if (tr) tr.classList.add('ov');
      }
    }
    function pu(e) {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.on) {
        d.g.remove(); var t = document.elementFromPoint(e.clientX, e.clientY), tr = t && t.closest('tr[data-row]');
        if (tr) return moveTo(d.id, tr.dataset.row);
        if (t && t.closest('.side')) return moveTo(d.id, 'pool');
        wrap.querySelectorAll('tr.ov').forEach(function (z) { z.classList.remove('ov'); }); return;
      }
      var tt = e.target.closest('[data-r]'); if (tt && tt.dataset.r === d.id) { sel = sel === d.id ? '' : d.id; draw(); }
    }
    document.addEventListener('pointermove', pm); document.addEventListener('pointerup', pu);
    wrap.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.put != null) { if (sel) moveTo(sel, t.dataset.put); return; }
      if (t.dataset.del != null) { var i = +t.dataset.del; if (rows[i].items.length && !confirm((i + 1) + '組の行を削除します。入っている組は「未配置」に戻ります。よろしいですか？')) return; rows.splice(i, 1); dirty = true; return draw(); }
      var a = t.dataset.a;
      if (a === 'close') close(); else if (a === 'save') save(); else if (a === 'auto') auto(); else if (a === 'xls') xls();
      else if (a === 'add') { var last = rows[rows.length - 1], tm = last && !isNaN(t2m(last.time)) ? m2t(t2m(last.time) + iv) : ''; rows.push({ id: C.newId(), time: tm, course: last ? last.course : 'OUT', items: [] }); dirty = true; draw(); }
      else if (a === 'times') {
        var v0 = wrap.querySelector('#pt0').value, vi = +wrap.querySelector('#pti').value;
        if (isNaN(t2m(v0)) || !(vi >= 1)) { alert('最初の時刻と間隔を入れてください'); return; }
        t0 = v0; iv = vi; rows.forEach(function (x, i) { x.time = m2t(t2m(t0) + i * iv); }); dirty = true; draw();
      }
    });
    wrap.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.f && t.dataset.i != null) { rows[+t.dataset.i][t.dataset.f] = t.value; mark(); }
      else if (t.dataset.m) { meta[t.dataset.m] = t.value; mark(); }
      else if (t.id === 'pt0' || t.id === 'pti') { t0 = wrap.querySelector('#pt0').value || t0; iv = +wrap.querySelector('#pti').value || iv; }
    });
    draw();
  }
  root.PAIR = { open: open, players: players, staffOf: staffOf };
})(window);
