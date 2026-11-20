// 「面接」タブの計算(画面に使わない部分)。
// 面接した女性の、情報・写真・書類を、お店のログインだけが見られる場所に置く。
//
// 保存先(どれも shops/<お店ID>/ の下。お店のログインだけが読み書きできる。データベースのルールは、変えていない):
//   interviews/<人のID>            = { name, interviewDate, age?, phone?, source?, note?, status, statusAt, ageCheckedAt?,
//                                      thumb?, thumbId?, photoCount, docCount, createdAt, updatedAt }   ← 一覧で読む(小さな顔写真つき)
//   interviewFiles/<人のID>/<ID>   = { kind: "photo" | "doc", docType?, label?, at, kb, thumb?, mini? }  ← その人を開いたときに読む(小さい。書類には、小さな画像を作らない)
//   interviewData/<人のID>/<ID>    = { data }(大きな画像の文字)                                      ← 「開く」を押したときだけ読む

export const STATUSES = [
  { id: "pending", label: "結果待ち", bg: "#FFF3CD", fg: "#8A6D1A" },
  { id: "hired", label: "採用", bg: "#DDF4E4", fg: "#2E7D32" },
  { id: "hold", label: "保留", bg: "#E3ECFA", fg: "#3A5F9E" },
  { id: "rejected", label: "不採用", bg: "#FDE3E3", fg: "#B3261E" },
  { id: "declined", label: "辞退", bg: "#EEE8F5", fg: "#6B4E8A" },
];
export const DOC_TYPES = [
  { id: "id", label: "身分証" },
  { id: "resume", label: "履歴書" },
  { id: "pledge", label: "誓約書" },
  { id: "other", label: "その他" },
];
export const ID_LABELS = ["運転免許証", "マイナンバーカード", "パスポート", "在留カード", "健康保険証"]; // 身分証の名前の候補(自由に書ける)
export const LIMITS = { name: 40, phone: 30, source: 60, note: 2000, label: 40 };
export const DELETE_AFTER_DAYS = 183; // 不採用・辞退から、「そろそろ消しましょう」と知らせるまでの日数(半年)
export const IMAGE_LIMITS = {
  photo: { maxPx: 1200, quality: 0.82, maxKB: 700, thumbPx: 320, miniPx: 160 }, // 顔の写真(thumb = その人の画面の並び用、mini = 一覧の顔写真用)
  doc: { maxPx: 1800, quality: 0.85, maxKB: 900, thumbPx: 0, miniPx: 0 }, // 書類(文字が読める大きさ。小さな画像は作らない=一覧にも、その人の画面にも、写真を出さない)
};

const THUMB_OK = /^data:image\/(jpeg|png|webp);base64,/;

export function statusOf(id) { return STATUSES.find((s) => s.id === id) || STATUSES[0]; }
export function docTypeOf(id) { return DOC_TYPES.find((d) => d.id === id) || DOC_TYPES[3]; }

const clip = (s, n) => Array.from(String(s == null ? "" : s)).slice(0, n).join("");
const oneLine = (s, n) => clip(String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim(), n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function makeId(prefix = "i", now = Date.now(), rand = Math.random()) {
  return `${prefix}${now.toString(36)}${Math.floor(rand * 36 ** 4).toString(36).padStart(4, "0")}`;
}

/* ---------- 日付 ---------- */
export function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
// 「2026/11/18」。short なら「11/18」
export function fmtDate(s, short = false) {
  if (!isValidDate(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  return short ? `${m}/${d}` : `${y}/${m}/${d}`;
}

// 時刻(ミリ秒)を、「2026/11/18」にする(わからない値は、空)
export function fmtStamp(ts) {
  if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) return "";
  const d = new Date(Number(ts));
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/* ---------- 入力のそうじ ---------- */
// 画面に入れた内容を、保存できる形にする。返す: { ok: true, value } か { ok: false, error }
export function cleanPerson(raw) {
  const r = raw || {};
  const name = oneLine(r.name, LIMITS.name);
  if (!name) return { ok: false, error: "名前を入れてください。" };
  const interviewDate = String(r.interviewDate == null ? "" : r.interviewDate).trim();
  if (!isValidDate(interviewDate)) return { ok: false, error: "面接日を、正しく入れてください。" };
  const ageText = String(r.age == null ? "" : r.age).normalize("NFKC").trim();
  let age = null;
  if (ageText !== "") {
    if (!/^\d{1,3}$/.test(ageText) || Number(ageText) < 10 || Number(ageText) > 99) return { ok: false, error: "年齢は、数字(10〜99)で入れてください。" };
    age = Number(ageText);
  }
  return {
    ok: true,
    value: {
      name,
      interviewDate,
      age,
      phone: oneLine(r.phone, LIMITS.phone),
      source: oneLine(r.source, LIMITS.source),
      note: clip(String(r.note == null ? "" : r.note).replace(/\r\n?/g, "\n"), LIMITS.note).replace(/\s+$/, ""),
    },
  };
}

// 保存に失敗したときの、画面に出す文(日本語の理由は、そのまま。英語の技術的な文は、使わない)
export function saveErrorText(e) {
  const m = e && typeof e.message === "string" ? e.message : "";
  if (/[ぁ-んァ-ン一-龥]/.test(m)) return m;
  if (/permission/i.test(`${m} ${e && e.code ? e.code : ""}`)) return "保存する権限がありません。ログインし直してください。";
  return "保存できませんでした。通信を確かめて、もう一度、お試しください。";
}

// 新しい人を作る(空の項目は、入れない)
export function newPersonRecord(clean, now) {
  const rec = { name: clean.name, interviewDate: clean.interviewDate, status: "pending", statusAt: now, photoCount: 0, docCount: 0, createdAt: now, updatedAt: now };
  if (clean.age != null) rec.age = clean.age;
  if (clean.phone) rec.phone = clean.phone;
  if (clean.source) rec.source = clean.source;
  if (clean.note) rec.note = clean.note;
  return rec;
}
// 直したときの保存(空にした項目は、null = 消す。update に渡す)
export function personPatch(clean, now) {
  return {
    name: clean.name,
    interviewDate: clean.interviewDate,
    age: clean.age != null ? clean.age : null,
    phone: clean.phone || null,
    source: clean.source || null,
    note: clean.note || null,
    updatedAt: now,
  };
}

// 情報を直したときの、update に渡す形(お店の場所からの、相対パス)
export function personEditUpdate(personId, clean, now) {
  const u = {};
  Object.entries(personPatch(clean, now)).forEach(([k, v]) => { u[`interviews/${personId}/${k}`] = v; });
  return u;
}

/* ---------- データベースから読む(壊れた値は、安全な値に) ---------- */
export function readPeople(val) {
  if (!val || typeof val !== "object") return [];
  const out = [];
  Object.entries(val).forEach(([id, v]) => {
    if (!v || typeof v !== "object") return;
    const date = typeof v.interviewDate === "string" && isValidDate(v.interviewDate) ? v.interviewDate : "";
    const age = Number(v.age);
    out.push({
      id,
      name: oneLine(v.name, LIMITS.name) || "(名前なし)",
      interviewDate: date,
      age: Number.isFinite(age) && age >= 10 && age <= 99 ? age : null,
      phone: oneLine(v.phone, LIMITS.phone),
      source: oneLine(v.source, LIMITS.source),
      note: typeof v.note === "string" ? clip(v.note, LIMITS.note) : "",
      status: STATUSES.some((s) => s.id === v.status) ? v.status : "pending",
      statusAt: num(v.statusAt),
      ageCheckedAt: typeof v.ageCheckedAt === "string" && isValidDate(v.ageCheckedAt) ? v.ageCheckedAt : "",
      thumb: typeof v.thumb === "string" && THUMB_OK.test(v.thumb) ? v.thumb : "",
      thumbId: typeof v.thumbId === "string" ? v.thumbId : "",
      photoCount: Math.max(0, Math.floor(num(v.photoCount))),
      docCount: Math.max(0, Math.floor(num(v.docCount))),
      createdAt: num(v.createdAt),
      updatedAt: num(v.updatedAt),
    });
  });
  // 面接日が新しい順。同じなら、登録が新しい順
  return out.sort((a, b) => (b.interviewDate > a.interviewDate ? 1 : b.interviewDate < a.interviewDate ? -1 : 0) || b.createdAt - a.createdAt || a.name.localeCompare(b.name));
}

export function readFiles(val) {
  if (!val || typeof val !== "object") return [];
  const out = [];
  Object.entries(val).forEach(([id, v]) => {
    if (!v || typeof v !== "object" || (v.kind !== "photo" && v.kind !== "doc")) return;
    out.push({
      id,
      kind: v.kind,
      docType: DOC_TYPES.some((d) => d.id === v.docType) ? v.docType : "other",
      label: oneLine(v.label, LIMITS.label),
      at: num(v.at),
      kb: num(v.kb),
      thumb: typeof v.thumb === "string" && THUMB_OK.test(v.thumb) ? v.thumb : "",
      mini: typeof v.mini === "string" && THUMB_OK.test(v.mini) ? v.mini : "",
    });
  });
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// 大きな画像の文字(「開く」を押したときに読む)。画像でなければ、空
export function readImageData(val) {
  const d = val && typeof val.data === "string" ? val.data : "";
  return THUMB_OK.test(d) ? d : "";
}

/* ---------- 探す・数える ---------- */
// 検索のための、そろえた文字(全角・半角、大文字・小文字、カタカナ・ひらがなの違いを、なくす)
export function norm(s) {
  return String(s == null ? "" : s).normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
const digits = (s) => norm(s).replace(/\D/g, "");

export function matchesQuery(p, query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = norm(`${p.name} ${p.source} ${p.note} ${p.phone}`);
  const phoneDigits = digits(p.phone);
  return tokens.every((t) => hay.includes(t) || (/^\d{3,}$/.test(t) && phoneDigits.includes(t)));
}

// 不採用・辞退にして半年たって、「そろそろ消しましょう」と知らせる人か
export function isDue(p, now = Date.now()) {
  if (p.status !== "rejected" && p.status !== "declined") return false;
  const base = p.statusAt || p.createdAt;
  return !!base && now - base >= DELETE_AFTER_DAYS * 86400000;
}

// filter: "all" | 結果の ID | "due"(消す時期が来ている人)
export function filterPeople(people, { query = "", filter = "all" } = {}, now = Date.now()) {
  return people.filter((p) => {
    if (filter === "due" ? !isDue(p, now) : filter !== "all" && p.status !== filter) return false;
    return matchesQuery(p, query);
  });
}
export function countByFilter(people, now = Date.now()) {
  const c = { all: people.length, due: 0 };
  STATUSES.forEach((s) => { c[s.id] = 0; });
  people.forEach((p) => { c[p.status] += 1; if (isDue(p, now)) c.due += 1; });
  return c;
}

/* ---------- 書き換え(update に渡す。お店の場所からの、相対パス) ---------- */
// inc は、数を増やす印(画面では firebase の increment を渡す。試験では、作り物を渡す)
export function addFileUpdate({ personId, fileId, kind, docType, label, data, thumb, mini, kb, hasMainPhoto, now, inc }) {
  const meta = { kind, at: now, kb };
  if (kind === "doc") {
    meta.docType = DOC_TYPES.some((d) => d.id === docType) ? docType : "other";
    const l = oneLine(label, LIMITS.label);
    if (l) meta.label = l;
  } else {
    if (thumb) meta.thumb = thumb;
    if (mini) meta.mini = mini;
  }
  const u = {
    [`interviewFiles/${personId}/${fileId}`]: meta,
    [`interviewData/${personId}/${fileId}`]: { data },
    [`interviews/${personId}/${kind === "photo" ? "photoCount" : "docCount"}`]: inc(1),
    [`interviews/${personId}/updatedAt`]: now,
  };
  // 最初の写真は、一覧の顔写真になる
  if (kind === "photo" && !hasMainPhoto && mini) {
    u[`interviews/${personId}/thumb`] = mini;
    u[`interviews/${personId}/thumbId`] = fileId;
  }
  return u;
}

// 写真・書類を消す。一覧の顔写真を消したときは、ほかの写真に替える(なければ、なし)
export function removeFileUpdate({ personId, file, person, files, now, inc }) {
  const u = {
    [`interviewFiles/${personId}/${file.id}`]: null,
    [`interviewData/${personId}/${file.id}`]: null,
    [`interviews/${personId}/${file.kind === "photo" ? "photoCount" : "docCount"}`]: inc(-1),
    [`interviews/${personId}/updatedAt`]: now,
  };
  if (file.kind === "photo" && person.thumbId === file.id) {
    const next = files.find((f) => f.kind === "photo" && f.id !== file.id && f.mini);
    u[`interviews/${personId}/thumb`] = next ? next.mini : null;
    u[`interviews/${personId}/thumbId`] = next ? next.id : null;
  }
  return u;
}

export function setMainPhotoUpdate({ personId, file, now }) {
  return {
    [`interviews/${personId}/thumb`]: file.mini,
    [`interviews/${personId}/thumbId`]: file.id,
    [`interviews/${personId}/updatedAt`]: now,
  };
}

export function statusUpdate({ personId, person, status, now }) {
  if (!STATUSES.some((s) => s.id === status) || person.status === status) return {};
  return {
    [`interviews/${personId}/status`]: status,
    [`interviews/${personId}/statusAt`]: now,
    [`interviews/${personId}/updatedAt`]: now,
  };
}

export function ageCheckUpdate({ personId, date, now }) {
  return {
    [`interviews/${personId}/ageCheckedAt`]: date && isValidDate(date) ? date : null,
    [`interviews/${personId}/updatedAt`]: now,
  };
}

// その人の記録を、すべて消す(写真・書類もいっしょに)
export function removePersonUpdate(personId) {
  return { [`interviews/${personId}`]: null, [`interviewFiles/${personId}`]: null, [`interviewData/${personId}`]: null };
}

// その人の画面で、「メインの写真」の ID(メインに決めた写真があればそれ、なければ最初の写真。写真がなければ空)
export function mainPhotoId(person, files) {
  const photos = files.filter((f) => f.kind === "photo");
  return (photos.find((f) => f.id === person.thumbId) || photos[0] || { id: "" }).id;
}
