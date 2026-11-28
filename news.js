/* 管理画面「お知らせ」：アプリの通知を送る／送信履歴を見る。
   ・送り先：通知を許可した全員／イベントの予約者全員／イベントの予約を、時間帯ごとの一覧から選んで（✔）
   ・送信履歴：送った（送る予定の）お知らせ・繰り上げ・抽選の結果の一覧（送れた台数・メールの数・待ち／送信済み）
   ・送る予約（pushQueue）を書くと、GAS が、すぐ（「すぐ届ける設定」済み）か、1分ごとの自動処理で、送る */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var WD = '日月火水木金土';
  function md(s) { var p = String(s || '').split('-'); return p.length < 3 ? (s || '') : (+p[1]) + '/' + (+p[2]) + '(' + WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] + ')'; }
  function rng(r) { return (r.start === '00:00' && r.end === '24:00') ? '終日' : (r.start || '') + '–' + (r.end || ''); }
  function ms(t) { return t && t.toMillis ? t.toMillis() : (t && t.__ts) || 0; }
  function fmt(t) { var m = ms(t); if (!m) return ''; var d = new Date(m), p = function (n) { return ('0' + n).slice(-2); }; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  var TYPE = { news: 'お知らせ', promote: '繰り上げ', lottery: '抽選の結果' };

  function view(C, box, events, say, audit, kick) {
    var db = firebase.firestore(), FV = firebase.firestore.FieldValue, subs = [], rs = [], sel = {}, mode = 'all', eid = events[0] ? events[0].id : '', unsub = function () {}, gasOk = null;
    var q = function (id) { return box.querySelector('#' + id); };
    box.innerHTML = '<div class="card" id="nwF"></div><div class="card" id="nwH"></div>';
    function subsOf(rid) { return subs.some(function (s) { return (s.data().rids || []).indexOf(rid) >= 0; }); }
    function live() { return rs.filter(function (r) { return r.status === 'confirmed' || r.status === 'won'; }).sort(function (a, b) { return ((a.date + a.start) < (b.date + b.start)) ? -1 : ((a.date + a.start) > (b.date + b.start)) ? 1 : String(a.name).localeCompare(String(b.name), 'ja'); }); }
    function form() {
      var f = q('nwF'), ev = events.filter(function (e) { return e.id === eid; })[0] || {};
      f.innerHTML = '<h2 style="margin-top:0">お知らせを送る</h2><p class="note">予約ページをホーム画面に追加し、通知を許可したお客様のスマホに届きます。キャンセル待ちの繰り上げ・抽選の結果は、自動で届きます。<b>いま通知を受け取っている端末：' + subs.length + '台</b></p>' +
        '<div class="row2" style="display:flex;gap:14px;flex-wrap:wrap;margin:6px 0"><label class="chk"><input type="radio" name="nwM" value="all"' + (mode === 'all' ? ' checked' : '') + '>通知を許可した全員</label><label class="chk"><input type="radio" name="nwM" value="event"' + (mode === 'event' ? ' checked' : '') + '>イベントの予約者全員</label><label class="chk"><input type="radio" name="nwM" value="pick"' + (mode === 'pick' ? ' checked' : '') + '>予約を選んで送る（✔）</label></div>' +
        (mode !== 'all' ? '<label>イベント<select id="nwE">' + events.map(function (e) { return '<option value="' + e.id + '"' + (e.id === eid ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') + '</select></label>' : '') +
        (mode === 'pick' ? '<div id="nwL"></div>' : '') +
        '<label>見出し<input id="nwT" maxlength="40" placeholder="例：レクサス鹿児島東開からのお知らせ"></label><label>本文<textarea id="nwB" rows="3" maxlength="200" placeholder="例：明日のゴルフコンペは予定どおり開催します。"></textarea></label>' +
        '<div class="tools"><button class="p" id="nwS" type="button" style="max-width:220px">お知らせを送る</button></div>' +
        '<p class="note" id="nwK"></p>';
      f.querySelectorAll('[name=nwM]').forEach(function (r) { r.onchange = function () { mode = r.value; var t = q('nwT') && q('nwT').value, b = q('nwB') && q('nwB').value; if (mode !== 'all') loadRs().then(function () { form(); q('nwT').value = t; q('nwB').value = b; }); else { form(); q('nwT').value = t; q('nwB').value = b; } }; });
      if (q('nwE')) q('nwE').onchange = function () { eid = this.value; sel = {}; loadRs().then(function () { var t = q('nwT').value, b = q('nwB').value; form(); q('nwT').value = t; q('nwB').value = b; }); };
      if (mode === 'pick') list();
      q('nwS').onclick = send;
      kickInfo();
    }
    function kickInfo() { var k = q('nwK'); if (!k) return; k.textContent = gasOk === null ? '' : gasOk ? '「すぐ届ける設定」は済んでいます。送ると、数秒で届きます。' : '「すぐ届ける設定」が未設定です。1分ごとの自動処理で、1〜2分以内に届きます（スタッフタブで、すぐ届ける設定ができます）。'; }
    function loadRs() { if (!eid) return Promise.resolve(); return C.res.where('eventId', '==', eid).get().then(function (s) { rs = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }); }
    function list() {
      var L = q('nwL'); if (!L) return;
      var rows = live(), groups = {}, order = [];
      rows.forEach(function (r) { var k = md(r.date) + ' ' + rng(r); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); });
      L.innerHTML = '<div class="box" style="margin:8px 0"><div class="row2" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b id="nwC"></b><button class="s" type="button" id="nwA">全員を選ぶ</button><button class="s" type="button" id="nwN">選択を外す</button><label class="chk" style="margin:0"><input type="checkbox" id="nwO">通知が届く方だけ表示</label></div>' +
        '<div class="scroll" style="max-height:44vh;margin-top:8px">' + (order.length ? order.map(function (k) {
          return '<div class="gh" data-g="' + esc(k) + '" style="margin:8px 0 2px"><label class="chk" style="margin:0"><input type="checkbox" data-gs="' + esc(k) + '"><b>' + esc(k) + '</b>　' + groups[k].length + '組</label></div>' + groups[k].map(function (r) {
            var on = subsOf(r.id); return '<label class="chk nwr" data-on="' + (on ? 1 : 0) + '" style="margin:2px 0 2px 18px"><input type="checkbox" data-r="' + r.id + '"' + (sel[r.id] ? ' checked' : '') + '>' + esc(r.name) + ' 様　' + (r.n || '') + '名 ' + (on ? '<span class="tag k">通知OK</span>' : '<span class="tag">通知なし</span>') + '</label>';
          }).join('');
        }).join('') : '<p class="note">確定している予約が、ありません。</p>') + '</div><p class="note" style="margin:6px 0 0">「通知なし」の方は、ホーム画面に追加して通知を許可していないため、アプリの通知は届きません。</p></div>';
      function count() { var ids = Object.keys(sel).filter(function (k) { return sel[k]; }), ok = ids.filter(function (k) { return subsOf(k); }).length; q('nwC').textContent = '選択：' + ids.length + '組（通知が届く：' + ok + '組）'; L.querySelectorAll('[data-gs]').forEach(function (g) { var rr = groups[g.dataset.gs]; g.checked = rr.every(function (r) { return sel[r.id]; }); }); }
      L.querySelectorAll('[data-r]').forEach(function (c) { c.onchange = function () { sel[c.dataset.r] = c.checked; count(); }; });
      L.querySelectorAll('[data-gs]').forEach(function (g) { g.onchange = function () { groups[g.dataset.gs].forEach(function (r) { sel[r.id] = g.checked; var c = L.querySelector('[data-r="' + r.id + '"]'); if (c) c.checked = g.checked; }); count(); }; });
      q('nwA').onclick = function () { rows.forEach(function (r) { sel[r.id] = true; }); L.querySelectorAll('[data-r]').forEach(function (c) { c.checked = true; }); count(); };
      q('nwN').onclick = function () { sel = {}; L.querySelectorAll('[data-r]').forEach(function (c) { c.checked = false; }); count(); };
      q('nwO').onchange = function () { L.querySelectorAll('.nwr').forEach(function (l) { l.style.display = (this.checked && l.dataset.on !== '1') ? 'none' : ''; }, this); };
      count();
    }
    async function send() {
      var t = q('nwT').value.trim() || 'レクサス鹿児島東開からのお知らせ', b = q('nwB').value.trim(), ev = events.filter(function (e) { return e.id === eid; })[0] || {}, job = { type: 'news', eid: '', title: t.slice(0, 40), body: b.slice(0, 200), sent: false }, who = '通知を許可した全員', n = 0;
      if (!b) { say('本文を入力してください'); return; }
      if (mode === 'event') { job.eid = eid; who = '「' + ev.name + '」を予約した方'; }
      if (mode === 'pick') {
        var ids = Object.keys(sel).filter(function (k) { return sel[k]; }); if (!ids.length) { say('送る予約に、✔を入れてください'); return; }
        var ok = ids.filter(subsOf).length; n = ids.length; job.eid = eid; job.rids = ids.slice(0, 400); who = '「' + ev.name + '」の、選んだ ' + ids.length + '組（通知が届くのは ' + ok + '組）';
        if (!ok) { say('選んだ方の中に、通知が届く方が、いません'); return; }
      }
      if (!confirm(who + ' に、お知らせを送ります。よろしいですか？\n\n' + t + '\n' + b)) return;
      var btn = q('nwS'); btn.disabled = true;
      try {
        var u = firebase.auth().currentUser; job.by = (u && u.email) || ''; job.evName = ev.name || ''; job.target = mode; job.picked = n; job.createdAt = FV.serverTimestamp();
        await db.collection('pushQueue').add(job); q('nwB').value = '';
        if (audit) audit('お知らせを送信', t + '／' + who);
        kick().then(function (k) { say(k ? 'お知らせを送りました（数秒で届きます）' : 'お知らせの送信を受け付けました（1〜2分以内に届きます）'); });
      } catch (e) { say('送れませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「pushQueue」の設定がまだありません' : e.message)); }
      btn.disabled = false;
    }
    function history(jobs) {
      var h = q('nwH'); if (!h) return;
      h.innerHTML = '<h2 style="margin-top:0">送信履歴</h2><p class="note">お知らせ・繰り上げ・抽選の結果の通知の、記録です（新しい順・最大50件）。「送った端末」が 0 台のときは、通知を許可した端末が、対象にいませんでした。</p>' +
        (jobs.length ? jobs.map(function (j) {
          var wait = !j.sent, old = wait && ms(j.createdAt) && Date.now() - ms(j.createdAt) > 10 * 60000, who = j.type === 'news' ? (j.target === 'pick' ? '「' + (j.evName || '') + '」の選んだ ' + (j.picked || 0) + '組' : j.eid ? '「' + (j.evName || '') + '」の予約者' : '通知を許可した全員') : (j.type === 'lottery' ? '「' + (j.evName || '') + '」の予約者' : '予約者ご本人');
          return '<div class="box" style="margin:6px 0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(TYPE[j.type] || j.type) + (j.title ? '：' + esc(j.title) : '') + '</b><small>' + esc(fmt(j.createdAt)) + '</small></div>' +
            (j.body ? '<div style="margin:2px 0;white-space:pre-wrap">' + esc(j.body) + '</div>' : '') + '<div class="note" style="margin:2px 0 0">送り先：' + esc(who) + (j.by ? '　送った人：' + esc(j.by) : '') + '</div>' +
            '<div style="margin-top:3px">' + (wait ? '<span class="tag w">送信待ち</span>' + (old ? '　<span style="color:#c0392b">10分以上たっています。自動処理が動いていない可能性があります（スタッフ・保守の方は、GASの実行ログをご確認ください）</span>' : '') : '<span class="tag k">送信済み</span>　送った端末：' + (j.sentCount || 0) + '台' + (j.mailCount ? '　メール：' + j.mailCount + '通' : '') + (j.sentAt ? '　' + esc(fmt(j.sentAt)) : '') + ((j.sentCount || 0) === 0 && j.type === 'news' ? '　<span style="color:#c0392b">届いた端末が、ありません</span>' : '')) + '</div></div>';
        }).join('') : '<p class="note">まだ、記録がありません。</p>');
    }
    // 起動：通知の端末の一覧・すぐ届ける設定の有無・履歴
    db.collection('pushSubs').get().then(function (s) { subs = s.docs; form(); }).catch(function () { form(); });
    form();
    if (root.AX && AX.hasKick) AX.hasKick().then(function (ok) { gasOk = ok; kickInfo(); });
    unsub = db.collection('pushQueue').orderBy('createdAt', 'desc').limit(50).onSnapshot(function (sn) { history(sn.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })); }, function (e) { var h = q('nwH'); if (h) h.innerHTML = '<p class="note">履歴を読み込めませんでした: ' + esc(e.message) + '</p>'; });
    return function () { unsub(); };
  }
  root.NEWS = { view: view };
})(window);
