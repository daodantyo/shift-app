// ============================================================
//  お店の設定(店名・LINE連携・キャストに案内するURL)
//  ・店名 / LIFF ID … shops/{お店ID}/data/settings に保存(キャスト向けページからも読む)
//  ・LINEのトークン / 管理者のLINE ID … shops/{お店ID}/secrets に保存(お店の人だけが読める場所)
// ============================================================
import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, get, update } from "firebase/database";
import { staffUrl } from "./shop";

const S = {
  card: { background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, border: "2px solid #FFD9E8" },
  h: { fontWeight: 700, fontSize: 14, color: "#FF6B9D", marginBottom: 4 },
  note: { fontSize: 11, color: "#888", marginBottom: 12, lineHeight: 1.6 },
  label: { fontSize: 12, fontWeight: 700, color: "#5C3344", marginBottom: 4 },
  input: { width: "100%", boxSizing: "border-box", border: "1.5px solid #FFD9E8", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#5C3344", outline: "none", marginBottom: 10, fontFamily: "inherit" },
  save: { background: "linear-gradient(135deg, #FF8FAB, #FF6B9D)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" },
  urlRow: { display: "flex", alignItems: "center", gap: 8, background: "#FFF5F8", borderRadius: 8, padding: "8px 10px", marginBottom: 6 },
  urlText: { flex: 1, fontSize: 11, color: "#5C3344", wordBreak: "break-all" },
  copy: { flexShrink: 0, background: "#fff", border: "1px solid #FFD9E8", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#FF6B9D", cursor: "pointer" },
};

export default function ShopSettings({ shopId, settings, updateSettings }) {
  const shopBase = `shops/${shopId}`;
  const [shopName, setShopName] = useState(settings.shopName || "");
  const [liffId, setLiffId] = useState(settings.liffId || "");
  const [lineToken, setLineToken] = useState("");
  const [adminLineId, setAdminLineId] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [saved, setSaved] = useState("");
  const [copied, setCopied] = useState("");
  const [open, setOpen] = useState(false);

  // 設定が別の端末で変わったら追従する
  useEffect(() => { setShopName(settings.shopName || ""); }, [settings.shopName]);
  useEffect(() => { setLiffId(settings.liffId || ""); }, [settings.liffId]);

  useEffect(() => {
    get(ref(db, `${shopBase}/secrets`)).then((snap) => {
      const s = snap.val() || {};
      setAdminLineId(s.adminLineId || "");
      setHasToken(!!s.lineToken);
    }).catch(() => {});
  }, [shopBase]);

  const flash = (msg) => { setSaved(msg); setTimeout(() => setSaved(""), 2000); };

  const saveBasic = () => {
    updateSettings({ ...settings, shopName: shopName.trim(), liffId: liffId.trim() });
    flash("保存しました");
  };

  const saveSecrets = async () => {
    const patch = { adminLineId: adminLineId.trim() };
    if (lineToken.trim()) patch.lineToken = lineToken.trim();
    try {
      await update(ref(db, `${shopBase}/secrets`), patch);
      if (lineToken.trim()) { setHasToken(true); setLineToken(""); }
      flash("LINEの設定を保存しました");
    } catch (e) {
      alert("保存できませんでした: " + e);
    }
  };

  const copy = async (kind, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(kind); setTimeout(() => setCopied(""), 1500); }
    catch { window.prompt("このURLをコピーしてください", text); }
  };

  const urls = [
    { kind: "request", label: "希望シフト提出(LINEのLIFFに登録するURL)", url: staffUrl("request", shopId) },
    { kind: "view", label: "シフト閲覧(見るだけ)", url: staffUrl("view", shopId) },
    { kind: "lottery", label: "抽選ページ", url: staffUrl("lottery", shopId) },
  ];

  return (
    <div style={S.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={S.h}>🏪 お店の設定 {settings.shopName ? `- ${settings.shopName}` : ""}</div>
          <div style={{ ...S.note, marginBottom: 0 }}>店名・LINE連携・キャストに案内するURL</div>
        </div>
        <button onClick={() => setOpen((o) => !o)} style={{ background: "#fff", border: "1px solid #FFD9E8", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#FF6B9D", cursor: "pointer" }}>
          {open ? "閉じる" : "開く"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {saved && <div style={{ background: "#EAF7EC", color: "#2E7D32", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>✓ {saved}</div>}

          <div style={S.label}>お店の名前</div>
          <input style={S.input} value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="例: さくら" />
          <div style={S.label}>LIFF ID(LINE Developers で作った「LIFFアプリ」のID)</div>
          <input style={S.input} value={liffId} onChange={(e) => setLiffId(e.target.value)} placeholder="例: 2010692487-XXXXXXXX" />
          <div style={S.note}>キャストがLINEから希望シフトを出すときに使います。LIFFアプリの「エンドポイントURL」には、下の「希望シフト提出」のURLを登録してください。</div>
          <button style={S.save} onClick={saveBasic}>店名・LIFF IDを保存</button>

          <div style={{ borderTop: "1px solid #FFF0F5", margin: "16px 0" }} />

          <div style={S.label}>LINE公式アカウントのチャネルアクセストークン {hasToken && <span style={{ color: "#4CAF50" }}>(登録済み)</span>}</div>
          <input style={S.input} type="password" value={lineToken} onChange={(e) => setLineToken(e.target.value)} placeholder={hasToken ? "変更するときだけ入力" : "LINE Developers の Messaging API 設定からコピー"} autoComplete="new-password" />
          <div style={S.label}>管理者(お店)のLINEユーザーID</div>
          <input style={S.input} value={adminLineId} onChange={(e) => setAdminLineId(e.target.value)} placeholder="Uから始まる33文字のID。抽選の当選や今日の予定がここに届きます" />
          <div style={S.note}>トークンはお店の人だけが読める場所に保存されます。キャストへのシフト送信や、当選のお知らせに使います。</div>
          <button style={S.save} onClick={saveSecrets}>LINEの設定を保存</button>

          <div style={{ borderTop: "1px solid #FFF0F5", margin: "16px 0" }} />

          <div style={S.label}>キャストに案内するURL</div>
          <div style={S.note}>お店ごとに専用のURLです。そのままLINEで送るか、LIFFアプリのエンドポイントURLに登録してください。</div>
          {urls.map((u) => (
            <div key={u.kind}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#D4789F", marginBottom: 3 }}>{u.label}</div>
              <div style={S.urlRow}>
                <div style={S.urlText}>{u.url}</div>
                <button style={S.copy} onClick={() => copy(u.kind, u.url)}>{copied === u.kind ? "コピーしました" : "コピー"}</button>
              </div>
            </div>
          ))}
          <div style={{ ...S.note, marginTop: 8 }}>お店ID: <span style={{ fontFamily: "monospace" }}>{shopId}</span></div>
        </div>
      )}
    </div>
  );
}
