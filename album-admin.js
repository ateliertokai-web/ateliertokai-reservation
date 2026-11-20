/* 管理画面：ゴルフの組ごとの「記念写真・成績表」（アルバム）。予約一覧の「写真・成績表」から開く。
   ・写真（自動で小さくする）と成績表（PDF）を載せる。掲載期間が過ぎたら、お客様は見られなくなり、管理画面を開いたときに自動で消す
   ・アルバムの専用URL・QRを、代表者にLINEなどで送れる。その組のお連れ様のページにも、自動でボタンが出る
   ・いつものお客様画面（予約ページ）には、何も出さない */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var PDF_MAX = 5 * 1024 * 1024, PHOTO_MAX = 12;
  function url(aid) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'album.html?a=' + aid; }
  function fmtD(ms) { var d = new Date(ms); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function readFile(f) { return new Promise(function (ok, ng) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = ng; r.readAsDataURL(f); }); }
  function shrink(f) {   // 写真：長い辺を1600pxまでに縮め、JPEGにする
    return readFile(f).then(function (src) {
      return new Promise(function (ok, ng) {
        var im = new Image(); im.onload = function () {
          var s = Math.min(1, 1600 / Math.max(im.width, im.height)), w = Math.round(im.width * s), h = Math.round(im.height * s), cv = document.createElement('canvas');
          cv.width = w; cv.height = h; cv.getContext('2d').drawImage(im, 0, 0, w, h); ok({ d: cv.toDataURL('image/jpeg', 0.82), w: w, h: h });
        }; im.onerror = function () { ng(new Error('この写真は読み込めませんでした')); }; im.src = src;
      });
    });
  }
  function css() {
    if (document.getElementById('albcss')) return;
    var s = document.createElement('style'); s.id = 'albcss';
    s.textContent = '.albm{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px}' +
      '.albm .in{background:#fff;border-radius:14px;max-width:640px;width:100%;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.3)}.albm h2{margin:0 0 4px;font-size:18px}' +
      '.albm .ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin:8px 0}.albm .ph div{position:relative;border:1px solid var(--line,#ddd);border-radius:8px;overflow:hidden;aspect-ratio:1;background:#f6f6f6;display:grid;place-items:center;font-size:12px;color:#888}' +
      '.albm .ph img{width:100%;height:100%;object-fit:cover}.albm .ph button,.albm .pdf button{position:absolute;top:4px;right:4px;border:0;border-radius:6px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;padding:3px 7px;cursor:pointer}' +
      '.albm .pdf{position:relative;border:1px solid var(--line,#ddd);border-radius:8px;padding:10px 12px;margin:6px 0;background:#fbfaf6}.albm .qr{text-align:center}.albm .qr img{width:170px;height:170px;image-rendering:pixelated;border:1px solid #ddd}' +
      '.albm .prog{font-size:13px;color:#8a5a00;margin:6px 0}';
    document.head.appendChild(s);
  }

  // r：予約、ev：イベント、gids：その組のお連れ様の欄のID
  async function open(C, r, ev, gids, say) {
    css();
    var wrap = document.createElement('div'); wrap.className = 'albm'; document.body.appendChild(wrap);
    var close = function () { wrap.remove(); };
    wrap.onclick = function (e) { if (e.target === wrap) close(); };
    wrap.innerHTML = '<div class="in"><div class="loading sm" role="status"><span class="spin"></span>読み込み中…</div></div>';
    var aid = '', A = null;
    try { var s = await C.albums.where('rid', '==', r.id).limit(1).get(); if (s.docs.length) { aid = s.docs[0].id; A = s.docs[0].data(); } }
    catch (e) { wrap.querySelector('.in').innerHTML = '<p class="err">読み込めませんでした: ' + esc(e.code === 'permission-denied' ? 'Firestoreのルールに「albums」の設定がまだありません。最新のルールを公開してください' : e.message) + '</p><button class="s" id="ax">閉じる</button>'; wrap.querySelector('#ax').onclick = close; return; }
    if (!aid) aid = C.newId();
    var base = function (expMs) {
      return { eid: r.eventId, rid: r.id, ev: r.eventName || ev.name || '', host: r.name || '', date: r.date || '', start: r.start || '', end: r.end || '',
        gids: gids, expireAt: firebase.firestore.Timestamp.fromMillis(expMs) };
    };
    var expMs = A && A.expireAt ? A.expireAt.toMillis() : Date.now() + 30 * 864e5;
    async function link() {   // その組のお連れ様のページに、アルバムのボタンを出す
      for (var i = 0; i < gids.length; i++) { try { await C.guests.doc(gids[i]).update({ album: aid }); } catch (e) {} }
    }
    function draw(msg) {
      var files = (A && A.files) || [], ph = files.filter(function (f) { return f.kind === 'photo'; }), pdf = files.filter(function (f) { return f.kind === 'pdf'; });
      var exp = new Date(expMs), dv = exp.getFullYear() + '-' + ('0' + (exp.getMonth() + 1)).slice(-2) + '-' + ('0' + exp.getDate()).slice(-2), forever = exp.getFullYear() >= 2100;
      var h = '<div style="display:flex;justify-content:space-between;align-items:center"><h2>記念写真・成績表</h2><button class="s" id="ax">閉じる</button></div>' +
        '<p class="note" style="margin:0 0 10px">' + esc(r.name) + ' 様の組（' + esc(r.date || '') + '）。この組の方だけが見られます。いつものお客様画面には出ません。</p>' +
        (msg ? '<div class="prog">' + esc(msg) + '</div>' : '') +
        '<fieldset><legend>写真（' + ph.length + '/' + PHOTO_MAX + '枚）</legend><div class="ph">' + ph.map(function (f) { return '<div data-f="' + f.id + '">読み込み中<button type="button" data-del="' + f.id + '">削除</button></div>'; }).join('') + '</div>' +
        (ph.length < PHOTO_MAX ? '<label class="s" style="display:inline-block;cursor:pointer">＋ 写真を選ぶ<input type="file" id="aph" accept="image/*" multiple hidden></label>' : '') + '<p class="note">自動で小さくしてから保存します。</p></fieldset>' +
        '<fieldset><legend>成績表（PDF）</legend>' + pdf.map(function (f) { return '<div class="pdf">📄 ' + esc(f.name) + '（' + Math.round((f.size || 0) / 1024) + 'KB）<button type="button" data-del="' + f.id + '">削除</button></div>'; }).join('') +
        '<label class="s" style="display:inline-block;cursor:pointer">＋ PDFを選ぶ<input type="file" id="apd" accept="application/pdf" hidden></label><p class="note">1ファイル5MBまで。</p></fieldset>' +
        '<fieldset><legend>掲載期間（過ぎたら自動で見られなくなり、消えます）</legend><div class="row"><label>掲載する期間<select id="aex"><option value="">そのまま（' + (forever ? 'ずっと' : fmtD(expMs) + 'まで') + '）</option><option value="7">今日から7日</option><option value="14">今日から14日</option><option value="30">今日から30日</option><option value="90">今日から90日</option><option value="d">日付を指定</option><option value="f">ずっと（自動で消さない）</option></select></label>' +
        '<label id="adw" hidden>最終日<input type="date" id="adt" value="' + dv + '"></label></div><button type="button" class="s" id="aes">掲載期間を保存</button></fieldset>' +
        (files.length ? '<fieldset><legend>代表者・お連れ様に送る</legend><div class="tools" style="flex-wrap:wrap"><button type="button" class="s" data-sh="line">LINEで送る</button><button type="button" class="s" data-sh="mail">メールで送る</button><button type="button" class="s" data-sh="copy">URLをコピー</button></div>' +
          '<div class="qr" id="aqr"></div><p class="note" style="word-break:break-all">' + esc(url(aid)) + '</p><p class="note">お連れ様のページ（ご入力いただいたページ）にも、自動で「記念写真・成績表を見る」が出ます。</p></fieldset>' +
          '<button type="button" class="s d" id="adl">このアルバムを削除</button>' : '<p class="note">写真か成績表を載せると、送るためのURL・QRが出ます。</p>');
      wrap.querySelector('.in').innerHTML = h;
      var $ = function (id) { return wrap.querySelector('#' + id); };
      $('ax').onclick = close;
      $('aex').onchange = function () { $('adw').hidden = this.value !== 'd'; };
      if ($('aqr')) { try { $('aqr').innerHTML = '<img alt="QRコード" src="' + QR.dataURL(url(aid), 6) + '">'; } catch (e) {} }
      ph.forEach(function (f) { C.albumData(f).then(function (d) { var el = wrap.querySelector('[data-f="' + f.id + '"]'); if (!el) return; if (el.firstChild && el.firstChild.nodeType === 3) el.removeChild(el.firstChild); if (/^data:image\//.test(d)) el.insertAdjacentHTML('afterbegin', '<img alt="" src="' + d.replace(/"/g, '') + '">'); }); });
      var txt = '【記念写真・成績表】' + (r.eventName || ev.name || '') + '\n' + (r.name || '') + ' 様の組の記念写真・成績表です。\n' + url(aid) + '\n\nレクサス鹿児島東開';
      wrap.querySelectorAll('[data-sh]').forEach(function (b) {
        b.onclick = function () {
          var E = encodeURIComponent;
          if (b.dataset.sh === 'line') window.open('https://line.me/R/share?text=' + E(txt), '_blank');
          else if (b.dataset.sh === 'mail') location.href = 'mailto:?subject=' + E('【記念写真・成績表】' + (r.eventName || '')) + '&body=' + E(txt);
          else navigator.clipboard.writeText(url(aid)).then(function () { b.textContent = 'コピーしました'; }, function () { prompt('このURLをコピーしてください', url(aid)); });
        };
      });
      async function add(files, kind) {
        try {
          for (var i = 0; i < files.length; i++) {
            var f = files[i]; draw((i + 1) + ' / ' + files.length + ' 件目を保存しています…');
            if (kind === 'photo') { var x = await shrink(f); A = { files: await C.albumAdd(aid, base(expMs), { kind: 'photo', name: f.name, w: x.w, h: x.h, size: Math.round(x.d.length * .75) }, x.d) }; }
            else {
              if (f.size > PDF_MAX) { alert('「' + f.name + '」は5MBを超えています。小さくしてから選んでください。'); continue; }
              if (!/pdf$/i.test(f.type || f.name)) { alert('PDFファイルを選んでください'); continue; }
              var d = await readFile(f); A = { files: await C.albumAdd(aid, base(expMs), { kind: 'pdf', name: f.name, size: f.size }, d) };
            }
          }
          await link(); say('保存しました'); draw();
        } catch (e) { draw(); say('保存できませんでした: ' + (e.code === 'permission-denied' ? 'Firestoreのルールに「albums」の設定がまだありません' : e.message)); }
      }
      if ($('aph')) $('aph').onchange = function () { var fs = [].slice.call(this.files, 0, PHOTO_MAX - ph.length); if (fs.length) add(fs, 'photo'); };
      $('apd').onchange = function () { if (this.files[0]) add([this.files[0]], 'pdf'); };
      wrap.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = async function () { if (!confirm('このファイルを削除します。よろしいですか？')) return; try { A = { files: await C.albumRemoveFile(aid, b.dataset.del) }; draw(); } catch (e) { say('削除できませんでした: ' + e.message); } }; });
      $('aes').onclick = async function () {
        var v = $('aex').value; if (!v) return;
        var ms = v === 'f' ? Date.UTC(2100, 0, 1) : v === 'd' ? new Date($('adt').value + 'T23:59:59').getTime() : Date.now() + (+v) * 864e5;
        if (!(ms > Date.now())) { alert('今日より後の日付にしてください'); return; }
        expMs = ms; try { if (A && A.files) await C.albumSetExpire(aid, firebase.firestore.Timestamp.fromMillis(ms)); say('掲載期間を保存しました'); draw(); } catch (e) { say('保存できませんでした: ' + e.message); }
      };
      if ($('adl')) $('adl').onclick = async function () { if (!confirm('この組の写真・成績表をすべて削除します。よろしいですか？')) return; try { await C.albumDelete(aid); A = null; aid = C.newId(); say('削除しました'); draw(); } catch (e) { say('削除できませんでした: ' + e.message); } };
    }
    draw();
  }
  root.ALB = { open: open };
})(window);
