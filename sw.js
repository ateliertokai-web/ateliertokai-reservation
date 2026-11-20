/* お客様画面の通知（プッシュ通知）を受け取る係。ページの保存（キャッシュ）はしない（いつも最新のページを開くため）。
   通知が届くと、通知を表示し、ホーム画面のアイコンに数字（バッジ）を付ける。通知を押すと、予約ページを開く */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
function badge(n) { try { if (self.navigator && self.navigator.setAppBadge) return n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge(); } catch (e) {} return Promise.resolve(); }
self.addEventListener('push', function (e) {
  var d = {};
  try { var j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  var title = d.title || 'レクサス鹿児島東開', body = d.body || '', url = d.url || './';
  e.waitUntil(self.registration.getNotifications().then(function (list) {
    return Promise.all([self.registration.showNotification(title, { body: body, icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, data: { url: url } }), badge(list.length + 1)]);
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.registration.getNotifications().then(function (list) { return badge(list.length); }).then(function () {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      for (var i = 0; i < cs.length; i++) { if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) { cs[i].navigate && url !== cs[i].url && cs[i].navigate(url); return cs[i].focus(); } }
      return self.clients.openWindow(url);
    });
  }));
});
