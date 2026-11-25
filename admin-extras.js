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
  function css() {
    if (document.getElementById('axcss')) return;
    var s = document.createElement('style'); s.id = 'axcss';
    s.textContent = '.calx{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}.calx .w{text-align:center;font-size:12px;color:#6b665d;padding:2px 0}.calx .su{color:#c0392b}.calx .sa{color:#1e88e5}' +
      '.calx .cd{display:flex;flex-direction:column;align-items:stretch;gap:1px;min-height:64px;padding:3px;border:1px solid var(--line,#ddd);border-radius:7px;background:#fff;text-align:left;font:inherit;cursor:pointer;color:inherit;overflow:hidden}.calx .cd.no{background:#faf9f6;color:#b5b0a5}.calx .cd.td{border-color:#b8955a;box-shadow:inset 0 0 0 1px #b8955a}.calx .cd.on{outline:2px solid #111}' +
      '.calx .dn{font-size:12px;font-weight:700}.calx .dt{font-size:11.5px;font-weight:700;color:#1f7a4d;line-height:1.2}.calx .dt.fl{color:#c0392b}.calx .de{font-size:9.5px;line-height:1.25;border-left:3px solid;padding-left:3px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '@media(max-width:560px){.calx{gap:2px}.calx .de{display:none}.calx .cd{min-height:52px;padding:2px}.calx .dt{font-size:10px;word-break:break-all;line-height:1.15}}';
    document.head.appendChild(s);
  }
  function statusView(C, box, events) {
    css();
    stop();
    var showAll = false, mode = 'ev', cm = '', sel = '';
    async function draw() {
      if (mode === 'cal') return drawCal();
      var list = events.filter(function (e) { return showAll || e.visible !== false || e.test; });
      box.innerHTML = '<div class="tools" style="justify-content:space-between;margin:0 0 8px"><span><button class="s on" data-md="ev">イベント別</button> <button class="s" data-md="cal">カレンダー（日・月ごと）</button></span><span><label class="chk" style="display:inline-flex;margin:0 8px 0 0"><input type="checkbox" id="stA"' + (showAll ? ' checked' : '') + '>受付終了のイベントも見る</label><button class="s" id="stR">更新</button> <small class="note" id="stT"></small></span></div><div id="stB"><div class="loading sm" role="status"><span class="spin"></span>読み込み中…</div></div>';
      box.querySelector('#stA').onchange = function () { showAll = this.checked; draw(); };
      box.querySelectorAll('[data-md]').forEach(function (b) { b.onclick = function () { mode = b.dataset.md; draw(); }; });
      box.querySelector('#stR').onclick = function () { fill(list); };
      fill(list);
    }

    // カレンダー：日ごと・月ごとの「予約 ◯／定員 ◯」。枠の数え方（組・人数）に合わせる。日をタップすると、その日の枠の一覧
    var PALC = ['#1e88e5', '#d81b60', '#43a047', '#fb8c00', '#5e35b1', '#00acc1', '#9e9d24', '#e64a19', '#546e7a', '#8e24aa'];
    async function drawCal() {
      box.innerHTML = '<div class="tools" style="justify-content:space-between;margin:0 0 8px"><span><button class="s" data-md="ev">イベント別</button> <button class="s on" data-md="cal">カレンダー（日・月ごと）</button></span><label class="chk" style="display:inline-flex;margin:0"><input type="checkbox" id="stA"' + (showAll ? ' checked' : '') + '>受付終了のイベントも含める</label></div><div id="cB"><div class="loading sm" role="status"><span class="spin"></span>読み込み中…</div></div>';
      box.querySelectorAll('[data-md]').forEach(function (b) { b.onclick = function () { mode = b.dataset.md; draw(); }; });
      box.querySelector('#stA').onchange = function () { showAll = this.checked; drawCal(); };
      var evs = {}; events.forEach(function (e) { if (showAll || e.visible !== false || e.test) evs[e.id] = e; });
      var sl;
      try { sl = (await C.slots.get()).docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (s) { return evs[s.eventId]; }); }
      catch (er) { box.querySelector('#cB').innerHTML = '<p class="err">読み込めませんでした: ' + esc(er.message) + '</p>'; return; }
      var ids = Object.keys(evs).sort(), color = {}; ids.forEach(function (id, i) { color[id] = PALC[i % PALC.length]; });
      var today = new Date(), ty = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
      if (!cm) { var up = sl.map(function (s) { return s.date; }).filter(function (d) { return d >= ty; }).sort()[0] || sl.map(function (s) { return s.date; }).sort().pop() || ty; cm = up.slice(0, 7); }
      function use(list) {   // 組で数える枠は組、人数で数える枠は人数。定員なしは数のみ
        var g = { b: 0, c: 0 }, p = { b: 0, c: 0 }, n = { b: 0, c: 0 }, people = 0, groups = 0;
        list.forEach(function (s) { groups += s.booked || 0; people += s.people || 0; if (s.capG) { g.b += s.booked || 0; g.c += s.capG; } else if (s.capP) { p.b += s.people || 0; p.c += s.capP; } else { n.b += s.booked || 0; } });
        return { g: g, p: p, n: n, groups: groups, people: people };
      }
      function txt(u) { var a = []; if (u.g.c) a.push(u.g.b + '/' + u.g.c + '組'); if (u.p.c) a.push(u.p.b + '/' + u.p.c + '名'); if (u.n.b && !u.g.c && !u.p.c) a.push(u.n.b + '組'); return a.join(' ') || '0'; }
      function full(u) { return (u.g.c && u.g.b >= u.g.c) || (u.p.c && u.p.b >= u.p.c); }
      var p = cm.split('-'), y = +p[0], mo = +p[1] - 1, first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
      var inM = sl.filter(function (s) { return s.date.slice(0, 7) === cm; }), tot = use(inM);
      var h = '<div class="tools" style="justify-content:space-between;align-items:center;margin:0 0 6px"><button class="s" data-mv="-1">‹ 前の月</button><b style="font-size:17px">' + y + '年' + (mo + 1) + '月</b><button class="s" data-mv="1">次の月 ›</button></div>' +
        '<div class="sum" style="margin:0 0 8px"><div><b>この月の合計</b>　予約 <b>' + txt(tot) + '</b></div><div>予約した人数 <b>' + tot.people + '</b>名</div><div>枠 ' + inM.length + '件</div></div>' +
        '<div class="calx">' + [].map.call('日月火水木金土', function (w, i) { return '<b class="w' + (i === 0 ? ' su' : i === 6 ? ' sa' : '') + '">' + w + '</b>'; }).join('');
      for (var i = 0; i < first; i++) h += '<span></span>';
      for (var d = 1; d <= days; d++) {
        var ds = cm + '-' + ('0' + d).slice(-2), day = sl.filter(function (s) { return s.date === ds; }), u = use(day), per = {};
        day.forEach(function (s) { (per[s.eventId] = per[s.eventId] || []).push(s); });
        h += '<button type="button" class="cd' + (ds === ty ? ' td' : '') + (sel === ds ? ' on' : '') + (day.length ? '' : ' no') + '" data-d="' + ds + '"><span class="dn">' + d + '</span>' + (day.length ? '<span class="dt' + (full(u) ? ' fl' : '') + '">' + txt(u) + '</span>' + Object.keys(per).map(function (id) { return '<span class="de" style="border-color:' + color[id] + '">' + esc(evs[id].name.slice(0, 5)) + ' ' + txt(use(per[id])) + '</span>'; }).join('') : '') + '</button>';
      }
      h += '</div><div class="note" style="margin:6px 0">各日の数字は「予約／定員」です（組で数える枠は組、人数で数える枠は名）。日をタップすると、その日の枠が下に出ます。</div><div id="cD"></div>' +
        '<h3 style="margin:14px 0 6px;font-size:15px">イベントごとの凡例</h3><div class="tools">' + ids.map(function (id) { return '<span class="tag" style="border-color:' + color[id] + '">' + esc(evs[id].name) + '</span>'; }).join('') + '</div>';
      var B = box.querySelector('#cB'); B.innerHTML = h;
      B.querySelectorAll('[data-mv]').forEach(function (b) { b.onclick = function () { var dt = new Date(y, mo + +b.dataset.mv, 1); cm = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2); sel = ''; drawCal(); }; });
      function detail(ds) {
        var day = sl.filter(function (s) { return s.date === ds; }).sort(function (a, b) { return (a.start + a.eventId) < (b.start + b.eventId) ? -1 : 1; });
        B.querySelector('#cD').innerHTML = '<div class="card"><b>' + esc(md(ds)) + ' の枠</b>' + (day.length ? '<div class="scroll"><table style="width:100%;margin-top:6px"><tr><th>イベント</th><th>時間</th><th>予約／定員</th></tr>' + day.map(function (s) {
          var u = use([s]); return '<tr><td>' + esc(evs[s.eventId].name) + '</td><td style="white-space:nowrap">' + (s.start === '00:00' && s.end === '24:00' ? '終日' : esc(s.start + '–' + s.end)) + '</td><td>' + txt(u) + '（' + (s.people || 0) + '名）' + (full(u) ? ' <span class="tag w">満席</span>' : '') + '</td></tr>'; }).join('') + '</table></div>' : '<p class="note">この日に、枠はありません。</p>') + '</div>';
      }
      B.querySelectorAll('[data-d]').forEach(function (b) { b.onclick = function () { sel = b.dataset.d; B.querySelectorAll('.cd.on').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); detail(sel); }; });
      if (sel) detail(sel);
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
    timer = setInterval(function () { if (!box.isConnected) return stop(); if (mode === 'ev' && document.visibilityState === 'visible') fill(events.filter(function (e) { return showAll || e.visible !== false || e.test; })); }, 30000);
  }

    /* ---------- 通知・メールを、すぐ届ける（GASのウェブアプリを呼ぶ）。設定は adminConfig/gas（管理者だけが読み書き） ---------- */
  var GAS = undefined;
  function gasCfg() { if (GAS !== undefined) return Promise.resolve(GAS); return firebase.firestore().collection('adminConfig').doc('gas').get().then(function (s) { GAS = (s.exists && s.data().url && s.data().key) ? s.data() : null; return GAS; }).catch(function () { GAS = null; return null; }); }
  // 送信予約を、すぐ処理させる。設定がない・失敗しても、5分ごとの自動処理が送るので、何も困らない。戻り値：呼び出せたか
  function kick() {
    return gasCfg().then(function (c) {
      if (!c) return false;
      return fetch(c.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: c.key }) }).then(function () { return true; }).catch(function () { return false; });
    });
  }
  function kickCard(box, say) {
    box.innerHTML = '<div class="card"><h2 style="margin-top:0">通知・メールを、すぐ届ける設定</h2><p class="note">いまは、5分ごとの自動処理で、通知・メールが届きます。ここを設定すると、管理画面の「お知らせを送る」「繰り上げ」「抽選」のあと、数秒で届きます。<br>設定の手順：GASで、「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」（実行するユーザー「自分」、アクセスできるユーザー「全員」）→ 出てきたURLをコピー。次に、関数 <code>makeWebhookKey</code> を実行して、実行ログに出た「合言葉」をコピー。2つを、下に入れます。<br>※ 自動処理と、この「すぐ届ける」が同時に動いても、同じ通知・メールが、二重に届くことはありません。</p>' +
      '<label>ウェブアプリのURL<input id="kkU" placeholder="https://script.google.com/macros/s/…/exec"></label><label>合言葉<input id="kkK" autocomplete="off"></label><div class="tools"><button class="p" id="kkS" type="button" style="max-width:180px">保存する</button><button class="s" id="kkT" type="button">いま、動くか試す</button><button class="s d" id="kkD" type="button">設定を消す</button></div><div id="kkM" class="note"></div></div>';
    var q = function (id) { return box.querySelector('#' + id); };
    gasCfg().then(function (c) { if (c) { q('kkU').value = c.url; q('kkK').value = c.key; q('kkM').textContent = '設定済みです。'; } });
    q('kkS').onclick = async function () {
      var u = q('kkU').value.trim(), k = q('kkK').value.trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) || k.length < 20) { say('URLと合言葉を、正しく入れてください'); return; }
      try { await firebase.firestore().collection('adminConfig').doc('gas').set({ url: u, key: k, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); GAS = { url: u, key: k }; audit('すぐ届ける設定を保存', ''); say('保存しました'); q('kkM').textContent = '設定済みです。'; }
      catch (e) { say('保存できませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「adminConfig」の設定がまだありません' : e.message)); }
    };
    q('kkT').onclick = async function () { var ok = await kick(); say(ok ? '呼び出しました（送る予約があれば、数秒で届きます）' : '呼び出せませんでした（URLと設定を確認してください）'); };
    q('kkD').onclick = async function () { if (!confirm('設定を消します（5分ごとの自動処理では、これまでどおり届きます）。よろしいですか？')) return; try { await firebase.firestore().collection('adminConfig').doc('gas').delete(); GAS = null; q('kkU').value = ''; q('kkK').value = ''; q('kkM').textContent = ''; say('消しました'); } catch (e) { say('消せませんでした: ' + e.message); } };
  }

  root.AX = { kick: kick, kickCard: kickCard, audit: audit, auditView: auditView, duplicate: duplicate, statusView: statusView, stop: stop };
  root.AUDIT = audit;
})(window);
