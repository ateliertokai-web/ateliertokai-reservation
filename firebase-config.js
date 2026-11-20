// Firebaseの設定値（公開されても問題ない値です。守っているのは firestore.rules の方です）
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyCIwqipK-UDkX7er-gywgs7FdiTaY80OaE",
  authDomain: "test-2ee7a.firebaseapp.com",
  projectId: "test-2ee7a",
  storageBucket: "test-2ee7a.firebasestorage.app",
  messagingSenderId: "866259140730",
  appId: "1:866259140730:web:8749d39f708f6a08237bc3"
};

// 通知（プッシュ通知）の公開鍵（Firebase コンソール → プロジェクトの設定 → Cloud Messaging → ウェブプッシュ証明書）。空なら通知の機能は使わない
var PUSH_VAPID = '';
