/* 練習用のお連れ様の入力欄。サーバー（データベース）には何も保存せず、この端末のブラウザの中（localStorage）だけに置く。
   代表者の練習画面（index.html?pv=1）と、お連れ様の練習ページ（guest.html?g=PRAC…）は、同じブラウザの別のタブで開くと、入力が反映される。
   練習用のID（PRAC＋8文字）は、本番のID（12文字の英数字）とは区別できる。 */
(function (root) {
  'use strict';
  var KEY = 'rv_practice_guests_v1', AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', KEEP_MS = 7 * 864e5;
  function all() {
    try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'), now = Date.now(), c = {};
      if (!o || typeof o !== 'object') return {};
      Object.keys(o).forEach(function (k) { if (o[k] && now - (o[k].t || 0) < KEEP_MS) c[k] = o[k]; });   // 7日より古い練習データは使わない
      return c; } catch (e) { return {}; }
  }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function isId(id) { return /^PRAC[A-HJ-NP-Z2-9]{8}$/.test(id || ''); }
  function newId() { var a = new Uint32Array(8), s = 'PRAC'; (root.crypto || {}).getRandomValues(a); for (var i = 0; i < 8; i++) s += AL[a[i] % 32]; return s; }
  function get(id) { var g = all()[id]; return g ? Object.assign({ id: id }, g) : null; }
  function put(id, g) { var o = all(), c = Object.assign({}, g); delete c.id; c.t = Date.now(); o[id] = c; return save(o); }
  root.PRAC = { isId: isId, newId: newId, get: get, put: put };
  if (typeof module !== 'undefined') module.exports = root.PRAC;
})(typeof window !== 'undefined' ? window : globalThis);
