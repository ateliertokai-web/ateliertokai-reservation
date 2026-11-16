/* 管理画面の「お客様画面の文言」で使う、見本のデータ。お客様画面（index.html?edit=1）の中だけで使い、データベースには、つながない。 */
(function (root) {
  'use strict';
  function ymd(add) { var d = new Date(Date.now() + add * 864e5), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  var EV = {
    E1: { name: '春の特別点検フェア（見本）', method: '先着', visible: true, wait: true, lap: true, order: true },
    E2: { name: 'ゴルフコンペ（見本）', method: '先着', visible: true, wait: true, golf: true },
    E3: { name: '新型車 試乗会（抽選・見本）', method: '抽選', visible: true, deadlineMs: Date.now() + 5 * 864e5 }
  };
  var SL = {
    S1: { eventId: 'E1', date: ymd(14), start: '10:00', end: '11:00', capG: 5, capP: 0, maxPer: 5, booked: 2, people: 4 },
    S2: { eventId: 'E1', date: ymd(14), start: '11:00', end: '12:00', capG: 3, capP: 0, maxPer: 5, booked: 3, people: 6 },
    S3: { eventId: 'E2', date: ymd(21), start: '00:00', end: '24:00', capG: 0, capP: 40, maxPer: 4, booked: 5, people: 12 },
    S4: { eventId: 'E3', date: ymd(28), start: '10:00', end: '12:00', capG: 0, capP: 0, maxPer: 4, booked: 0, people: 0 }
  };
  function mk(o) { return Object.keys(o).map(function (k) { return { id: k, d: o[k] }; }); }
  function snap(a) { return { docs: a.map(function (x) { return { id: x.id, exists: true, data: function () { return x.d; } }; }) }; }
  function one(a, id) { var x = a.filter(function (y) { return y.id === id; })[0]; return { id: id, exists: !!x, data: function () { return x ? x.d : {}; } }; }
  var evs = mk(EV), sls = mk(SL);
  function rec(o) {
    return Object.assign({ id: 'ABCDEFGHJKLM', mail: 'sample@example.com', eventId: 'E1', eventName: EV.E1.name, slotId: 'S1', date: SL.S1.date, start: '10:00', end: '11:00', name: '鹿児島 太郎', n: 2, a: 2, k: 0, s: 0, m: 0, status: 'confirmed', participants: [], inv: {}, car: {}, stores: [], staff: {} }, o || {});
  }
  var GUEST = { id: 'GGGGGGGGGGGG', name: '山田 花子', own: true, hasMail: true, cx: false };
  root.EDITSAMPLE = function () {
    return {
      events: { get: function () { return Promise.resolve(snap(evs)); }, where: function () { return { get: function () { return Promise.resolve(snap(evs)); } }; }, doc: function (id) { return { get: function () { return Promise.resolve(one(evs, id)); } }; } },
      slots: { where: function () { return { get: function () { return Promise.resolve(snap(sls)); } }; } },
      cfg: { doc: function () { return { get: function () { return Promise.resolve({ exists: false }); } }; } },
      eimgs: { doc: function () { return { get: function () { return Promise.resolve({ exists: false }); } }; } },
      lookup: function () { return Promise.resolve({ ok: true, id: 'ABCDEFGHJKLM', r: rec() }); },
      normMail: function (m) { return m; }, isFixed: function () { return true; }, isId: function () { return true; }, newId: function () { return 'ABCDEFGHJKLM'; },
      dupNames: function () { return Promise.resolve([]); }, getGuest: function () { return Promise.resolve(GUEST); },
      findByOwner: function () { return Promise.resolve({ ok: true, list: [] }); }, makeInvite: function () { return Promise.resolve('GGGGGGGGGGGG'); },
      syncParticipants: function () { return Promise.resolve({ ok: true }); }, renameGuest: function () { return Promise.resolve({ ok: true }); }, cancelGuest: function () { return Promise.resolve({ ok: true }); },
      change: function () { return Promise.resolve({ ok: false, msg: '' }); }, cancel: function () { return Promise.resolve({ ok: false, msg: '' }); }, book: function () { return Promise.resolve({ ok: false, msg: '' }); }
    };
  };
  root.EDITDATA = { EV: EV, SL: SL, rec: rec, ymd: ymd };
})(window);
