// 勤務時間の入力（開始・終了を 時・分 のプルダウンで選ぶ）
// 値は "20:00〜01:00" の形の文字列で保存する

// 深夜営業に合わせて 24〜29 時（翌0〜5時）も選べるようにする
const HOURS = Array.from({ length: 30 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

// "20:00〜01:00" / "20:00-01:00" / "20：00～01：00" などを分解する
// 片側だけ（"20:00〜" や "〜01:00"）や分なし（"20〜1"）でも読めるようにする（入力途中で消えないため）
export function parseHours(str) {
  const s = String(str || "").replace(/：/g, ":").replace(/[～\-–—~]/g, "〜").replace(/\s/g, "");
  const [a = "", b = ""] = s.split("〜");
  const one = (x) => {
    const m = x.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return { h: "", m: "" };
    return { h: m[1].padStart(2, "0"), m: (m[2] || "0").padStart(2, "0") };
  };
  const A = one(a), B = one(b);
  return { sh: A.h, sm: A.m, eh: B.h, em: B.m };
}

function join({ sh, sm, eh, em }) {
  if (!sh && !eh) return "";
  const a = sh ? `${sh}:${sm || "00"}` : "";
  const b = eh ? `${eh}:${em || "00"}` : "";
  return `${a}〜${b}`;
}

export default function HoursInput({ value, onChange, compact }) {
  const v = parseHours(value);
  const set = (k) => (e) => onChange(join({ ...v, [k]: e.target.value }));
  const sel = (val, k, list, blank) => (
    <select value={val} onChange={set(k)} className="hours-sel">
      <option value="">{blank}</option>
      {list.map((x) => <option key={x} value={x}>{x}</option>)}
    </select>
  );
  return (
    <div className={"hours-input" + (compact ? " compact" : "")}>
      {sel(v.sh, "sh", HOURS, "時")}<span>:</span>{sel(v.sm, "sm", MINUTES, "分")}
      <span className="hours-sep">〜</span>
      {sel(v.eh, "eh", HOURS, "時")}<span>:</span>{sel(v.em, "em", MINUTES, "分")}
      {value ? <button type="button" className="hours-clear" title="消す" onClick={() => onChange("")}>×</button> : null}
    </div>
  );
}
