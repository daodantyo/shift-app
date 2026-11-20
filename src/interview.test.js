// 「面接」タブの計算の試験(データベース・画面は使わない)
import {
  cleanPerson, newPersonRecord, personPatch, personEditUpdate, readPeople, readFiles, readImageData, matchesQuery, isDue, filterPeople, countByFilter,
  addFileUpdate, removeFileUpdate, setMainPhotoUpdate, statusUpdate, ageCheckUpdate, removePersonUpdate, mainPhotoId, saveErrorText,
  isValidDate, fmtDate, fmtStamp, isoDate, makeId, norm, DELETE_AFTER_DAYS, LIMITS,
} from "./interview";
import { fitSize, shrinkSteps, dataUrlSizeKB } from "./image";

const DAY = 86400000;
const JPG = "data:image/jpeg;base64,AAAA";
const inc = (n) => ({ inc: n }); // 数を増やす印の、作り物

describe("日付", () => {
  test("正しい日付だけ通す", () => {
    expect(isValidDate("2026-11-18")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026/11/18")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate(null)).toBe(false);
  });
  test("見た目", () => {
    expect(fmtDate("2026-11-08")).toBe("2026/11/8");
    expect(fmtDate("2026-11-08", true)).toBe("11/8");
    expect(fmtDate("bad")).toBe("");
    expect(fmtStamp(new Date(2026, 10, 18, 12).getTime())).toBe("2026/11/18");
    expect(fmtStamp(0)).toBe("");
    expect(fmtStamp("x")).toBe("");
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  test("makeId は、毎回ちがい、先頭の文字がつく", () => {
    expect(makeId("p", 1000, 0.5)).toMatch(/^p/);
    expect(makeId("p", 1000, 0.1)).not.toBe(makeId("p", 1000, 0.9));
  });
});

describe("入力のそうじ(cleanPerson)", () => {
  const ok = { name: "さくら", interviewDate: "2026-11-18" };
  test("名前がないとエラー", () => {
    expect(cleanPerson({ ...ok, name: "   " })).toEqual({ ok: false, error: "名前を入れてください。" });
    expect(cleanPerson(null).ok).toBe(false);
  });
  test("面接日が正しくないとエラー", () => {
    expect(cleanPerson({ ...ok, interviewDate: "2026-02-30" }).ok).toBe(false);
    expect(cleanPerson({ ...ok, interviewDate: "" }).ok).toBe(false);
  });
  test("年齢: 空はなし。全角の数字も読む。10〜99だけ", () => {
    expect(cleanPerson({ ...ok, age: "" }).value.age).toBeNull();
    expect(cleanPerson({ ...ok, age: "２４" }).value.age).toBe(24);
    expect(cleanPerson({ ...ok, age: 31 }).value.age).toBe(31);
    expect(cleanPerson({ ...ok, age: "9" }).ok).toBe(false);
    expect(cleanPerson({ ...ok, age: "100" }).ok).toBe(false);
    expect(cleanPerson({ ...ok, age: "二十" }).ok).toBe(false);
    expect(cleanPerson({ ...ok, age: "-5" }).ok).toBe(false);
  });
  test("前後の空白をとる・長いものは切る・改行は、メモだけに残す", () => {
    const r = cleanPerson({ ...ok, name: "  さくら\n子 ", phone: " 090-1234-5678 ", source: "a".repeat(100), note: "1行目\r\n2行目\n\n" });
    expect(r.value.name).toBe("さくら 子");
    expect(r.value.phone).toBe("090-1234-5678");
    expect(r.value.source).toHaveLength(LIMITS.source);
    expect(r.value.note).toBe("1行目\n2行目");
  });
  test("絵文字を、半分に切らない", () => {
    const r = cleanPerson({ ...ok, name: "🌸".repeat(50) });
    expect(Array.from(r.value.name)).toHaveLength(LIMITS.name);
  });
});

describe("保存する形", () => {
  const clean = { name: "さくら", interviewDate: "2026-11-18", age: null, phone: "", source: "", note: "" };
  test("新しい人: 空の項目は入れない。最初は「結果待ち」", () => {
    expect(newPersonRecord(clean, 1000)).toEqual({ name: "さくら", interviewDate: "2026-11-18", status: "pending", statusAt: 1000, photoCount: 0, docCount: 0, createdAt: 1000, updatedAt: 1000 });
    const full = newPersonRecord({ ...clean, age: 24, phone: "090", source: "求人", note: "メモ" }, 1);
    expect(full).toMatchObject({ age: 24, phone: "090", source: "求人", note: "メモ" });
  });
  test("直したとき: 空にした項目は null(消す)", () => {
    expect(personPatch(clean, 5)).toEqual({ name: "さくら", interviewDate: "2026-11-18", age: null, phone: null, source: null, note: null, updatedAt: 5 });
    expect(personEditUpdate("p1", clean, 5)["interviews/p1/phone"]).toBeNull();
    expect(personEditUpdate("p1", clean, 5)["interviews/p1/name"]).toBe("さくら");
  });
});

describe("読み込み(壊れた値は、安全な値に)", () => {
  test("面接日が新しい順。同じ日は、登録が新しい順", () => {
    const list = readPeople({
      a: { name: "A", interviewDate: "2026-11-01", createdAt: 1 },
      b: { name: "B", interviewDate: "2026-11-18", createdAt: 1 },
      c: { name: "C", interviewDate: "2026-11-18", createdAt: 9 },
    });
    expect(list.map((p) => p.id)).toEqual(["c", "b", "a"]);
  });
  test("壊れた値・空は、落ちない", () => {
    expect(readPeople(null)).toEqual([]);
    expect(readPeople("x")).toEqual([]);
    const [p] = readPeople({ z: { name: "", interviewDate: "ふつうでない", age: "abc", status: "???", photoCount: -3, docCount: "x", thumb: "javascript:alert(1)" } });
    expect(p).toMatchObject({ name: "(名前なし)", interviewDate: "", age: null, status: "pending", photoCount: 0, docCount: 0, thumb: "" });
    expect(readPeople({ q: null, r: 5 })).toEqual([]);
  });
  test("顔写真は、画像の文字だけ通す", () => {
    expect(readPeople({ a: { name: "A", thumb: JPG } })[0].thumb).toBe(JPG);
    expect(readPeople({ a: { name: "A", thumb: "http://evil.example/x.jpg" } })[0].thumb).toBe("");
  });
  test("写真・書類の一覧: 種類が正しいものだけ。追加が古い順", () => {
    const files = readFiles({
      f2: { kind: "doc", docType: "id", label: "免許証", at: 20 },
      f1: { kind: "photo", at: 10, thumb: JPG, mini: JPG },
      f3: { kind: "video", at: 5 },
      f4: { kind: "doc", docType: "ふめい", at: 30 },
    });
    expect(files.map((f) => f.id)).toEqual(["f1", "f2", "f4"]);
    expect(files[2].docType).toBe("other");
    expect(readFiles(undefined)).toEqual([]);
  });
  test("大きな画像: 画像の文字だけ", () => {
    expect(readImageData({ data: JPG })).toBe(JPG);
    expect(readImageData({ data: "hello" })).toBe("");
    expect(readImageData(null)).toBe("");
  });
});

describe("探す・数える", () => {
  const people = readPeople({
    a: { name: "さくら", interviewDate: "2026-11-18", phone: "090-1234-5678", source: "求人サイト", note: "落ち着いた雰囲気", status: "pending", createdAt: 3 },
    b: { name: "ミウ", interviewDate: "2026-11-10", phone: "080 9999 0000", note: "経験あり", status: "hired", createdAt: 2 },
    c: { name: "ＲＥＮＡ", interviewDate: "2026-05-01", status: "rejected", statusAt: 1000, createdAt: 1000 },
  });
  test("ひらがな・カタカナ・全角・半角の、ちがいを気にしない", () => {
    expect(norm("ＲＥＮＡ")).toBe("rena");
    expect(matchesQuery(people[0], "サクラ")).toBe(true);
    expect(matchesQuery(people[1], "みう")).toBe(true);
    expect(matchesQuery(people[2], "rena")).toBe(true);
  });
  test("電話は、ハイフン・空白のちがいを気にしない。数字3けた以上", () => {
    expect(matchesQuery(people[0], "09012345678")).toBe(true);
    expect(matchesQuery(people[0], "1234")).toBe(true);
    expect(matchesQuery(people[1], "08099990000")).toBe(true);
    expect(matchesQuery(people[0], "9999")).toBe(false);
  });
  test("空白で区切ると、全部に当たる人だけ", () => {
    expect(matchesQuery(people[0], "さくら 求人")).toBe(true);
    expect(matchesQuery(people[0], "さくら 紹介")).toBe(false);
    expect(matchesQuery(people[0], "   ")).toBe(true);
  });
  test("不採用・辞退から半年で「消す時期」。それ以外は、ならない", () => {
    const rej = { status: "rejected", statusAt: 1000, createdAt: 1000 };
    expect(isDue(rej, 1000 + DELETE_AFTER_DAYS * DAY - 1)).toBe(false);
    expect(isDue(rej, 1000 + DELETE_AFTER_DAYS * DAY)).toBe(true);
    expect(isDue({ ...rej, status: "declined" }, 1000 + 999 * DAY)).toBe(true);
    expect(isDue({ ...rej, status: "hired" }, 1000 + 999 * DAY)).toBe(false);
    expect(isDue({ ...rej, status: "pending" }, 1000 + 999 * DAY)).toBe(false);
    expect(isDue({ status: "rejected", statusAt: 0, createdAt: 0 }, 1e15)).toBe(false); // 日付が分からないものは、知らせない
  });
  test("しぼりこみと件数", () => {
    const now = 1000 + 300 * DAY;
    expect(filterPeople(people, { filter: "hired" }, now).map((p) => p.name)).toEqual(["ミウ"]);
    expect(filterPeople(people, { filter: "due" }, now).map((p) => p.name)).toEqual(["ＲＥＮＡ"]);
    expect(filterPeople(people, { filter: "all", query: "さくら" }, now)).toHaveLength(1);
    expect(filterPeople(people, { filter: "hired", query: "さくら" }, now)).toHaveLength(0);
    expect(countByFilter(people, now)).toEqual({ all: 3, due: 1, pending: 1, hired: 1, hold: 0, rejected: 1, declined: 0 });
  });
});

describe("書き換え(update に渡す形)", () => {
  const base = { personId: "p1", fileId: "f1", now: 500, inc };
  test("写真を足す: 数を1つ増やす。最初の写真は、一覧の顔写真になる", () => {
    const u = addFileUpdate({ ...base, kind: "photo", data: JPG, thumb: JPG, mini: JPG, kb: 100, hasMainPhoto: false });
    expect(u["interviewFiles/p1/f1"]).toEqual({ kind: "photo", at: 500, kb: 100, thumb: JPG, mini: JPG });
    expect(u["interviewData/p1/f1"]).toEqual({ data: JPG });
    expect(u["interviews/p1/photoCount"]).toEqual({ inc: 1 });
    expect(u["interviews/p1/thumb"]).toBe(JPG);
    expect(u["interviews/p1/thumbId"]).toBe("f1");
  });
  test("2枚目からは、顔写真を変えない", () => {
    const u = addFileUpdate({ ...base, kind: "photo", data: JPG, thumb: JPG, mini: JPG, kb: 100, hasMainPhoto: true });
    expect(u["interviews/p1/thumb"]).toBeUndefined();
  });
  test("書類を足す: 小さな画像は、作らない(一覧に、書類の写真を出さない)。書類の数を増やす", () => {
    const u = addFileUpdate({ ...base, kind: "doc", docType: "id", label: " 運転免許証 ", data: JPG, thumb: JPG, mini: JPG, kb: 300, hasMainPhoto: false });
    expect(u["interviewFiles/p1/f1"]).toEqual({ kind: "doc", at: 500, kb: 300, docType: "id", label: "運転免許証" });
    expect(u["interviews/p1/docCount"]).toEqual({ inc: 1 });
    expect(u["interviews/p1/thumb"]).toBeUndefined();
    expect(u["interviews/p1/photoCount"]).toBeUndefined();
  });
  test("知らない書類の種類は「その他」。名前が空なら、名前を入れない", () => {
    const u = addFileUpdate({ ...base, kind: "doc", docType: "???", label: "  ", data: JPG, kb: 1, hasMainPhoto: false });
    expect(u["interviewFiles/p1/f1"]).toEqual({ kind: "doc", at: 500, kb: 1, docType: "other" });
  });
  test("写真を消す: 顔写真を消したら、ほかの写真に替える。なければ消す", () => {
    const f1 = { id: "f1", kind: "photo", mini: "data:image/jpeg;base64,ONE" };
    const f2 = { id: "f2", kind: "photo", mini: "data:image/jpeg;base64,TWO" };
    const u = removeFileUpdate({ personId: "p1", file: f1, person: { thumbId: "f1" }, files: [f1, f2], now: 9, inc });
    expect(u["interviewFiles/p1/f1"]).toBeNull();
    expect(u["interviewData/p1/f1"]).toBeNull();
    expect(u["interviews/p1/photoCount"]).toEqual({ inc: -1 });
    expect(u["interviews/p1/thumb"]).toBe(f2.mini);
    expect(u["interviews/p1/thumbId"]).toBe("f2");
    const last = removeFileUpdate({ personId: "p1", file: f1, person: { thumbId: "f1" }, files: [f1], now: 9, inc });
    expect(last["interviews/p1/thumb"]).toBeNull();
    const other = removeFileUpdate({ personId: "p1", file: f2, person: { thumbId: "f1" }, files: [f1, f2], now: 9, inc });
    expect(other["interviews/p1/thumb"]).toBeUndefined(); // 顔写真でない写真を消しても、顔写真は、そのまま
  });
  test("書類を消す: 書類の数を減らす。顔写真には、触らない", () => {
    const d = { id: "d1", kind: "doc" };
    const u = removeFileUpdate({ personId: "p1", file: d, person: { thumbId: "d1" }, files: [d], now: 9, inc });
    expect(u["interviews/p1/docCount"]).toEqual({ inc: -1 });
    expect(u["interviews/p1/thumb"]).toBeUndefined();
  });
  test("メインの写真を変える", () => {
    expect(setMainPhotoUpdate({ personId: "p1", file: { id: "f2", mini: JPG }, now: 3 })).toEqual({ "interviews/p1/thumb": JPG, "interviews/p1/thumbId": "f2", "interviews/p1/updatedAt": 3 });
  });
  test("メインの写真の決まり: 決めた写真 → なければ最初の写真 → 写真がなければ空", () => {
    const files = [{ id: "d", kind: "doc" }, { id: "a", kind: "photo" }, { id: "b", kind: "photo" }];
    expect(mainPhotoId({ thumbId: "b" }, files)).toBe("b");
    expect(mainPhotoId({ thumbId: "" }, files)).toBe("a");
    expect(mainPhotoId({ thumbId: "x" }, files)).toBe("a");
    expect(mainPhotoId({ thumbId: "" }, [files[0]])).toBe("");
  });
  test("結果を変える: 変わらないときは、何もしない。変えたら、変えた時刻を残す", () => {
    expect(statusUpdate({ personId: "p1", person: { status: "pending" }, status: "pending", now: 1 })).toEqual({});
    expect(statusUpdate({ personId: "p1", person: { status: "pending" }, status: "???", now: 1 })).toEqual({});
    expect(statusUpdate({ personId: "p1", person: { status: "pending" }, status: "rejected", now: 7 })).toEqual({ "interviews/p1/status": "rejected", "interviews/p1/statusAt": 7, "interviews/p1/updatedAt": 7 });
  });
  test("年齢の確認: 正しい日付だけ。空は、消す", () => {
    expect(ageCheckUpdate({ personId: "p1", date: "2026-11-18", now: 1 })["interviews/p1/ageCheckedAt"]).toBe("2026-11-18");
    expect(ageCheckUpdate({ personId: "p1", date: "", now: 1 })["interviews/p1/ageCheckedAt"]).toBeNull();
    expect(ageCheckUpdate({ personId: "p1", date: "ふつうでない", now: 1 })["interviews/p1/ageCheckedAt"]).toBeNull();
  });
  test("人を消す: 情報・写真・書類の、3つの場所をいっしょに消す", () => {
    expect(removePersonUpdate("p1")).toEqual({ "interviews/p1": null, "interviewFiles/p1": null, "interviewData/p1": null });
  });
});

describe("保存に失敗したときの文", () => {
  test("日本語の理由は、そのまま。権限は、わかる文に。ほかは、やさしい文に", () => {
    expect(saveErrorText(new Error("画像が大きすぎて、小さくできませんでした。"))).toBe("画像が大きすぎて、小さくできませんでした。");
    expect(saveErrorText({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED: Permission denied" })).toContain("権限");
    expect(saveErrorText(new Error("Network error"))).toContain("通信");
    expect(saveErrorText(null)).toContain("保存できませんでした");
  });
});

describe("画像(大きさの計算)", () => {
  test("長いほうが上限に収まるように、縦横の比を保って小さくする。小さい画像は、大きくしない", () => {
    expect(fitSize(4000, 3000, 1200)).toEqual({ w: 1200, h: 900 });
    expect(fitSize(3000, 4000, 1200)).toEqual({ w: 900, h: 1200 });
    expect(fitSize(800, 600, 1200)).toEqual({ w: 800, h: 600 });
    expect(fitSize(0, 0, 1200)).toEqual({ w: 0, h: 0 });
  });
  test("上限に収まらないときの、小さくする順番は、だんだん小さくなる", () => {
    const steps = shrinkSteps(1200, 0.82);
    expect(steps[0]).toEqual([1200, 0.82]);
    steps.slice(1).forEach(([px], i) => expect(px).toBeLessThanOrEqual(steps[i][0]));
    expect(steps.every(([, q]) => q >= 0.5 && q <= 0.85)).toBe(true);
  });
  test("data URL の大きさ(KB)", () => {
    expect(dataUrlSizeKB("")).toBe(0);
    expect(dataUrlSizeKB("a".repeat(4096))).toBe(3);
  });
});
