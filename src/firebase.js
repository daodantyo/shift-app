import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAzhuyDJq_JvfzjOBvs6JjloLbozJmsMLs",
  authDomain: "shift-app-fa13d.firebaseapp.com",
  databaseURL: "https://shift-app-fa13d-default-rtdb.firebaseio.com",
  projectId: "shift-app-fa13d",
  storageBucket: "shift-app-fa13d.firebasestorage.app",
  messagingSenderId: "599604964523",
  appId: "1:599604964523:web:2e37264761ec38983c1bee",
  measurementId: "G-26YKL68CMF"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// 手元での動作確認用(REACT_APP_SKIP_VERIFY=1 のときだけ)。本番ビルドには入らない
if (process.env.REACT_APP_SKIP_VERIFY === "1" && typeof window !== "undefined") window.__auth = auth;
