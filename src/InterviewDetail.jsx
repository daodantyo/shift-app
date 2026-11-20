import { useEffect, useState } from "react";
import { ref, onValue, get, update, increment } from "firebase/database";
import { db } from "./firebase";
import { makeImageSet } from "./image";
import {
  STATUSES, DOC_TYPES, ID_LABELS, IMAGE_LIMITS, docTypeOf, statusOf, readFiles, readImageData, isDue, isoDate, fmtDate, fmtStamp, makeId, mainPhotoId,
  addFileUpdate, removeFileUpdate, setMainPhotoUpdate, statusUpdate, ageCheckUpdate, removePersonUpdate, personEditUpdate, saveErrorText,
} from "./interview";
import { S, badgeStyle } from "./interview-style";
import InterviewForm from "./InterviewForm";

/* ================= 大きく見る画面(「開く」「写真を押す」を押したときだけ、大きな画像を読む) ================= */
function Viewer({ base, personId, file, isMain, onClose, onMain, onDelete }) {
  const [data, setData] = useState(null); // null = 読み込み中、"" = 読めなかった
  useEffect(() => {
    let alive = true;
    get(ref(db, `${base}/interviewData/${personId}/${file.id}`))
      .then((s) => { if (alive) setData(readImageData(s.val())); })
      .catch(() => { if (alive) setData(""); });
    return () => { alive = false; };
  }, [base, personId, file.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isDoc = file.kind === "doc";
  const title = isDoc ? `${docTypeOf(file.docType).label}${file.label ? `(${file.label})` : ""}` : "写真";
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(24,12,18,0.94)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 12px" }}>
        <div style={{ color: "#fff", fontWeight: 800, flex: 1, minWidth: 120 }}>{title}</div>
        {!isDoc && !isMain && <button type="button" style={{ ...S.ghost, minHeight: 40 }} onClick={onMain}>⭐ メインの写真にする</button>}
        <button type="button" style={{ ...S.danger, minHeight: 40 }} onClick={onDelete}>{isDoc ? "この書類を消す" : "この写真を消す"}</button>
        <button type="button" style={{ ...S.primary, minHeight: 40 }} onClick={onClose} autoFocus>閉じる</button>
      </div>
      {isDoc && <div style={{ color: "#FFD666", fontSize: 12, fontWeight: 700, padding: "0 12px 6px" }}>⚠ 個人情報です。まわりに人がいない所で、ご覧ください。</div>}
      <div onClick={onClose} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, overflow: "auto" }}>
        {data === null && <div style={{ color: "#fff" }}>読み込んでいます…</div>}
        {data === "" && <div style={{ color: "#FFB3B3", fontWeight: 700 }}>画像を読み込めませんでした。</div>}
        {data && <img src={data} alt={title} draggable={false} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }} onClick={(e) => e.stopPropagation()} />}
      </div>
    </div>
  );
}

/* ================= ひとりの画面 ================= */
export default function InterviewDetail({ base, person, onBack }) {
  const personId = person.id;
  const [files, setFiles] = useState(null); // null = 読み込み中
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" }); // type: "ok" / "err"
  const [viewing, setViewing] = useState(null); // 大きく見ている写真・書類
  const [docOpen, setDocOpen] = useState(false);
  const [docType, setDocType] = useState("id");
  const [docLabel, setDocLabel] = useState("");

  useEffect(() => onValue(ref(db, `${base}/interviewFiles/${personId}`), (s) => setFiles(readFiles(s.val())), () => setFiles([])), [base, personId]);

  const upd = (u) => (Object.keys(u).length ? update(ref(db, base), u) : Promise.resolve()); // 書き換えるものがないときは、何も送らない
  const photos = (files || []).filter((f) => f.kind === "photo");
  const docs = (files || []).filter((f) => f.kind === "doc");
  const mainId = mainPhotoId(person, files || []);
  const st = statusOf(person.status);
  const due = isDue(person);

  async function run(fn, okText) {
    setMsg({ type: "", text: "" });
    try { await fn(); if (okText) setMsg({ type: "ok", text: okText }); }
    catch (e) { setMsg({ type: "err", text: saveErrorText(e) }); }
  }

  // 写真・書類を、小さくして、保存する(1枚ずつ。失敗した分は、理由を出す)
  async function addImages(fileList, kind) {
    const list = Array.from(fileList || []);
    if (!list.length) return;
    setBusy(true);
    setMsg({ type: "", text: "" });
    const errs = [];
    let done = 0;
    let hasMain = !!person.thumb;
    for (let i = 0; i < list.length; i++) {
      setProgress(`${i + 1} / ${list.length} 枚を、保存しています…`);
      try {
        const img = await makeImageSet(list[i], kind === "photo" ? IMAGE_LIMITS.photo : IMAGE_LIMITS.doc);
        await upd(addFileUpdate({ personId, fileId: makeId("f"), kind, docType, label: docLabel, data: img.data, thumb: img.thumb, mini: img.mini, kb: img.kb, hasMainPhoto: hasMain, now: Date.now(), inc: increment }));
        if (kind === "photo") hasMain = true;
        done += 1;
      } catch (e) {
        errs.push(`${list[i].name || `${i + 1}枚目`}: ${saveErrorText(e)}`);
      }
    }
    setProgress("");
    setBusy(false);
    if (kind === "doc" && done > 0) { setDocOpen(false); setDocLabel(""); }
    setMsg(errs.length ? { type: "err", text: `${done}枚を保存しました。保存できなかった分: ${errs.join(" / ")}` } : { type: "ok", text: `${done}枚を保存しました。` });
  }

  function removeFile(file) {
    const what = file.kind === "doc" ? "この書類" : "この写真";
    if (!window.confirm(`${what}を消します。元に戻せません。よろしいですか?`)) return;
    setViewing(null);
    run(() => upd(removeFileUpdate({ personId, file, person, files: files || [], now: Date.now(), inc: increment })), `${what}を消しました。`);
  }
  function setMain(file) {
    setViewing(null);
    run(() => upd(setMainPhotoUpdate({ personId, file, now: Date.now() })), "メインの写真を変えました。一覧に出る顔写真になります。");
  }
  function removePerson() {
    if (!window.confirm(`「${person.name}」の記録を、すべて消します。\n写真 ${photos.length} 枚・書類 ${docs.length} 点も、いっしょに消えます。\n元に戻せません。よろしいですか?`)) return;
    run(async () => { await upd(removePersonUpdate(personId)); onBack(); });
  }
  async function saveInfo(clean) {
    setBusy(true);
    await run(async () => { await upd(personEditUpdate(personId, clean, Date.now())); setEditing(false); }, "直しました。");
    setBusy(false);
  }

  const idDocs = docs.filter((d) => d.docType === "id");
  return (
    <div>
      <button type="button" style={{ ...S.ghost, marginBottom: 12 }} onClick={onBack}>← 一覧にもどる</button>

      {due && (
        <div style={{ background: "#FFF7E0", border: "2px solid #FFD666", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#8a6d1a", fontWeight: 700, lineHeight: 1.7 }}>
          🗓 {st.label}にしてから、半年たちました。この人の記録(写真・書類)を、そろそろ消しましょう。
          <div style={{ fontWeight: 500, fontSize: 12 }}>お知らせだけです。自動では、消えません。</div>
        </div>
      )}
      {msg.text && <div role={msg.type === "err" ? "alert" : "status"} style={msg.type === "err" ? S.err : { ...S.ok, marginBottom: 10 }}>{msg.type === "ok" ? "✓ " : ""}{msg.text}</div>}

      {/* 情報 */}
      {editing ? (
        <InterviewForm initial={person} submitLabel="直したことを保存する" onSubmit={saveInfo} onCancel={() => setEditing(false)} busy={busy} />
      ) : (
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, fontSize: 22, color: "#5C3344", flex: 1, minWidth: 0, wordBreak: "break-word" }}>{person.name}</div>
            <span style={badgeStyle(st)}>{st.label}</span>
            <button type="button" style={S.ghost} onClick={() => setEditing(true)}>直す</button>
          </div>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: "12px 0 0", fontSize: 14, color: "#5C3344" }}>
            <dt style={S.label}>面接日</dt><dd style={{ margin: 0 }}>{fmtDate(person.interviewDate) || "—"}</dd>
            <dt style={S.label}>年齢</dt><dd style={{ margin: 0 }}>{person.age != null ? `${person.age}歳` : "—"}</dd>
            <dt style={S.label}>連絡先</dt><dd style={{ margin: 0, wordBreak: "break-all" }}>{person.phone || "—"}</dd>
            <dt style={S.label}>きっかけ</dt><dd style={{ margin: 0 }}>{person.source || "—"}</dd>
            <dt style={S.label}>メモ</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7 }}>{person.note || "—"}</dd>
          </dl>
        </div>
      )}

      {/* 結果 */}
      <div style={S.card}>
        <div style={S.h}>結果</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {STATUSES.map((s) => (
            <button key={s.id} type="button" aria-pressed={person.status === s.id} style={{ ...S.chip, ...(person.status === s.id ? { background: s.fg, border: `1.5px solid ${s.fg}`, color: "#fff" } : null) }}
              onClick={() => run(() => upd(statusUpdate({ personId, person, status: s.id, now: Date.now() })))}>{s.label}</button>
          ))}
        </div>
        {(person.status === "rejected" || person.status === "declined") && (
          <div style={{ ...S.note, marginTop: 8 }}>不採用・辞退の人の記録は、半年後に消しましょう(その時期に、お知らせが出ます。自動では、消えません)。</div>
        )}
      </div>

      {/* 年齢の確認 */}
      <div style={S.card}>
        <div style={S.h}>身分証で、年齢を確認した日</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input aria-label="年齢を確認した日" type="date" style={{ ...S.input, width: "auto" }} value={person.ageCheckedAt} onChange={(e) => run(() => upd(ageCheckUpdate({ personId, date: e.target.value, now: Date.now() })))} />
          <button type="button" style={S.ghost} onClick={() => run(() => upd(ageCheckUpdate({ personId, date: isoDate(), now: Date.now() })))}>今日、確認した</button>
          {person.ageCheckedAt && <button type="button" style={S.ghost} onClick={() => run(() => upd(ageCheckUpdate({ personId, date: "", now: Date.now() })))}>なしにする</button>}
        </div>
        <div style={{ ...S.note, marginTop: 6 }}>
          {person.ageCheckedAt ? <span style={S.ok}>✓ {fmtDate(person.ageCheckedAt)} に、確認ずみ</span> : "まだ、確認していません。"}
          {idDocs.length === 0 && " 身分証の写真は、下の「書類」に入れられます。"}
        </div>
      </div>

      {/* 写真 */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ ...S.h, marginBottom: 0, flex: 1 }}>写真({photos.length})</div>
          <label style={{ ...S.primary, display: "inline-flex", alignItems: "center", opacity: busy ? 0.6 : 1 }}>
            📷 写真を足す
            <input type="file" accept="image/*" multiple disabled={busy} style={{ display: "none" }} onChange={(e) => { addImages(e.target.files, "photo"); e.target.value = ""; }} />
          </label>
        </div>
        {files === null ? <div style={S.note}>読み込んでいます…</div> : photos.length === 0 ? (
          <div style={S.note}>まだ、写真がありません。「写真を足す」で、カメラで撮るか、写真から選べます。何枚でも入れられます。</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
            {photos.map((f) => (
              <button key={f.id} type="button" onClick={() => setViewing(f)} aria-label={f.id === mainId ? "メインの写真を大きく見る" : "写真を大きく見る"} style={{ position: "relative", border: "none", padding: 0, background: "#FFF0F5", borderRadius: 10, overflow: "hidden", cursor: "pointer", aspectRatio: "3 / 4" }}>
                {f.thumb ? <img src={f.thumb} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span style={{ color: "#D4789F" }}>写真</span>}
                {f.id === mainId && <span style={{ position: "absolute", left: 4, top: 4, background: "#FF6B9D", color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 800 }}>メイン</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 書類 */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ ...S.h, marginBottom: 0, flex: 1 }}>書類({docs.length})</div>
          <button type="button" style={S.primary} aria-expanded={docOpen} onClick={() => setDocOpen((v) => !v)}>📄 書類を足す</button>
        </div>
        {docOpen && (
          <div style={{ background: "#FFF5F8", border: "1.5px solid #FFD9E8", borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={S.label}>書類の種類</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {DOC_TYPES.map((d) => <button key={d.id} type="button" aria-pressed={docType === d.id} style={{ ...S.chip, ...(docType === d.id ? S.chipOn : null) }} onClick={() => setDocType(d.id)}>{d.label}</button>)}
            </div>
            <label style={{ display: "block", marginBottom: 10 }}>
              <span style={S.label}>名前(なくてもよい。例: 運転免許証・表)</span>
              <input style={S.input} value={docLabel} onChange={(e) => setDocLabel(e.target.value)} list="interview-id-labels" maxLength={40} autoComplete="off" />
              {docType === "id" && <datalist id="interview-id-labels">{ID_LABELS.map((l) => <option key={l} value={l} />)}</datalist>}
            </label>
            <label style={{ ...S.primary, display: "inline-flex", alignItems: "center", opacity: busy ? 0.6 : 1 }}>
              📷 写真を撮る・選ぶ
              <input type="file" accept="image/*" multiple disabled={busy} style={{ display: "none" }} onChange={(e) => { addImages(e.target.files, "doc"); e.target.value = ""; }} />
            </label>
            <div style={{ ...S.note, marginTop: 8 }}>書類は、写真(画像)で入れます。PDF は、まだ入れられません。表と裏など、何枚でも選べます。</div>
          </div>
        )}
        {progress && <div role="status" style={{ ...S.note, fontWeight: 700, marginBottom: 8 }}>{progress}</div>}
        {files === null ? <div style={S.note}>読み込んでいます…</div> : docs.length === 0 ? (
          <div style={S.note}>まだ、書類がありません。身分証・履歴書・誓約書などの写真を入れられます。一覧には、書類の写真は出ません。「開く」を押したときだけ、読み込みます。</div>
        ) : docs.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: "1px solid #FFE4EF" }}>
            <span style={{ ...S.badge, background: "#FFE4EF", color: "#D4789F", flex: "none" }}>{docTypeOf(d.docType).label}</span>
            <div style={{ flex: 1, minWidth: 0, color: "#5C3344", wordBreak: "break-word" }}>
              <div style={{ fontSize: 14 }}>{d.label || "(名前なし)"}</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                {fmtStamp(d.at)} に追加
                {d.docType === "id" && person.ageCheckedAt && <span style={{ ...S.badge, background: "#DDF4E4", color: "#2E7D32", marginLeft: 6, padding: "0 8px", fontSize: 11 }}>年齢確認ずみ {fmtDate(person.ageCheckedAt, true)}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flex: "none" }}>
              <button type="button" style={{ ...S.ghost, minHeight: 40, padding: "8px 14px" }} onClick={() => setViewing(d)}>開く</button>
              <button type="button" style={{ ...S.danger, minHeight: 40, padding: "8px 14px" }} onClick={() => removeFile(d)}>消す</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "right", marginTop: 4 }}>
        <button type="button" style={S.danger} onClick={removePerson}>この人の記録を、すべて消す</button>
      </div>

      {viewing && (
        <Viewer base={base} personId={personId} file={viewing} isMain={viewing.id === mainId}
          onClose={() => setViewing(null)} onMain={() => setMain(viewing)} onDelete={() => removeFile(viewing)} />
      )}
    </div>
  );
}
