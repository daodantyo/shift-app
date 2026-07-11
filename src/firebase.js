import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

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