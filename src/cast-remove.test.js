import { castRemovalPlan, removeCastConfirm } from "./cast-remove";

// 女性 10(さくら)と 20(あい)。さくらは、LINE 登録・希望シフト・抽選の記録つき
const base = () => ({
  cast: [{ id: 10, name: "さくら" }, { id: 20, name: "あい" }, { id: 30, name: "みお" }],
  shifts: {
    10: {
      "Mon Nov 02 2026": { status: "work", in: "17:00", out: "01:00" },
      "Tue Nov 03 2026": { status: "off", in: "", out: "" },
      "Wed Nov 04 2026": { status: "work", in: "17:00", out: "01:00" },
    },
    20: { "Mon Nov 02 2026": { status: "work" } },
  },
  stats: {
    10: {
      "Mon Nov 02 2026": { douhan: 1, shimei: 0, drink: 0, sales: "" },
      "Tue Nov 03 2026": { douhan: 0, shimei: 0, drink: 0, sales: "" }, // 全部ゼロの日は、数えない
      "Wed Nov 04 2026": { douhan: 0, shimei: 0, drink: 2, sales: "30000" },
    },
    20: { "Mon Nov 02 2026": { douhan: 5 } },
  },
  requests: {
    "-Kaaa": { castId: 10, status: "pending" },
    "-Kbbb": { castId: "10", status: "approved" }, // ID が文字でも、同じ女性
    "-Kccc": { castId: 20, status: "pending" },
  },
  castLine: {
    10: { castId: 10, lineUserId: "Uaaa" },
    20: { castId: 20, lineUserId: "Ubbb" },
  },
  lottery: {
    Uaaa: { "2026-11-01": { result: "win" }, "2026-11-02": { result: "lose" } },
    Ubbb: { "2026-11-01": { result: "lose" } },
  },
});

describe("castRemovalPlan: 完全に削除で、消すもの", () => {
  test("名簿・出勤・指名売上・LINE の登録・希望シフト・抽選の記録を、全部、消す(null)。ほかの人の分は、残す", () => {
    const plan = castRemovalPlan(10, base());
    expect(plan.updates).toEqual({
      "data/cast": [{ id: 20, name: "あい" }, { id: 30, name: "みお" }],
      "data/shifts/10": null,
      "data/stats/10": null,
      "castLine/10": null,
      "shiftRequests/-Kaaa": null,
      "shiftRequests/-Kbbb": null, // 文字の ID の希望シフトも
      "lottery/Uaaa": null,
    });
    expect(Object.keys(plan.newShifts)).toEqual(["20"]);
    expect(Object.keys(plan.newStats)).toEqual(["20"]);
    expect(plan.newCast.map((c) => c.id)).toEqual([20, 30]);
  });

  test("数は、出勤した日・指名や売上を入れた日・希望シフトの件数・LINE の登録・抽選の日数", () => {
    expect(castRemovalPlan(10, base()).counts).toEqual({ worked: 2, stat: 2, requests: 2, line: true, lottery: 2 });
    expect(castRemovalPlan(20, base()).counts).toEqual({ worked: 1, stat: 1, requests: 1, line: true, lottery: 1 });
  });

  test("記録が何もない女性は、名簿と、空の記録(null)だけ。落ちない", () => {
    const plan = castRemovalPlan(30, base());
    expect(plan.updates).toEqual({ "data/cast": [{ id: 10, name: "さくら" }, { id: 20, name: "あい" }], "data/shifts/30": null, "data/stats/30": null });
    expect(plan.counts).toEqual({ worked: 0, stat: 0, requests: 0, line: false, lottery: 0 });
  });

  test("まだ読み込んでいない(undefined)ものがあっても、落ちない", () => {
    const plan = castRemovalPlan(10, { cast: [{ id: 10, name: "さくら" }] });
    expect(plan.newCast).toEqual([]);
    expect(plan.updates).toEqual({ "data/cast": [], "data/shifts/10": null, "data/stats/10": null });
    expect(plan.counts).toEqual({ worked: 0, stat: 0, requests: 0, line: false, lottery: 0 });
    expect(() => castRemovalPlan(10)).not.toThrow();
  });

  test("同じ LINE の ID を、ほかの(残る)キャストも使っているときは、抽選の記録は、消さない", () => {
    const data = base();
    data.castLine[30] = { castId: 30, lineUserId: "Uaaa" }; // みおも、同じ LINE
    const plan = castRemovalPlan(10, data);
    expect(plan.updates["lottery/Uaaa"]).toBeUndefined();
    expect(plan.updates["castLine/10"]).toBeNull(); // その女性の LINE の登録は、消す
    expect(plan.counts.lottery).toBe(0);
  });

  test("もう名簿にいないキャストの、古い LINE の登録は、「ほかのキャスト」に数えない", () => {
    const data = base();
    data.castLine[99] = { castId: 99, lineUserId: "Uaaa" }; // 99 は、名簿にいない
    expect(castRemovalPlan(10, data).updates["lottery/Uaaa"]).toBeNull();
  });

  test("もとのデータを、書き換えない", () => {
    const data = base();
    const copy = JSON.parse(JSON.stringify(data));
    castRemovalPlan(10, data);
    expect(data).toEqual(copy);
  });
});

describe("removeCastConfirm: 確認の文", () => {
  test("記録がなくても、名簿が消えることと、元に戻せないこと、バックアップのことを伝える", () => {
    const t = removeCastConfirm("さくら", { worked: 0, stat: 0, requests: 0, line: false, lottery: 0 });
    expect(t).toMatch(/さくら さんを、完全に削除しますか？/);
    expect(t).toMatch(/・キャストの名簿/);
    expect(t).toMatch(/元に戻せません/);
    expect(t).toMatch(/バックアップ/);
    expect(t).toMatch(/「報酬」「面接」の記録は、消えません/);
    expect(t).not.toMatch(/出勤の記録/);
    expect(removeCastConfirm("さくら", undefined)).toBe(t); // 数えられなかったときも、同じ文
  });
  test("記録があれば、消えるものを、数つきで、ならべる(0のものは、出さない)", () => {
    const t = removeCastConfirm("あい", { worked: 12, stat: 0, requests: 3, line: true, lottery: 5 });
    expect(t).toMatch(/・出勤の記録（12 日）/);
    expect(t).toMatch(/・LINE の登録/);
    expect(t).toMatch(/・届いている希望シフト（3 件）/);
    expect(t).toMatch(/・抽選の記録（5 日）/);
    expect(t).not.toMatch(/指名・ドリンク・売上の記録/);
  });
});
