/**
 * 予約データの自動バックアップ（Google Apps Script）
 *
 * Firebase（Firestore）の予約データを読み、Googleドライブのスプレッドシート「予約バックアップ」に、
 * 実行した日時の名前のシートとして保存します。古いシートは KEEP 件を超えたら自動で消します。
 * 使い方は tools/README.md を見てください。
 *
 * 必ず Firebase プロジェクトの持ち主（オーナー）の Google アカウントで動かしてください。
 * スプレッドシートには個人情報が入るので、他の人と共有しないでください。
 */
var PROJECT_ID = 'test-2ee7a';   // Firebase のプロジェクトID（firebase-config.js の projectId）
var KEEP = 60;                   // 残すバックアップの数（毎日なら約2か月分）
var BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/';

var STATUS = { confirmed: '確定', won: '当選', lottery: '抽選待ち', wait: 'キャンセル待ち', lost: '落選', cancel: '取消' };
var HEAD = ['予約番号', '受付日時', '状態', '待ち番号', 'イベント', '日付', '開始', '終了', '代表者', '法人名', '連絡先', 'メール',
  '大人', '未就学児', '小学生', '中学生以上', '合計', '参加者', '登録ナンバー', '車種', 'ご注文中・新規', '利用店舗', '担当スタッフ',
  '備考', 'オーナーズカードID', '招待枠', '最終更新'];

/** バックアップを1回とる（トリガーからも、この関数が呼ばれます） */
function backupNow() {
  var docs = listAll_('reservations');
  var rows = docs.map(toRow_);
  rows.sort(function (a, b) { return (String(a[5]) + a[6]) < (String(b[5]) + b[6]) ? -1 : (String(a[5]) + a[6]) > (String(b[5]) + b[6]) ? 1 : 0; });
  var ss = getBook_();
  var name = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var sh = ss.getSheetByName(name) || ss.insertSheet(name, 0);
  sh.clear();
  var data = [HEAD].concat(rows);
  sh.getRange(1, 1, data.length, HEAD.length).setValues(data);
  sh.setFrozenRows(1);
  // 最初からある空のシートと、古いバックアップを消す
  ss.getSheets().forEach(function (s) { if (/^(シート|Sheet)\d+$/.test(s.getName()) && ss.getSheets().length > 1) ss.deleteSheet(s); });
  var backups = ss.getSheets().filter(function (s) { return /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(s.getName()); })
    .sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  backups.slice(KEEP).forEach(function (s) { ss.deleteSheet(s); });
  Logger.log(rows.length + '件の予約を「' + name + '」に保存しました: ' + ss.getUrl());
  return rows.length;
}

/** 自動実行の設定（最初に1回だけ実行）。毎日3時と、毎月1日の13時（解禁日の受付のあと）にバックアップします */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backupNow') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupNow').timeBased().everyDays(1).atHour(3).inTimezone('Asia/Tokyo').create();
  ScriptApp.newTrigger('backupNow').timeBased().onMonthDay(1).atHour(13).inTimezone('Asia/Tokyo').create();
  Logger.log('自動バックアップを設定しました（毎日3時ごろ・毎月1日13時ごろ）');
}

/** 自動実行を止めるとき */
function stopTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backupNow') ScriptApp.deleteTrigger(t); });
  Logger.log('自動バックアップを止めました');
}

// ---------- ここから下は中身の処理 ----------
function getBook_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('BOOK_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('予約バックアップ'); props.setProperty('BOOK_ID', ss.getId()); }
  return ss;
}

function listAll_(collection) {
  var out = [], token = '';
  do {
    var url = BASE + collection + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('予約データを読めませんでした（' + res.getResponseCode() + '）: ' + res.getContentText().slice(0, 300));
    var j = JSON.parse(res.getContentText());
    (j.documents || []).forEach(function (d) { out.push({ id: d.name.split('/').pop(), data: fields_(d.fields || {}) }); });
    token = j.nextPageToken || '';
  } while (token);
  return out;
}

function fields_(f) { var o = {}; Object.keys(f).forEach(function (k) { o[k] = val_(f[k]); }); return o; }
function val_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return '';
  if ('mapValue' in v) return fields_(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val_);
  return '';
}

function toRow_(doc) {
  var r = doc.data, c = r.car || {}, st = r.stores || [], sf = r.staff || {};
  var fmt = function (d) { return d instanceof Date ? Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss') : ''; };
  var invited = r.invited === true || r.fav === true;
  return [doc.id.replace(/(.{4})(?=.)/g, '$1-'), fmt(r.createdAt), STATUS[r.status] || r.status || '', r.status === 'wait' ? (r.waitNo || '') : '',
    r.eventName || '', r.date || '', r.start || '', r.end || '', r.name || '', r.corp || '', "'" + (r.tel || ''), r.mail || '',
    r.a || 0, r.k || 0, r.s || 0, r.m || 0, r.n || 0, (r.participants || []).filter(String).join('、'),
    r.order ? '' : [c.pref, c.cls, c.kana, c.num].filter(function (x) { return x; }).join(' '), r.order ? '' : (c.model || ''), r.order ? '○' : '',
    st.join(' / '), st.map(function (k) { return sf[k] || ''; }).join(' / '), r.note || '', r.owner || '', invited ? '○' : '', fmt(r.updatedAt)];
}
