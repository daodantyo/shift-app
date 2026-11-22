import { castRecordCounts, removeCastConfirm } from "./cast-remove";

describe("castRecordCounts: 消すと画面から消える記録の数", () => {
  const shifts = {
    10: {
      "Mon Nov 02 2026": { status: "work", in: "17:00", out: "01:00" },
      "Tue Nov 03 2026": { status: "off", in: "", out: "" },
      "Wed Nov 04 2026": { status: "work", in: "17:00", out: "01:00" },
    },
    20: { "Mon Nov 02 2026": { status: "work" } },
  };
  const stats = {
    10: {
      "Mon Nov 02 2026": { douhan: 1, shimei: 0, drink: 0, sales: "" },
      "Tue Nov 03 2026": { douhan: 0, shimei: 0, drink: 0, sales: "" }, // 全部ゼロの日は、数えない
      "Wed Nov 04 2026": { douhan: 0, shimei: 0, drink: 2, sales: "30000" },
    },
  };

  test("出勤は、休み(off)以外の日。指名・ドリンク・売上は、どれか1つでも入っている日", () => {
    expect(castRecordCounts(10, shifts, stats)).toEqual({ worked: 2, stat: 2 });
  });
  test("ほかの女性の記録は、数えない", () => {
    expect(castRecordCounts(20, shifts, stats)).toEqual({ worked: 1, stat: 0 });
  });
  test("記録がない女性や、まだ読み込んでいないとき(undefined)は、0", () => {
    expect(castRecordCounts(99, shifts, stats)).toEqual({ worked: 0, stat: 0 });
    expect(castRecordCounts(10, undefined, undefined)).toEqual({ worked: 0, stat: 0 });
  });
  test("壊れた値(文字・null)があっても、落ちない", () => {
    const bad = { 10: { a: null, b: "x", c: { status: "work" }, d: { sales: "abc", douhan: "1" } } };
    expect(castRecordCounts(10, bad, bad)).toEqual({ worked: 1, stat: 1 });
  });
});

describe("removeCastConfirm: 確認の文", () => {
  test("記録がなくても、元に戻せないことと、バックアップのことを伝える", () => {
    const t = removeCastConfirm("さくら", { worked: 0, stat: 0 });
    expect(t).toMatch(/さくら さんを、キャストの一覧から削除しますか？/);
    expect(t).toMatch(/元に戻せません/);
    expect(t).toMatch(/バックアップ/);
    expect(t).not.toMatch(/記録（/);
    expect(removeCastConfirm("さくら", undefined)).toBe(t); // 数えられなかったときも、同じ文
  });
  test("記録があれば、数と、「画面には出なくなる」ことを足す(0の内訳は出さない)", () => {
    const t = removeCastConfirm("あい", { worked: 12, stat: 0 });
    expect(t).toMatch(/あい さんの記録（出勤 12 日）は、データには残りますが、一覧・集計・ランキングには出なくなります/);
    expect(t).not.toMatch(/指名・売上などの記録/);
    expect(removeCastConfirm("あい", { worked: 12, stat: 5 })).toMatch(/（出勤 12 日、指名・売上などの記録 5 日）/);
  });
});
