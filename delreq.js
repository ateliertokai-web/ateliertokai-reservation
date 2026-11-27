/* 管理画面：お客様情報の削除のご依頼。
   ・お客様が、プライバシーポリシーのページから出した依頼（deleteRequests）が、ここに届く
   ・依頼のナンバー・ご連絡先・お名前で、予約を自動で検索して、該当の候補を出す
   ・管理者が内容を確認して、「削除する」を押すと、その予約と、お連れ様の入力・組・写真・通知の紐づけを、まとめて消す
   ・該当がなければ、「該当なし」にして、ご連絡先に、店舗から連絡する（新しい依頼は、メールでも、店舗にお知らせが届く）
   ※ ナンバーだけで、自動で消さないのは、ナンバーは、車を見れば、だれにでもわかるため（他人の情報を消されないように、必ず人が確認します） */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var z2h = function (s) { return String(s == null ? '' : s).normalize('NFKC'); };
  var digits = function (s) { return z2h(s).replace(/\D/g, '').replace(/^0+(?=\d)/, ''); };
  var nm = function (s) { return z2h(s).replace(/[\s　]/g, '').toLowerCase(); };
  var tel = function (s) { return z2h(s).replace(/\D/g, ''); };
  function fmt(t) { if (!t || !t.toDate) return ''; var d = t.toDate(), p = function (n) { return ('0' + n).slice(-2); }; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function plateTxt(p) { p = p || {}; return [p.pref, p.cls, p.kana, p.num].filter(Boolean).join(' '); }

  // 依頼に当てはまる予約を探す。理由（ナンバー・連絡先・お名前）を付ける
  function match(req, all) {
    var p = req.plate || {}, num = digits(p.num), ct = String(req.contact || '').trim(), isMail = /@/.test(ct), ctv = isMail ? z2h(ct).toLowerCase() : tel(ct), nn = nm(req.name), out = [];
    all.forEach(function (r) {
      var why = [], c = r.car || {};
      if (num && !r.order && digits(c.num) === num && (!p.kana || c.kana === z2h(p.kana)) && (!p.cls || z2h(c.cls) === z2h(p.cls)) && (!p.pref || nm(c.pref) === nm(p.pref))) why.push('ナンバー');
      if (ctv && (isMail ? z2h(r.mail || '').toLowerCase() === ctv : (tel(r.tel) && tel(r.tel) === ctv))) why.push('連絡先');
      if (nn && [r.name, r.corp].concat(r.participants || []).some(function (x) { return x && nm(x) === nn; })) why.push('お名前');
      if (!why.length) return;
      // ナンバーと、（連絡先かお名前）が合うものは、初めからチェック。ほかは、確認のうえ、手動でチェック
      var strong = (why.indexOf('ナンバー') >= 0 && why.length >= 2) || (why.indexOf('連絡先') >= 0 && why.indexOf('お名前') >= 0);
      out.push({ r: r, why: why, strong: strong });
    });
    return out.sort(function (a, b) { return (b.strong ? 1 : 0) - (a.strong ? 1 : 0) || b.why.length - a.why.length; });
  }

  // 1件の予約を、まとめて消す。枠の人数・同姓同名の目印・申込の目印は、取り消し（C.cancel）で戻してから、消す
  async function purge(C, r) {
    var db = firebase.firestore(), FV = firebase.firestore.FieldValue, n = 0;
    if (r.status !== 'cancel') { var x = await C.cancel(r.id, '', true); if (!x.ok && !/すでにキャンセル/.test(x.msg || '')) throw new Error(x.msg || '取り消せませんでした'); }
    var gids = Object.keys(r.inv || {}).map(function (k) { return r.inv[k]; }).filter(Boolean);
    async function del(ref) { try { await ref.delete(); n++; } catch (e) { if (!e || e.code !== 'not-found') throw e; } }
    // 写真・成績表（予約に紐づく組のアルバム）
    var al = await C.albums.where('rid', '==', r.id).get(); for (var a = 0; a < al.docs.length; a++) { await C.albumDelete(al.docs[a].id); n++; }
    // お連れ様の入力欄・メール・組
    for (var i = 0; i < gids.length; i++) {
      var gr = await db.collection('guestGroups').where('members', 'array-contains', gids[i]).get(); for (var k = 0; k < gr.docs.length; k++) await del(gr.docs[k].ref);
      await del(C.guests.doc(gids[i])); await del(C.gmail.doc(gids[i]));
    }
    // オーナーズカードIDからの目印、通知の端末との紐づけ、通知の送信予約
    var ow = await C.owners.where('ids', 'array-contains', r.id).get();
    for (var o = 0; o < ow.docs.length; o++) { var ids = (ow.docs[o].data().ids || []).filter(function (v) { return v !== r.id; }); if (ids.length) await ow.docs[o].ref.update({ ids: ids }); else await del(ow.docs[o].ref); }
    var ps = await db.collection('pushSubs').where('rids', 'array-contains', r.id).get();
    for (var s = 0; s < ps.docs.length; s++) await ps.docs[s].ref.update({ rids: FV.arrayRemove(r.id) });
    var pq = await db.collection('pushQueue').where('rid', '==', r.id).get(); for (var q = 0; q < pq.docs.length; q++) await del(pq.docs[q].ref);
    await del(C.res.doc(r.id));
    return n;
  }

  function view(C, box, say, audit, onChange) {
    var reqs = [], all = null, loading = false, unsub = function () {};
    box.className = '';
    function draw() {
      var open = reqs.filter(function (q) { return q.status === 'new' || q.status === 'nomatch'; }), done = reqs.filter(function (q) { return q.status === 'done'; });
      box.innerHTML = '<div class="card"><h2 style="margin-top:0">お客様情報の削除のご依頼</h2>' +
        '<p class="note">お客様が、プライバシーポリシーのページ（privacy.html）から出した依頼が、届きます。依頼のナンバー・ご連絡先・お名前で、予約を自動で探します。内容を確認して「削除する」を押すと、その予約の情報を、消します（取り消せません）。<br>' +
        '※ ナンバーは、車を見ればわかるため、ナンバーだけでは、初めからチェックを入れません。ご本人かどうか、ご連絡先・お名前もご確認ください。</p></div>' +
        (open.length ? open.map(card).join('') : '<div class="card note">対応が必要な依頼は、ありません。</div>') +
        (done.length ? '<div class="card"><b>対応済み（' + done.length + '件）</b><div class="note">' + done.slice(0, 20).map(function (q) { return esc(fmt(q.doneAt || q.createdAt)) + '　削除 ' + (q.deleted || 0) + '件　' + esc(q.doneBy || ''); }).join('<br>') + '</div></div>' : '');
      box.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { run(b.dataset.del, this); }; });
      box.querySelectorAll('[data-none]').forEach(function (b) { b.onclick = async function () { this.disabled = true; try { await firebase.firestore().collection('deleteRequests').doc(b.dataset.none).update({ status: 'nomatch', checkedAt: firebase.firestore.FieldValue.serverTimestamp() }); say('「該当なし（要連絡）」にしました。ご連絡先に、店舗から連絡してください'); } catch (e) { say('失敗しました: ' + e.message); } }; });
      box.querySelectorAll('[data-fin]').forEach(function (b) { b.onclick = function () { fin(b.dataset.fin, 0, this); }; });
    }
    function card(q) {
      var ms = all ? match(q, all) : null, p = plateTxt(q.plate);
      return '<div class="card" data-q="' + q.id + '"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(q.name) + ' 様</b><small>' + esc(fmt(q.createdAt)) + (q.status === 'nomatch' ? '　<span class="tag w">該当なし・要連絡</span>' : '') + '</small></div>' +
        '<div class="note" style="margin:4px 0">ナンバー：' + (p ? esc(p) : '（なし）') + '　ご連絡先：' + esc(q.contact) + (q.note ? '<br>ご要望：' + esc(q.note) : '') + '</div>' +
        (ms === null ? '<p class="note">予約を検索しています…</p>' : ms.length ? '<div class="note" style="margin:6px 0 2px"><b>該当の候補（' + ms.length + '件）</b>　チェックした予約を、削除します</div>' + ms.map(function (m) {
          var r = m.r; return '<label class="chk" style="margin:4px 0;align-items:flex-start"><input type="checkbox" data-r="' + r.id + '"' + (m.strong ? ' checked' : '') + '><span><b>' + esc(r.name) + ' 様</b>　' + esc(r.eventName || '') + '　' + esc(r.date || '') + '　' + esc(r.tel || '') + '　' + esc(r.mail || '') +
            '<br><small>' + (r.order ? 'ご注文中・新規' : esc(plateTxt(r.car))) + '　予約番号 ' + esc(r.id) + '　一致：' + m.why.map(function (w) { return '<span class="tag k">' + w + '</span>'; }).join(' ') + '</small></span></label>';
        }).join('') + '<div class="tools" style="margin-top:8px"><button class="s d" type="button" data-del="' + q.id + '">チェックした予約を削除する</button></div>' :
          '<p class="note" style="color:var(--err)">該当する予約は、見つかりませんでした。ご連絡先に連絡して、状況を確認してください（別のお名前・別のナンバーでのご予約の可能性があります）。</p>') +
        '<div class="tools" style="margin-top:6px">' + (q.status === 'new' ? '<button class="s" type="button" data-none="' + q.id + '">該当なし（要連絡）にする</button>' : '') + '<button class="s" type="button" data-fin="' + q.id + '">対応済みにする（個人情報の記録を消す）</button></div></div>';
    }
    async function fin(id, deleted, btn) {
      if (btn && !confirm('この依頼を「対応済み」にします。依頼に書かれたお名前・ナンバー・ご連絡先の記録は、消えます。よろしいですか？')) return;
      var u = firebase.auth().currentUser;
      try {
        await firebase.firestore().collection('deleteRequests').doc(id).update({ status: 'done', name: '', contact: '', plate: { pref: '', cls: '', kana: '', num: '' }, note: '', deleted: deleted, doneBy: (u && u.email) || '', doneAt: firebase.firestore.FieldValue.serverTimestamp() });
        if (audit) audit('削除依頼を対応済みに', '削除 ' + deleted + '件');
        say('対応済みにしました');
      } catch (e) { say('失敗しました: ' + e.message); }
    }
    async function run(id, btn) {
      var wrap = box.querySelector('[data-q="' + id + '"]'), ids = [].map.call(wrap.querySelectorAll('[data-r]:checked'), function (c) { return c.dataset.r; });
      if (!ids.length) { say('削除する予約に、チェックを入れてください'); return; }
      if (!confirm('チェックした ' + ids.length + '件の予約の情報を、削除します。取り消せません。よろしいですか？')) return;
      btn.disabled = true; var n = 0, bad = 0;
      for (var i = 0; i < ids.length; i++) {
        var r = all.filter(function (x) { return x.id === ids[i]; })[0]; if (!r) continue;
        try { await purge(C, r); n++; if (audit) audit('削除依頼により、予約情報を削除', '予約番号 ' + r.id + '（' + (r.eventName || '') + '）'); } catch (e) { bad++; say('削除できませんでした（' + r.id + '）: ' + e.message); }
      }
      all = all.filter(function (x) { return ids.indexOf(x.id) < 0 || bad; });
      if (!bad) { await fin(id, n, null); say(n + '件を削除して、対応済みにしました'); } else btn.disabled = false;
      if (onChange) onChange();
    }
    var coll = firebase.firestore().collection('deleteRequests');
    unsub = coll.orderBy('createdAt', 'desc').limit(100).onSnapshot(function (sn) {
      reqs = sn.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); draw(); if (onChange) onChange(reqs.filter(function (q) { return q.status === 'new'; }).length);
      if (all === null && !loading && reqs.some(function (q) { return q.status === 'new' || q.status === 'nomatch'; })) { loading = true; C.res.get().then(function (s) { all = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); draw(); }).catch(function (e) { say('予約を検索できませんでした: ' + e.message); }).then(function () { loading = false; }); }
    }, function (e) { box.innerHTML = '<div class="card note">読み込めませんでした: ' + esc(e.code === 'permission-denied' ? 'Firestoreのルールに「deleteRequests」の設定がありません（ルールを更新してください）' : e.message) + '</div>'; });
    return function () { unsub(); };
  }
  // 新しい依頼の数だけ数える（タブの目印用）
  function count(cb) {
    try { return firebase.firestore().collection('deleteRequests').where('status', '==', 'new').limit(50).onSnapshot(function (s) { cb(s.docs.length); }, function () {}); } catch (e) { return function () {}; }
  }
  root.DELREQ = { view: view, count: count, match: match, purge: purge, digits: digits };
})(window);
