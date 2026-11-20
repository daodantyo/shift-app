import { useEffect, useMemo, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { db } from "./firebase";
import { STATUSES, statusOf, readPeople, filterPeople, countByFilter, newPersonRecord, makeId, fmtDate, isDue, saveErrorText } from "./interview";
import { S, badgeStyle } from "./interview-style";
import InterviewForm from "./InterviewForm";
import InterviewDetail from "./InterviewDetail";

/* ================= 「面接」タブ(キャスト管理の、上のタブの1つ) =================
   面接した女性の、情報・写真・書類を、置いておく。お店のログインをした人だけが、読み書きできる(キャストの画面には、出ない)。
   保存先は shops/<お店ID>/ の下(interviews / interviewFiles / interviewData)。計算は src/interview.js
   base = shops/<お店ID>(App.jsx から受け取る) */
export default function InterviewTab({ base }) {
  const [people, setPeople] = useState(null); // null = 読み込み中
  const [loadError, setLoadError] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => onValue(ref(db, `${base}/interviews`), (s) => { setPeople(readPeople(s.val())); setLoadError(false); }, () => { setPeople([]); setLoadError(true); }), [base]);

  const list = people || [];
  const counts = useMemo(() => countByFilter(list), [list]);
  const shown = useMemo(() => filterPeople(list, { query, filter }), [list, query, filter]);
  const open = openId ? list.find((p) => p.id === openId) : null;

  async function create(clean) {
    setBusy(true);
    setError("");
    const id = makeId("p");
    try {
      await update(ref(db, base), { [`interviews/${id}`]: newPersonRecord(clean, Date.now()) });
      setCreating(false);
      setOpenId(id); // 登録したら、そのまま、その人の画面へ(写真・書類を入れられる)
    } catch (e) {
      setError(saveErrorText(e));
    }
    setBusy(false);
  }

  const lock = (
    <div style={S.lock}>🔒 この画面は、お店のログインをした人だけが見られます。写真や書類は、外のサービスや AI には、送りません。</div>
  );

  if (open) {
    return <div>{lock}<InterviewDetail key={open.id} base={base} person={open} onBack={() => setOpenId(null)} /></div>;
  }

  return (
    <div>
      {lock}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>面接した人({list.length}人)</div>
        <button type="button" style={S.primary} aria-expanded={creating} onClick={() => { setCreating((v) => !v); setError(""); }}>🌸 面接を登録する</button>
      </div>

      {creating && (
        <>
          {error && <div role="alert" style={S.err}>{error}</div>}
          <InterviewForm submitLabel="登録する" onSubmit={create} onCancel={() => setCreating(false)} busy={busy} />
        </>
      )}
      {loadError && <div role="alert" style={S.err}>読み込めませんでした。通信を確かめて、読み込み直してください。</div>}

      {counts.due > 0 && filter !== "due" && (
        <div style={{ background: "#FFF7E0", border: "2px solid #FFD666", borderRadius: 12, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180, fontSize: 13, fontWeight: 700, color: "#8a6d1a", lineHeight: 1.7 }}>
            🗓 不採用・辞退から半年たった人が、{counts.due}人います。記録を、そろそろ消しましょう。
            <div style={{ fontWeight: 500, fontSize: 12 }}>お知らせだけです。自動では、消えません。</div>
          </div>
          <button type="button" style={S.chip} onClick={() => setFilter("due")}>見る</button>
        </div>
      )}

      <input type="search" aria-label="探す" placeholder="名前・連絡先・きっかけ・メモで探す" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...S.input, marginBottom: 10 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button type="button" aria-pressed={filter === "all"} style={{ ...S.chip, ...(filter === "all" ? S.chipOn : null) }} onClick={() => setFilter("all")}>すべて {counts.all}</button>
        {STATUSES.map((s) => (
          <button key={s.id} type="button" aria-pressed={filter === s.id} style={{ ...S.chip, ...(filter === s.id ? S.chipOn : null) }} onClick={() => setFilter(filter === s.id ? "all" : s.id)}>{s.label} {counts[s.id]}</button>
        ))}
        {filter === "due" && <button type="button" aria-pressed style={{ ...S.chip, ...S.chipOn }} onClick={() => setFilter("all")}>消す時期 {counts.due} ✕</button>}
      </div>

      {people === null ? (
        <div style={S.note}>読み込んでいます…</div>
      ) : shown.length === 0 ? (
        <div style={{ ...S.card, ...S.note, textAlign: "center" }}>
          {list.length === 0 ? "まだ、面接した人が登録されていません。「面接を登録する」から、入れられます。" : "あてはまる人が、いません。"}
        </div>
      ) : shown.map((p) => <PersonRow key={p.id} p={p} onOpen={() => setOpenId(p.id)} />)}

      <div style={{ ...S.note, marginTop: 14 }}>
        ※ 画面の撮影(スクリーンショット)は、止められません。<br />
        ※ データの自動バックアップは、まだありません。上の「キャスト」タブの「バックアップ」にも、面接の写真・書類は、入りません。
      </div>
    </div>
  );
}

function PersonRow({ p, onOpen }) {
  const st = statusOf(p.status);
  const due = isDue(p);
  return (
    <button type="button" onClick={onOpen} aria-label={`${p.name} を開く`} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", font: "inherit", background: "#fff", border: "1.5px solid #FFE4EF", borderRadius: 14, padding: 10, marginBottom: 8, cursor: "pointer", minHeight: 76 }}>
      {p.thumb ? (
        <img src={p.thumb} alt="" draggable={false} style={{ width: 52, height: 66, objectFit: "cover", borderRadius: 8, flex: "none" }} />
      ) : (
        <div aria-hidden="true" style={{ width: 52, height: 66, borderRadius: 8, flex: "none", background: "linear-gradient(135deg, #FFB6D5, #FF8FAB)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 }}>{Array.from(p.name)[0]}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#5C3344", wordBreak: "break-word" }}>
          {p.name}{p.age != null && <span style={{ fontWeight: 500, fontSize: 13, color: "#999", marginLeft: 8 }}>{p.age}歳</span>}
        </div>
        <div style={{ fontSize: 12, color: "#8a6d7a", marginTop: 3, lineHeight: 1.6 }}>
          面接 {fmtDate(p.interviewDate, true) || "—"} ・ 写真 {p.photoCount} ・ 書類 {p.docCount}
          {p.ageCheckedAt && <span style={{ color: "#2E7D32", fontWeight: 700 }}> ・ 年齢確認ずみ</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "none" }}>
        <span style={badgeStyle(st)}>{st.label}</span>
        {due && <span style={{ ...S.badge, background: "#FFF3CD", color: "#8A6D1A", fontSize: 11 }}>消す時期</span>}
      </div>
    </button>
  );
}
