// Google の許可の画面まわりの、画面に出す文の試験(部品の動きは、gcal.test.js)。
import { googleErrorText, pushFailText, GOOGLE_WAIT_TEXT, GOOGLE_WARN_HELP } from "./gcal-google";

describe("許可の画面が開いているあいだの案内", () => {
  test("警告の画面で、押すのは、左の小さい「続行」だと書いてある。大きい青いボタンは、やめる意味だと書いてある", () => {
    expect(GOOGLE_WAIT_TEXT).toContain("左の小さい「続行」");
    expect(GOOGLE_WAIT_TEXT).toContain("安全なページに戻る");
    expect(GOOGLE_WAIT_TEXT).toContain("チェック");
  });
  test("いつもの説明に足す一言は、「続行」を案内している", () => {
    expect(GOOGLE_WARN_HELP).toContain("続行");
  });
});

describe("許可の画面で、閉じた・断ったとき", () => {
  test("閉じられた: もう一度押す・「続行」・青いボタンはやめたことになる、が分かる", () => {
    const t = googleErrorText({ code: "popup_closed" });
    expect(t).toContain("閉じられました");
    expect(t).toContain("続行");
    expect(t).toContain("安全なページに戻る");
  });
  test("許可されなかった: 「続行」が案内される", () => {
    expect(googleErrorText({ code: "access_denied" })).toContain("続行");
  });
  test("ほかの理由は、これまでどおり(コードが出る)", () => {
    expect(googleErrorText({ code: "popup_failed_to_open" })).toContain("ポップアップ");
    expect(googleErrorText({ code: "gsi_load" })).toContain("読み込めませんでした");
    expect(googleErrorText({ code: "xyz" })).toContain("（xyz）");
  });
});

describe("予定を入れられなかった理由の文", () => {
  test("カレンダーの項目のチェックが外れていたとき(403 insufficientPermissions)は、チェックを入れる、と案内する", () => {
    expect(pushFailText({ status: 403, reason: "insufficientPermissions" })).toContain("チェック");
  });
  test("API がオフ・許可を受け取れない(401)・それ以外は、これまでどおり", () => {
    expect(pushFailText({ status: 403, reason: "accessNotConfigured" })).toContain("API");
    expect(pushFailText({ status: 401, reason: "" })).toContain("許可");
    expect(pushFailText({ status: 400, reason: "invalid", detail: "でたらめ" })).toBe("でたらめ");
    expect(pushFailText({ status: 500, reason: "" })).toBe("番号 500");
    expect(pushFailText(undefined)).toBe("不明");
  });
});
