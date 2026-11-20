import { useState } from "react";
import { cleanPerson, isoDate, LIMITS } from "./interview";
import { S } from "./interview-style";

// 面接した人の情報を入れる欄(新しく登録するときと、あとから直すときの、両方で使う)
// initial: 入っている内容(直すとき)。onSubmit(きれいにした内容)を呼ぶ。
export default function InterviewForm({ initial, submitLabel, onSubmit, onCancel, busy }) {
  const [d, setD] = useState(() => {
    const base = { name: "", interviewDate: isoDate(), phone: "", source: "", note: "", ...initial };
    return { ...base, age: base.age != null ? String(base.age) : "" }; // 年齢は、入力欄の文字として持つ
  });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    const r = cleanPerson(d);
    if (!r.ok) { setErr(r.error); return; }
    setErr("");
    onSubmit(r.value);
  }

  return (
    <form onSubmit={submit} style={{ ...S.card, border: "2px solid #FF8FAB" }} aria-label="面接した人の情報">
      {err && <div role="alert" style={S.err}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <label>
          <span style={S.label}>名前(必ず入れる。呼び名でも、かまいません)</span>
          <input style={S.input} value={d.name} onChange={set("name")} maxLength={LIMITS.name} autoComplete="off" />
        </label>
        <label>
          <span style={S.label}>面接日</span>
          <input style={S.input} type="date" value={d.interviewDate} onChange={set("interviewDate")} />
        </label>
        <label>
          <span style={S.label}>年齢</span>
          <input style={S.input} inputMode="numeric" value={d.age} onChange={set("age")} maxLength={3} autoComplete="off" placeholder="例: 24" />
        </label>
        <label>
          <span style={S.label}>連絡先(電話・LINE など)</span>
          <input style={S.input} value={d.phone} onChange={set("phone")} maxLength={LIMITS.phone} autoComplete="off" />
        </label>
        <label>
          <span style={S.label}>きっかけ(どこで知ったか)</span>
          <input style={S.input} value={d.source} onChange={set("source")} maxLength={LIMITS.source} autoComplete="off" placeholder="例: 求人サイト・紹介" />
        </label>
      </div>
      <label style={{ display: "block", marginTop: 12 }}>
        <span style={S.label}>メモ(面接の印象・希望・気づいたこと)</span>
        <textarea style={{ ...S.input, minHeight: 110, resize: "vertical", lineHeight: 1.6 }} value={d.note} onChange={set("note")} maxLength={LIMITS.note} />
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button type="submit" style={{ ...S.primary, opacity: busy ? 0.6 : 1 }} disabled={busy}>{busy ? "保存しています…" : submitLabel}</button>
        <button type="button" style={S.ghost} onClick={onCancel} disabled={busy}>やめる</button>
      </div>
    </form>
  );
}
