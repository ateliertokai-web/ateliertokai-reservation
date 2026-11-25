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
  var JSQR = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
  function loadJsQR() { if (root.jsQR) return Promise.resolve(); return new Promise(function (y, n) { var s = document.createElement('script'); s.src = JSQR; s.onload = y; s.onerror = function () { n(new Error('読み取りの部品を読み込めませんでした')); }; document.head.appendChild(s); }); }
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
    var eid = (box.__eid && list.some(function (e) { return e.id === box.__eid; })) ? box.__eid : list[0].id, rs = [], filter = '', last = null, unsub = function () {}, stream = null, raf = 0, scanning = false, det = null;
    box.className = 'ck';
    function who() { var u = firebase.auth().currentUser; return (u && u.email) || ''; }
    function live() { return rs.filter(function (r) { return r.status === 'confirmed' || r.status === 'won'; }); }
    function stopCam() { scanning = false; cancelAnimationFrame(raf); if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } var c = box.querySelector('#ckCam'); if (c) c.innerHTML = ''; var b = box.querySelector('#ckScan'); if (b) b.textContent = 'カメラで読み取る'; }
    async function mark(r, on) {
      var up = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (on) { if (r.checkin) return 'dup'; up.checkin = { at: firebase.firestore.FieldValue.serverTimestamp(), by: who() }; } else up.checkin = firebase.firestore.FieldValue.delete();
      await C.res.doc(r.id).update(up);
      if (root.AUDIT) root.AUDIT(on ? '来場受付' : '来場受付を取り消し', r.name + ' 様（' + r.id + '）');
      return 'ok';
    }
    function card(r, msg, cls) {
      var el = box.querySelector('#ckRes'); if (!el) return;
      if (!r) { el.innerHTML = msg ? '<div class="res ng"><b>' + esc(msg) + '</b></div>' : ''; return; }
      var inn = !!r.checkin, other = r.eventId !== eid, bad = !(r.status === 'confirmed' || r.status === 'won');
      el.innerHTML = '<div class="res ' + (cls || (inn ? 'ok' : bad ? 'ng' : '')) + '"><div class="big">' + esc(r.name) + ' 様　' + r.n + '名</div><div>' + esc(r.date || '') + ' ' + (r.start === '00:00' && r.end === '24:00' ? '終日' : esc((r.start || '') + '–' + (r.end || ''))) + '　予約番号 ' + esc(r.id.replace(/(.{4})(?=.)/g, '$1-')) + '</div>' +
        (bad ? '<div style="color:#c0392b;font-weight:700;margin-top:4px">この予約は、' + ({ cancel: '取り消されています', wait: 'キャンセル待ちです', lottery: '抽選待ちです', lost: '落選です' }[r.status] || '確定ではありません') + '</div>' : '') +
        (inn ? '<div style="color:#1f7a4d;font-weight:700;margin-top:4px">✓ 来場済み（' + esc(fmt(r.checkin.at)) + '）</div>' : '') +
        (msg ? '<div style="margin-top:4px">' + esc(msg) + '</div>' : '') +
        '<div class="row2" style="margin-top:8px">' + (!inn && !bad && !other ? '<button class="p" id="ckGo" type="button" style="max-width:200px">受付する</button>' : '') + (inn && !other ? '<button class="s" id="ckUndo" type="button">受付を取り消す</button>' : '') + '</div></div>';
      var go = el.querySelector('#ckGo'); if (go) go.onclick = async function () { this.disabled = true; await act(r, true); };
      var un = el.querySelector('#ckUndo'); if (un) un.onclick = async function () { if (!confirm(r.name + ' 様の来場受付を、取り消します。よろしいですか？')) return; this.disabled = true; await act(r, false); };
    }
    async function act(r, on) {
      try { var s = await mark(r, on); var f = rs.filter(function (x) { return x.id === r.id; })[0] || r; if (s === 'dup') say('すでに受付済みです'); else say(on ? f.name + ' 様を受付しました' : '受付を取り消しました'); }
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
    function head() {
      var ls = live(), inn = ls.filter(function (r) { return r.checkin; }), pp = ls.reduce(function (a, r) { return a + (r.n || 0); }, 0), pi = inn.reduce(function (a, r) { return a + (r.n || 0); }, 0), pct = ls.length ? Math.round(inn.length * 100 / ls.length) : 0;
      return '<b>来場 ' + inn.length + ' / ' + ls.length + ' 組</b>（' + pi + ' / ' + pp + ' 名）<div class="prog"><i style="width:' + pct + '%"></i></div>';
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
        return '<div class="rl' + (r.checkin ? ' in' : '') + '"><div><b>' + esc(r.name) + ' 様</b>　' + r.n + '名<br><small>' + esc(r.date || '') + ' ' + (r.start === '00:00' && r.end === '24:00' ? '終日' : esc((r.start || '') + '–' + (r.end || ''))) + '　' + esc(r.id.replace(/(.{4})(?=.)/g, '$1-')) + (r.checkin ? '　✓ ' + esc(fmt(r.checkin.at)) : '') + '</small></div>' +
          (r.checkin ? '<button class="s" data-u="' + r.id + '">取消</button>' : '<button class="p" data-g="' + r.id + '" style="max-width:110px;padding:8px 14px">受付</button>') + '</div>';
      }).join('') + (rr.length > 200 ? '<p class="note">最初の200件を表示しています。名前で絞り込んでください。</p>' : '') : '<p class="note">該当する予約はありません。</p>';
      l.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = async function () { this.disabled = true; var r = find(b.dataset.g); if (r) { await act(r, true); card(find(r.id), '', ''); } }; });
      l.querySelectorAll('[data-u]').forEach(function (b) { b.onclick = async function () { var r = find(b.dataset.u); if (!r || !confirm(r.name + ' 様の来場受付を、取り消します。よろしいですか？')) return; await act(r, false); }; });
      if (last) { var r = find(last); if (r && box.querySelector('#ckRes .res')) card(r, '', ''); }
    }
    function draw() {
      box.innerHTML = '<div class="card"><h2 style="margin-top:0">来場受付（QR）</h2><p class="note" style="margin:0 0 8px">お客様の予約番号のQR（または予約番号）を読み取って、来場を記録します。管理画面だけの機能で、お客様の画面には出ません。</p>' +
        '<label>イベント<select id="ckEv">' + list.map(function (e) { return '<option value="' + e.id + '"' + (e.id === eid ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') + '</select></label>' +
        '<div id="ckHead" style="margin:8px 0"></div>' +
        '<div class="row2"><button class="p" id="ckScan" type="button" style="max-width:220px">カメラで読み取る</button><label class="chk" style="margin:0"><input type="checkbox" id="ckAuto">読み取ったら、すぐ受付する</label></div><div id="ckCam"></div>' +
        '<form id="ckF" class="row2" style="margin-top:8px"><input id="ckI" placeholder="予約番号を入力（例：ABCD-EFGH-JKLM）" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:200px"><button class="s" type="submit">確認</button></form><div id="ckRes"></div></div>' +
        '<div class="card"><h2 style="margin-top:0;font-size:16px">予約の一覧</h2><input id="ckQ" placeholder="お名前・電話・予約番号で絞り込み" style="width:100%;margin-bottom:8px" value="' + esc(filter) + '"><div id="ckList"></div></div>';
      box.querySelector('#ckEv').onchange = function () { stopCam(); eid = this.value; box.__eid = eid; last = null; unsub(); sub(); draw(); };
      box.querySelector('#ckScan').onclick = scan;
      box.querySelector('#ckF').onsubmit = function (e) { e.preventDefault(); var i = box.querySelector('#ckI'); handle(i.value); i.select(); };
      box.querySelector('#ckQ').oninput = function () { filter = this.value; drawList(); };
      drawList();
    }
    function sub() { unsub = C.res.where('eventId', '==', eid).onSnapshot(function (sn) { rs = sn.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); if (!box.querySelector('#ckList')) draw(); else drawList(); }, function (e) { say('読み込めませんでした: ' + e.message); }); }
    sub(); draw();
    return function () { stopCam(); unsub(); };
  }
  root.CHK = { view: view, parseId: parseId };
})(window);
