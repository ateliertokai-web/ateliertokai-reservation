// Firebaseの設定値（公開されても問題ない値です。守っているのは firestore.rules の方です）
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyCIwqipK-UDkX7er-gywgs7FdiTaY80OaE",
  authDomain: "test-2ee7a.firebaseapp.com",
  projectId: "test-2ee7a",
  storageBucket: "test-2ee7a.firebasestorage.app",
  messagingSenderId: "866259140730",
  appId: "1:866259140730:web:8749d39f708f6a08237bc3"
};

// App Check（本物の予約ページからのアクセスだけを通す仕組み）で使う reCAPTCHA Enterprise のサイトキー。
// 空欄のあいだは App Check を使いません。サイトキーは公開されても問題ない値です。
var APPCHECK_SITE_KEY = "";
