// 「報酬」タブ(旧「報酬管理」アプリの画面を、そのまま移したもの)
// データの置き場所: shops/<お店のID>/commission/{members, deals, settings, meta}
// (お店のログインの人だけが読み書きできる場所。ルールは、キャスト管理のものを、そのまま使う)
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { ref, onValue, push, update, remove, set } from "firebase/database";
import { todayStr } from "./calc";
import { isLineBrowser, externalBrowserUrl } from "./env";
import DealsPage from "./DealsPage";
import SummaryPage from "./SummaryPage";
import SettingsPage from "./SettingsPage";
import ScoutPage from "./ScoutPage";
import "./commission.css";

export default function CommissionApp({ base, user }) {
  const [tab, setTab] = useState("deals");
  const [data, setData] = useState(null); // { members, deals, settings, meta }
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    setData(null);
    setLoadError("");
    const unsub = onValue(
      ref(db, base),
      (snap) => {
        const v = snap.val() || {};
        setData({ members: v.members || {}, deals: v.deals || {}, meta: v.meta || {}, settings: v.settings || {} });
      },
      (err) => setLoadError((err && err.message) || "読み込めませんでした。"),
    );
    return () => unsub();
  }, [base]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const dealList = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.deals)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt || 0) < (b.createdAt || 0) ? 1 : -1));
  }, [data]);

  // ---- 保存系 ----
  const api = {
    addDeal: async (d) => { await push(ref(db, `${base}/deals`), { ...d, createdAt: Date.now() }); showToast("登録しました"); },
    updateDeal: async (id, d) => { await update(ref(db, `${base}/deals/${id}`), d); showToast("更新しました"); },
    deleteDeal: async (id) => { await remove(ref(db, `${base}/deals/${id}`)); showToast("削除しました"); },
    setPaid: async (ids, paid) => {
      const patch = {};
      for (const id of ids) {
        patch[`deals/${id}/paid`] = paid;
        patch[`deals/${id}/paidDate`] = paid ? todayStr() : null;
      }
      await update(ref(db, base), patch);
      showToast(paid ? "支払済にしました" : "未払に戻しました");
    },
    addMember: async (m) => { await push(ref(db, `${base}/members`), { ...m, createdAt: Date.now() }); showToast("追加しました"); },
    updateMember: async (id, m) => { await update(ref(db, `${base}/members/${id}`), m); showToast("更新しました"); },
    deleteMember: async (id) => { await remove(ref(db, `${base}/members/${id}`)); showToast("削除しました"); },
    saveSettings: async (patch) => { await update(ref(db, `${base}/settings`), patch); showToast("保存しました"); },
    markBackedUp: async () => { await update(ref(db, `${base}/meta`), { lastBackupAt: Date.now() }); },
    restoreAll: async (payload) => {
      // 復元：女性・登録・設定をファイルの内容で置き換える（メタ情報は残す）
      await set(ref(db, base), { members: payload.members || {}, deals: payload.deals || {}, settings: payload.settings || data?.settings || {}, meta: { ...(data?.meta || {}), restoredAt: Date.now() } });
      showToast("復元しました");
    },
  };

  const backupDue = data && dealList.length > 0 && (!data.meta.lastBackupAt || Date.now() - data.meta.lastBackupAt > 7 * 24 * 60 * 60 * 1000);
  const daysSince = data && data.meta.lastBackupAt ? Math.floor((Date.now() - data.meta.lastBackupAt) / 86400000) : null;

  return (
    <div className="cm-root cm-embed">
      <div className="app">
        <header className="header no-print">
          <div>
            <h1>報酬管理</h1>
            <div className="sub">{data ? `女性 ${Object.keys(data.members).length}名 / 登録 ${dealList.length}件` : "読み込み中..."}</div>
          </div>
        </header>
        <nav className="tabs no-print">
          <button className={tab === "deals" ? "active" : ""} onClick={() => setTab("deals")}>登録</button>
          <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>集計</button>
          <button className={tab === "scout" ? "active" : ""} onClick={() => setTab("scout")}>スカウトバック</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>設定</button>
        </nav>
        {isLineBrowser() && (
          <div className="banner no-print">
            <span>LINEの中のブラウザで開いています。この画面ではPDFやCSVの保存ができません。保存するときは通常のブラウザで開いてください。</span>
            <a className="btn small primary" href={externalBrowserUrl()} target="_blank" rel="noreferrer">Safari／Chromeで開く</a>
          </div>
        )}
        {backupDue && tab !== "settings" && (
          <div className="banner no-print">
            <span>{daysSince === null ? "まだバックアップを取っていません。" : `前回のバックアップから${daysSince}日たっています。`}</span>
            <button className="btn small" onClick={() => setTab("settings")}>バックアップする</button>
          </div>
        )}
        {loadError ? (
          <div className="empty">読み込めませんでした。（{loadError}）</div>
        ) : !data ? (
          <div className="empty">読み込み中...</div>
        ) : tab === "deals" ? (
          <DealsPage data={data} deals={dealList} api={api} goSettings={() => setTab("settings")} />
        ) : tab === "summary" ? (
          <SummaryPage data={data} deals={dealList} api={api} />
        ) : tab === "scout" ? (
          <ScoutPage data={data} deals={dealList} />
        ) : (
          <SettingsPage data={data} deals={dealList} api={api} user={user} />
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
