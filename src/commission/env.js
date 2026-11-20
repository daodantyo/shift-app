// 動作環境の判定（LINEアプリ内ブラウザなど）

// LINEの中のブラウザで開いているか（ファイル保存・共有ができない）
export function isLineBrowser() {
  if (typeof navigator === "undefined") return false;
  return /\bLine\//i.test(navigator.userAgent || "");
}

// LINE内ブラウザから、スマホの通常ブラウザ（Safari / Chrome）で開き直すためのURL
// （LINEは openExternalBrowser=1 が付いたリンクを外部ブラウザで開く）
export function externalBrowserUrl() {
  const u = new URL(window.location.href);
  u.searchParams.set("openExternalBrowser", "1");
  return u.toString();
}
