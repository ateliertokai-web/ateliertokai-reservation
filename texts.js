/* お客様画面の文言。
   ・既定の文言は、各ページで TXT.add(グループ名, {キー: '文言'}) で登録する
   ・管理画面で変更した文言は、データベース（config/texts の v）に保存され、TXT.load(db) で読み込む
   ・画面では T('キー', {名前: 値}) で取り出す。文中の {名前} は、値に置き換わる（例：{host} は代表者の名前） */
(function (root) {
  'use strict';
  var TX = {}, TXO = {};
  function add(group, obj) { Object.keys(obj).forEach(function (k) { TX[k] = { t: obj[k], g: group }; }); }
  // 管理画面で変更した文言があればそれを、空欄や未設定なら既定の文言を使う
  function raw(key) { var o = TXO[key]; return (typeof o === 'string' && o.trim() !== '') ? o : (TX[key] ? TX[key].t : String(key)); }
  function fill(s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; }
  function T(key, vars) { return fill(raw(key), vars); }
  // 読み込めなかったときは、既定の文言のまま表示する
  function load(db) {
    return db.collection('config').doc('texts').get().then(function (s) { TXO = (s.exists && s.data().v) || {}; }).catch(function () {});
  }
  root.TXT = { add: add, T: T, raw: raw, load: load, all: TX, overrides: function () { return TXO; }, setOverrides: function (o) { TXO = o || {}; } };
  root.T = T;
  if (typeof module !== 'undefined') module.exports = root.TXT;
})(typeof window !== 'undefined' ? window : globalThis);
