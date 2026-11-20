import { useMemo, useRef, useState } from "react";
import { scoutRows, scoutSettings, scoutTotals, todayStr, yen } from "./calc";
import { buildScoutXlsx, xlsxFileName } from "./scoutXlsx";
import { isLineBrowser, externalBrowserUrl } from "./env";

// 紹介スカウトバック：女性ごと・期間ごとの「勤務・報酬管理表」（担当者＝スカウトへの報酬）
//   報酬 ＝ 女子給の合計 × 率% ＋ 1勤務あたりの勤務加算 → 小計に消費税
//   女子給 ＝ 登録の「計」（コースバック＋指名料＋OPバック＋延長）。同じ日の最初の行にだけ 勤務=1

const SCREEN_MIN_ROWS = 10; // 画面・PDFで、空の行を足して見た目をそろえる（Excel は32行）
const pad = (x) => String(x).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const thisMonth = () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), ymd(n)]; };
const lastMonth = () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), ymd(new Date(n.getFullYear(), n.getMonth(), 0))]; };
const dayLabel = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? `${Number(m[2])}月${Number(m[3])}日` : s || ""; };
const comma = (n) => Number(n).toLocaleString("ja-JP");
const plain = (n) => String(Number(n));
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// スマホは共有画面（「ファイルに保存」やLINEを選べる）、パソコンはそのままダウンロード
async function saveBlob(blob, name, setMsg) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      setMsg("保存先（「ファイルに保存」やLINEなど）を選んでください。");
      return;
    } catch (e) {
      if (e && e.name === "AbortError") { setMsg(""); return; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setMsg(`「${name}」をダウンロードしました（ダウンロード フォルダに入ります）。`);
}

export default function ScoutPage({ data, deals }) {
  const members = data.members;
  const cfg = scoutSettings(data.settings);
  const ids = Object.keys(members).sort((a, b) => (members[a].createdAt || 0) - (members[b].createdAt || 0));
  const [memberId, setMemberId] = useState(() => ids.find((id) => members[id].active !== false) || ids[0] || "");
  const [[from, to], setRange] = useState(thisMonth);
  const [openDates, setOpenDates] = useState(false); // 「ほかの期間を選ぶ」を押したときだけ、日付の入力欄を出す
  const member = members[memberId];
  const [tm0, tm1] = thisMonth(), [lm0, lm1] = lastMonth();
  const isThis = from === tm0 && to === tm1, isLast = from === lm0 && to === lm1;
  const customRange = !isThis && !isLast; // 今月・先月以外の期間のときは、日付の入力欄をいつも出す
  const pick = (range) => { setRange(range); setOpenDates(false); };

  const picked = useMemo(
    () => deals.filter((d) => d.memberId === memberId && d.date && d.date >= from && d.date <= to),
    [deals, memberId, from, to]
  );
  const baseRows = useMemo(() => scoutRows(picked), [picked]);
  const shop = (member && member.shop) || [...new Set(picked.map((d) => d.shop).filter(Boolean))].join("/");

  if (ids.length === 0) {
    return <div className="page"><div className="card"><div className="empty">女性がまだ登録されていません。「設定」で女性を追加してください。</div></div></div>;
  }

  return (
    <div className="page">
      <div className="card">
        <h2>紹介スカウトバック（勤務・報酬管理表）</h2>
        <div className="field scout-pick">
          <label>女性</label>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {ids.map((id) => <option key={id} value={id}>{members[id].name}{members[id].active === false ? "（非表示）" : ""}</option>)}
          </select>
        </div>
        <div className="row scout-range" style={{ marginTop: 12 }}>
          <button className={"btn" + (isThis ? " primary" : "")} onClick={() => pick(thisMonth())}>今月</button>
          <button className={"btn" + (isLast ? " primary" : "")} onClick={() => pick(lastMonth())}>先月</button>
          {!customRange && <button className="linkbtn" onClick={() => setOpenDates((v) => !v)}>{openDates ? "日付の入力を閉じる" : "ほかの期間を選ぶ"}</button>}
        </div>
        {(openDates || customRange) && (
          <div className="grid scout-dates">
            <div className="field"><label>はじめの日</label><input type="date" value={from} max={to} onChange={(e) => e.target.value && setRange([e.target.value, to])} /></div>
            <div className="field"><label>おわりの日</label><input type="date" value={to} min={from} onChange={(e) => e.target.value && setRange([from, e.target.value])} /></div>
          </div>
        )}
        <p className="scout-period">{dayLabel(from)} 〜 {dayLabel(to)} の表を出しています</p>
        {!member?.scout && <p className="muted" style={{ marginBottom: 0 }}>担当者が未設定です。「設定」の女性の「編集」で、担当者（スカウト）の名前を入れてください。</p>}
      </div>

      <ScoutSheet key={`${memberId}|${from}|${to}`} member={member} shop={shop} baseRows={baseRows} cfg={cfg} from={from} to={to} />
    </div>
  );
}

function ScoutSheet({ member, shop, baseRows, cfg, from, to }) {
  const [edits, setEdits] = useState({}); // { 登録のID: { memo } }  画面で書いた備考（保存するExcel・PDFにだけ入る）。勤務は自動
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const sheetRef = useRef(null);
  const inLine = isLineBrowser();

  const rows = useMemo(
    () => baseRows.map((r) => ({ ...r, ...(edits[r.id] || {}) })),
    [baseRows, edits]
  );
  const totals = useMemo(() => scoutTotals(rows, cfg), [rows, cfg]);
  const name = member?.name || "（削除済）";
  const edit = (id, patch) => setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), ...patch } }));
  const blanks = Math.max(0, SCREEN_MIN_ROWS - rows.length);
  const empty = rows.length === 0;

  const lines = [
    ["女子給合計", totals.pay],
    [`女子給の${plain(cfg.rate)}％報酬`, totals.bonus],
    [`勤務加算（1勤務×${comma(cfg.perDay)}円）`, totals.perDayTotal],
    ["報酬小計", totals.subtotal],
    [`消費税${plain(cfg.tax)}％`, totals.tax],
    ["税込最終合計", totals.total],
  ];

  const needBrowser = () => {
    if (!inLine) return false;
    setMsg("LINEの中のブラウザでは保存できません。「Safari／Chromeで開く」を押して、開き直した画面で保存してください。");
    return true;
  };

  const saveXlsx = async () => {
    if (needBrowser()) return;
    setBusy(true); setMsg("Excelを作っています...");
    try {
      const mod = await import("exceljs/dist/exceljs.min.js");
      const ExcelJS = mod.default || mod;
      const buf = await buildScoutXlsx(ExcelJS, { name, shop, scout: member?.scout || "", rows, cfg, totals });
      await saveBlob(new Blob([buf], { type: XLSX_MIME }), xlsxFileName(name, from, to), setMsg);
    } catch (e) {
      setMsg("Excelを作れませんでした。もう一度お試しください。（" + ((e && e.message) || e) + "）");
    } finally {
      setBusy(false);
    }
  };

  const savePdf = async () => {
    if (needBrowser()) return;
    setBusy(true); setMsg("PDFを作っています...");
    try {
      // 入力欄の枠や色を消した状態で、画面のシートを画像にしてPDF（A4たて・1ページ）にする
      setCapturing(true);
      await new Promise((r) => setTimeout(r, 80)); // 描き直しを待つ（タブが裏にあっても止まらないよう requestAnimationFrame は使わない）
      const [{ jsPDF }, html2canvas] = await Promise.all([import("jspdf"), import("html2canvas").then((m) => m.default)]);
      const el = sheetRef.current;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", windowWidth: Math.max(el.scrollWidth, 900), scrollX: 0, scrollY: 0 });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 10;
      const ratio = canvas.height / canvas.width;
      let w = W - M * 2, h = w * ratio;
      if (h > H - M * 2) { h = H - M * 2; w = h / ratio; }
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", M, M, w, h);
      await saveBlob(pdf.output("blob"), xlsxFileName(name, from, to).replace(/\.xlsx$/, ".pdf"), setMsg);
    } catch (e) {
      setMsg("PDFを作れませんでした。もう一度お試しください。（" + ((e && e.message) || e) + "）");
    } finally {
      setCapturing(false);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span className="muted">{msg || (empty ? "この期間の登録はありません。" : "備考は、黄色い枠に書けます（保存するExcel・PDFにだけ入ります。登録は変わりません）。")}</span>
        <div className="row">
          {inLine && <a className="btn primary" href={externalBrowserUrl()} target="_blank" rel="noreferrer">Safari／Chromeで開く</a>}
          <button className="btn primary" onClick={saveXlsx} disabled={busy || empty}>Excelで保存</button>
          <button className="btn" onClick={savePdf} disabled={busy || empty}>PDFで保存</button>
        </div>
      </div>

      <div className="table-wrap">
        <div className={"scout-sheet" + (capturing ? " capturing" : "")} ref={sheetRef}>
          <div className="scout-title">{name}さん　勤務・報酬実績</div>
          <table className="scout-info">
            <tbody><tr><th>店舗</th><td>{shop}</td><th>担当者</th><td>{member?.scout || ""}</td></tr></tbody>
          </table>
          <table className="scout-table">
            <thead>
              <tr><th>日付</th><th>勤務時間</th><th>予約</th><th className="w">勤務</th><th className="num">コース</th><th className="num">女子給</th><th className="memo">備考</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="c">{dayLabel(r.date)}</td>
                  <td className="c">{r.hours}</td>
                  <td className="c">{r.reserve}</td>
                  <td className="c w">{r.work}</td>
                  <td className="num">{r.coursePrice ? comma(r.coursePrice) + "円" : ""}</td>
                  <td className="num">{comma(r.pay)}円</td>
                  <td className="memo">
                    {/* PDFにするときは、入力欄ではなく文字だけにする（空の欄の薄い文字が写らないように） */}
                    {capturing ? r.memo : <input type="text" value={r.memo} onChange={(e) => edit(r.id, { memo: e.target.value })} placeholder="ここに書けます" aria-label="備考" />}
                  </td>
                </tr>
              ))}
              {Array.from({ length: blanks }, (_, i) => (
                <tr key={"b" + i} className="blank"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
              ))}
              <tr className="sum">
                <td colSpan={3} className="c">勤務日数 合計</td>
                <td className="c">{totals.days}日</td>
                <td></td>
                <td className="num">{comma(totals.pay)}円</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div className="scout-sumhead">報酬集計（税込）</div>
          <table className="scout-sumtable">
            <tbody>
              {lines.map(([label, value], i) => (
                <tr key={label} className={i === lines.length - 1 ? "final" : i === 3 ? "strong" : ""}>
                  <td>{label}</td>
                  <td className="num">{yen(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="scout-note">{plain(cfg.rate)}％は女子給のみに適用／勤務加算は1勤務{comma(cfg.perDay)}円／消費税は報酬小計の{plain(cfg.tax)}％</div>
        </div>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        女子給は、登録の「計」（コースバック＋指名料＋OPバック＋延長）です。予約は登録の「店コース」の文字（数字だけのときは「分」を付けます）、勤務は自動で、同じ日の最初の行だけ 1 になります。
        率・勤務加算・消費税は「設定」で変えられます。
      </p>
    </div>
  );
}
