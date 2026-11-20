/* 管理画面：ゴルフの組み合わせ表。予約一覧（ゴルフ）の「組み合わせ表」から開く。
   ・予約1件＝組パネル（代表者・参加者・お連れ様の入力・レクサスオーナー・担当スタッフ・備考）。担当スタッフごとに色分け、オーナーは★
   ・パネルを、スタートの行（1行4名まで）に動かして並べる。パソコンはドラッグ、スマホは「タップで選ぶ → 行をタップ」
   ・並べた内容は保存できる（pairings/{イベントID}、管理者だけが読み書き）。Excel（色つき）に出力できる */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var PAL = [['#e3f2fd', '#1e88e5'], ['#fce4ec', '#d81b60'], ['#e8f5e9', '#43a047'], ['#fff3e0', '#fb8c00'], ['#ede7f6', '#5e35b1'], ['#e0f7fa', '#00acc1'],
    ['#f9fbe7', '#9e9d24'], ['#fbe9e7', '#e64a19'], ['#eceff1', '#546e7a'], ['#f3e5f5', '#8e24aa'], ['#e0f2f1', '#00897b'], ['#fffde7', '#f9a825']];
  var CAP = 4, EXCEL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  function staffOf(r) { var st = r.staff || {}; return (r.stores || Object.keys(st)).filter(function (k) { return st[k]; }).map(function (k) { return { store: k.replace('鹿児島', ''), name: st[k], key: k + ':' + st[k] }; }); }
  function players(r, gs) {
    var out = [], inv = r.inv || {}, ps = r.participants || [], lx = r.lexus || [];
    for (var i = 0; i < r.n; i++) {
      var g = inv[i + 1] ? gs[inv[i + 1]] : null, gok = g && !g.cx;
      var name = (gok && g.name) || ps[i] || (i === 0 ? r.name : '');
      out.push({ name: name || '', own: !!lx[i] || !!(gok && g.own), guest: !!g, host: i === 0 });
    }
    return out;
  }
  function css() {
    if (document.getElementById('pairCss')) return;
    var s = document.createElement('style'); s.id = 'pairCss';
    s.textContent = '.pair{position:fixed;inset:0;z-index:9000;background:#f5f3ee;overflow:auto;-webkit-overflow-scrolling:touch}.pair .hd{position:sticky;top:0;z-index:5;background:#111;color:#e8c872;padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.pair .hd b{font-size:16px;margin-right:auto}.pair .hd button{border:1px solid #b8955a;background:#222;color:#e8c872;border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}.pair .hd button.sv{background:#e8c872;color:#111;font-weight:700}' +
      '.pair .dirty{background:#c0392b!important;color:#fff!important;border-color:#c0392b!important}.pair .bd{display:grid;grid-template-columns:300px 1fr;gap:14px;padding:14px;align-items:start}@media(max-width:820px){.pair .bd{grid-template-columns:1fr}}' +
      '.pair .lg{display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px 0}.pair .lg span{font-size:12px;border-radius:999px;padding:2px 9px;border:1px solid}.pair .tip{font-size:12.5px;color:#6b665d;padding:4px 14px 0}' +
      '.pair .pool,.pair .rw{background:#fff;border:1px solid #e2dccd;border-radius:12px}.pair .pool{padding:10px;position:sticky;top:60px;max-height:calc(100vh - 80px);overflow:auto}@media(max-width:820px){.pair .pool{position:static;max-height:none}}' +
      '.pair h3{margin:0 0 8px;font-size:14px}.pair .zone{min-height:54px;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start;border-radius:10px;padding:4px}.pair .zone.ov{outline:2px dashed #b8955a;background:#fffaf0}' +
      '.pair .rw{margin:0 0 10px;padding:8px 10px}.pair .rh{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px}.pair .rh .no{font-weight:700;min-width:2.2em}.pair .rh input,.pair .rh select{padding:5px 6px;font:inherit;font-size:14px;border:1px solid #d9d2c1;border-radius:7px;width:auto}' +
      '.pair .rh .ct{font-size:12px;border-radius:8px;padding:2px 8px;background:#eef6f0;color:#1f7a4d}.pair .rh .ct.ng{background:#fdeceb;color:#c0392b}.pair .rh .rx{margin-left:auto;border:0;background:none;color:#c0392b;font-size:18px;cursor:pointer}' +
      '.pair .put{display:none;border:1px dashed #b8955a;background:#fffaf0;color:#8a5a00;border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}.pair.sel .put{display:inline-block}' +
      '.pair .pp{width:230px;max-width:100%;border:1px solid;border-left-width:6px;border-radius:10px;padding:6px 8px;font-size:13px;line-height:1.45;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:manipulation;background:#fff}' +
      '.pair .pp.on{box-shadow:0 0 0 3px #111}.pair .pp .t{display:flex;gap:6px;align-items:baseline;font-weight:700}.pair .pp .t small{font-weight:400;color:#6b665d}.pair .pp .sf{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0}' +
      '.pair .pp .sf span{font-size:11px;border-radius:6px;padding:0 6px;color:#fff}.pair .pp ul{margin:2px 0 0;padding:0;list-style:none}.pair .pp li{display:flex;gap:4px;align-items:center}.pair .pp li .ow{font-size:10.5px;background:#b8955a;color:#fff;border-radius:5px;padding:0 5px;font-weight:700}' +
      '.pair .pp li .gi{font-size:10px;color:#6b665d}.pair .pp li.em{color:#a39e93}.pair .pp .nt{font-size:11.5px;color:#6b665d;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.pair .ghost{position:fixed;z-index:9999;pointer-events:none;opacity:.85;transform:rotate(2deg)}.pair .ar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin:0 0 10px}.pair .ar input,.pair .ar select{padding:5px 6px;font:inherit;font-size:13px;border:1px solid #d9d2c1;border-radius:7px;width:auto}';
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
    var colors = {}, ci = 0;
    live.slice().sort(function (a, b) { return (staffOf(a)[0] || {}).key > (staffOf(b)[0] || {}).key ? 1 : -1; }).forEach(function (r) { staffOf(r).forEach(function (s) { if (!colors[s.key]) colors[s.key] = PAL[ci++ % PAL.length]; }); });
    var NONE = ['#ffffff', '#b8b2a5'];
    function col(r) { var s = staffOf(r)[0]; return s ? colors[s.key] : NONE; }
    var rows = [], dirty = false, sel = '', dropped = 0;
    try {
      var d = await ref.get();
      if (d.exists) rows = (d.data().rows || []).map(function (x) { var it = (x.items || []).filter(function (id) { if (byId[id]) return true; dropped++; return false; }); return { id: x.id || C.newId(), time: x.time || '', course: x.course || '', items: it }; });
    } catch (e) { say('組み合わせ表を読み込めませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「pairings」の設定がまだありません。最新のルールを公開してください' : e.message)); return; }
    var seen = {}; rows.forEach(function (x) { x.items = x.items.filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; }); });
    if (!rows.length) for (var k = 0; k < Math.max(3, Math.ceil(live.reduce(function (a, r) { return a + r.n; }, 0) / CAP)); k++) rows.push({ id: C.newId(), time: '', course: '', items: [] });
    var wrap = document.createElement('div'); wrap.className = 'pair'; document.body.appendChild(wrap);
    function used() { var u = {}; rows.forEach(function (x) { x.items.forEach(function (id) { u[id] = 1; }); }); return u; }
    function nOf(x) { return x.items.reduce(function (a, id) { return a + (byId[id] ? byId[id].n : 0); }, 0); }
    function panel(r) {
      var c = col(r), ps = players(r, gs), sf = staffOf(r);
      return '<div class="pp' + (sel === r.id ? ' on' : '') + '" data-r="' + r.id + '" style="border-color:' + c[1] + ';background:' + c[0] + '">' +
        '<div class="t">' + esc(r.name) + ' 様<small>' + r.n + '名</small></div>' +
        (sf.length ? '<div class="sf">' + sf.map(function (s) { return '<span style="background:' + colors[s.key][1] + '">' + esc(s.store + '：' + s.name) + '</span>'; }).join('') + '</div>' : '') +
        '<ul>' + ps.map(function (p) { return '<li' + (p.name ? '' : ' class="em"') + '>' + (p.name ? esc(p.name) : '（未入力）') + (p.own ? '<span class="ow">★オーナー</span>' : '') + (p.guest && p.name ? '<span class="gi">お連れ様入力</span>' : '') + '</li>'; }).join('') + '</ul>' +
        (r.note ? '<div class="nt">備考：' + esc(r.note) + '</div>' : '') + '</div>';
    }
    function draw() {
      var u = used(), pool = live.filter(function (r) { return !u[r.id]; }).sort(function (a, b) { return (a.date + a.start) < (b.date + b.start) ? -1 : (a.date + a.start) > (b.date + b.start) ? 1 : C.ms(a.createdAt) - C.ms(b.createdAt); });
      wrap.className = 'pair' + (sel ? ' sel' : '');
      wrap.innerHTML = '<div class="hd"><b>組み合わせ表　' + esc(ev.name) + '</b><button type="button" data-a="auto">自動で並べる</button><button type="button" data-a="add">＋ 行を追加</button><button type="button" data-a="xls">Excelに出力</button>' +
        '<button type="button" class="sv' + (dirty ? ' dirty' : '') + '" data-a="save">' + (dirty ? '保存する（未保存）' : '保存済み') + '</button><button type="button" data-a="close">閉じる</button></div>' +
        '<div class="lg">' + Object.keys(colors).map(function (k) { return '<span style="background:' + colors[k][0] + ';border-color:' + colors[k][1] + '">' + esc(k.replace('鹿児島', '').replace(':', '：')) + '</span>'; }).join('') + '<span style="background:#fff;border-color:#b8955a">★＝レクサスオーナー</span></div>' +
        '<div class="tip">パソコン：組パネルを、行にドラッグします。スマホ：組パネルをタップして選び、入れたい行の「ここに入れる」をタップします。1行は' + CAP + '名までが目安です。' + (dropped ? '（取り消された予約 ' + dropped + '件は、表から外しました）' : '') + '</div>' +
        '<div class="bd"><div class="pool"><h3>まだ並べていない組（' + pool.length + '組）</h3><button type="button" class="put" data-put="pool">ここに戻す</button><div class="zone" data-z="pool">' + pool.map(panel).join('') + (pool.length ? '' : '<p class="tip" style="padding:0">すべて並べました</p>') + '</div></div>' +
        '<div><div class="ar">時刻を順に入れる：最初<input type="time" id="pt0" value="07:30">間隔<input type="number" id="pti" value="8" min="1" style="width:56px">分　コース<select id="ptc"><option value="">—</option><option>OUT</option><option>IN</option></select><button type="button" class="s" data-a="times">入れる</button></div>' +
        rows.map(function (x, i) {
          var n = nOf(x);
          return '<div class="rw" data-row="' + i + '"><div class="rh"><span class="no">' + (i + 1) + '組</span><input type="time" data-f="time" data-i="' + i + '" value="' + esc(x.time) + '"><select data-f="course" data-i="' + i + '"><option value="">コース</option>' + ['OUT', 'IN'].map(function (c) { return '<option' + (x.course === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>' +
            '<span class="ct' + (n > CAP ? ' ng' : '') + '">' + n + ' / ' + CAP + '名</span><button type="button" class="put" data-put="' + i + '">ここに入れる</button><button type="button" class="rx" data-del="' + i + '" title="この行を削除">×</button></div>' +
            '<div class="zone" data-z="' + i + '">' + x.items.map(function (id) { return panel(byId[id]); }).join('') + '</div></div>';
        }).join('') + '<button type="button" class="s" data-a="add" style="width:100%">＋ 行を追加</button></div></div>';
    }
    function setDirty() { dirty = true; }
    function moveTo(rid, z) {
      rows.forEach(function (x) { x.items = x.items.filter(function (id) { return id !== rid; }); });
      if (z !== 'pool') rows[+z].items.push(rid);
      sel = ''; setDirty(); draw();
    }
    function close() { if (dirty && !confirm('組み合わせ表の変更が、まだ保存されていません。保存せずに閉じますか？')) return; wrap.remove(); document.removeEventListener('pointermove', pm); document.removeEventListener('pointerup', pu); }
    async function save() {
      try { await ref.set({ eid: ev.id, rows: rows.map(function (x) { return { id: x.id, time: x.time, course: x.course, items: x.items }; }), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); dirty = false; say('組み合わせ表を保存しました'); draw(); }
      catch (e) { say('保存できませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「pairings」の設定がまだありません' : e.message)); }
    }
    function auto() {
      var u = used(), pool = live.filter(function (r) { return !u[r.id]; }).sort(function (a, b) { return b.n - a.n; });
      if (!pool.length) { say('並べていない組はありません'); return; }
      pool.forEach(function (r) {   // 人数の多い組から、入る行の最初に入れる（4名をこえない）
        var x = rows.filter(function (y) { return nOf(y) + r.n <= CAP; })[0];
        if (!x) { x = { id: C.newId(), time: '', course: '', items: [] }; rows.push(x); }
        x.items.push(r.id);
      });
      setDirty(); draw(); say(pool.length + '組を並べました。必要に応じて、動かして調整してください');
    }
    async function xls() {
      try {
        say('Excelを作っています…');
        var X = await loadExcel(), wb = new X.Workbook(), ws = wb.addWorksheet('組み合わせ表', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
        var ARGB = function (h) { return 'FF' + h.replace('#', '').toUpperCase(); }, thin = { style: 'thin', color: { argb: 'FFBBBBBB' } }, B = { top: thin, left: thin, bottom: thin, right: thin };
        ws.mergeCells('A1:K1'); ws.getCell('A1').value = ev.name + '　組み合わせ表'; ws.getCell('A1').font = { bold: true, size: 14 };
        ws.getCell('A2').value = '★＝レクサスオーナー　色＝担当スタッフ（凡例は「凡例」シート）'; ws.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
        var head = ['組', 'スタート', 'コース', '参加者1', '参加者2', '参加者3', '参加者4', '担当', '代表者', '予約番号', '備考'];
        var hr = ws.addRow([]); hr = ws.getRow(3); head.forEach(function (h, i) { var c = hr.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFE8C872' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } }; c.border = B; c.alignment = { vertical: 'middle', horizontal: 'center' }; });
        ws.columns = [{ width: 6 }, { width: 8 }, { width: 7 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 30 }];
        ws.views = [{ state: 'frozen', ySplit: 3 }];
        var put = function (label, time, course, ids) {
          var pl = [], staff = [], host = [], idt = [], note = [];
          ids.forEach(function (id) { var r = byId[id]; players(r, gs).forEach(function (p) { pl.push({ p: p, r: r }); }); staff.push(staffOf(r).map(function (s) { return s.store + '：' + s.name; }).join('・') || '—'); host.push(r.name); idt.push(r.id.replace(/(.{4})(?=.)/g, '$1-')); if (r.note) note.push(r.name + '：' + r.note); });
          var rowN = Math.max(1, Math.ceil(pl.length / CAP));
          for (var k = 0; k < rowN; k++) {
            var part = pl.slice(k * CAP, k * CAP + CAP), row = ws.addRow([k ? '' : label, k ? '' : time, k ? '' : course, '', '', '', '', k ? '' : staff.join(' / '), k ? '' : host.join(' / '), k ? '' : idt.join('\n'), k ? '' : note.join('\n')]);
            for (var j = 0; j < 4; j++) {
              var c = row.getCell(4 + j), x = part[j];
              if (x) { var cc = col(x.r); c.value = (x.p.own ? '★' : '') + (x.p.name || '（未入力）'); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(x.p.own ? '#FFF1C9' : cc[0]) } }; c.font = { bold: x.p.own, color: { argb: x.p.name ? 'FF1D1D1B' : 'FF999999' } }; }
            }
            for (var m = 1; m <= 11; m++) { var ce = row.getCell(m); ce.border = B; ce.alignment = Object.assign({ vertical: 'middle', wrapText: true }, m <= 3 ? { horizontal: 'center' } : {}); }
            if (!k && ids.length) { var c8 = row.getCell(8), f = col(byId[ids[0]]); c8.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(f[0]) } }; c8.font = { color: { argb: ARGB(f[1]) }, bold: true }; }
          }
        };
        rows.forEach(function (x, i) { put((i + 1) + '組', x.time, x.course, x.items); });
        var u = used(), rest = live.filter(function (r) { return !u[r.id]; });
        if (rest.length) { ws.addRow([]); var tr = ws.addRow(['未配置の組']); tr.getCell(1).font = { bold: true, color: { argb: 'FFC0392B' } }; rest.forEach(function (r) { put('—', '', '', [r.id]); }); }
        var w2 = wb.addWorksheet('参加者一覧'); w2.columns = [{ header: '組', width: 6 }, { header: 'スタート', width: 8 }, { header: 'コース', width: 7 }, { header: '代表者', width: 14 }, { header: '予約番号', width: 16 }, { header: '区分', width: 9 }, { header: '氏名', width: 18 }, { header: 'レクサスオーナー', width: 10 }, { header: '担当', width: 18 }, { header: '備考', width: 30 }];
        w2.getRow(1).font = { bold: true };
        var where = {}; rows.forEach(function (x, i) { x.items.forEach(function (id) { where[id] = { n: (i + 1) + '組', t: x.time, c: x.course }; }); });
        live.forEach(function (r) { var w = where[r.id] || { n: '未配置', t: '', c: '' }; players(r, gs).forEach(function (p, i) { var rw = w2.addRow([w.n, w.t, w.c, r.name, r.id.replace(/(.{4})(?=.)/g, '$1-'), p.host ? '代表者' : p.guest ? 'お連れ様' : '参加者', p.name || '（未入力）', p.own ? '★' : '', staffOf(r).map(function (s) { return s.store + '：' + s.name; }).join('・'), i ? '' : (r.note || '')]); if (p.own) rw.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1C9' } }; }); });
        var w3 = wb.addWorksheet('凡例'); w3.columns = [{ header: '担当スタッフ', width: 22 }]; w3.getRow(1).font = { bold: true };
        Object.keys(colors).forEach(function (k) { var c = w3.addRow([k.replace(':', '：')]).getCell(1); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(colors[k][0]) } }; c.font = { color: { argb: ARGB(colors[k][1]) }, bold: true }; });
        var oc = w3.addRow(['★ レクサスオーナー']).getCell(1); oc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1C9' } }; oc.font = { bold: true };
        var buf = await wb.xlsx.writeBuffer(), blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = '組み合わせ表_' + ev.name.replace(/[\\/:*?"<>|]/g, '') + '.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        say('Excelを出力しました');
      } catch (e) { say('Excelを出力できませんでした: ' + e.message); }
    }
    // ドラッグ（マウス）と、タップで選んで入れる（スマホ）
    var drag = null;
    wrap.addEventListener('pointerdown', function (e) {
      var p = e.target.closest('.pp'); if (!p || e.button > 0) return;
      drag = { id: p.dataset.r, x: e.clientX, y: e.clientY, el: p, on: false, mouse: e.pointerType === 'mouse' };
    });
    function pm(e) {
      if (!drag || !drag.mouse) return;
      if (!drag.on && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) { drag.on = true; drag.g = drag.el.cloneNode(true); drag.g.classList.add('ghost'); drag.g.style.width = drag.el.offsetWidth + 'px'; wrap.appendChild(drag.g); drag.el.style.opacity = .35; }
      if (drag.on) {
        drag.g.style.left = (e.clientX - 20) + 'px'; drag.g.style.top = (e.clientY - 14) + 'px';
        wrap.querySelectorAll('.zone.ov').forEach(function (z) { z.classList.remove('ov'); });
        var t = document.elementFromPoint(e.clientX, e.clientY), z = t && t.closest('.rw,.pool'); if (z) { var zz = z.querySelector('.zone'); if (zz) zz.classList.add('ov'); }
      }
    }
    function pu(e) {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.on) {
        d.g.remove(); var t = document.elementFromPoint(e.clientX, e.clientY), z = t && t.closest('.rw,.pool');
        if (z) return moveTo(d.id, z.classList.contains('pool') ? 'pool' : z.dataset.row);
        d.el.style.opacity = ''; wrap.querySelectorAll('.zone.ov').forEach(function (x) { x.classList.remove('ov'); }); return;
      }
      if (e.target.closest('.pp') === d.el) { sel = sel === d.id ? '' : d.id; draw(); }
    }
    document.addEventListener('pointermove', pm); document.addEventListener('pointerup', pu);
    wrap.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.put != null && sel) return moveTo(sel, t.dataset.put);
      if (t.dataset.del != null) { var i = +t.dataset.del; if (rows[i].items.length && !confirm((i + 1) + '組の行を削除します。入っている組は「まだ並べていない組」に戻ります。よろしいですか？')) return; rows.splice(i, 1); setDirty(); return draw(); }
      var a = t.dataset.a;
      if (a === 'close') close(); else if (a === 'save') save(); else if (a === 'auto') auto(); else if (a === 'xls') xls();
      else if (a === 'add') { rows.push({ id: C.newId(), time: '', course: '', items: [] }); setDirty(); draw(); }
      else if (a === 'times') {
        var t0 = wrap.querySelector('#pt0').value, iv = +wrap.querySelector('#pti').value, cs = wrap.querySelector('#ptc').value;
        if (!/^\d\d:\d\d$/.test(t0) || !(iv >= 1)) { alert('最初の時刻と間隔を入れてください'); return; }
        var m0 = +t0.slice(0, 2) * 60 + +t0.slice(3); rows.forEach(function (x, i) { var m = m0 + i * iv; x.time = ('0' + Math.floor(m / 60) % 24).slice(-2) + ':' + ('0' + m % 60).slice(-2); if (cs) x.course = cs; }); setDirty(); draw();
      }
    });
    wrap.addEventListener('change', function (e) { var t = e.target; if (t.dataset.f && t.dataset.i != null) { rows[+t.dataset.i][t.dataset.f] = t.value; dirty = true; var b = wrap.querySelector('[data-a=save]'); b.classList.add('dirty'); b.textContent = '保存する（未保存）'; } });
    draw();
  }
  root.PAIR = { open: open, players: players, staffOf: staffOf };
})(window);
