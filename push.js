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
  async function token() {
    await load();
    var m = root.firebase.messaging();
    return m.getToken({ vapidKey: root.PUSH_VAPID, serviceWorkerRegistration: reg });
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
      catch (e) { d.querySelector('.note').textContent = T('通知の設定ができませんでした。電波の良い場所で、もう一度お試しください。'); this.disabled = false; }
    };
  }
  // ホーム画面を表示したときに呼ぶ：条件がそろえば「通知を受け取りますか？」を出す
  function ask(box) {
    if (!ok() || !standalone() || Notification.permission !== 'default') return;
    if (!reg) { if (READY) READY.then(function () { if (reg && box.isConnected) ask(box); }); return; }
    var t = 0; try { t = +localStorage.getItem(ASK) || 0; } catch (e) {}
    if (Date.now() - t < 30 * 864e5) return;   // 「今はしない」から30日は出さない
    card(box);
  }
  function init(fdb, getRids) { READY = init2(fdb, getRids); return READY; }
  async function init2(fdb, getRids) {
    db = fdb; rids = getRids || rids;
    try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) {}
    if (!ok()) return;
    try { reg = await navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) { reg = null; return; }
    try { (await reg.getNotifications()).forEach(function (n) { n.close(); }); } catch (e) {}
    sync();
  }
  root.PUSH = { init: init, ask: ask, sync: sync, supported: ok };
})(window);
