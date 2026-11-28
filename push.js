/* お客様画面：通知（プッシュ通知）の受け取り。
   ・ホーム画面に追加して使っている方（アプリとして開いている方）に、「通知を受け取りますか？」を出す
   ・許可された端末の受け取り先（トークン）と、この端末で予約した予約番号を pushSubs に保存する（読めるのは管理者だけ）
   ・店舗から、キャンセル待ちの繰り上げ・抽選の結果・お知らせが届く。アプリを開くと、アイコンの数字（バッジ）を消す
   ・通知の鍵（window.PUSH_VAPID）が設定されていないときは、何もしない */
(function (root) {
  'use strict';
  var READY = null, MSG = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js', ASK = 'rv_push_ask_v1', KEY = 'rv_push_tok_v1', reg = null, db = null, rids = function () { return []; };
  function ok() { return !!(root.PUSH_VAPID && 'serviceWorker' in navigator && 'PushManager' in root && 'Notification' in root); }
  function standalone() { try { return root.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function T(s) { return root.T ? root.T(s) : s; }
  function load() { if (root.firebase && root.firebase.messaging) return Promise.resolve(); return new Promise(function (y, n) { var s = document.createElement('script'); s.src = MSG; s.onload = y; s.onerror = n; document.head.appendChild(s); }); }
  async function hash(t) { var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(b)).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  async function save(tok) {
    var list = (rids() || []).filter(function (x) { return /^[A-HJ-NP-Z2-9]{12}$/.test(x); }).slice(0, 20);
    await db.collection('pushSubs').doc(await hash(tok)).set({ t: tok, rids: list, updatedAt: root.firebase.firestore.FieldValue.serverTimestamp() });
    try { localStorage.setItem(KEY, tok); } catch (e) {}
  }
  // 通知の受け取り先（トークン）をもらう。アプリを入れ直した直後は、受け取り係（サービスワーカー）が、まだ動き始めていないことがあるため、
  // 動き始めるのを待ってから、もらう（だめなら、少し待って、もう一度）
  async function token() {
    await load();
    var m = root.firebase.messaging(), r = reg;
    try { r = await Promise.race([navigator.serviceWorker.ready, new Promise(function (y) { setTimeout(function () { y(reg); }, 8000); })]) || reg; } catch (e) {}
    try { return await m.getToken({ vapidKey: root.PUSH_VAPID, serviceWorkerRegistration: r }); }
    catch (e) { await new Promise(function (y) { setTimeout(y, 1500); }); return m.getToken({ vapidKey: root.PUSH_VAPID, serviceWorkerRegistration: r }); }
  }
  // 許可されている端末：予約番号の一覧を新しくする（予約したあと・アプリを開いたとき）
  async function sync() {
    if (!ok() || !reg || Notification.permission !== 'granted') return;
    try { await save(await token()); } catch (e) {}
  }
  async function enable() {
    var p = await Notification.requestPermission();
    if (p !== 'granted') return false;
    await save(await token());
    return true;
  }
  function card(box) {
    if (!box || box.querySelector('#pushAsk')) return;
    var d = document.createElement('div'); d.id = 'pushAsk'; d.className = 'box'; d.style.cssText = 'margin:0 0 14px';
    d.innerHTML = '<b>' + T('通知を受け取りますか？') + '</b><br><span class="note">' + T('キャンセル待ちからの繰り上げ、抽選の結果、店舗からのお知らせを、通知でお届けします。') + '</span>' +
      '<div class="tools" style="margin:8px 0 0"><button type="button" class="p" id="pushOn" style="max-width:200px">' + T('通知を受け取る') + '</button><button type="button" class="s" id="pushNo">' + T('今はしない') + '</button></div>';
    box.insertBefore(d, box.firstChild);
    d.querySelector('#pushNo').onclick = function () { try { localStorage.setItem(ASK, String(Date.now())); } catch (e) {} d.remove(); };
    d.querySelector('#pushOn').onclick = async function () {
      this.disabled = true;
      try { var y = await enable(); d.innerHTML = y ? '<b>' + T('通知を受け取る設定にしました。') + '</b>' : '<span class="note">' + T('通知は受け取らない設定です。あとで受け取る場合は、スマホの設定で、このアプリの通知を許可してください。') + '</span>'; setTimeout(function () { d.remove(); }, 4000); }
      catch (e) { var nt = d.querySelector('.note'); if (!nt) { nt = document.createElement('span'); nt.className = 'note'; d.insertBefore(nt, d.querySelector('.tools')); } nt.textContent = T('通知の設定ができませんでした。電波の良い場所で、もう一度お試しください。') + ' (' + String((e && (e.code || e.name || e.message)) || '').slice(0, 80) + ')'; this.disabled = false; }
    };
  }
  // ホーム画面を表示したときに呼ぶ：条件がそろえば「通知を受け取りますか？」を出す
  // force：確認画面（準備中のイベントのテスト）では、アプリとして開いていなくても、「今はしない」の後でも出す
  function ask(box, force) {
    if (!ok() || (!force && !standalone()) || Notification.permission !== 'default') return;
    if (!reg) { if (READY) READY.then(function () { if (reg && box.isConnected) ask(box, force); }); return; }
    var t = 0; try { t = +localStorage.getItem(ASK) || 0; } catch (e) {}
    if (!force && Date.now() - t < 30 * 864e5) return;   // 「今はしない」から30日は出さない
    card(box);
  }
  /* ---------- 届いたお知らせ（この端末の中に保存）。アプリを開くと、内容を見られる ---------- */
  function idb() { return new Promise(function (y, n) { try { var r = indexedDB.open('rv-push', 1); r.onupgradeneeded = function () { r.result.createObjectStore('msgs', { keyPath: 'id', autoIncrement: true }); }; r.onsuccess = function () { y(r.result); }; r.onerror = function () { n(r.error); }; } catch (e) { n(e); } }); }
  function list() { return idb().then(function (db) { return new Promise(function (y, n) { var q = db.transaction('msgs').objectStore('msgs').getAll(); q.onsuccess = function () { y((q.result || []).sort(function (a, b) { return b.t - a.t; })); }; q.onerror = function () { n(q.error); }; }); }).catch(function () { return []; }); }
  function readAll() { return idb().then(function (db) { return new Promise(function (y) { var t = db.transaction('msgs', 'readwrite'), st = t.objectStore('msgs'), q = st.openCursor(); q.onsuccess = function () { var c = q.result; if (!c) return; if (!c.value.read) { var v = c.value; v.read = true; c.update(v); } c.continue(); }; t.oncomplete = function () { y(); }; t.onerror = function () { y(); }; }); }).catch(function () {}); }
  // アイコンの数字（バッジ）と、通知センターに残っている通知を消す
  function clearBadge() {
    try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) {}
    try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.getNotifications().then(function (l) { l.forEach(function (n) { n.close(); }); }); }); } catch (e) {}
  }
  function fmt(t) { var d = new Date(t), p = function (n) { return ('0' + n).slice(-2); }; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + p(d.getMinutes()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // ホーム画面の上に「お知らせ」を出す（未読は「新着」。出したら既読にして、数字を消す）
  async function inbox(box) {
    if (!box || !root.indexedDB) return;
    var msgs = await list(); if (!msgs.length) { clearBadge(); return; }
    var old = box.querySelector('#pushBox'); if (old) old.remove();
    var un = msgs.filter(function (m) { return !m.read; }), rd = msgs.filter(function (m) { return m.read; }).slice(0, 15);
    var item = function (m, nw) { return '<div class="box" style="margin:0 0 6px;' + (nw ? 'border-color:#c0392b;background:#fff6f4' : '') + '"><div style="display:flex;gap:6px;align-items:baseline"><b>' + esc(m.title) + '</b>' + (nw ? '<span class="tag w">' + T('新着') + '</span>' : '') + '<small class="note" style="margin-left:auto">' + fmt(m.t) + '</small></div><div style="white-space:pre-wrap;margin-top:2px">' + esc(m.body) + '</div></div>'; };
    var d = document.createElement('div'); d.id = 'pushBox'; d.style.cssText = 'margin:0 0 14px';
    d.innerHTML = (un.length ? '<h2 style="font-size:16px;margin:0 0 6px">' + T('新しいお知らせ') + '（' + un.length + '）</h2>' + un.map(function (m) { return item(m, true); }).join('') : '') +
      (rd.length ? '<details' + (un.length ? '' : ' open') + '><summary class="note" style="cursor:pointer;margin:4px 0">' + T('これまでのお知らせ') + '（' + rd.length + '）</summary>' + rd.map(function (m) { return item(m, false); }).join('') + '</details>' : '');
    box.insertBefore(d, box.firstChild);
    if (un.length) { await readAll(); }
    clearBadge();
  }
  var BOX = null;
  function watch(getBox) {   // アプリに戻ってきたとき・お知らせが届いたとき：数字を消して、お知らせを見せる
    var go = function () { clearBadge(); var b = getBox && getBox(); if (b && document.visibilityState === 'visible') inbox(b); };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') go(); });
    root.addEventListener('focus', go); root.addEventListener('pageshow', go);
    try { navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'push') go(); }); } catch (e) {}
  }
  function init(fdb, getRids) { READY = init2(fdb, getRids); return READY; }
  async function init2(fdb, getRids) {
    db = fdb; rids = getRids || rids;
    clearBadge();
    if (!ok()) return;
    try { reg = await navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) { reg = null; return; }
    try { (await reg.getNotifications()).forEach(function (n) { n.close(); }); } catch (e) {}
    sync();
  }
  root.PUSH = { init: init, ask: ask, sync: sync, supported: ok, inbox: function (box) { BOX = box; return inbox(box); }, watch: watch, clearBadge: clearBadge };
})(window);
