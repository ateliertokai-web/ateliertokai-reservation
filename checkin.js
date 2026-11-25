/* 管理画面：来場受付（QR）。管理画面だけの機能で、お客様の画面には何も出しません。
   ・イベントの設定で「来場受付を使う」をONにしたイベントが、ここに出る
   ・予約番号のQR（または、予約番号の入力・名前の検索）で、来場を記録する（reservations.checkin = {at, by}）
   ・スマホのカメラで読み取る（対応していない端末は、予約番号の入力・一覧の「受付」ボタンで）
   ・複数のスタッフが同時に使っても、画面が自動で、最新になる（二重に受付しても、先の記録を残す） */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ID = /[A-HJ-NP-Z2-9]{12}/;
  // QR・入力の文字から、予約番号（12文字）を取り出す。「ABCD-EFGH-JKLM」「メールの控えのリンク（#r=…&m=…）」「小文字」も受け付ける
  function parseId(t) {
    var s = String(t || '').trim().toUpperCase(), m = /#R=([A-Z0-9]{12})/.exec(s); if (m && ID.test(m[1])) return m[1];
    s = s.replace(/[\s\-ー－　]/g, ''); if (/^[A-HJ-NP-Z2-9]{12}$/.test(s)) return s;
    m = ID.exec(s.replace(/[^A-Z0-9]/g, '')); return m ? m[0] : '';
  }
  // 人数：大人＝中学生以上、こども＝中学生未満（未就学児・小学生）。予約の人数と、受付で直した来店人数（arrive）
  function adv(r) { var c = (+r.k || 0) + (+r.s || 0), n = +r.n || ((+r.a || 0) + (+r.m || 0) + c); return { a: Math.max(0, n - c), c: c }; }
  function arr(r) { var b = adv(r), o = r.arrive; if (o && typeof o.a === 'number' && typeof o.c === 'number') return { a: o.a, c: o.c, mod: o.a !== b.a || o.c !== b.c }; return { a: b.a, c: b.c, mod: false }; }
  var EXCEL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  function loadExcel() { if (root.ExcelJS) return Promise.resolve(root.ExcelJS); return new Promise(function (y, n) { var t = document.createElement('script'); t.src = EXCEL; t.onload = function () { y(root.ExcelJS); }; t.onerror = function () { n(new Error('Excelの部品を読み込めませんでした（電波をご確認ください）')); }; document.head.appendChild(t); }); }
  var JSQR = 'jsqr.min.js';   // 読み取りの部品は、このサイトの中に置いてある（外のサイトに頼らない。カメラで読み取るときだけ、読み込む）
  function loadJsQR() { if (root.jsQR) return Promise.resolve(); return new Promise(function (y, n) { var s = document.createElement('script'); s.src = JSQR; s.onload = y; s.onerror = function () { n(new Error('読み取りの部品を読み込めませんでした（電波をご確認のうえ、ページを再読み込みしてください）。予約番号の入力でも、受付できます')); }; document.head.appendChild(s); }); }
  function css() {
    if (document.getElementById('ckcss')) return;
    var s = document.createElement('style'); s.id = 'ckcss';
    s.textContent = '.ck .big{font-size:22px;font-weight:700}.ck .cam{position:relative;background:#000;border-radius:12px;overflow:hidden;max-width:420px;margin:8px 0}.ck .cam video{width:100%;display:block}.ck .cam .fr{position:absolute;inset:18% 18%;border:3px solid #e8c872;border-radius:12px;box-shadow:0 0 0 999px rgba(0,0,0,.35);pointer-events:none}' +
      '.ck .res{border:2px solid #b8955a;border-radius:12px;padding:12px;background:#fffaf0;margin:8px 0}.ck .res.ok{border-color:#2e8b57;background:#f1fbf4}.ck .res.ng{border-color:#c0392b;background:#fdf1ef}.ck .row2{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
      '.ck .rl{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--line,#ddd);border-radius:9px;margin:0 0 6px;background:#fff}.ck .rl.in{background:#f1fbf4;border-color:#bfe0cc}.ck .rl small{color:#6b665d}.ck .prog{height:10px;border-radius:6px;background:#eee;overflow:hidden;margin:4px 0}.ck .prog i{display:block;height:100%;background:#2e8b57}';
    document.head.appendChild(s);
  }
  function fmt(t) { if (!t || !t.toDate) return ''; var d = t.toDate(), p = function (n) { return ('0' + n).slice(-2); }; return p(d.getHours()) + ':' + p(d.getMinutes()); }

  function view(C, box, events, say) {
    css();
    var list = events.filter(function (e) { return e.checkin; });
    if (!list.length) { box.innerHTML = '<div class="card"><h2 style="margin-top:0">来場受付（QR）</h2><p class="note">来場受付を使うイベントが、ありません。「イベント・枠」で、イベントの設定を開き、「来場受付（QR）を使う」にチェックを入れて、保存してください。<br>※ この機能は、管理画面だけです。お客様の画面には、何も出ません。</p></div>'; return function () {}; }
    var cur = null, eid = (box.__eid && list.some(function (e) { return e.id === box.__eid; })) ? box.__eid : list[0].id, rs = [], filter = '', last = null, unsub = function () {}, stream = null, raf = 0, scanning = false, det = null;
    box.className = 'ck';
    function who() { var u = firebase.auth().currentUser; return (u && u.email) || ''; }
    function live() { return rs.filter(function (r) { return r.status === 'confirmed' || r.status === 'won'; }); }
    function stopCam() { scanning = false; cancelAnimationFrame(raf); if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } var c = box.querySelector('#ckCam'); if (c) c.innerHTML = ''; var b = box.querySelector('#ckScan'); if (b) b.textContent = 'カメラで読み取る'; }
    var FV = function () { return firebase.firestore.FieldValue; };
    function arrUp(r, a, c) {   // 来店人数が、予約と違うときだけ、記録する（同じなら、記録を消す）
      var b = adv(r); return (a !== b.a || c !== b.c) ? { a: a, c: c, by: who(), at: FV().serverTimestamp() } : FV().delete();
    }
    async function mark(r, on, a, c) {
      var up = { updatedAt: FV().serverTimestamp() };
      if (on) { if (r.checkin) return 'dup'; up.checkin = { at: FV().serverTimestamp(), by: who() }; if (a != null) { var b0 = adv(r); if (a !== b0.a || c !== b0.c) up.arrive = arrUp(r, a, c); } }
      else { up.checkin = FV().delete(); up.arrive = FV().delete(); }
      await C.res.doc(r.id).update(up);
      var b = adv(r), chg = on && a != null && (a !== b.a || c !== b.c);
      if (root.AUDIT) root.AUDIT(on ? '来場受付' : '来場受付を取り消し', r.name + ' 様（' + r.id + '）' + (chg ? '／来店人数を修正：大人' + b.a + '→' + a + '・こども' + b.c + '→' + c : ''));
      return 'ok';
    }
    async function saveArrive(r, a, c) {
      await C.res.doc(r.id).update({ arrive: arrUp(r, a, c), updatedAt: FV().serverTimestamp() });
      var b = adv(r); if (root.AUDIT) root.AUDIT('来店人数を修正', r.name + ' 様（' + r.id + '）：大人' + b.a + '→' + a + '・こども' + b.c + '→' + c);
    }
    function card(r, msg, cls) {
      var el = box.querySelector('#ckRes'); if (!el) return;
      if (!r) { el.innerHTML = msg ? '<div class="res ng"><b>' + esc(msg) + '</b></div>' : ''; return; }
      var inn = !!r.checkin, other = r.eventId !== eid, bad = !(r.status === 'confirmed' || r.status === 'won');
      if (!cur || cur.id !== r.id || cur.fresh !== (r.arrive ? JSON.stringify(r.arrive.a) + JSON.stringify(r.arrive.c) : '') + inn) { var ar = arr(r); cur = { id: r.id, a: ar.a, c: ar.c, fresh: (r.arrive ? JSON.stringify(r.arrive.a) + JSON.stringify(r.arrive.c) : '') + inn }; }
      el.innerHTML = '<div class="res ' + (cls || (inn ? 'ok' : bad ? 'ng' : '')) + '"><div class="big">' + esc(r.name) + ' 様　' + r.n + '名</div><div>' + esc(r.date || '') + ' ' + (r.start === '00:00' && r.end === '24:00' ? '終日' : esc((r.start || '') + '–' + (r.end || ''))) + '　予約番号 ' + esc(r.id.replace(/(.{4})(?=.)/g, '$1-')) + '</div>' +
        (bad ? '<div style="color:#c0392b;font-weight:700;margin-top:4px">この予約は、' + ({ cancel: '取り消されています', wait: 'キャンセル待ちです', lottery: '抽選待ちです', lost: '落選です' }[r.status] || '確定ではありません') + '</div>' : '') +
        (inn ? '<div style="color:#1f7a4d;font-weight:700;margin-top:4px">✓ 来場済み（' + esc(fmt(r.checkin.at)) + '）</div>' : '') +
        (msg ? '<div style="margin-top:4px">' + esc(msg) + '</div>' : '') +
        ((!bad && !other) ? '<div class="row2" style="margin-top:8px;gap:16px"><span>来店人数　大人 <span class="stp" data-k="a"><button type="button" data-d="-1">−</button><b id="ckA" style="min-width:1.6em;display:inline-block;text-align:center">' + cur.a + '</b><button type="button" data-d="1">＋</button></span></span><span>こども（中学生未満） <span class="stp" data-k="c"><button type="button" data-d="-1">−</button><b id="ckC" style="min-width:1.6em;display:inline-block;text-align:center">' + cur.c + '</b><button type="button" data-d="1">＋</button></span></span></div><div class="note" style="margin:4px 0 0">予約：大人 ' + adv(r).a + '・こども ' + adv(r).c + '（変更があるときは、ここで直せます。直した人数は、一覧・Excelで、赤く出ます）</div>' : '') +
        '<div class="row2" style="margin-top:8px">' + (!inn && !bad && !other ? '<button class="p" id="ckGo" type="button" style="max-width:200px">受付する</button>' : '') + (inn && !other ? '<button class="p" id="ckSave" type="button" style="max-width:200px">人数を保存</button><button class="s" id="ckUndo" type="button">受付を取り消す</button>' : '') + '</div></div>';
      el.querySelectorAll('.stp').forEach(function (g) { g.querySelectorAll('button').forEach(function (bt) { bt.onclick = function () { var k = g.dataset.k; cur[k] = Math.max(0, cur[k] + +bt.dataset.d); el.querySelector(k === 'a' ? '#ckA' : '#ckC').textContent = cur[k]; }; }); });
      var go = el.querySelector('#ckGo'); if (go) go.onclick = async function () { this.disabled = true; await act(r, true, cur.a, cur.c); };
      var sv = el.querySelector('#ckSave'); if (sv) sv.onclick = async function () { this.disabled = true; try { await saveArrive(r, cur.a, cur.c); say('来店人数を保存しました（大人 ' + cur.a + '・こども ' + cur.c + '）'); } catch (e) { say('保存できませんでした: ' + e.message); } this.disabled = false; };
      var un = el.querySelector('#ckUndo'); if (un) un.onclick = async function () { if (!confirm(r.name + ' 様の来場受付を、取り消します。よろしいですか？')) return; this.disabled = true; await act(r, false); };
    }
    async function act(r, on, a, c) {
      try { var s = await mark(r, on, a, c); var f = rs.filter(function (x) { return x.id === r.id; })[0] || r; if (s === 'dup') say('すでに受付済みです'); else say(on ? f.name + ' 様を受付しました' : '受付を取り消しました'); }
      catch (e) { say('記録できませんでした: ' + e.message); }
    }
    function find(id) { return rs.filter(function (r) { return r.id === id; })[0]; }
    async function handle(text) {
      var id = parseId(text); if (!id) { card(null, '予約番号を読み取れませんでした'); return; }
      var r = find(id);
      if (!r) { try { var s = await C.res.doc(id).get(); if (s.exists) r = Object.assign({ id: id }, s.data()); } catch (e) { /* 読めない */ } }
      if (!r) { card(null, 'この予約番号は、見つかりません'); return; }
      if (r.eventId !== eid) { card(r, 'このご予約は、別のイベント（' + esc(r.eventName || '') + '）です', 'ng'); return; }
      last = id;
      if (box.querySelector('#ckAuto') && box.querySelector('#ckAuto').checked && !r.checkin && (r.status === 'confirmed' || r.status === 'won')) { await act(r, true); }
      card(find(id) || r);
    }
    async function scan() {
      if (scanning) return stopCam();
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
      catch (e) { say('カメラを使えませんでした（カメラの許可をご確認ください）。予約番号の入力でも、受付できます'); return; }
      var cam = box.querySelector('#ckCam'); cam.innerHTML = '<div class="cam"><video playsinline muted></video><div class="fr"></div></div>';
      var v = cam.querySelector('video'); v.srcObject = stream; await v.play().catch(function () {}); scanning = true; box.querySelector('#ckScan').textContent = '読み取りを止める';
      if (!det && 'BarcodeDetector' in root) { try { det = new root.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; } }
      if (!det) { try { await loadJsQR(); } catch (e) { say(e.message); stopCam(); return; } }
      var cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true }), busy = false, hold = '', holdAt = 0;
      var tick = async function () {
        if (!scanning) return;
        if (!busy && v.readyState >= 2 && v.videoWidth) {
          busy = true; var txt = '';
          try {
            if (det) { var r = await det.detect(v); txt = r && r[0] ? r[0].rawValue : ''; }
            else { var w = Math.min(640, v.videoWidth), h = Math.round(v.videoHeight * w / v.videoWidth); cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h); var q = root.jsQR(cx.getImageData(0, 0, w, h).data, w, h); txt = q ? q.data : ''; }
          } catch (e) { txt = ''; }
          busy = false;
          if (txt && parseId(txt) && (parseId(txt) !== hold || Date.now() - holdAt > 4000)) { hold = parseId(txt); holdAt = Date.now(); try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} await handle(txt); }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    function sums() {
      var ls = live(), o = { g: ls.length, gi: 0, pa: 0, pc: 0, ia: 0, ic: 0 };
      ls.forEach(function (r) { var p = adv(r); o.pa += p.a; o.pc += p.c; if (r.checkin) { var q = arr(r); o.gi++; o.ia += q.a; o.ic += q.c; } });
      return o;
    }
    function head() {
      var o = sums(), pct = o.g ? Math.round(o.gi * 100 / o.g) : 0;
      return '<b>来場 ' + o.gi + ' / ' + o.g + ' 組</b><div class="prog"><i style="width:' + pct + '%"></i></div>' +
        '<div class="note" style="margin:2px 0 0"><b style="font-size:15px;color:var(--ink,#222)">来店人数　大人 ' + o.ia + '・こども（中学生未満） ' + o.ic + '・計 ' + (o.ia + o.ic) + '名</b><br>予約の人数　大人 ' + o.pa + '・こども ' + o.pc + '・計 ' + (o.pa + o.pc) + '名</div>';
    }
    function rows() {
      var f = filter.trim().replace(/[\s　]/g, '').toLowerCase();
      return live().filter(function (r) { return !f || (String(r.name || '').replace(/[\s　]/g, '') + String(r.tel || '') + r.id.toLowerCase() + (r.participants || []).join('').replace(/[\s　]/g, '')).toLowerCase().indexOf(f) >= 0; })
        .sort(function (a, b) { return (a.checkin ? 1 : 0) - (b.checkin ? 1 : 0) || (a.date + a.start) < (b.date + b.start) ? -1 : 1; });
    }
    function drawList() {
      var h = box.querySelector('#ckHead'); if (h) h.innerHTML = head();
      var l = box.querySelector('#ckList'); if (!l) return;
      var rr = rows();
      l.innerHTML = rr.length ? rr.slice(0, 200).map(function (r) {
        var q = arr(r), p = adv(r);
        return '<div class="rl' + (r.checkin ? ' in' : '') + '"><div data-o="' + r.id + '" style="cursor:pointer;flex:1"><b>' + esc(r.name) + ' 様</b>　大人' + (r.checkin && q.a !== p.a ? '<span style="color:#c0392b;font-weight:700">' + q.a + '</span>' : p.a) + '・こども' + (r.checkin && q.c !== p.c ? '<span style="color:#c0392b;font-weight:700">' + q.c + '</span>' : p.c) + '<br><small>' + esc(r.date || '') + ' ' + (r.start === '00:00' && r.end === '24:00' ? '終日' : esc((r.start || '') + '–' + (r.end || ''))) + '　' + esc(r.id.replace(/(.{4})(?=.)/g, '$1-')) + (r.checkin ? '　✓ ' + esc(fmt(r.checkin.at)) : '') + '</small></div>' +
          (r.checkin ? '<button class="s" data-u="' + r.id + '">取消</button>' : '<button class="p" data-g="' + r.id + '" style="max-width:110px;padding:8px 14px">受付</button>') + '</div>';
      }).join('') + (rr.length > 200 ? '<p class="note">最初の200件を表示しています。名前で絞り込んでください。</p>' : '') : '<p class="note">該当する予約はありません。</p>';
      l.querySelectorAll('[data-o]').forEach(function (b) { b.onclick = function () { var r = find(b.dataset.o); if (r) { last = r.id; card(r); var e = box.querySelector('#ckRes'); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); } }; });
      l.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = async function () { this.disabled = true; var r = find(b.dataset.g); if (r) { await act(r, true); card(find(r.id), '', ''); } }; });
      l.querySelectorAll('[data-u]').forEach(function (b) { b.onclick = async function () { var r = find(b.dataset.u); if (!r || !confirm(r.name + ' 様の来場受付を、取り消します。よろしいですか？')) return; await act(r, false); }; });
      if (last) { var r = find(last); if (r && box.querySelector('#ckRes .res')) card(r, '', ''); }
    }
    async function xlsx(btn) {
      btn.disabled = true; var t0 = btn.textContent; btn.textContent = '作成中…';
      try {
        var X = await loadExcel(), ev = list.filter(function (e) { return e.id === eid; })[0] || {};
        var ls = live().slice().sort(function (a, b) { return ((a.date || '') + (a.start || '') + (a.name || '')) < ((b.date || '') + (b.start || '') + (b.name || '')) ? -1 : 1; });
        var wb = new X.Workbook(), ws = wb.addWorksheet('来場者一覧', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .2, footer: .2 } }, views: [{ state: 'frozen', ySplit: 4 }] });
        ws.columns = [{ width: 4 }, { width: 6 }, { width: 22 }, { width: 8 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 8 }, { width: 14 }];
        ws.mergeCells('A1:L1'); var t = ws.getCell('A1'); t.value = (ev.name || '') + '　来場者一覧'; t.font = { bold: true, size: 14 };
        ws.mergeCells('A2:L2'); ws.getCell('A2').value = '出力：' + new Date().toLocaleString('ja-JP') + '　／　ピンクの行＝受付済み　／　赤い数字＝受付で人数を直したもの'; ws.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
        ws.mergeCells('E3:G3'); ws.getCell('E3').value = '予約の人数'; ws.mergeCells('H3:J3'); ws.getCell('H3').value = '来店人数';
        var hd = ['No', '時間', 'お名前', '予約番号', '大人', 'こども', '計', '大人', 'こども', '計', '受付', '備考'];
        ws.getRow(4).values = hd; ['A3', 'E3', 'H3'].forEach(function (a) { });
        var thin = { style: 'thin', color: { argb: 'FF999999' } }, bd = { top: thin, left: thin, bottom: thin, right: thin };
        [3, 4].forEach(function (rn) { ws.getRow(rn).eachCell({ includeEmpty: true }, function (c) { c.font = { bold: true, size: 9 }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EFEB' } }; c.border = bd; }); });
        var f = 5;
        ls.forEach(function (r, i) {
          var p = adv(r), q = arr(r), inn = !!r.checkin, row = ws.getRow(f + i), tm = (r.start === '00:00' && r.end === '24:00') ? '終日' : (r.start || '');
          row.values = [i + 1, tm, (r.name || '') + ' 様', r.id.replace(/(.{4})(?=.)/g, '$1-'), p.a, p.c, { formula: 'E' + (f + i) + '+F' + (f + i), result: p.a + p.c }, inn ? q.a : null, inn ? q.c : null, inn ? { formula: 'H' + (f + i) + '+I' + (f + i), result: q.a + q.c } : null, inn ? fmt(r.checkin.at) : '', ''];
          row.eachCell({ includeEmpty: true }, function (c, n) {
            c.border = bd; c.font = { size: 10 }; c.alignment = { vertical: 'middle', horizontal: n === 3 || n === 12 ? 'left' : 'center' };
            if (inn) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC0CB' } };
          });
          if (inn && q.mod) { var red = { size: 10, bold: true, color: { argb: 'FFFF0000' } }; if (q.a !== p.a) row.getCell(8).font = red; if (q.c !== p.c) row.getCell(9).font = red; row.getCell(10).font = red; }
          row.height = 20;
        });
        var e = f + ls.length - 1, tr = ws.getRow(e + 1);
        tr.values = ['', '', '合計（' + ls.length + '組）', '', { formula: 'SUM(E' + f + ':E' + e + ')' }, { formula: 'SUM(F' + f + ':F' + e + ')' }, { formula: 'SUM(G' + f + ':G' + e + ')' }, { formula: 'SUM(H' + f + ':H' + e + ')' }, { formula: 'SUM(I' + f + ':I' + e + ')' }, { formula: 'SUM(J' + f + ':J' + e + ')' }, { formula: 'COUNT(J' + f + ':J' + e + ')&"組"' }, ''];
        tr.eachCell({ includeEmpty: true }, function (c) { c.font = { bold: true, size: 10 }; c.border = bd; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EAD3' } }; });
        ws.getRow(4).height = 18; ws.printOptions = { horizontalCentered: true };
        ws.headerFooter = { oddFooter: '&C&P / &N' }; ws.pageSetup.printTitlesRow = '3:4';
        var buf = await wb.xlsx.writeBuffer(), name = '来場者一覧_' + String(ev.name || '').replace(/[\\/:*?"<>|]/g, '') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
        var bl = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1500);
        say('Excelを作りました');
      } catch (e) { say('Excelを作れませんでした: ' + e.message); }
      btn.disabled = false; btn.textContent = t0;
    }
    function draw() {
      box.innerHTML = '<div class="card"><h2 style="margin-top:0">来場受付（QR）</h2><p class="note" style="margin:0 0 8px">お客様の予約番号のQR（または予約番号）を読み取って、来場を記録します。管理画面だけの機能で、お客様の画面には出ません。</p>' +
        '<div id="ckQr" class="box" style="margin:0 0 8px"></div><div class="box" style="margin:0 0 8px"><b>お客様用の受付画面（iPadのインカメラ）</b><p class="note" style="margin:4px 0 8px">お客様に見てもらう画面です。お客様が、ご自身でQRをかざして、受付できます（お名前は、読み取った方ご本人のものだけが出ます）。iPadで、管理画面にログインしたまま、開いてください。</p><a class="p" id="ckKiosk" href="reception.html?e=' + encodeURIComponent(eid) + '" style="display:inline-block;text-decoration:none;text-align:center;padding:12px 18px;border-radius:10px">お客様用の受付画面を開く</a></div><label>イベント<select id="ckEv">' + list.map(function (e) { return '<option value="' + e.id + '"' + (e.id === eid ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') + '</select></label>' +
        '<div id="ckHead" style="margin:8px 0"></div>' +
        '<div class="row2"><button class="p" id="ckScan" type="button" style="max-width:220px">カメラで読み取る</button><label class="chk" style="margin:0"><input type="checkbox" id="ckAuto">読み取ったら、すぐ受付する</label></div><div id="ckCam"></div>' +
        '<form id="ckF" class="row2" style="margin-top:8px"><input id="ckI" placeholder="予約番号を入力（例：ABCD-EFGH-JKLM）" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:200px"><button class="s" type="submit">確認</button></form><div id="ckRes"></div></div>' +
        '<div class="card"><h2 style="margin-top:0;font-size:16px">予約の一覧</h2><div class="row2" style="margin-bottom:8px"><button class="s" id="ckXl" type="button">Excelで出す（A4縦・受付済はピンク）</button></div><p class="note" style="margin:0 0 8px">お名前の行を押すと、来店人数を直せます。</p><input id="ckQ" placeholder="お名前・電話・予約番号で絞り込み" style="width:100%;margin-bottom:8px" value="' + esc(filter) + '"><div id="ckList"></div></div>';
      var ev = list.filter(function (e) { return e.id === eid; })[0], qb = box.querySelector('#ckQr');
      function qdraw() { qb.innerHTML = '<b>お客様の画面に、受付用のQRを表示：' + (ev.checkinQr ? '<span style="color:#1f7a4d">ON（表示中）</span>' : '<span style="color:#6b665d">OFF（表示していません）</span>') + '</b><div class="row2" style="margin-top:6px"><button class="' + (ev.checkinQr ? 's' : 'p') + '" id="ckQt" type="button">' + (ev.checkinQr ? '表示をやめる（OFFにする）' : '表示する（ONにする）') + '</button></div><p class="note" style="margin:6px 0 0">ONにすると、ご予約の完了画面と、確定したご予約の画面に、QRコードが出ます。いつでも切り替えられます。</p>'; qb.querySelector('#ckQt').onclick = async function () { this.disabled = true; try { var nv = !ev.checkinQr; await C.events.doc(eid).update({ checkinQr: nv }); ev.checkinQr = nv; if (root.AUDIT) root.AUDIT('お客様画面のQR表示を' + (nv ? 'ON' : 'OFF'), ev.name); say(nv ? 'お客様の画面に、QRを表示します' : 'お客様の画面の、QR表示をやめました'); } catch (e) { say('切り替えられませんでした: ' + e.message); } qdraw(); }; }
      qdraw();
      box.querySelector('#ckEv').onchange = function () { stopCam(); eid = this.value; box.__eid = eid; last = null; unsub(); sub(); draw(); };
      box.querySelector('#ckXl').onclick = function () { xlsx(this); };
      box.querySelector('#ckScan').onclick = scan;
      box.querySelector('#ckF').onsubmit = function (e) { e.preventDefault(); var i = box.querySelector('#ckI'); handle(i.value); i.select(); };
      box.querySelector('#ckQ').oninput = function () { filter = this.value; drawList(); };
      drawList();
    }
    function sub() { unsub = C.res.where('eventId', '==', eid).onSnapshot(function (sn) { rs = sn.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); if (!box.querySelector('#ckList')) draw(); else drawList(); }, function (e) { say('読み込めませんでした: ' + e.message); }); }
    sub(); draw();
    return function () { stopCam(); unsub(); };
  }
  root.CHK = { view: view, parseId: parseId, loadJsQR: loadJsQR, arr: arr, adv: adv };
})(window);
