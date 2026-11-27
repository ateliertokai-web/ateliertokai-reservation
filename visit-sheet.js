/* 管理画面：イベント来店表（Excel・A4縦）。日ごとにまとめ、同じ時間帯ごとにまとめる。
   予約番号・代表者（法人名があれば、法人名まで）・人数・車両・店舗・担当は、予約データから。右端に、領収書・宛名の記入欄。
   確定・当選の予約だけを載せる（取り消し・キャンセル待ち・抽選待ち・落選は載せない）。印刷してPDFにも、できる */
(function (root) {
  'use strict';
  var WD = '日月火水木金土';
  function md(s) { var p = String(s || '').split('-'); if (p.length < 3) return s || ''; return (+p[1]) + '月' + (+p[2]) + '日（' + WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] + '）'; }
  function rng(r) { return (r.start === '00:00' && r.end === '24:00') ? '終日' : (r.start || '') + '–' + (r.end || ''); }
  function car(r) { if (r.order) return 'ご注文中・新規'; var c = r.car || {}; return [c.pref, c.cls, c.kana, c.num].filter(Boolean).join(' ') + (c.model ? '　' + c.model : ''); }
  function who(r) { return (r.corp ? r.corp + '　' : '') + (r.name || '') + ' 様'; }
  function stores(r) { return (r.stores || []).map(function (k) { var s = (r.staff || {})[k]; return k + (s ? '：' + s : ''); }).join(' / '); }
  // 日 → 時間帯 → 予約 の順に、まとめる
  function group(list) {
    var days = {};
    list.filter(function (r) { return r.status === 'confirmed' || r.status === 'won'; }).forEach(function (r) {
      var d = days[r.date || ''] = days[r.date || ''] || {}, t = d[rng(r)] = d[rng(r)] || { start: r.start || '', rows: [] }; t.rows.push(r);
    });
    return Object.keys(days).sort().map(function (d) {
      return { date: d, times: Object.keys(days[d]).sort(function (a, b) { return (days[d][a].start < days[d][b].start) ? -1 : 1; }).map(function (k) {
        return { label: k, rows: days[d][k].rows.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ja'); }) };
      }) };
    });
  }
  async function make(list, ev, loadExcel) {
    var X = await loadExcel(), g = group(list), wb = new X.Workbook();
    var ws = wb.addWorksheet('来店表', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .2, footer: .2 } } });
    ws.columns = [{ width: 15 }, { width: 26 }, { width: 6 }, { width: 24 }, { width: 18 }, { width: 8 }, { width: 18 }];
    var thin = { style: 'thin', color: { argb: 'FF999999' } }, bd = { top: thin, left: thin, bottom: thin, right: thin };
    var fill = function (c) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: c } }; };
    ws.mergeCells('A1:G1'); ws.getCell('A1').value = (ev.name || '') + '　来店表'; ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A2:G2'); ws.getCell('A2').value = '出力：' + new Date().toLocaleString('ja-JP'); ws.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
    var hr = ws.getRow(4); hr.values = ['予約番号', '代表者', '人数', '車両', '店舗・担当', '領収書', '宛名'];
    hr.eachCell(function (c) { c.font = { bold: true, size: 10 }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = fill('FFE9EFEB'); c.border = bd; });
    ws.pageSetup.printTitlesRow = '4:4'; ws.views = [{ state: 'frozen', ySplit: 4 }];
    var n = 5, dataRows = [], total = 0, groups = 0;
    g.forEach(function (d) {
      var dn = d.times.reduce(function (a, t) { return a + t.rows.length; }, 0), dp = d.times.reduce(function (a, t) { return a + t.rows.reduce(function (b, r) { return b + (+r.n || 0); }, 0); }, 0);
      ws.mergeCells('A' + n + ':G' + n); var c = ws.getCell('A' + n); c.value = md(d.date) + '　' + dn + '組・' + dp + '名'; c.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }; c.fill = fill('FF1F4A3D'); c.alignment = { vertical: 'middle' }; ws.getRow(n).height = 22; n++;
      d.times.forEach(function (t) {
        var tp = t.rows.reduce(function (b, r) { return b + (+r.n || 0); }, 0);
        ws.mergeCells('A' + n + ':G' + n); var s = ws.getCell('A' + n); s.value = t.label + '　' + t.rows.length + '組・' + tp + '名'; s.font = { bold: true, size: 11 }; s.fill = fill('FFF3EAD3'); s.border = bd; n++;
        t.rows.forEach(function (r) {
          var row = ws.getRow(n); row.values = [(r.id || '').replace(/(.{4})(?=.)/g, '$1-'), who(r), +r.n || 0, car(r), stores(r), '', ''];
          row.eachCell({ includeEmpty: true }, function (c2, i) { c2.border = bd; c2.font = { size: 10 }; c2.alignment = { vertical: 'middle', wrapText: i === 2 || i === 4 || i === 5, horizontal: i === 3 ? 'center' : 'left' }; });
          row.height = 24; dataRows.push(n); total += +r.n || 0; groups++; n++;
        });
      });
    });
    if (!groups) { ws.mergeCells('A5:G5'); ws.getCell('A5').value = '該当する予約が、ありません'; }
    else { var tr = ws.getRow(n); tr.getCell(2).value = '合計（' + groups + '組）'; tr.getCell(3).value = { formula: 'SUM(C5:C' + (n - 1) + ')', result: total }; tr.eachCell({ includeEmpty: true }, function (c) { c.font = { bold: true, size: 10 }; c.border = bd; c.fill = fill('FFE9EFEB'); }); tr.getCell(3).alignment = { horizontal: 'center' }; }
    ws.headerFooter = { oddFooter: '&C&P / &N' };
    var buf = await wb.xlsx.writeBuffer();
    return { buf: buf, name: '来店表_' + String(ev.name || '').replace(/[\\/:*?"<>|]/g, '') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx', groups: groups };
  }
  async function download(list, ev, loadExcel) {
    var o = await make(list, ev, loadExcel), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([o.buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = o.name; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1500); return o;
  }
  root.VSHEET = { make: make, download: download, group: group };
})(window);
