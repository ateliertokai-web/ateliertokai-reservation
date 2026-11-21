/* お客様画面の通知（プッシュ通知）を受け取る係。ページの保存（キャッシュ）はしない（いつも最新のページを開くため）。
   通知が届くと、①通知を表示 ②「お知らせ」として、この端末に保存（アプリを開いたときに、内容を見られる）③アイコンに未読の数字（バッジ）を付ける。
   アプリを開いている（画面が見えている）ときに届いたお知らせは、すぐ既読にして、数字は付けない。通知を押すと、予約ページを開く */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
function badge(n) { try { if (self.navigator && self.navigator.setAppBadge) return n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge(); } catch (e) {} return Promise.resolve(); }
function idb() { return new Promise(function (ok, ng) { var r = indexedDB.open('rv-push', 1); r.onupgradeneeded = function () { r.result.createObjectStore('msgs', { keyPath: 'id', autoIncrement: true }); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ng(r.error); }; }); }
function all() { return idb().then(function (db) { return new Promise(function (ok, ng) { var q = db.transaction('msgs').objectStore('msgs').getAll(); q.onsuccess = function () { ok(q.result || []); }; q.onerror = function () { ng(q.error); }; }); }); }
function add(m) {
  return idb().then(function (db) { return new Promise(function (ok, ng) {
    var t = db.transaction('msgs', 'readwrite'), st = t.objectStore('msgs'); st.add(m);
    st.getAllKeys().onsuccess = function (e) { var k = e.target.result || []; k.slice(0, Math.max(0, k.length - 30)).forEach(function (x) { st.delete(x); }); };   // 30件まで残す
    t.oncomplete = function () { ok(); }; t.onerror = function () { ng(t.error); };
  }); });
}
self.addEventListener('push', function (e) {
  var d = {};
  try { var j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  var title = d.title || 'レクサス鹿児島東開', body = d.body || '', url = d.url || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    var vis = cs.some(function (c) { return c.visibilityState === 'visible'; });
    return add({ title: title, body: body, url: url, t: Date.now(), read: vis }).catch(function () {}).then(function () { return all().catch(function () { return []; }); }).then(function (list) {
      var n = list.filter(function (x) { return !x.read; }).length;
      return Promise.all([self.registration.showNotification(title, { body: body, icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, data: { url: url } }), vis ? badge(0) : badge(n || 1)])
        .then(function () { cs.forEach(function (c) { c.postMessage({ type: 'push' }); }); });
    });
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) { cs[i].postMessage({ type: 'push' }); cs[i].navigate && url !== cs[i].url && cs[i].navigate(url); return cs[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
