// メモ帳の計算(画面に使わない部分)。保存先: shops/<お店ID>/memo = { text, at }(at はサーバーの時刻。最後に書いた日時)。
// お店のログインだけが読み書きできる場所(データベースのルールは変えていない)。
// 管理画面(members-app)のメモ帳と、同じ作り。

export const MEMO_MAX = 3000; // 書ける文字数の上限
export const MEMO_SAVE_MS = 800; // 入力が止まってから、保存するまでの時間

// 画面の文字を、保存できる形にする(文字だけ。改行は LF にそろえる。上限で切る)
export function cleanMemo(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\r\n?/g, "\n").slice(0, MEMO_MAX);
}

// データベースの値から、メモの文字と、最後に書いた日時を読む(壊れた値は、空と 0)
export function readMemo(v) {
  const text = v && typeof v.text === "string" ? cleanMemo(v.text) : "";
  const at = v && Number.isFinite(Number(v.at)) ? Number(v.at) : 0;
  return { text, at };
}

// 保存する中身。空(空白だけ)なら null = メモごと消す。at は、呼ぶ側が渡す(画面はサーバーの時刻)
export function memoToSave(text, at) {
  const t = cleanMemo(text);
  return t.trim() === "" ? null : { text: t, at };
}

// 小さくしたときに出す1行。最初の、文字のある行を、max 文字まで(超えたら「…」)
export function memoPreview(text, max = 40) {
  const line = cleanMemo(text).split("\n").map((s) => s.trim()).find((s) => s !== "") || "";
  const chars = Array.from(line);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : line;
}
