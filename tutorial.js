/* お客様画面：ホーム画面に追加する方法の、チュートリアル（初めて開いたとき）。
   ・スマホ（iPhone・iPad・Android）で、まだホーム画面から開いていない方にだけ、1回だけ出す（「閉じる」「完了」で、その端末では、二度と自動では出ない）
   ・トップ画面の下の「ホーム画面に追加する方法」から、いつでも、もう一度見られる。URLに tut=1 を付けると、いつでも出る（確認用）
   ・文言は、T('…') なので、管理画面の「お客様画面の文言」で書き換えられる */
(function (root) {
  'use strict';
  var KEY = 'rv_tut_v1', ua = navigator.userAgent || '', deferred = null;
  var IOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), AND = /Android/.test(ua);
  var SAFARI = IOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Line\/|FBAN|FBAV|Instagram|MicroMessenger|GSA\//.test(ua);
  var VER = +((/Version\/(\d+)/.exec(ua) || [])[1] || 0), NEWIOS = IOS && VER >= 26;   // iOS 26 以降のSafariは、「共有」が、画面下のURLの左のマークの中に入っている
  var INAPP = /Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/.test(ua);
  var IPAD = /iPad/.test(ua) || (IOS && navigator.maxTouchPoints > 1 && !/iPhone/.test(ua));
  root.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  function standalone() { try { return root.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function done() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }
  function can() { return (IOS || AND) && !standalone(); }

  // ---- 説明の絵（簡単な図） ----
  var GOLD = '#b8955a', INK = '#111';
  function svg(inner) { return '<svg viewBox="0 0 260 150" width="100%" height="150" role="img" aria-hidden="true" focusable="false">' + inner + '</svg>'; }
  function ring(x, y, r) { return '<circle class="tr" cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + GOLD + '" stroke-width="3"/><circle cx="' + x + '" cy="' + y + '" r="' + (r - 7) + '" fill="rgba(184,149,90,.18)"/>'; }
  var shareIco = function (x, y) { return '<g transform="translate(' + x + ',' + y + ')" fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M-8 -2v10h16v-10"/><path d="M0 8v-20M-5 -7l5 -5 5 5"/></g>'; };
  var ART = {
    intro: svg('<rect x="88" y="6" width="84" height="138" rx="14" fill="#fff" stroke="' + INK + '" stroke-width="3"/><rect x="100" y="22" width="22" height="22" rx="6" fill="' + INK + '"/><rect x="130" y="22" width="22" height="22" rx="6" fill="#d9d4c7"/><rect x="100" y="54" width="22" height="22" rx="6" fill="#d9d4c7"/><rect x="130" y="54" width="22" height="22" rx="6" fill="#d9d4c7"/><text x="111" y="39" font-size="11" fill="' + GOLD + '" text-anchor="middle" font-weight="700">AT</text><rect x="100" y="100" width="52" height="30" rx="8" fill="rgba(0,0,0,.06)"/>' + ring(111, 33, 22)),
    share: svg('<rect x="20" y="10" width="220" height="130" rx="12" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><rect x="20" y="104" width="220" height="36" rx="0" fill="#f3f1ec"/><rect x="20" y="104" width="220" height="1.5" fill="#d9d4c7"/><path d="M48 124l-6 6 6 6M80 124l6 6-6 6" fill="none" stroke="#9b958a" stroke-width="2.2" stroke-linecap="round"/>' + shareIco(130, 122) + '<rect x="170" y="116" width="16" height="16" rx="3" fill="none" stroke="#9b958a" stroke-width="2"/><rect x="204" y="116" width="16" height="16" rx="3" fill="none" stroke="#9b958a" stroke-width="2"/>' + ring(130, 122, 20) + '<text x="130" y="60" font-size="12" fill="#9b958a" text-anchor="middle">この画面の下にあります</text>'),
    shareTop: svg('<rect x="20" y="10" width="220" height="130" rx="12" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><rect x="20" y="10" width="220" height="34" rx="12" fill="#f3f1ec"/><rect x="62" y="19" width="110" height="16" rx="8" fill="#fff" stroke="#d9d4c7"/>' + shareIco(208, 27) + ring(208, 27, 19) + '<text x="130" y="95" font-size="12" fill="#9b958a" text-anchor="middle">この画面の右上にあります</text>'),
    menu: svg('<rect x="40" y="8" width="180" height="136" rx="14" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><rect x="52" y="20" width="156" height="22" rx="6" fill="#f3f1ec"/><rect x="52" y="48" width="156" height="22" rx="6" fill="#f3f1ec"/><rect x="52" y="82" width="156" height="30" rx="8" fill="rgba(184,149,90,.22)" stroke="' + GOLD + '" stroke-width="2.5" class="tr"/><text x="62" y="102" font-size="12" font-weight="700" fill="' + INK + '">ホーム画面に追加</text><path d="M190 97v8M186 101h8" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/><rect x="52" y="118" width="156" height="18" rx="6" fill="#f3f1ec"/>'),
    add: svg('<rect x="30" y="8" width="200" height="134" rx="14" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><text x="136" y="30" font-size="9.5" text-anchor="middle" fill="' + INK + '" font-weight="700">ホーム画面に追加</text><text x="42" y="31" font-size="8.5" fill="#9b958a">キャンセル</text><text x="214" y="31" font-size="12" text-anchor="end" fill="' + GOLD + '" font-weight="700">追加</text>' + ring(204, 27, 20) + '<rect x="46" y="54" width="38" height="38" rx="9" fill="' + INK + '"/><text x="65" y="78" font-size="13" fill="' + GOLD + '" text-anchor="middle" font-weight="700">AT</text><rect x="96" y="58" width="110" height="10" rx="3" fill="#d9d4c7"/><rect x="96" y="76" width="80" height="8" rx="3" fill="#ebe7dd"/>'),
    dots: svg('<rect x="20" y="10" width="220" height="130" rx="12" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><rect x="20" y="10" width="220" height="34" rx="12" fill="#f3f1ec"/><rect x="34" y="19" width="140" height="16" rx="8" fill="#fff" stroke="#d9d4c7"/><g fill="' + INK + '"><circle cx="216" cy="19" r="2.6"/><circle cx="216" cy="27" r="2.6"/><circle cx="216" cy="35" r="2.6"/></g>' + ring(216, 27, 19) + '<text x="120" y="95" font-size="12" fill="#9b958a" text-anchor="middle">この画面の右上にあります</text>'),
    install: svg('<rect x="40" y="8" width="180" height="134" rx="14" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><rect x="52" y="20" width="156" height="20" rx="6" fill="#f3f1ec"/><rect x="52" y="46" width="156" height="30" rx="8" fill="rgba(184,149,90,.22)" stroke="' + GOLD + '" stroke-width="2.5" class="tr"/><text x="62" y="66" font-size="12" font-weight="700" fill="' + INK + '">ホーム画面に追加</text><rect x="52" y="84" width="156" height="20" rx="6" fill="#f3f1ec"/><rect x="52" y="110" width="156" height="20" rx="6" fill="#f3f1ec"/>'),
    fin: svg('<rect x="88" y="6" width="84" height="138" rx="14" fill="#fff" stroke="' + INK + '" stroke-width="3"/><rect x="100" y="22" width="22" height="22" rx="6" fill="' + INK + '"/><text x="111" y="39" font-size="11" fill="' + GOLD + '" text-anchor="middle" font-weight="700">AT</text><rect x="130" y="22" width="22" height="22" rx="6" fill="#d9d4c7"/><rect x="100" y="54" width="22" height="22" rx="6" fill="#d9d4c7"/><path d="M122 100l7 7 14-16" fill="none" stroke="#2e8b57" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' + ring(111, 33, 22)),
    pageMenu: svg('<rect x="20" y="8" width="220" height="134" rx="12" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><text x="130" y="60" font-size="12" fill="#9b958a" text-anchor="middle">この画面の下にあります</text><rect x="30" y="98" width="200" height="34" rx="17" fill="#f3f1ec"/><circle cx="52" cy="115" r="12" fill="#fff" stroke="#d9d4c7"/><path d="M48 111l-4 4 4 4" fill="none" stroke="#9b958a" stroke-width="2" stroke-linecap="round"/><rect x="72" y="104" width="100" height="22" rx="11" fill="#fff" stroke="#d9d4c7"/><g stroke="' + INK + '" stroke-width="2" stroke-linecap="round"><path d="M82 111h14M82 119h8"/></g>' + ring(88, 115, 18) + '<text x="138" y="119" font-size="9" fill="#9b958a" text-anchor="middle">URL</text><circle cx="205" cy="115" r="12" fill="#fff" stroke="#d9d4c7"/>'),
    menuShare: svg('<rect x="40" y="6" width="180" height="138" rx="14" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><rect x="52" y="16" width="156" height="20" rx="6" fill="#f3f1ec"/><rect x="52" y="42" width="156" height="20" rx="6" fill="#f3f1ec"/><rect x="52" y="70" width="156" height="30" rx="8" fill="rgba(184,149,90,.22)" stroke="' + GOLD + '" stroke-width="2.5" class="tr"/><text x="62" y="90" font-size="12" font-weight="700" fill="' + INK + '">共有</text>' + shareIco(192, 85) + '<rect x="52" y="108" width="156" height="28" rx="6" fill="#f3f1ec"/>'),
    more: svg('<rect x="40" y="6" width="180" height="138" rx="14" fill="#fff" stroke="#c9c4b8" stroke-width="2"/><rect x="52" y="16" width="156" height="30" rx="8" fill="#f3f1ec"/><circle cx="70" cy="62" r="9" fill="#d9d4c7"/><circle cx="104" cy="62" r="9" fill="#d9d4c7"/><circle cx="138" cy="62" r="9" fill="#d9d4c7"/><circle cx="172" cy="62" r="9" fill="#d9d4c7"/><rect x="52" y="82" width="156" height="30" rx="8" fill="rgba(184,149,90,.22)" stroke="' + GOLD + '" stroke-width="2.5" class="tr"/><text x="62" y="102" font-size="12" font-weight="700" fill="' + INK + '">表示を増やす</text><path d="M190 90l6 7-6 7" fill="none" stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="52" y="118" width="156" height="18" rx="6" fill="#f3f1ec"/>'),
    safari: svg('<circle cx="130" cy="75" r="46" fill="#fff" stroke="' + INK + '" stroke-width="3"/><path d="M130 75l-14 26 10-30 30-12z" fill="' + GOLD + '"/><circle cx="130" cy="75" r="4" fill="' + INK + '"/>')
  };

  function steps(T) {
    var intro = { art: ART.intro, t: T('ホーム画面に追加すると、アプリのように使えます'), b: '<ul class="tl"><li>' + T('ホーム画面のアイコンから、すぐに、予約を開けます') + '</li><li>' + T('キャンセル待ちの繰り上げなどの「お知らせ」が、届きます') + '</li><li>' + T('予約の確認・変更が、かんたんになります') + '</li></ul><p class="tn">' + T('1分ほどで、終わります。順番に、ご案内します。') + '</p>' };
    var fin = { art: ART.fin, t: T('できました！'), b: '<p>' + T('ホーム画面に、アイコンができました。次からは、そのアイコンから開いてください。') + '</p><p class="tn">' + T('アイコンから開くと、通知の受け取りの設定も、できます。') + '</p>' };
    if (IOS && !SAFARI) return [intro, { art: ART.safari, t: T('Safariで開いてください'), b: '<p>' + T('いま開いているアプリ（ブラウザ）では、ホーム画面に追加できないことがあります。下のボタンでURLをコピーして、「Safari」を開き、貼り付けて開いてください。') + '</p><button type="button" class="tb s" data-cp="1">' + T('URLをコピー') + '</button>' }, fin];
    if (NEWIOS && !IPAD) return [intro,
      { art: ART.pageMenu, t: T('①「URLの左のマーク」をタップ'), b: '<p>' + T('画面の下の真ん中にある、URL（アドレス）の、左側のマークを、タップします。') + '</p>' },
      { art: ART.menuShare, t: T('②「共有」をタップ'), b: '<p>' + T('出てきたメニューの中の「共有」を、タップします。') + '</p>' },
      { art: ART.more, t: T('③「表示を増やす」をタップ'), b: '<p>' + T('「表示を増やす」を、タップします。（上にスクロールすると、メニューが、広がります）') + '</p>' },
      { art: ART.menu, t: T('④「ホーム画面に追加」をタップ'), b: '<p>' + T('広がったメニューの中から、「ホーム画面に追加」を、探して、タップします。') + '</p>' },
      { art: ART.add, t: T('⑤ 右上の「追加」をタップ'), b: '<p>' + T('名前は、そのままで大丈夫です。右上の「追加」を、タップします。') + '</p><p class="tn">' + T('画面の下に、四角から上向きの矢印の「共有」ボタンがあるときは、それをタップしても、同じです。') + '</p>' }, fin];
    if (IOS) return [intro,
      { art: IPAD ? ART.shareTop : ART.share, t: T('①「共有」ボタンをタップ'), b: '<p>' + (IPAD ? T('Safariの画面の右上にある、四角から上向きの矢印が出ているボタンを、タップします。') : T('Safariの画面の下にある、四角から上向きの矢印が出ているボタンを、タップします。')) + '</p>' + (IPAD ? '' : '<p class="tn">' + T('見つからないときは、画面の下の真ん中にある、URLの左側のマークをタップすると、その中に「共有」があります。') + '</p>') },
      { art: ART.menu, t: T('②「ホーム画面に追加」をタップ'), b: '<p>' + T('出てきたメニューを、指で、上にスクロールして、「ホーム画面に追加」を探して、タップします。') + '</p>' },
      { art: ART.add, t: T('③ 右上の「追加」をタップ'), b: '<p>' + T('名前は、そのままで大丈夫です。右上の「追加」を、タップします。') + '</p>' }, fin];
    if (AND && INAPP) return [intro, { art: ART.safari, t: T('Chromeで開いてください'), b: '<p>' + T('いま開いているアプリ（ブラウザ）では、ホーム画面に追加できないことがあります。下のボタンでURLをコピーして、「Chrome」を開き、貼り付けて開いてください。') + '</p><button type="button" class="tb s" data-cp="1">' + T('URLをコピー') + '</button>' }, fin];
    return [intro,
      { art: ART.dots, t: T('①「︙」メニューをタップ'), b: '<p>' + T('画面の右上にある、縦に3つ並んだ点（︙）を、タップします。') + '</p>' + (deferred ? '<button type="button" class="tb p" data-inst="1">' + T('かんたん追加（ここを押す）') + '</button>' : '') },
      { art: ART.install, t: T('②「ホーム画面に追加」をタップ'), b: '<p>' + T('メニューの中の「ホーム画面に追加」（または「アプリをインストール」）を、タップします。') + '</p>' },
      { art: ART.add, t: T('③「追加」（または「インストール」）をタップ'), b: '<p>' + T('確認の画面が出たら、「追加」（または「インストール」）を、タップします。') + '</p>' }, fin];
  }

  function css() {
    if (document.getElementById('tutcss')) return;
    var s = document.createElement('style'); s.id = 'tutcss';
    s.textContent = '.tut{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center;padding:0 0 env(safe-area-inset-bottom)}' +
      '.tut .tc{background:#fff;color:#1c1b19;width:100%;max-width:460px;border-radius:20px 20px 0 0;padding:16px 18px 18px;max-height:92vh;overflow:auto;box-shadow:0 -8px 30px rgba(0,0,0,.3);animation:tutup .25s ease-out}' +
      '@media(min-width:520px){.tut{align-items:center}.tut .tc{border-radius:20px}}' +
      '@keyframes tutup{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}' +
      '.tut .tx{float:right;border:0;background:none;font-size:13px;color:#6b665d;padding:6px 0 6px 10px;cursor:pointer}' +
      '.tut .ta{background:#f7f4ec;border-radius:14px;margin:6px 0 10px;padding:6px 10px;clear:both}.tut h2{font-size:18px;margin:4px 0 6px;line-height:1.5}.tut p{margin:6px 0;line-height:1.75;font-size:15px}.tut .tn{color:#6b665d;font-size:13px}' +
      '.tut .tl{margin:6px 0;padding-left:1.3em;line-height:1.8;font-size:15px}.tut .tdots{display:flex;gap:7px;justify-content:center;margin:12px 0 10px}.tut .tdots i{width:8px;height:8px;border-radius:50%;background:#d9d4c7}.tut .tdots i.on{background:#b8955a;width:20px;border-radius:5px}' +
      '.tut .tbar{display:flex;gap:10px}.tut .tbar button,.tut .tb{flex:1;padding:13px;border-radius:12px;font:inherit;font-weight:700;border:1px solid #c9c4b8;background:#fff;color:#1c1b19;cursor:pointer}.tut .tbar .nx,.tut .tb.p{background:#111;color:#e8c872;border-color:#111;flex:2}.tut .tb{margin-top:6px;width:100%}' +
      '.tut .tr{animation:tutp 1.4s ease-in-out infinite;transform-origin:center;transform-box:fill-box}@keyframes tutp{0%,100%{opacity:1}50%{opacity:.35}}@media(prefers-reduced-motion:reduce){.tut .tc,.tut .tr{animation:none}}';
    document.head.appendChild(s);
  }

  function show(T, force) {
    if (document.getElementById('tut')) return;
    css();
    var st = steps(T), i = 0, ov = document.createElement('div'), last = document.activeElement;
    ov.id = 'tut'; ov.className = 'tut'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', T('ホーム画面に追加する方法'));
    function close() { mark(); ov.remove(); try { last && last.focus && last.focus(); } catch (e) {} }
    function draw() {
      var s = st[i], last2 = i === st.length - 1;
      ov.innerHTML = '<div class="tc"><button type="button" class="tx" data-x="1">' + (last2 ? T('閉じる') : T('あとで見る')) + '</button><div class="ta">' + s.art + '</div><h2>' + s.t + '</h2>' + s.b +
        '<div class="tdots" aria-label="' + (i + 1) + '/' + st.length + '">' + st.map(function (_, k) { return '<i' + (k === i ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' +
        '<div class="tbar">' + (i ? '<button type="button" data-b="1">' + T('戻る') + '</button>' : '') + '<button type="button" class="nx" data-n="1">' + (last2 ? T('完了') : T('次へ')) + '</button></div></div>';
      ov.querySelector('[data-x]').onclick = close;
      ov.querySelector('[data-n]').onclick = function () { if (last2) close(); else { i++; draw(); } };
      var b = ov.querySelector('[data-b]'); if (b) b.onclick = function () { i--; draw(); };
      var cp = ov.querySelector('[data-cp]'); if (cp) cp.onclick = function () { var u = location.href.split('#')[0].replace(/[?&]tut=1/, ''), t = cp; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { t.textContent = T('コピーしました'); }, function () { prompt(T('このURLをコピーしてください'), u); }); };
      var ib = ov.querySelector('[data-inst]'); if (ib) ib.onclick = function () { deferred.prompt(); deferred.userChoice && deferred.userChoice.then(function (r) { if (r && r.outcome === 'accepted') { i = st.length - 1; draw(); } }); };
      var nx = ov.querySelector('[data-n]'); try { nx.focus(); } catch (e) {}
    }
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(ov); draw();
  }

  // 初めて開いたとき：条件がそろえば出す。トップ画面の下の「ホーム画面に追加する方法」からも、開ける
  function init(T, o) {
    o = o || {};
    var force = /[?&]tut=1(&|$)/.test(location.search);
    if (o.link && (can() || force)) { o.link.hidden = false; o.link.onclick = function (e) { e.preventDefault(); show(T, true); }; }
    if (o.skip && !force) return;
    if (force || (can() && !done())) setTimeout(function () { show(T, force); }, 900);
  }
  root.TUT = { init: init, show: show, can: can };
})(window);
