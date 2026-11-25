/* 管理画面の追加機能：①操作の記録（auditLog）②イベントの複製 ③受付状況の一覧
   ・操作の記録：誰が・いつ・何をしたかを、追加だけできる記録として残す（書き換え・削除はできない。読めるのはオーナーだけ）
   ・イベントの複製：設定・枠・写真を、新しい日付でコピー。コピーは「準備中」（お客様には見えない）になる
   ・受付状況：イベントごとの残り枠・人数・キャンセル待ち・抽選待ちを1画面で見る */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var WD = '日月火水木金土';
  function md(s) { var p = String(s || '').split('-'); return p.length < 3 ? s : (+p[1]) + '/' + (+p[2]) + '(' + WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] + ')'; }
  function addDays(ymd, n) { var p = ymd.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2] + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function diffDays(a, b) { var f = function (s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }; return Math.round((f(b) - f(a)) / 864e5); }

  /* ---------- ①操作の記録 ---------- */
  function audit(action, detail) {
    try {
      var u = firebase.auth().currentUser; if (!u || !u.email) return Promise.resolve();
      return firebase.firestore().collection('auditLog').add({ by: u.email, action: String(action).slice(0, 40), detail: String(detail || '').slice(0, 300), at: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }
  function auditView(box) {
    box.innerHTML = '<div class="card"><h2 style="margin-top:0">操作の記録</h2><p class="note">誰が・いつ・何をしたかの記録です（新しい順に、最新100件）。書き換え・削除はできません。</p><div id="auL"><div class="loading sm" role="status"><span class="spin"></span></div></div></div>';
    firebase.firestore().collection('auditLog').orderBy('at', 'desc').limit(100).get().then(function (s) {
      var fm = function (t) { if (!t || !t.toDate) return ''; var d = t.toDate(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
      var rows = s.docs.map(function (d) { var x = d.data(); return '<tr><td style="white-space:nowrap">' + fm(x.at) + '</td><td>' + esc(x.by) + '</td><td>' + esc(x.action) + '</td><td style="white-space:normal">' + esc(x.detail) + '</td></tr>'; }).join('');
      box.querySelector('#auL').innerHTML = rows ? '<div class="scroll" style="max-height:60vh"><table><tr><th>日時</th><th>操作した人</th><th>操作</th><th>内容</th></tr>' + rows + '</table></div>' : '<p class="note">まだ記録はありません。</p>';
    }).catch(function (e) { box.querySelector('#auL').innerHTML = '<p class="err">読み込めませんでした: ' + esc(e.code === 'permission-denied' ? 'Firestoreのルールに「auditLog」の設定がまだありません。最新のルールを公開してください' : e.message) + '</p>'; });
  }

  /* ---------- ②イベントの複製 ---------- */
  async function duplicate(C, e, say) {
    var sn = await C.slots.where('eventId', '==', e.id).get(), sl = sn.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    var dates = sl.map(function (s) { return s.date; }).sort(), first = dates[0] || '';
    var wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:14px';
    wrap.innerHTML = '<div class="card" style="max-width:460px;width:100%;margin:0"><h2 style="margin-top:0">イベントを複製する</h2><p class="note">「' + esc(e.name) + '」の設定・枠（' + sl.length + '件）・写真を、新しい日付でコピーします。コピーは<b>準備中</b>（お客様には見えません）になります。予約・お連れ様・組み合わせ表は、コピーされません。</p>' +
      '<label>新しいイベント名<input id="dpN" maxlength="60" value="' + esc(e.name + '（コピー）') + '"></label>' +
      '<label>最初の枠の、新しい日付' + (first ? '<small class="help" style="font-weight:400">いまは ' + esc(md(first)) + '。ほかの日付も、同じ間隔でずれます</small>' : '') + '<input id="dpD" type="date" value="' + (first ? addDays(first, 364) : '') + '"></label>' +
      '<div class="tools"><button class="p" id="dpO" type="button" style="max-width:200px">複製する</button><button class="s" id="dpC" type="button">やめる</button></div><div class="err" id="dpE"></div></div>';
    document.body.appendChild(wrap);
    var q = function (id) { return wrap.querySelector('#' + id); };
    q('dpC').onclick = function () { wrap.remove(); };
    return new Promise(function (done) {
      q('dpO').onclick = async function () {
        var nm = q('dpN').value.trim(), nd = q('dpD').value;
        if (!nm) { q('dpE').textContent = 'イベント名を入力してください'; return; }
        if (sl.length && !nd) { q('dpE').textContent = '新しい日付を入れてください'; return; }
        if (C.events && (await C.events.get()).docs.some(function (d) { return d.data().name === nm; })) { q('dpE').textContent = '同じ名前のイベントがあります。名前を変えてください'; return; }
        this.disabled = true;
        try {
          var shift = first ? diffDays(first, nd) : 0, nid = C.newId(), ev = Object.assign({}, e); delete ev.id;
          Object.assign(ev, { name: nm, drawn: false, test: true, visible: false, group: '' });
          if (ev.deadlineMs) ev.deadlineMs = +ev.deadlineMs + shift * 864e5;
          if (ev.openAtMs) ev.openAtMs = +ev.openAtMs + shift * 864e5;
          var db = firebase.firestore(), ops = [function (b) { b.set(C.events.doc(nid), ev); }];
          sl.forEach(function (s) { var sid = C.newId(); ops.push(function (b) { b.set(C.slots.doc(sid), { eventId: nid, eventName: nm, date: addDays(s.date, shift), start: s.start, end: s.end, capG: s.capG || 0, capP: s.capP || 0, maxPer: s.maxPer || 4, booked: 0, people: 0, waitSeq: 0 }); }); });
          for (var i = 0; i < ops.length; i += 400) { var b = db.batch(); ops.slice(i, i + 400).forEach(function (o) { o(b); }); await b.commit(); }
          try { var im = await C.eimgs.doc(e.id).get(); if (im.exists) await C.eimgs.doc(nid).set(im.data()); } catch (x) { /* 写真は、なくても続ける */ }
          audit('イベントを複製', e.name + ' → ' + nm + '（枠' + sl.length + '件）');
          wrap.remove(); say('複製しました（「' + nm + '」は準備中です。確認してから、公開にしてください）'); done(nid);
        } catch (x) { q('dpE').textContent = '複製できませんでした: ' + x.message; this.disabled = false; }
      };
    });
  }

  /* ---------- ③受付状況 ---------- */
  var timer = 0;
  function stop() { clearInterval(timer); timer = 0; }
  function statusView(C, box, events) {
    stop();
    var showAll = false;
    async function draw() {
      var list = events.filter(function (e) { return showAll || e.visible !== false || e.test; });
      box.innerHTML = '<div class="tools" style="justify-content:space-between;margin:0 0 8px"><b style="font-size:16px">受付状況</b><span><label class="chk" style="display:inline-flex;margin:0 8px 0 0"><input type="checkbox" id="stA"' + (showAll ? ' checked' : '') + '>受付終了のイベントも見る</label><button class="s" id="stR">更新</button> <small class="note" id="stT"></small></span></div><div id="stB"><div class="loading sm" role="status"><span class="spin"></span>読み込み中…</div></div>';
      box.querySelector('#stA').onchange = function () { showAll = this.checked; draw(); };
      box.querySelector('#stR').onclick = function () { fill(list); };
      fill(list);
    }
    async function fill(list) {
      var out = '';
      try {
        for (var i = 0; i < list.length; i++) {
          var e = list[i], sn = await C.slots.where('eventId', '==', e.id).get(), sl = sn.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return (a.date + a.start) < (b.date + b.start) ? -1 : 1; });
          var rs = (await C.res.where('eventId', '==', e.id).get()).docs.map(function (d) { return d.data(); });
          var cnt = function (st) { return rs.filter(function (r) { return r.status === st; }).length; };
          var bk = sl.reduce(function (a, s) { return a + (s.booked || 0); }, 0), pp = sl.reduce(function (a, s) { return a + (s.people || 0); }, 0), cg = sl.reduce(function (a, s) { return a + (s.capG || 0); }, 0), cp = sl.reduce(function (a, s) { return a + (s.capP || 0); }, 0);
          var tag = e.test ? '<span class="tag w">準備中</span>' : e.visible === false ? '<span class="tag w">受付終了</span>' : '<span class="tag k">公開中</span>';
          out += '<div class="card"><div class="tools" style="justify-content:space-between;margin:0"><b>' + esc(e.name) + '</b><span>' + tag + (e.method === '抽選' ? '<span class="tag k">抽選' + (e.drawn ? '・抽選済' : '') + '</span>' : '') + '</span></div>' +
            '<div class="sum" style="margin:8px 0"><div>予約 <b>' + bk + '</b>' + (cg ? '/' + cg : '') + '組・<b>' + pp + '</b>' + (cp ? '/' + cp : '') + '名</div><div>キャンセル待ち <b>' + cnt('wait') + '</b>組</div>' + (e.method === '抽選' ? '<div>抽選待ち <b>' + cnt('lottery') + '</b>組</div>' : '') + '<div>取消 ' + cnt('cancel') + '組</div></div>' +
            '<table style="width:100%"><tr><th>日時</th><th>埋まり具合</th></tr>' + sl.map(function (s) {
              var capUse = s.capG ? 'g' : s.capP ? 'p' : 'n', used = capUse === 'g' ? (s.booked || 0) : capUse === 'p' ? (s.people || 0) : 0, cap = capUse === 'g' ? s.capG : capUse === 'p' ? s.capP : 0;
              var pct = cap ? Math.min(100, Math.round(used * 100 / cap)) : 0, full = cap && used >= cap, left = cap ? Math.max(0, cap - used) : null;
              return '<tr><td style="white-space:nowrap;vertical-align:top">' + esc(md(s.date)) + '<br><small class="note">' + (s.start === '00:00' && s.end === '24:00' ? '終日' : esc(s.start + '–' + s.end)) + '</small></td><td>' + (cap ? '<div style="background:#eee;border-radius:6px;height:12px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:' + (full ? '#c0392b' : pct >= 80 ? '#e0a020' : '#2e8b57') + '"></div></div>' : '') +
                '<div style="font-size:13px;margin-top:2px">' + (s.booked || 0) + '組・' + (s.people || 0) + '名　' + (cap ? (full ? '<span class="tag w">満席</span>' : '残り ' + left + (capUse === 'g' ? '組' : '名')) : '<span class="note">定員なし</span>') + '</div></td></tr>';
            }).join('') + '</table></div>';
        }
        var b = box.querySelector('#stB'); if (!b) return; b.innerHTML = out || '<div class="card note">表示するイベントがありません。</div>';
        var t = box.querySelector('#stT'); if (t) { var d = new Date(); t.textContent = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + ' 現在（30秒ごとに自動で更新）'; }
      } catch (er) { var bb = box.querySelector('#stB'); if (bb) bb.innerHTML = '<p class="err">読み込めませんでした: ' + esc(er.message) + '</p>'; }
    }
    draw();
    timer = setInterval(function () { if (!box.isConnected) return stop(); if (document.visibilityState === 'visible') fill(events.filter(function (e) { return showAll || e.visible !== false || e.test; })); }, 30000);
  }

  root.AX = { audit: audit, auditView: auditView, duplicate: duplicate, statusView: statusView, stop: stop };
  root.AUDIT = audit;
})(window);
