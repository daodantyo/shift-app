import { useEffect, useMemo, useRef, useState } from "react";
import { ref, set, onValue, serverTimestamp } from "firebase/database";
import { db } from "./firebase";
import { MEMO_MAX, MEMO_SAVE_MS, memoDateLines, memoPreview, memoToSave, planExists, readMemo } from "./memo";

const FOLD_KEY = "memoFolded"; // 小さくしているか(この端末だけの覚え書き。覚えられない端末では、毎回、広げて出す)
function loadFolded() { try { return localStorage.getItem(FOLD_KEY) === "1"; } catch { return false; } }
function saveFolded(v) { try { localStorage.setItem(FOLD_KEY, v ? "1" : "0"); } catch { /* 覚えられなくても、使える */ } }
function fmtDateTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const S = {
  box: { background: "#FFF6B8", border: "1.5px solid #E8D56A", borderRadius: 12, boxShadow: "0 3px 10px rgba(180,150,20,0.22)", marginBottom: 16, overflow: "hidden" },
  head: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F6E58A", color: "#6B5300", fontWeight: 800, fontSize: 14 },
  preview: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, fontSize: 13, color: "#3A3000" },
  btn: { font: "inherit", fontSize: 12, fontWeight: 700, border: "1px solid #C8B24A", background: "#FFF9D6", color: "#6B5300", borderRadius: 999, padding: "4px 12px", minHeight: 32, cursor: "pointer", whiteSpace: "nowrap" },
  body: { padding: "10px 12px 8px" },
  ta: { display: "block", width: "100%", boxSizing: "border-box", minHeight: 120, resize: "vertical", border: "1px solid #E3D27A", borderRadius: 8, padding: "8px 10px", font: "inherit", fontSize: 16, lineHeight: "26px", color: "#3A3000", background: "repeating-linear-gradient(#FFF9CF, #FFF9CF 25px, #EFE08A 26px)" },
  foot: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", marginTop: 6, fontSize: 12, color: "#7D6A12" },
  btnHot: { background: "#FF6B9D", border: "1px solid #FF6B9D", color: "#fff", boxShadow: "0 0 0 3px #FFD0E1" },
  plan: { background: "#fff", border: "2px solid #FF8FAB", borderRadius: 12, padding: "10px 12px", marginTop: 10, fontSize: 13, color: "#5C3344" },
  planRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #FFE4EF", cursor: "pointer", minHeight: 36 },
  planDate: { flex: "none", background: "#FFE4EF", color: "#D4789F", borderRadius: 4, padding: "1px 6px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  planGo: { display: "block", width: "100%", marginTop: 10, background: "linear-gradient(135deg, #FFB6D5, #FF8FAB)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" },
  planNote: { fontSize: 11, color: "#7a4a5e", marginTop: 8, lineHeight: 1.7 },
};

// 予定表に入れる日付の見た目: 「11/20(金)」。年が今年でないときは、「2027/1/5(火)」
function dateLabel(it, thisYear) {
  return `${it.year === thisYear ? "" : `${it.year}/`}${it.month}/${it.day}(${it.weekday})`;
}

/* ================= メモ帳(「キャスト管理」の、上のタブのすぐ下。どのタブでも出る) =================
   お店のログインを開いた人みんなで、同じメモを使う(パソコンでもスマホでも)。書いたら、入力が止まって少し経つと、自動で保存する。
   保存先: shops/<お店ID>/memo(お店のログインだけが読み書きできる。キャストの画面には出ない)。計算は src/memo.js
   「予定表に入れる」: メモの、日付で始まる行(例: 「11/20 家賃の振り込み」)を選んで、予定表に入れる(メモの文字は、変えない)。
   schedule = 予定表のいまの中身、onAddPlans(items) = 予定表に足す(足した件数を返す)。どちらも App.jsx から受け取る */
export default function MemoPad({ path, schedule, onAddPlans }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState(0); // 最後に書いた日時
  const [loaded, setLoaded] = useState(false);
  const [folded, setFolded] = useState(loadFolded);
  const [state, setState] = useState("saved"); // saved / dirty(書いている)/ saving / error
  const dirty = useRef(false); // 書き換えたが、まだ保存していない
  const latest = useRef("");
  const timer = useRef(null);
  const flushRef = useRef(null);
  const [planOpen, setPlanOpen] = useState(false); // 「予定表に入れる」の枠を開いているか
  const [skipped, setSkipped] = useState({}); // 外したチェック { 「日付|文字」: true }(外していない行は、チェックが付いている)
  const [planMsg, setPlanMsg] = useState("");

  // ほかの端末で書いた内容を受け取る。ここで書いている途中(まだ保存していない)のときは、上書きしない
  useEffect(() => onValue(ref(db, path), (s) => {
    const m = readMemo(s.val());
    setAt(m.at);
    if (!dirty.current) { setText(m.text); latest.current = m.text; }
    setLoaded(true);
  }, () => setLoaded(true)), [path]);

  async function flush() {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false; // いま保存する分。保存しているあいだに、さらに書かれたら、また「書いている」になる
    setState("saving");
    try {
      await set(ref(db, path), memoToSave(latest.current, serverTimestamp()));
      setState(dirty.current ? "dirty" : "saved");
    } catch (err) {
      dirty.current = true; // 保存できなかった分は、まだ、保存していない
      setState("error");
    }
  }
  useEffect(() => { flushRef.current = flush; }); // 画面を描いたあとに、いちばん新しい flush を入れておく(閉じるとき・止まったときに呼ぶ)

  // 画面を閉じる・隠すときは、すぐ保存する(保存を待っている分を、取りこぼさない)
  useEffect(() => {
    const go = () => { flushRef.current?.(); };
    const onHide = () => { if (document.visibilityState === "hidden") go(); };
    window.addEventListener("pagehide", go);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", go); document.removeEventListener("visibilitychange", onHide); go(); };
  }, []);

  function change(e) {
    const v = e.target.value;
    setText(v);
    latest.current = v;
    dirty.current = true;
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current?.(), MEMO_SAVE_MS);
  }
  function toggle() { const next = !folded; setFolded(next); saveFolded(next); }

  // 予定表に入れられる行(メモの、日付で始まる行)。もう予定表に入っている行は、「入っています」と出して、選べない
  const cands = useMemo(() => memoDateLines(text, new Date()), [text, planOpen]);
  const rows = cands.map((c) => ({ ...c, have: planExists(schedule, c.dateStr, c.text) }));
  const fresh = rows.filter((r) => !r.have);
  const chosen = fresh.filter((r) => !skipped[r.key]);
  const thisYear = new Date().getFullYear();
  function addPlans() {
    if (chosen.length === 0 || !onAddPlans) return;
    const n = onAddPlans(chosen.map((r) => ({ dateStr: r.dateStr, text: r.text })));
    setPlanMsg(n > 0 ? `${n}件を、予定表に入れました。「予定表」のタブで見られます。` : "入れる予定は、ありませんでした。");
  }

  const preview = memoPreview(text);
  const stateText = state === "saving" ? "保存しています…" : state === "dirty" ? "書いています…(止まると、自動で保存します)" : state === "error" ? "保存できていません。" : "自動で保存されます";
  return (
    <section style={S.box} aria-label="メモ帳">
      <div style={{ ...S.head, flexWrap: folded ? "nowrap" : "wrap", cursor: folded ? "pointer" : "default" }} onClick={folded ? toggle : undefined}>
        <span>📝 メモ帳</span>
        {folded && <span style={S.preview}>{preview || "(まだ、書いていません)"}</span>}
        <span style={{ flex: 1 }} />
        {!folded && onAddPlans && (
          <button type="button" style={{ ...S.btn, ...(fresh.length > 0 ? S.btnHot : null) }} aria-expanded={planOpen} onClick={(e) => { e.stopPropagation(); setPlanOpen((v) => !v); setPlanMsg(""); }}>
            📅 予定表に入れる{fresh.length > 0 ? `(${fresh.length})` : ""}
          </button>
        )}
        <button type="button" style={S.btn} aria-expanded={!folded} onClick={(e) => { e.stopPropagation(); toggle(); }}>{folded ? "広げる" : "小さくする"}</button>
      </div>
      {!folded && (
        <div style={S.body}>
          <textarea style={S.ta} value={text} onChange={change} onBlur={flush} maxLength={MEMO_MAX} rows={5} disabled={!loaded} aria-label="メモ" placeholder="ここに、メモを書けます。書いたら、自動で保存されます。" />
          <div style={S.foot}>
            <span style={state === "error" ? { color: "#B3261E", fontWeight: 700 } : undefined}>{stateText}</span>
            {state === "error" && <button type="button" style={S.btn} onClick={flush}>保存し直す</button>}
            <span>{at ? `最後に書いた日時: ${fmtDateTime(at)}` : "まだ、書いていません"}</span>
            <span>{text.length} / {MEMO_MAX}文字</span>
          </div>
          {planOpen && onAddPlans && (
            <div style={S.plan} role="region" aria-label="予定表に入れる">
              <b>📅 予定表に入れる行を選んでください</b>
              {rows.length === 0 ? (
                <div style={S.planNote}>日付で始まる行が、ありません。<br />例:「11/20 家賃の振り込み」のように、行の先頭に日付を書くと、ここに出ます。</div>
              ) : (
                <>
                  {rows.map((r) => (
                    <label key={r.line} style={{ ...S.planRow, opacity: r.have ? 0.6 : 1 }}>
                      <input type="checkbox" style={{ width: 18, height: 18, accentColor: "#FF6B9D", flex: "none" }} checked={!r.have && !skipped[r.key]} disabled={r.have} onChange={() => setSkipped((s) => ({ ...s, [r.key]: !s[r.key] }))} />
                      <span style={S.planDate}>{dateLabel(r, thisYear)}</span>
                      <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{r.text}</span>
                      {r.have && <span style={{ ...S.planDate, background: "#E3F4E6", color: "#2E7D32" }}>入っています</span>}
                    </label>
                  ))}
                  <button type="button" style={{ ...S.planGo, opacity: chosen.length ? 1 : 0.5, cursor: chosen.length ? "pointer" : "default" }} disabled={chosen.length === 0} onClick={addPlans}>
                    {chosen.length ? `選んだ${chosen.length}件を、予定表に入れる` : "入れる行を選んでください"}
                  </button>
                </>
              )}
              {planMsg && <div role="status" style={{ marginTop: 8, color: "#2E7D32", fontWeight: 700 }}>✓ {planMsg}</div>}
              <div style={S.planNote}>予定表の「やること・メモ」として入ります。メモの文字は、そのまま残ります。日付が書いていない行は、出ません。</div>
              <button type="button" style={{ ...S.btn, marginTop: 6 }} onClick={() => { setPlanOpen(false); setPlanMsg(""); }}>閉じる</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
