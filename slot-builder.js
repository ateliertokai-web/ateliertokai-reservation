/* 管理画面「イベント・枠」：枠をつくる（時間割ビルダー）と、つくった枠を直す（まとめて・ボタンで）。
   ・枠をつくる：日にち（カレンダーで複数）→ 時間帯（飛び飛びに、いくつでも／終日）→ 定員 → できあがる枠（確認・タップで外せる）
   ・つくった枠を直す：1枠ずつカード（上段：日時、下段：定員・1組の上限・予約）。チェックした枠は、まとめて変更・削除
   画面の部品だけを持つ。保存は admin.html（C.createSlots / C.slots）が行う */
(function (root) {
  'use strict';
  var WD = '日月火水木金土';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function t2m(t) { var a = String(t || '').split(':'); return +a[0] * 60 + +a[1]; }
  function m2t(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var LEN = [['one', 'まるごと1枠'], ['10', '10分ずつ'], ['15', '15分ずつ'], ['20', '20分ずつ'], ['30', '30分ずつ'], ['45', '45分ずつ'], ['60', '1時間ずつ'], ['90', '1時間30分ずつ'], ['120', '2時間ずつ'], ['180', '3時間ずつ'], ['c', '分数を指定…']];
  var PRE = {
    class: [{ s: '10:00', e: '12:00', cut: 'one' }, { s: '13:00', e: '17:00', cut: '120' }],
    golf: [{ s: '07:00', e: '09:00', cut: '10' }],
    fair: [{ s: '10:00', e: '12:00', cut: '60' }, { s: '13:00', e: '17:00', cut: '60' }]
  };
  var CSS = '.sb .cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}.sb .cal b{font-size:12px;color:var(--ink2,#6b665d);font-weight:600}' +
    '.sb .cal button{padding:8px 0;border:1px solid var(--line,#e2dccd);background:#fff;border-radius:8px;font:inherit;cursor:pointer;color:inherit}.sb .cal button.on{background:#111;color:#e8c872;border-color:#111}.sb .cal button.past{opacity:.35}' +
    '.sb .mh{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px}.sb .mh button{border:1px solid var(--line,#e2dccd);background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer}' +
    '.sb .chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.sb .chip{border:1px solid var(--line,#e2dccd);background:#fff;border-radius:999px;padding:5px 11px;font-size:13px;cursor:pointer;color:inherit;font:inherit;font-size:13px}.sb .chip.on{background:#111;color:#e8c872;border-color:#111}' +
    '.sb .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.sb .seg.two{grid-template-columns:1fr 1fr}.sb .seg label{margin:0;font-weight:400}.sb .seg input{position:absolute;opacity:0;pointer-events:none}' +
    '.sb .seg span{display:block;text-align:center;border:1px solid var(--line,#e2dccd);border-radius:10px;padding:9px 4px;background:#fff;cursor:pointer;font-size:13px;line-height:1.35}.sb .seg input:checked+span{background:#111;color:#e8c872;border-color:#111}.sb .seg span small{display:block;font-size:10.5px;white-space:nowrap;opacity:.85}' +
    '.sb .stp{display:flex;align-items:center;gap:4px}.sb .stp button{width:36px;height:36px;border:1px solid var(--line,#e2dccd);background:#fff;border-radius:9px;font-size:17px;cursor:pointer;color:inherit}.sb .stp input{width:60px;text-align:center}' +
    '.sb .blk{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto auto;gap:6px;align-items:center;padding:8px 0;border-bottom:1px dashed var(--line,#e2dccd)}.sb .blk .tm{display:flex;align-items:center;gap:4px;min-width:0}.sb .blk .tm input{flex:1;min-width:0}' +
    '.sb .blk .mn{display:flex;align-items:center;gap:4px;white-space:nowrap;font-size:13px}.sb .blk .mn input{width:64px;text-align:center}.sb .blk select{width:auto}.sb .blk .cnt{font-size:12px;color:#1f7a4d;background:#e9f5ee;border-radius:8px;padding:3px 7px;white-space:nowrap}.sb .blk .cnt.ng{color:#c0392b;background:#fdeceb}.sb .blk .del{border:0;background:none;color:#c0392b;font-size:20px;cursor:pointer;padding:0 4px}' +
    '@media(max-width:560px){.sb .blk{grid-template-columns:minmax(0,1fr) auto auto}.sb .blk .tm{grid-column:1/-1}.sb .blk .mn{grid-column:1/-1}}' +
    '.sb .ad{border:1px solid var(--line,#e2dccd);border-radius:11px;overflow:hidden;background:#fff}.sb .adr{display:grid;grid-template-columns:minmax(0,1fr) 28px;row-gap:4px;align-items:center;gap:8px;padding:8px 10px}.sb .adr+.adr{border-top:1px solid var(--line,#e2dccd)}' +
    '.sb .adr span{font-size:12px;font-weight:600;grid-column:1/-1;color:var(--ink2,#6b665d)}.sb .adr input{width:100%;min-width:0}.sb .adr .adc{border:0;background:none;color:var(--ink2,#6b665d);font-size:20px;line-height:1;padding:0;cursor:pointer}' +
    '.sb input[type=time]{min-width:0;max-width:100%}' +
    '.sb .tl{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.sb .sl{border:1px solid #bfe0cc;background:#e9f5ee;color:#1f7a4d;border-radius:9px;padding:5px 10px;font-size:13px;font-variant-numeric:tabular-nums;cursor:pointer}.sb .sl.x{border-color:#f2c9c5;background:#fdeceb;color:#c0392b;text-decoration:line-through}' +
    '.sb .sum{background:#fbf7ec;border:1px solid #eadfc2;border-radius:10px;padding:10px 12px;font-size:14px}.sb .stepn{display:flex;align-items:center;gap:8px;margin:14px 0 6px}.sb .stepn b.n{width:22px;height:22px;border-radius:50%;background:#111;color:#e8c872;display:grid;place-items:center;font-size:12px}' +
    '.sx .sc{border:1px solid var(--line,#e2dccd);border-radius:11px;padding:10px 12px;margin:0 0 8px;background:#fff}.sx .sc.on{border-color:#b8955a;background:#fffaf0}.sx .sc.dirty{box-shadow:inset 3px 0 0 #e0b84c}' +
    '.sx .top{display:flex;align-items:center;gap:8px;font-weight:700;margin:0}.sx .top input{width:20px;height:20px;margin:0}.sx .top .r{margin-left:auto}' +
    '.sx .bot{display:grid;grid-template-columns:auto auto 1fr;gap:8px;margin-top:8px;align-items:end}.sx .bot small{display:block;font-size:11px;color:var(--ink2,#6b665d);margin-bottom:2px}.sx .bot>div:last-child{text-align:right}' +
    '.sx .stp{display:flex;align-items:center;gap:4px}.sx .stp button{width:30px;height:30px;border:1px solid var(--line,#e2dccd);background:#fff;border-radius:8px;font-size:16px;cursor:pointer;color:inherit}.sx .stp input{width:42px;text-align:center;padding:5px 2px}' +
    '.sx .bk{font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap;padding-bottom:6px}.sx .pill{font-size:12px;border-radius:8px;padding:2px 8px;background:#fff1d6;color:#8a5a00}.sx .ul{font-size:12px;color:var(--ink2,#6b665d)}' +
    '.sx .bar{position:sticky;bottom:8px;z-index:5;background:#fff8e1;border:1px solid #e0b84c;border-radius:12px;padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;box-shadow:0 4px 14px rgba(0,0,0,.12)}';
  function css() { if (document.getElementById('sbcss')) return; var s = document.createElement('style'); s.id = 'sbcss'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------------- 枠をつくる ---------------- */
  function builderHTML() {
    return '<div class="sb">' +
      '<div class="stepn"><b class="n">2</b><b>日にち</b><span class="note" style="margin:0">（タップで複数選べます）</span></div>' +
      '<div class="mh"><button type="button" id="sbPm">‹</button><b id="sbMt"></b><button type="button" id="sbNm">›</button></div><div class="cal" id="sbCal"></div><div class="chips" id="sbDs"></div>' +
      '<div class="stepn"><b class="n">3</b><b>時間帯</b><span class="note" style="margin:0">（飛び飛びに、いくつでも）</span></div>' +
      '<div class="seg two"><label><input type="radio" name="sbKd" value="t" checked><span>時間を区切る</span></label><label><input type="radio" name="sbKd" value="a"><span>終日<small>キャンプ・ドライブ等</small></span></label></div>' +
      '<div id="sbAll" hidden style="margin-top:8px"><div class="ad"><div class="adr"><span>集合・開始（任意）</span><input type="time" id="sbMeet"><button type="button" class="adc" data-c="sbMeet" title="消す">×</button></div>' +
      '<div class="adr"><span>終了の目安（任意）</span><input type="time" id="sbUntil"><button type="button" class="adc" data-c="sbUntil" title="消す">×</button></div></div>' +
      '<p class="note">空欄なら「終日」とだけ表示、入れると「終日（集合 9:00）」のように、お客様画面に出ます（イベントの設定として保存されます）。</p></div>' +
      '<div id="sbTime" style="margin-top:8px"><div class="chips"><button type="button" class="chip" data-p="class">例：教室（午前1枠・午後2枠）</button><button type="button" class="chip" data-p="golf">例：ゴルフ（10分おき）</button><button type="button" class="chip" data-p="fair">例：フェア（1時間ずつ）</button></div>' +
      '<div id="sbBlocks"></div><button type="button" class="s" id="sbAdd" style="width:100%;margin-top:8px">＋ 時間帯を追加</button>' +
      '<p class="note">「できあがる枠」で、いらない枠をタップすると、その枠だけ外せます。</p></div>' +
      '<div class="stepn"><b class="n">4</b><b>定員</b></div>' +
      '<div class="seg"><label><input type="radio" name="sbMd" value="g" checked><span>組の数で<br>管理</span></label><label><input type="radio" name="sbMd" value="p"><span>人数で<br>管理</span></label><label><input type="radio" name="sbMd" value="n"><span>制限<br>なし</span></label></div>' +
      '<div class="row" style="margin-top:6px"><div id="sbCapW"><label id="sbCapL" style="margin-bottom:4px">1枠の定員（組）</label><div class="stp"><button type="button" data-t="sbCap" data-d="-1">−</button><input type="number" id="sbCap" value="25" min="0"><button type="button" data-t="sbCap" data-d="1">＋</button></div></div>' +
      '<div><label style="margin-bottom:4px">1組の上限人数</label><div class="stp"><button type="button" data-t="sbMx" data-d="-1">−</button><input type="number" id="sbMx" value="10" min="1"><button type="button" data-t="sbMx" data-d="1">＋</button></div></div></div>' +
      '<p class="note" id="sbCapH"></p>' +
      '<div class="stepn"><b class="n">5</b><b>できあがる枠（確認）</b></div><div class="sum" id="sbSum"></div><div id="sbPrev"></div></div>';
  }
  function builder(box) {
    css();
    var now = new Date(), y = now.getFullYear(), mo = now.getMonth(), days = {}, skip = {};
    var blocks = [{ s: '10:00', e: '12:00', cut: 'one' }, { s: '13:00', e: '17:00', cut: '60' }];
    var $ = function (id) { return box.querySelector('#' + id); };
    function allday() { return box.querySelector('[name=sbKd]:checked').value === 'a'; }
    function mode() { return box.querySelector('[name=sbMd]:checked').value; }
    function key(d) { return y + '-' + pad(mo + 1) + '-' + pad(d); }
    function today() { return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }
    function cal() {
      $('sbMt').textContent = y + '年' + (mo + 1) + '月';
      var h = WD.split('').map(function (w) { return '<b>' + w + '</b>'; }).join(''), f = new Date(y, mo, 1).getDay(), n = new Date(y, mo + 1, 0).getDate(), td = today();
      for (var i = 0; i < f; i++) h += '<span></span>';
      for (var d = 1; d <= n; d++) { var k = key(d); h += '<button type="button" data-d="' + k + '" class="' + (days[k] ? 'on' : '') + (k < td ? ' past' : '') + '">' + d + '</button>'; }
      $('sbCal').innerHTML = h;
      var a = Object.keys(days).sort();
      $('sbDs').innerHTML = a.length ? a.map(function (k) { var p = k.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]); return '<button type="button" class="chip on" data-rm="' + k + '">' + (+p[1]) + '/' + (+p[2]) + '（' + WD[dt.getDay()] + '） ×</button>'; }).join('') : '<span class="note" style="margin:0">日にちを選んでください</span>';
    }
    function lenOf(b) { return b.cut === 'c' ? (+b.min || 0) : (+b.cut || 60); }   // 1枠の長さ（分）。「分数を指定」は好きな分数
    function cnt(b) { var s = t2m(b.s), e = t2m(b.e); if (!b.s || !b.e || !(e > s)) return 0; if (b.cut === 'one') return 1; var L = lenOf(b); return L >= 1 ? Math.floor((e - s) / L) : 0; }
    function blk() {
      $('sbBlocks').innerHTML = blocks.map(function (b, i) {
        var n = cnt(b);
        return '<div class="blk"><div class="tm"><input type="time" data-i="' + i + '" data-k="s" value="' + b.s + '">〜<input type="time" data-i="' + i + '" data-k="e" value="' + b.e + '"></div>' +
          '<select data-i="' + i + '" data-k="cut">' + LEN.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === b.cut ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          (b.cut === 'c' ? '<span class="mn"><input type="number" data-i="' + i + '" data-k="min" min="1" max="720" value="' + (b.min || '') + '" placeholder="12" inputmode="numeric">分ずつ</span>' : '') +
          '<span class="cnt' + (n ? '' : ' ng') + '">' + (n ? n + '枠' : '時間を確認') + '</span>' + (blocks.length > 1 ? '<button type="button" class="del" data-x="' + i + '" title="この時間帯を削除">×</button>' : '<span></span>') + '</div>';
      }).join('');
    }
    function times() {
      if (allday()) return [{ a: '00:00', b: '24:00', k: 'all' }];
      var out = [], seen = {};
      blocks.forEach(function (b) {
        var s = t2m(b.s), e = t2m(b.e); if (!b.s || !b.e || !(e > s)) return;
        var push = function (a, z) { var k = m2t(a) + '-' + m2t(z); if (!seen[k]) { seen[k] = 1; out.push({ a: m2t(a), b: m2t(z), k: k }); } };
        if (b.cut === 'one') push(s, e); else { var L = lenOf(b); if (!(L >= 1)) return; for (var c = s; c + L <= e; c += L) push(c, c + L); }
      });
      return out.sort(function (p, q) { return p.a < q.a ? -1 : p.a > q.a ? 1 : 0; });
    }
    function label(t) {
      if (t.k !== 'all') return t.a + '〜' + t.b;
      var a = $('sbMeet').value, e = $('sbUntil').value;
      return '終日' + (a || e ? '（' + (a ? '集合 ' + a : '') + (a && e ? '・' : '') + (e ? e + ' 終了予定' : '') + '）' : '');
    }
    function draw() {
      var T = times(), ok = T.filter(function (t) { return !skip[t.k]; }), n = Object.keys(days).length, md = mode(), cap = +$('sbCap').value || 0, mx = +$('sbMx').value || 0;
      $('sbPrev').innerHTML = '<div class="tl">' + T.map(function (t) { return '<span class="sl' + (skip[t.k] ? ' x' : '') + '" data-k="' + t.k + '">' + esc(label(t)) + (skip[t.k] ? '（外す）' : '') + '</span>'; }).join('') + '</div>';
      var per = md === 'g' ? (cap ? cap + '組' : '制限なし') : md === 'p' ? (cap ? cap + '名' : '制限なし') : '制限なし';
      $('sbSum').innerHTML = '<b>' + ok.length + ' 枠 × ' + n + ' 日 ＝ 全 ' + (ok.length * n) + ' 枠</b>　（1枠の定員：' + per + '、1組の上限：' + mx + '名）' +
        (md === 'g' && cap > 0 && ok.length ? '<br>1日あたりの最大人数：約 ' + (ok.length * cap * mx) + ' 名' : '') + (n ? '' : '<br><span style="color:#c0392b">日にちを選んでください</span>') + (T.length ? '' : '<br><span style="color:#c0392b">時間帯を確認してください</span>');
      $('sbCapL').textContent = md === 'g' ? '1枠の定員（組）' : md === 'p' ? '1枠の定員（人数）' : '1枠の定員';
      $('sbCapW').style.opacity = md === 'n' ? .35 : 1; $('sbCap').disabled = md === 'n';
      $('sbCapH').textContent = md === 'g' ? '組の数で数えます。1組は、上限人数まで入れます（0なら制限なし）。' : md === 'p' ? '合計人数で数えます。1組の人数は、上限人数までです（0なら制限なし）。' : '人数も組の数も制限しません。1組の上限人数だけ守ります。';
    }
    box.innerHTML = builderHTML();
    $('sbPm').onclick = function () { mo--; if (mo < 0) { mo = 11; y--; } cal(); };
    $('sbNm').onclick = function () { mo++; if (mo > 11) { mo = 0; y++; } cal(); };
    box.addEventListener('click', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.d && t.closest('#sbCal')) { var k = t.dataset.d; if (days[k]) delete days[k]; else days[k] = 1; cal(); draw(); }
      else if (t.dataset && t.dataset.rm) { delete days[t.dataset.rm]; cal(); draw(); }
      else if (t.dataset && t.dataset.p && PRE[t.dataset.p]) { blocks = JSON.parse(JSON.stringify(PRE[t.dataset.p])); skip = {}; blk(); draw(); }
      else if (t.dataset && t.dataset.x != null && t.classList.contains('del')) { blocks.splice(+t.dataset.x, 1); skip = {}; blk(); draw(); }
      else if (t.id === 'sbAdd') { var l = blocks[blocks.length - 1], s = l && l.e ? l.e : '10:00'; blocks.push({ s: s, e: m2t(Math.min(t2m(s) + 120, 1439)), cut: 'one' }); blk(); draw(); }
      else if (t.classList && t.classList.contains('sl')) { var kk = t.dataset.k; if (skip[kk]) delete skip[kk]; else skip[kk] = 1; draw(); }
      else if (t.dataset && t.dataset.t) { var i = $(t.dataset.t); i.value = Math.max(t.dataset.t === 'sbMx' ? 1 : 0, (+i.value || 0) + +t.dataset.d); draw(); }
      else if (t.classList && t.classList.contains('adc')) { $(t.dataset.c).value = ''; draw(); }
    });
    box.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.i != null) {
        var b = blocks[+t.dataset.i]; b[t.dataset.k] = t.value; skip = {};
        if (t.dataset.k === 'cut' && (t.value === 'c') !== !!t.closest('.blk').querySelector('.mn')) { if (t.value === 'c' && !b.min) b.min = ''; blk(); var mi = box.querySelector('.blk:nth-child(' + (+t.dataset.i + 1) + ') .mn input'); if (mi) mi.focus(); draw(); return; }
        var row = t.closest('.blk'), c = row.querySelector('.cnt'), n = cnt(b); c.textContent = n ? n + '枠' : '時間を確認'; c.className = 'cnt' + (n ? '' : ' ng');
      }
      draw();
    });
    box.addEventListener('change', function (e) {
      if (e.target.name === 'sbKd') { $('sbAll').hidden = !allday(); $('sbTime').hidden = allday(); skip = {}; }
      draw();
    });
    blk(); cal(); draw();
    return {
      // 保存に使う値。エラーがあれば err に文を入れる
      read: function () {
        var T = times().filter(function (t) { return !skip[t.k]; }), md = mode(), cap = +$('sbCap').value || 0, mx = +$('sbMx').value || 0, dates = Object.keys(days).sort();
        var err = '';
        if (!dates.length) err = '日にちを選んでください';
        else if (!allday()) { for (var i = 0; i < blocks.length; i++) if (!cnt(blocks[i])) { err = '時間帯' + (i + 1) + 'の、開始・終了・区切り方を確認してください（終了は開始より後に。区切る長さより短い時間帯は作れません）'; break; } }
        if (!err && !T.length) err = '作る枠がありません（すべて外しています）';
        if (!err && !(mx >= 1)) err = '1組の上限人数は1以上にしてください';
        return {
          err: err, dates: dates, allday: allday(), meet: allday() ? $('sbMeet').value : '', until: allday() ? $('sbUntil').value : '',
          o: { allday: allday(), times: T.map(function (t) { return [t.a, t.b]; }), capG: md === 'g' ? cap : 0, capP: md === 'p' ? cap : 0, maxPer: mx }
        };
      }
    };
  }

  /* ---------------- つくった枠を直す ---------------- */
  // 定員の数え方：組（capG>0）／人数（capP>0）／制限なし（両方0）。カードの「定員」は、その数え方の数を増減する（0にすると制限なし）
  function editor(box, slots, opt) {
    css();
    var sel = {}, ch = {}, list = slots.map(function (s) { return Object.assign({}, s); });
    var md = function (s) { return s.capG > 0 ? 'g' : s.capP > 0 ? 'p' : 'n'; };
    var cur = function (s) { return Object.assign({}, s, ch[s.id] || {}); };
    function capOf(s) { var m = md(s); return m === 'p' ? s.capP : s.capG; }
    function setCap(s, v) { var o = ch[s.id] || {}, m = md(slots.filter(function (x) { return x.id === s.id; })[0]); v = Math.max(0, v); if (m === 'p') o.capP = v; else o.capG = v; ch[s.id] = o; clean(s.id); }
    function clean(id) { var o = ch[id], b = slots.filter(function (x) { return x.id === id; })[0]; if (!o) return; Object.keys(o).forEach(function (k) { if (o[k] === b[k]) delete o[k]; }); if (!Object.keys(o).length) delete ch[id]; }
    function draw() {
      var h = list.map(function (s0) {
        var s = cur(s0), m = md(s0), c = capOf(s), full = (s.capG && (s.booked || 0) >= s.capG) || (s.capP && (s.people || 0) >= s.capP);
        return '<div class="sc' + (sel[s.id] ? ' on' : '') + (ch[s.id] ? ' dirty' : '') + '" data-s="' + s.id + '"><label class="top"><input type="checkbox" data-c="' + s.id + '"' + (sel[s.id] ? ' checked' : '') + '>' + esc(opt.label(s)) + (full ? '<span class="pill r">満席</span>' : '') + '</label>' +
          '<div class="bot"><div><small>' + (m === 'p' ? '定員（人数）' : '定員（組）') + '</small><div class="stp"><button type="button" data-r="' + s.id + '" data-f="cap" data-d="-1">−</button><input type="number" data-r="' + s.id + '" data-f="capv" value="' + c + '" min="0"><button type="button" data-r="' + s.id + '" data-f="cap" data-d="1">＋</button></div>' + (c ? '' : '<span class="ul">制限なし</span>') + '</div>' +
          '<div><small>1組の上限</small><div class="stp"><button type="button" data-r="' + s.id + '" data-f="mx" data-d="-1">−</button><input type="number" data-r="' + s.id + '" data-f="mxv" value="' + s.maxPer + '" min="1"><button type="button" data-r="' + s.id + '" data-f="mx" data-d="1">＋</button></div></div>' +
          '<div><small>予約</small><div class="bk">' + (s.booked || 0) + '組・' + (s.people || 0) + '名</div></div></div></div>';
      }).join('') || '<p class="note">枠はありません。</p>';
      var nsel = Object.keys(sel).length, nch = Object.keys(ch).length;
      h += (nsel ? '<div class="bar"><b>' + nsel + ' 枠を選択中</b><span>定員を</span><button type="button" class="s" data-bd="-1">−1</button><button type="button" class="s" data-bd="1">＋1</button><button type="button" class="s" data-bd="5">＋5</button>' +
        '<button type="button" class="s" data-ba="set">指定の数にそろえる</button><button type="button" class="s" data-ba="mx">1組の上限をそろえる</button><button type="button" class="s d" data-ba="del">選んだ枠を削除</button><button type="button" class="s" data-ba="none">選択をやめる</button></div>' : '') +
        (nch ? '<div class="bar"><b>保存していない変更：' + nch + ' 枠</b><button type="button" class="p" data-ba="save" style="max-width:180px">変更を保存</button><button type="button" class="s" data-ba="undo">元に戻す</button></div>' : '');
      box.innerHTML = '<div class="sx"><div class="tools" style="margin:0 0 8px"><button type="button" class="s" data-ba="all">すべて選ぶ</button></div>' + h + '</div>';
    }
    box.onclick = async function (e) {
      var t = e.target.closest('button,input[type=checkbox]'); if (!t || !box.contains(t)) return;
      if (t.dataset.c) { if (t.checked) sel[t.dataset.c] = 1; else delete sel[t.dataset.c]; return draw(); }
      if (t.dataset.r && t.tagName === 'BUTTON') {
        var s = cur(list.filter(function (x) { return x.id === t.dataset.r; })[0]);
        if (t.dataset.f === 'cap') setCap(s, capOf(s) + +t.dataset.d);
        else { var o = ch[s.id] || {}; o.maxPer = Math.max(1, s.maxPer + +t.dataset.d); ch[s.id] = o; clean(s.id); }
        return draw();
      }
      if (t.dataset.bd) { Object.keys(sel).forEach(function (id) { var s = cur(list.filter(function (x) { return x.id === id; })[0]); setCap(s, capOf(s) + +t.dataset.bd); }); return draw(); }
      var a = t.dataset.ba; if (!a) return;
      if (a === 'all') { list.forEach(function (s) { sel[s.id] = 1; }); return draw(); }
      if (a === 'none') { sel = {}; return draw(); }
      if (a === 'undo') { ch = {}; return draw(); }
      if (a === 'set' || a === 'mx') {
        var v = prompt(a === 'set' ? '定員を、いくつにそろえますか？（0で制限なし）' : '1組の上限人数を、何名にそろえますか？'); if (v === null) return; v = +v;
        if (!(v >= (a === 'mx' ? 1 : 0))) { alert('数を正しく入力してください'); return; }
        Object.keys(sel).forEach(function (id) { var s = cur(list.filter(function (x) { return x.id === id; })[0]); if (a === 'set') setCap(s, v); else { var o = ch[id] || {}; o.maxPer = v; ch[id] = o; clean(id); } });
        return draw();
      }
      if (a === 'save') {
        t.disabled = true;
        try { await opt.save(ch); Object.keys(ch).forEach(function (id) { var b = slots.filter(function (x) { return x.id === id; })[0]; Object.assign(b, ch[id]); list.forEach(function (x) { if (x.id === id) Object.assign(x, ch[id]); }); }); ch = {}; draw(); }
        catch (x) { t.disabled = false; }
        return;
      }
      if (a === 'del') {
        var ids = Object.keys(sel); t.disabled = true;
        try { var gone = await opt.remove(ids); if (gone && gone.length) { list = list.filter(function (x) { return gone.indexOf(x.id) < 0; }); slots = slots.filter(function (x) { return gone.indexOf(x.id) < 0; }); gone.forEach(function (id) { delete sel[id]; delete ch[id]; }); } draw(); }
        catch (x) { t.disabled = false; }
      }
    };
    box.onchange = function (e) {
      var t = e.target; if (!t.dataset || !t.dataset.r || t.tagName !== 'INPUT' || t.type !== 'number') return;
      var s = cur(list.filter(function (x) { return x.id === t.dataset.r; })[0]);
      if (t.dataset.f === 'capv') setCap(s, +t.value || 0);
      else { var o = ch[s.id] || {}; o.maxPer = Math.max(1, +t.value || 1); ch[s.id] = o; clean(s.id); }
      draw();
    };
    draw();
    return { dirty: function () { return Object.keys(ch).length > 0; } };
  }

  root.SB = { builder: builder, editor: editor, css: css };
})(window);
