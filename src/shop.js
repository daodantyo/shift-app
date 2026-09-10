// ============================================================
//  お店(店舗)の判別
//  ・管理画面: ログインした人の uid が、そのままお店IDになる
//  ・キャスト向けページ(希望提出・閲覧・抽選): URLの ?shop=お店ID で判別する
//    昔のURL(shopなし)でも動くように、config/defaultShopId に既定のお店を持てる
// ============================================================
import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, get } from "firebase/database";

// 最初のお店(移行前)で使っていた LIFF ID。データ引き継ぎのときに設定へコピーする
export const DEFAULT_LIFF_ID = "2010692487-HEfxObPq";

export function getShopIdFromUrl() {
  if (typeof window === "undefined") return "";
  const v = new URLSearchParams(window.location.search).get("shop");
  return v ? String(v).trim() : "";
}

// キャスト向けページで使う: { shopId, status: "loading" | "ready" }
export function useShopId(enabled) {
  const fromUrl = getShopIdFromUrl();
  const [state, setState] = useState(() =>
    fromUrl ? { shopId: fromUrl, status: "ready" } : { shopId: "", status: enabled ? "loading" : "ready" }
  );
  useEffect(() => {
    if (!enabled || fromUrl) return;
    get(ref(db, "config/defaultShopId"))
      .then((snap) => setState({ shopId: snap.val() ? String(snap.val()) : "", status: "ready" }))
      .catch(() => setState({ shopId: "", status: "ready" }));
  }, [enabled, fromUrl]);
  return state;
}

// キャストに案内するURLを作る
export function staffUrl(kind, shopId) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?${kind}=1&shop=${encodeURIComponent(shopId)}`;
}
