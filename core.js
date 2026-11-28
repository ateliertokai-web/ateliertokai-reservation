/* 予約システムの中身（画面なし）。お客様画面・管理画面の両方から使う。 */
(function (root) {
'use strict';
var STORES = { '鹿児島東開': ['小園','原田','寺床','植木','日髙','濱崎','下石原','坂口','西','新田','不明'], 'CPO川内': ['瀬戸口','石野','小川','不明'] };
/* お客様画面の文言（管理画面で直せる）。texts.js が無い画面（管理画面など）では、もとの文のまま */
function _T(s, v) { if (root.T) return root.T(s, v); return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; }
var ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var LAP_TEXT = 'お席に限りが御座います。未就学児のお子様は保護者のお膝の上でよろしければ人数に含まなくても結構です。';  // 表示するときに T() を通す（index.html）

function makeCore(firebase, db, opts) {
  opts = opts || {};
  var cr = opts.crypto || root.crypto;
  var now = opts.now || function () { return Date.now(); };
  var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var FV = firebase.firestore.FieldValue;
  var events = db.collection('events'), slots = db.collection('slots'), res = db.collection('reservations'), apps = db.collection('applicants'), eimgs = db.collection('eventImages'), owners = db.collection('owners');
  var guests = db.collection('guests'), gmail = db.collection('guestMail'), groups = db.collection('guestGroups');
  var albums = db.collection('albums'), afiles = db.collection('albumFiles');

  var fail = function (m) { return { ok: false, msg: m }; };
  var ok = function (x) { var o = { ok: true }; for (var k in (x || {})) o[k] = x[k]; return o; };
  var normMail = function (s) { return String(s || '').trim().toLowerCase(); };
  var isFixed = function (st) { return st === 'confirmed' || st === 'won'; };
  var settings = db.collection('settings');
  var normTel = function (s) { return String(s || '').normalize('NFKC').replace(/\D/g, ''); };
  var ms = function (t) { return t ? (t.toMillis ? t.toMillis() : (t.__ts || 0)) : 0; };

  function rnd(n) { var a = new Uint32Array(1); cr.getRandomValues(a); return a[0] % n; }
  function newId() { var s = ''; for (var i = 0; i < 12; i++) s += ALPH[rnd(32)]; return s; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  async function sha(str) {
    var b = await cr.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  // 同じイベント（同一イベントグループ）には、同じメールアドレスで1回だけ申し込める
  // オーナーズカードID: 全角→半角、空白・ハイフンを除く（大文字小文字はそのまま）
  function normOwner(s) {
    return String(s || '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 65248); }).replace(/[\s\-ー－‐]/g, '');
  }
  // 「オーナーズカードID＋メールアドレス」を知っている人だけが引ける目印（予約番号の一覧）
  function ownerKey(owner, mail) { return sha('o:' + normOwner(owner) + '|' + normMail(mail)); }
  // 同姓同名の目印（ゴルフのイベントのみ）。「イベント＋参加者名（スペースを除く）」のハッシュごとに、予約の件数だけを持つ。
  // 予約番号や他の情報は入れないので、お客様が見られるのは「同じ名前の予約があるか」だけ
  var names = db.collection('names');
  function normName(s) { return String(s || '').replace(/[\s\u3000]/g, ''); }
  function nameList(ev, parts) {
    if (!ev || !ev.golf) return [];
    var seen = {}, out = [];
    (parts || []).forEach(function (p) { var k = normName(p); if (k && !seen[k]) { seen[k] = 1; out.push(k); } });
    return out;
  }
  async function nameRefs(eventId, list) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push({ n: list[i], ref: names.doc(await sha('n:' + eventId + '|' + list[i])) });
    return out;
  }
  async function readNames(tx, refs) { var out = []; for (var i = 0; i < refs.length; i++) out.push(await tx.get(refs[i].ref)); return out; }
  function bumpNames(tx, refs, snaps, delta, eventId) {
    refs.forEach(function (x, i) {
      var s = snaps[i], cur = s.exists ? (s.data().n || 0) : 0;
      if (s.exists) { if (delta > 0 || cur > 0) tx.update(x.ref, { n: Math.max(0, cur + delta) }); }
      else if (delta > 0) tx.set(x.ref, { n: 1, e: eventId });
    });
  }
  // 申し込み前の確認用：同じイベントに、同じ参加者名（スペースを除いて完全一致）の予約があるか。except の名前（変更前の自分の名前）は除く
  async function dupNames(eventId, ev, parts, except) {
    var ex = {}; nameList(ev, except).forEach(function (n) { ex[n] = 1; });
    var orig = {}; (parts || []).forEach(function (p) { var k = normName(p); if (k && !orig[k]) orig[k] = String(p).trim(); });
    var refs = await nameRefs(eventId, nameList(ev, parts).filter(function (n) { return !ex[n]; })), out = [];
    for (var i = 0; i < refs.length; i++) { var s = await refs[i].ref.get(); if (s.exists && (s.data().n || 0) > 0) out.push(orig[refs[i].n]); }
    return out;
  }
  function appKey(ev, eventId, mail, tel) { return sha((ev && ev.group ? 'g:' + ev.group : 'e:' + eventId) + '|' + (normMail(mail) || ('tel:' + String(tel || '').replace(/\D/g, '')))); }

  async function withRetry(fn, onRetry) {
    for (var i = 0; i < 10; i++) {
      try { return await fn(); }
      catch (e) {
        var c = e && e.code;
        if (c === 'aborted' || c === 'resource-exhausted' || /contention|too much|aborted/i.test(String(e && e.message))) {
          if (onRetry) onRetry(i + 1);
          await sleep(200 + Math.random() * 900 + i * 150);
          continue;
        }
        throw e;
      }
    }
    return fail(_T('混み合っていて処理できませんでした。少し待ってもう一度お試しください'));
  }

  // 枠の開始時刻（日本時間）を過ぎたか（「終日」の枠は、その日の終わりまで）
  var slotStarted = function (s) { var all = s.start === '00:00' && s.end === '24:00'; return !!s.date && now() >= new Date(s.date + 'T' + (all ? '23:59' : (s.start || '00:00')) + ':00+09:00').getTime() + (all ? 60000 : 0); };
  var fits = function (s, n, extraGroups) { return (!s.capG || (s.booked || 0) + (extraGroups || 1) <= s.capG) && (!s.capP || (s.people || 0) + n <= s.capP); };

  /* ---------- お客様: 申し込み ---------- */
  async function book(slotId, d) {
    var id = newId();
    d = Object.assign({}, d, { mail: normMail(d.mail), owner: normOwner(d.owner) });
    var okey = d.owner && d.mail ? await ownerKey(d.owner, d.mail) : '';
    // 店舗スタッフの代理予約用に登録された電話番号は、同じイベントへの重複申し込みを許可する
    var dupOk = false;
    try { var tdig = normTel(d.tel); if (tdig) { var dsn = await settings.doc('dup').get(); dupOk = !!(dsn.exists && (dsn.data().hashes || []).indexOf(await sha('t:' + tdig)) >= 0); } } catch (e) { dupOk = false; }
    return withRetry(function () {
      return db.runTransaction(async function (tx) {
        var sRef = slots.doc(slotId), sS = await tx.get(sRef);
        if (!sS.exists) return fail(_T('この枠は削除されました'));
        var s = sS.data(), eS = await tx.get(events.doc(s.eventId));
        if (!eS.exists) return fail(_T('このイベントは削除されました'));
        var ev = eS.data();
        if (!ev.visible && !ev.test) return fail(_T('このイベントは受付を終了しました')); // テスト用イベントは非表示でも予約できる（動作確認用）
        var lot = ev.method === '抽選';
        if (lot && ev.drawn) return fail(_T('抽選は終了したため、新しいお申し込みはできません'));
        if (ev.deadlineMs && now() > ev.deadlineMs) return fail(_T('申込の受付は締め切りました'));   // 抽選も、先着も、締切後は受け付けない
        if (!ev.test && slotStarted(s)) return fail(_T('この枠は、受付を終了しました'));   // 枠の開始時刻を過ぎたら、受け付けない
        var n = (+d.a || 0) + (+d.k || 0) + (+d.s || 0) + (+d.m || 0);
        if (n < 1 || n > s.maxPer) return fail(_T('人数は1〜{n}名で入力してください', { n: s.maxPer }));
        var ak = await appKey(ev, s.eventId, d.mail, d.tel), aRef = apps.doc(ak), aS = await tx.get(aRef);
        if (aS.exists && !dupOk) return fail(_T('このメールアドレス（メールなしの場合は連絡先）は、すでにこのイベントにお申し込み済みです。内容の変更・キャンセルは「予約の確認・変更」から行えます'));
        var nRefs = await nameRefs(s.eventId, nameList(ev, d.participants)), nSnaps = await readNames(tx, nRefs);
        var status, upd = null, waitNo = 0;
        if (lot) status = 'lottery';
        else if (fits(s, n)) { status = 'confirmed'; upd = { booked: (s.booked || 0) + 1, people: (s.people || 0) + n, lastRes: id }; }
        else if (ev.wait) { status = 'wait'; waitNo = (s.waitSeq || 0) + 1; upd = { waitSeq: waitNo, lastRes: id }; }
        else return fail(_T('この枠は満席です'));
        var doc = Object.assign({}, d, { dupOk: dupOk, n: n, eventId: s.eventId, eventName: ev.name, slotId: slotId, date: s.date, start: s.start, end: s.end,
          status: status, waitNo: waitNo, invited: false, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
        tx.set(res.doc(id), doc);
        if (okey) tx.set(owners.doc(okey), { ids: FV.arrayUnion(id) }, { merge: true });
        if (!dupOk) tx.set(aRef, { at: now() });
        bumpNames(tx, nRefs, nSnaps, 1, s.eventId);
        if (upd) tx.update(sRef, upd);
        return ok({ id: id, status: status, waitNo: waitNo });
      });
    });
  }

  async function lookup(id, mail) {
    id = String(id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-HJ-NP-Z2-9]{12}$/.test(id)) return fail(_T('予約番号の形式が正しくありません'));
    var s = await res.doc(id).get();
    if (!s.exists || s.data().mail !== normMail(mail)) return fail(_T('予約番号またはメールアドレスが違います'));
    return ok({ id: id, r: s.data() });
  }

  /* ---------- 予約番号を忘れたとき: オーナーズカードID＋メールアドレスで探す ---------- */
  async function findByOwner(owner, mail) {
    owner = normOwner(owner); mail = normMail(mail);
    var NG = _T('見つかりませんでした。オーナーズカードIDとメールアドレスを、お申し込みのときと同じ内容で、ご確認ください');
    if (!owner || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return fail(NG);
    var s = await owners.doc(await ownerKey(owner, mail)).get();
    var ids = (s.exists && s.data().ids) || [], out = [];
    ids = ids.slice(-30);
    for (var i = 0; i < ids.length; i++) {
      var r = await res.doc(ids[i]).get();
      if (r.exists && r.data().mail === mail) out.push({ id: ids[i], r: r.data() });
    }
    if (!out.length) return fail(NG);
    out.sort(function (p, q) { return (q.r.date + q.r.start) < (p.r.date + p.r.start) ? -1 : 1; });
    return ok({ list: out });
  }

  /* ---------- キャンセル（お客様・管理者） ---------- */
  async function cancel(id, mail, admin) {
    return withRetry(function () {
      return db.runTransaction(async function (tx) {
        var rRef = res.doc(id), rS = await tx.get(rRef);
        if (!rS.exists) return fail(_T('予約が見つかりません'));
        var r = rS.data();
        if (!admin && r.mail !== normMail(mail)) return fail(_T('予約番号またはメールアドレスが違います'));
        if (r.status === 'cancel') return fail(_T('すでにキャンセル済みです'));
        var sRef = slots.doc(r.slotId), sS = await tx.get(sRef), eS = await tx.get(events.doc(r.eventId));
        var cRefs = await nameRefs(r.eventId, nameList(eS.exists ? eS.data() : null, r.participants)), cSnaps = await readNames(tx, cRefs);
        var ak = await appKey(eS.exists ? eS.data() : null, r.eventId, r.mail, r.tel);
        tx.update(rRef, { status: 'cancel', updatedAt: FV.serverTimestamp() });
        var freed = false;
        if (sS.exists && isFixed(r.status)) {
          var s = sS.data(); freed = true;
          tx.update(sRef, { booked: Math.max(0, (s.booked || 0) - 1), people: Math.max(0, (s.people || 0) - r.n), lastRes: id });
        }
        if (!r.dupOk) tx.delete(apps.doc(ak));
        if (r.status !== 'lost') bumpNames(tx, cRefs, cSnaps, -1, r.eventId);
        return ok({ freed: freed, slotId: r.slotId });
      });
    });
  }

  /* ---------- お客様: 内容の変更（人数・名前・連絡先・時間帯） ---------- */
  var EDIT = ['owner', 'name', 'corp', 'tel', 'a', 'k', 's', 'm', 'participants', 'lexus', 'note', 'car', 'order', 'stores', 'staff'];
  async function change(id, mail, patch, newSlotId) {
    return withRetry(function () {
      return db.runTransaction(async function (tx) {
        var rRef = res.doc(id), rS = await tx.get(rRef);
        if (!rS.exists) return fail(_T('予約が見つかりません'));
        var r = rS.data();
        if (r.mail !== normMail(mail)) return fail(_T('予約番号またはメールアドレスが違います'));
        if (r.status === 'cancel') return fail(_T('キャンセル済みの予約は変更できません'));
        var oldRef = slots.doc(r.slotId), oldS = await tx.get(oldRef);
        var moving = newSlotId && newSlotId !== r.slotId, newRef = null, newS = null;
        if (moving) { newRef = slots.doc(newSlotId); newS = await tx.get(newRef); }
        var eS = await tx.get(events.doc(r.eventId)), ev = eS.exists ? eS.data() : {};
        // 参加者名が変わったら、同姓同名の目印も入れ替える
        var oldN = nameList(ev, r.participants), newN = (patch && patch.participants !== undefined) ? nameList(ev, patch.participants) : oldN;
        var addRefs = await nameRefs(r.eventId, newN.filter(function (n) { return oldN.indexOf(n) < 0; })), addSnaps = await readNames(tx, addRefs);
        var delRefs = await nameRefs(r.eventId, oldN.filter(function (n) { return newN.indexOf(n) < 0; })), delSnaps = await readNames(tx, delRefs);
        var upd = {}, waited = 0;
        if (patch && patch.owner !== undefined) patch = Object.assign({}, patch, { owner: normOwner(patch.owner) });
        EDIT.forEach(function (k) { if (patch && patch[k] !== undefined) upd[k] = patch[k]; });
        // オーナーズカードIDの目印は、入力チェックがすべて通ってから書く（失敗時に書き込みが残らないように）
        var newOkey = (upd.owner && r.mail && upd.owner !== r.owner) ? await ownerKey(upd.owner, r.mail) : '';
        var m2 = Object.assign({}, r, upd);
        var n = (+m2.a || 0) + (+m2.k || 0) + (+m2.s || 0) + (+m2.m || 0);
        upd.n = n;
        var target = moving ? newS : oldS;
        if (!target.exists) return fail(_T('この枠は削除されました'));
        var t = target.data();
        if (n < 1 || n > t.maxPer) return fail('人数は1〜' + t.maxPer + '名で入力してください');
        if (moving) {
          if (t.eventId !== r.eventId) return fail(_T('別のイベントの枠には変更できません'));
          if (r.status === 'wait') return fail(_T('キャンセル待ちの方は時間帯を変更できません。いったんキャンセルして申し込み直してください'));
          if (ev.method === '抽選' && ev.drawn) return fail(_T('抽選後は時間帯を変更できません'));
          var toWait = false, newWaitNo = 0;
          if (isFixed(r.status) && !fits(t, n)) {
            // 変更先が満席: キャンセル待ちを受け付けるイベントなら、並び直してキャンセル待ちへ。受け付けないイベントは変更不可（元の予約はそのまま）
            if (ev.wait !== false && ev.method !== '抽選') { toWait = true; newWaitNo = (t.waitSeq || 0) + 1; }
            else return fail(_T('変更先の時間帯は満席のため、変更できませんでした。現在のご予約はそのままです'));
          }
          if (isFixed(r.status)) {
            var o = oldS.data();
            tx.update(oldRef, { booked: Math.max(0, (o.booked || 0) - 1), people: Math.max(0, (o.people || 0) - r.n), lastRes: id });
            if (toWait) { tx.update(newRef, { waitSeq: newWaitNo, lastRes: id }); upd.status = 'wait'; upd.waitNo = newWaitNo; waited = newWaitNo; }
            else tx.update(newRef, { booked: (t.booked || 0) + 1, people: (t.people || 0) + n, lastRes: id });
          }
          Object.assign(upd, { slotId: newSlotId, date: t.date, start: t.start, end: t.end });
        } else if (isFixed(r.status) && n !== r.n) {
          if (t.capP && (t.people || 0) - r.n + n > t.capP) return fail(_T('この枠の定員人数を超えるため、人数を増やせません'));
          tx.update(oldRef, { people: Math.max(0, (t.people || 0) - r.n + n), lastRes: id });
        }
        if (newOkey) tx.set(owners.doc(newOkey), { ids: FV.arrayUnion(id) }, { merge: true });
        if (r.status !== 'lost') { bumpNames(tx, addRefs, addSnaps, 1, r.eventId); bumpNames(tx, delRefs, delSnaps, -1, r.eventId); }
        upd.updatedAt = FV.serverTimestamp();
        tx.update(rRef, upd);
        return ok({ waitlisted: !!waited, waitNo: waited });
      });
    });
  }

  /* ---------- 管理者 ---------- */
  async function promote(id) {
    return withRetry(function () {
      return db.runTransaction(async function (tx) {
        var rRef = res.doc(id), rS = await tx.get(rRef);
        if (!rS.exists) return fail(_T('予約が見つかりません'));
        var r = rS.data();
        if (r.status !== 'wait') return fail(_T('キャンセル待ちの予約ではありません'));
        var sRef = slots.doc(r.slotId), sS = await tx.get(sRef);
        if (!sS.exists) return fail(_T('この枠は削除されています'));
        var s = sS.data();
        if (!fits(s, r.n)) return fail(_T('この枠にはまだ空きがありません'));
        tx.update(rRef, { status: 'confirmed', waitNo: 0, updatedAt: FV.serverTimestamp() });
        tx.update(sRef, { booked: (s.booked || 0) + 1, people: (s.people || 0) + r.n, lastRes: id });
        return ok({});
      });
    });
  }

  async function chunked(ops) {
    for (var i = 0; i < ops.length; i += 400) {
      var b = db.batch();
      ops.slice(i, i + 400).forEach(function (o) { o(b); });
      await b.commit();
    }
  }

  // 抽選: 枠ごとに「招待枠」（invited）の方を先に当選させ、残りは無作為。外れた方は申込順でキャンセル待ち（なしの設定なら落選）
  async function runLottery(eventId) {
    var eS = await events.doc(eventId).get();
    if (!eS.exists) return fail(_T('イベントが見つかりません'));
    var ev = eS.data();
    if (ev.method !== '抽選') return fail(_T('抽選のイベントではありません'));
    if (ev.drawn) return fail(_T('すでに抽選済みです'));
    await migrateInvited(eventId);
    var rs = await res.where('eventId', '==', eventId).where('status', '==', 'lottery').get();
    var ss = await slots.where('eventId', '==', eventId).get();
    var bySlot = {};
    rs.docs.forEach(function (d) { var r = d.data(); (bySlot[r.slotId] = bySlot[r.slotId] || []).push({ id: d.id, r: r }); });
    var ops = [], win = 0, wait = 0, lost = 0;
    ss.docs.forEach(function (sd) {
      var s = sd.data(), list = bySlot[sd.id] || [];
      var inv = shuffle(list.filter(function (x) { return x.r.invited === true; })), rest = shuffle(list.filter(function (x) { return x.r.invited !== true; }));
      var booked = s.booked || 0, people = s.people || 0, seq = s.waitSeq || 0, over = [];
      inv.concat(rest).forEach(function (x) {
        if ((!s.capG || booked + 1 <= s.capG) && (!s.capP || people + x.r.n <= s.capP)) {
          booked++; people += x.r.n; win++;
          ops.push(function (b) { b.update(res.doc(x.id), { status: 'won', updatedAt: FV.serverTimestamp() }); });
        } else over.push(x);
      });
      over.sort(function (p, q) { return ms(p.r.createdAt) - ms(q.r.createdAt); });
      over.forEach(function (x) {
        if (ev.wait) { seq++; wait++; ops.push(function (b) { b.update(res.doc(x.id), { status: 'wait', waitNo: seq, updatedAt: FV.serverTimestamp() }); }); }
        else { lost++; ops.push(function (b) { b.update(res.doc(x.id), { status: 'lost', updatedAt: FV.serverTimestamp() }); }); }
      });
      if (list.length) ops.push(function (b) { b.update(slots.doc(sd.id), { booked: booked, people: people, waitSeq: seq }); });
    });
    ops.push(function (b) { b.update(events.doc(eventId), { drawn: true }); });
    await chunked(ops);
    return ok({ win: win, wait: wait, lost: lost });
  }

  // 人数の数え直し（予約一覧から枠のカウンターを作り直す）
  async function recount(eventId) {
    var rs = await res.where('eventId', '==', eventId).get();
    var ss = await slots.where('eventId', '==', eventId).get();
    var c = {};
    rs.docs.forEach(function (d) {
      var r = d.data(), x = c[r.slotId] = c[r.slotId] || { booked: 0, people: 0, waitSeq: 0 };
      if (isFixed(r.status)) { x.booked++; x.people += r.n; }
      if (r.status === 'wait') x.waitSeq = Math.max(x.waitSeq, r.waitNo || 0);
    });
    var ops = ss.docs.map(function (sd) {
      var x = c[sd.id] || { booked: 0, people: 0, waitSeq: 0 };
      return function (b) { b.update(slots.doc(sd.id), x); };
    });
    // ゴルフのイベントは、同姓同名の目印も予約から数え直す
    var eS = await events.doc(eventId).get(), ev = eS.exists ? eS.data() : null;
    if (ev && ev.golf) {
      var cnt = {};
      rs.docs.forEach(function (d) { var r = d.data(); if (r.status === 'cancel' || r.status === 'lost') return; nameList(ev, r.participants).forEach(function (n) { cnt[n] = (cnt[n] || 0) + 1; }); });
      var keys = Object.keys(cnt), want = {};
      for (var i = 0; i < keys.length; i++) want[await sha('n:' + eventId + '|' + keys[i])] = cnt[keys[i]];
      var have = await names.where('e', '==', eventId).get();
      have.docs.forEach(function (d) { if (!(d.id in want)) ops.push(function (b) { b.update(names.doc(d.id), { n: 0 }); }); });
      Object.keys(want).forEach(function (k) { ops.push(function (b) { b.set(names.doc(k), { n: want[k], e: eventId }); }); });
    }
    await chunked(ops);
    return ok({ slots: ss.docs.length });
  }

  // 時間枠の作成。minutes ごとに区切り、休憩時間は除く。allday なら終日1枠
  function makeTimes(o) {
    if (o.allday) return [['00:00', '24:00']];
    // 管理画面の時間割ビルダー：つくる枠の時刻を、そのまま受け取る（[['10:00','12:00'], ...]）
    if (o.times && o.times.length) {
      var ok = o.times.filter(function (t) { return t && /^\d\d:\d\d$/.test(t[0]) && /^\d\d:\d\d$/.test(t[1]) && t[0] < t[1]; });
      var u = {}; ok = ok.filter(function (t) { var k = t[0] + '-' + t[1]; if (u[k]) return false; u[k] = 1; return true; });
      return ok.sort(function (p, q) { return p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0; });
    }
    var toM = function (t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; };
    var fmt = function (m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); };
    var bs = o.bstart ? toM(o.bstart) : null, be = o.bend ? toM(o.bend) : null;
    // 時間帯を複数指定できる（例: 10:00〜11:30 と 14:00〜15:30）。ranges が無ければ従来の start/end/minutes
    var ranges = (o.ranges && o.ranges.length) ? o.ranges : [{ start: o.start, end: o.end, minutes: o.minutes }];
    var out = [], seen = {};
    ranges.forEach(function (r) {
      if (!r.start || !r.end) return;
      var a = toM(r.start), z = toM(r.end), len = +(r.minutes || o.minutes);
      if (!(len > 0)) return;
      for (var t = a; t + len <= z; ) {
        if (bs !== null && be !== null && t < be && t + len > bs) { t = be; continue; }
        var k = fmt(t) + '-' + fmt(t + len);
        if (!seen[k]) { seen[k] = 1; out.push([fmt(t), fmt(t + len)]); }
        t += len;
      }
    });
    out.sort(function (p, q) { return p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0; });
    return out;
  }
  async function createSlots(eventId, ev, dates, o) {
    var times = makeTimes(o), ops = [];
    if (!times.length) return fail(_T('枠が作れません。時刻を確認してください'));
    ops.push(function (b) { b.set(events.doc(eventId), ev, { merge: true }); });
    dates.forEach(function (date) {
      times.forEach(function (t) {
        var sid = newId();
        ops.push(function (b) { b.set(slots.doc(sid), { eventId: eventId, eventName: ev.name, date: date, start: t[0], end: t[1], capG: +o.capG || 0, capP: +o.capP || 0, maxPer: +o.maxPer || ((!(+o.capG) && +o.capP) ? +o.capP : 4), booked: 0, people: 0, waitSeq: 0 }); });
      });
    });
    await chunked(ops);
    return ok({ count: dates.length * times.length });
  }

  // 旧項目名（招待枠の印の古い名前）から invited へ移す。eventId を渡すとそのイベントだけ（管理者のみ）
  var OLD_INV = 'f' + 'av';
  async function migrateInvited(eventId) {
    var q = res.where(OLD_INV, 'in', [true, false]);
    if (eventId) q = q.where('eventId', '==', eventId);
    var s = await q.get(), ops = [];
    s.docs.forEach(function (d) {
      var u = { invited: d.data()[OLD_INV] === true }; u[OLD_INV] = FV.delete();
      ops.push(function (b) { b.update(res.doc(d.id), u); });
    });
    await chunked(ops);
    return ok({ count: ops.length });
  }

  async function scrubApplicants() {
    var s = await apps.get(), ops = [];
    s.docs.forEach(function (d) { if (d.data().resId !== undefined) ops.push(function (b) { b.set(apps.doc(d.id), { at: d.data().at || 0 }); }); });
    await chunked(ops);
    return ok({ count: ops.length });
  }

  async function deleteEvent(eventId) {
    var ss = await slots.where('eventId', '==', eventId).get();
    var ops = ss.docs.map(function (d) { return function (b) { b.delete(slots.doc(d.id)); }; });
    ops.push(function (b) { b.delete(events.doc(eventId)); });
    ops.push(function (b) { b.delete(eimgs.doc(eventId)); });
    await chunked(ops);
    return ok({});
  }

  async function getDupTels() { var s = await settings.doc('dupAdmin').get(); return s.exists ? (s.data().tels || []) : []; }
  async function setDupTels(list) {
    var tels = [], seen = {};
    (list || []).forEach(function (x) { var t = normTel(x); if (t && !seen[t]) { seen[t] = 1; tels.push(t); } });
    var hashes = []; for (var i = 0; i < tels.length; i++) hashes.push(await sha('t:' + tels[i]));
    await settings.doc('dupAdmin').set({ tels: tels });
    await settings.doc('dup').set({ hashes: hashes });
    return tels;
  }

  /* ---------- ゴルフ: お連れ様の入力URL ---------- */
  // お連れ様の入力欄（guests）は、予約番号とは別のIDで作る。お連れ様は自分の欄だけを読み書きでき、予約の変更・キャンセルはできない
  async function makeInvite(rec, no, grp) {
    var inv = rec.inv || {};
    if (inv[no]) return inv[no];
    var gid = newId();
    var doc = { no: no, eid: rec.eventId, ev: rec.eventName || '', date: rec.date || '', start: rec.start || '', end: rec.end || '',
      host: rec.name || '', name: '', own: false, hasMail: false, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() };
    if (grp) doc.grp = grp;   // 同じ組（全員共通のURL）
    await guests.doc(gid).set(doc);
    var up = { updatedAt: FV.serverTimestamp() }; up['inv.' + no] = gid;
    await res.doc(rec.id).update(up);
    return gid;
  }

  /* ---------- ゴルフ: 全員共通のURL（入力が終わった順に、空いている枠に入る） ---------- */
  // 組（guestGroups）：共通URLに対応する、お連れ様の欄（guests）の一覧。予約が確定した直後に、代表者の端末で作る
  async function makeGroup(rec, nos) {
    var grp = newId(), members = [];
    for (var i = 0; i < nos.length; i++) members.push(await makeInvite(rec, nos[i], grp));
    await groups.doc(grp).set({ eid: rec.eventId, ev: rec.eventName || '', date: rec.date || '', start: rec.start || '', end: rec.end || '',
      host: rec.name || '', members: members, createdAt: FV.serverTimestamp() });
    return { grp: grp, members: members };
  }
  async function getGroup(grp) {
    if (!/^[A-HJ-NP-Z2-9]{12}$/.test(grp || '')) return null;
    var s = await groups.doc(grp).get();
    if (!s.exists) return null;
    var d = s.data(), list = [];
    for (var i = 0; i < (d.members || []).length; i++) { var g = await getGuest(d.members[i]); if (g) list.push(g); }
    list.sort(function (a, b) { return a.no - b.no; });
    return { id: grp, host: d.host, ev: d.ev, date: d.date, start: d.start, end: d.end, eid: d.eid, members: list };
  }
  // 共通URLから入力するお連れ様を、空いている最初の枠に入れる（同時に送信されても、同じ枠には入らない）
  async function claimGuest(grp, v) {
    var gs = await groups.doc(grp).get();
    if (!gs.exists) return { ok: false, invalid: true };
    var members = gs.data().members || [], name = String(v.name || '').trim().slice(0, 50), mail = normMail(v.mail);
    var out = await db.runTransaction(async function (t) {
      var snaps = [];
      for (var i = 0; i < members.length; i++) snaps.push(await t.get(guests.doc(members[i])));
      for (var j = 0; j < snaps.length; j++) {
        var d = snaps[j].exists ? snaps[j].data() : null;
        if (!d || d.name || (d.cx && d.cxBy === 'owner')) continue;   // 入力済み・代表者が取り消した枠は、使わない
        t.update(guests.doc(members[j]), { name: name, own: !!v.own, hasMail: !!mail, cx: false, cxBy: '', cxName: '', updatedAt: FV.serverTimestamp() });
        return { ok: true, gid: members[j] };
      }
      return { ok: false, full: true };
    });
    if (out.ok && mail) await gmail.doc(out.gid).set({ mail: mail, eid: gs.data().eid, updatedAt: FV.serverTimestamp() });
    return out;
  }

  /* ---------- ゴルフ: 組ごとの記念写真・成績表（アルバム） ----------
     albums/{id}：組の情報と、ファイルの一覧（中身は持たない）。albumFiles/{id}：ファイルの中身（文字にした画像・PDFを分割）。
     どちらも掲載期限（expireAt）を過ぎると、管理者以外は読めない。作る・直す・消すのは管理者だけ */
  var PART = 700000;
  function idOk(id) { return /^[A-HJ-NP-Z2-9]{12}$/.test(id || ''); }
  async function getAlbum(aid) {
    if (!idOk(aid)) return null;
    try { var s = await albums.doc(aid).get(); return s.exists ? Object.assign({ id: aid }, s.data()) : null; }
    catch (e) { if (e && e.code === 'permission-denied') return { id: aid, expired: true }; throw e; }
  }
  async function albumData(f) {
    var out = '';
    for (var i = 0; i < (f.parts || []).length; i++) { var s = await afiles.doc(f.parts[i]).get(); out += s.exists ? (s.data().d || '') : ''; }
    return out;
  }
  // 管理者：ファイル（data URL）を分けて保存し、アルバムの一覧に足す
  async function albumAdd(aid, base, file, dataUrl) {
    var exp = base.expireAt, parts = [];
    for (var i = 0; i < dataUrl.length; i += PART) { var pid = newId(); await afiles.doc(pid).set({ aid: aid, i: parts.length, d: dataUrl.slice(i, i + PART), expireAt: exp }); parts.push(pid); }
    var cur = await albums.doc(aid).get(), files = cur.exists ? (cur.data().files || []) : [];
    files.push(Object.assign({ id: newId(), parts: parts }, file));
    var doc = Object.assign({}, base, { files: files, updatedAt: FV.serverTimestamp() });
    if (!cur.exists) doc.createdAt = FV.serverTimestamp();
    await albums.doc(aid).set(doc, { merge: true });
    return files;
  }
  async function albumRemoveFile(aid, fileId) {
    var cur = await albums.doc(aid).get(); if (!cur.exists) return [];
    var files = cur.data().files || [], f = files.filter(function (x) { return x.id === fileId; })[0];
    if (f) for (var i = 0; i < f.parts.length; i++) await afiles.doc(f.parts[i]).delete();
    files = files.filter(function (x) { return x.id !== fileId; });
    await albums.doc(aid).update({ files: files, updatedAt: FV.serverTimestamp() });
    return files;
  }
  async function albumSetExpire(aid, exp) {
    var cur = await albums.doc(aid).get(); if (!cur.exists) return;
    var ops = [function (b) { b.update(albums.doc(aid), { expireAt: exp, updatedAt: FV.serverTimestamp() }); }];
    (cur.data().files || []).forEach(function (f) { f.parts.forEach(function (p) { ops.push(function (b) { b.update(afiles.doc(p), { expireAt: exp }); }); }); });
    await chunked(ops);
  }
  async function albumDelete(aid) {
    var cur = await albums.doc(aid).get(); if (!cur.exists) return;
    var d = cur.data(), ops = [];
    (d.files || []).forEach(function (f) { f.parts.forEach(function (p) { ops.push(function (b) { b.delete(afiles.doc(p)); }); }); });
    (d.gids || []).forEach(function (g) { ops.push(function (b) { b.update(guests.doc(g), { album: FV.delete() }); }); });
    ops.push(function (b) { b.delete(albums.doc(aid)); });
    try { await chunked(ops); } catch (e) { for (var i = 0; i < ops.length; i++) { try { var bb = db.batch(); ops[i](bb); await bb.commit(); } catch (x) {} } }
  }
  // 掲載期限を過ぎたアルバムを、まとめて消す（管理画面を開いたときに実行）
  async function albumCleanup() {
    var s = await albums.where('expireAt', '<', new Date()).get(), n = 0;
    for (var i = 0; i < s.docs.length; i++) { await albumDelete(s.docs[i].id); n++; }
    return n;
  }
  async function getGuest(gid) {
    if (!/^[A-HJ-NP-Z2-9]{12}$/.test(gid || '')) return null;
    var s = await guests.doc(gid).get();
    return s.exists ? Object.assign({ id: gid }, s.data()) : null;
  }
  // メールアドレスは別の場所（guestMail）に書き込むだけ。読めるのは管理者だけ
  async function saveGuest(g, v) {
    var mail = normMail(v.mail);
    await guests.doc(g.id).update({ name: String(v.name || '').trim().slice(0, 50), own: !!v.own, hasMail: !!((g.hasMail && !g.cx) || mail),
      cx: false, cxBy: '', cxName: '', updatedAt: FV.serverTimestamp() });
    if (mail) await gmail.doc(g.id).set({ mail: mail, eid: g.eid, updatedAt: FV.serverTimestamp() });
  }

  // 取り消し。by='guest'（お連れ様ご本人）なら入力内容を消すだけ。by='owner'（代表者）なら、予約からもこの欄を外し、URLは使えなくなる
  async function cancelGuest(g, by, rec) {
    var nm = g.name || g.cxName || '';
    await guests.doc(g.id).update({ name: '', own: false, hasMail: false, cx: true, cxBy: by, cxName: nm.slice(0, 50), updatedAt: FV.serverTimestamp() });
    try { await gmail.doc(g.id).set({ mail: '', eid: g.eid, updatedAt: FV.serverTimestamp() }); } catch (e) {}
    if (by === 'owner' && rec) {
      var up = { updatedAt: FV.serverTimestamp() }; up['inv.' + g.no] = FV.delete();
      var ps = (rec.participants || []).slice();
      await res.doc(rec.id).update(up);
      if (nm && ps[g.no - 1] === nm) { ps[g.no - 1] = ''; await syncParticipants(rec.id, ps); }
      return ps;
    }
  }
  // 参加者名を書き換える（お連れ様が入力した名前を予約に写すときなど）。同姓同名の確認用の記録（names）も一緒に更新する
  async function syncParticipants(id, ps) {
    return withRetry(function () {
      return db.runTransaction(async function (tx) {
        var rRef = res.doc(id), rS = await tx.get(rRef);
        if (!rS.exists) return fail(_T('予約が見つかりません'));
        var r = rS.data(), eS = await tx.get(events.doc(r.eventId)), ev = eS.exists ? eS.data() : null;
        var oldN = nameList(ev, r.participants), newN = nameList(ev, ps);
        var addRefs = await nameRefs(r.eventId, newN.filter(function (n) { return oldN.indexOf(n) < 0; })), addSnaps = await readNames(tx, addRefs);
        var delRefs = await nameRefs(r.eventId, oldN.filter(function (n) { return newN.indexOf(n) < 0; })), delSnaps = await readNames(tx, delRefs);
        if (r.status !== 'cancel' && r.status !== 'lost') { bumpNames(tx, addRefs, addSnaps, 1, r.eventId); bumpNames(tx, delRefs, delSnaps, -1, r.eventId); }
        tx.update(rRef, { participants: ps, updatedAt: FV.serverTimestamp() });
        return ok({});
      });
    });
  }
  async function renameGuest(g, name) {
    await guests.doc(g.id).update({ name: String(name || '').trim().slice(0, 50), updatedAt: FV.serverTimestamp() });
  }

  return { syncParticipants: syncParticipants, makeInvite: makeInvite, makeGroup: makeGroup, getAlbum: getAlbum, albumData: albumData, albumAdd: albumAdd, albumRemoveFile: albumRemoveFile, albumSetExpire: albumSetExpire, albumDelete: albumDelete, albumCleanup: albumCleanup, albums: albums, afiles: afiles, getGroup: getGroup, claimGuest: claimGuest, getGuest: getGuest, saveGuest: saveGuest, cancelGuest: cancelGuest, renameGuest: renameGuest, guests: guests, gmail: gmail, getDupTels: getDupTels, setDupTels: setDupTels,
    book: book, lookup: lookup, cancel: cancel, change: change, promote: promote, runLottery: runLottery, recount: recount,
    findByOwner: findByOwner, normOwner: normOwner, owners: owners, scrubApplicants: scrubApplicants, migrateInvited: migrateInvited,
    createSlots: createSlots, makeTimes: makeTimes, deleteEvent: deleteEvent, newId: newId, normMail: normMail, isFixed: isFixed, ms: ms,
    events: events, slots: slots, res: res, apps: apps, eimgs: eimgs, cfg: db.collection('config'), dupNames: dupNames, normName: normName };
}
root.makeCore = makeCore;
root.RV = { STORES: STORES, LAP_TEXT: LAP_TEXT };
if (typeof module !== 'undefined') module.exports = { makeCore: makeCore, RV: root.RV };
})(typeof window !== 'undefined' ? window : globalThis);
