import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { dealCourse, dealNet, monthKey, purgeInfo, summarize, toCsv, todayStr, yen } from "./calc";
import WomanSheet from "./Sheet";
import { isLineBrowser, externalBrowserUrl } from "./env";

export default function SummaryPage({ data, deals, api }) {
  const members = data.members;
  const [month, setMonth] = useState(monthKey(todayStr()));
  const [openMember, setOpenMember] = useState(null);
  const [printing, setPrinting] = useState(null); // null=閉じている ／ { ids: PDFにする女性のID, mode: "file"|"separate" }
  const [day, setDay] = useState(""); // "" = 月全体

  const months = useMemo(() => {
    const s = new Set(deals.map((d) => monthKey(d.date)));
    s.add(monthKey(todayStr()));
    return [...s].sort().reverse();
  }, [deals]);

  const monthOnly = useMemo(() => deals.filter((d) => !month || monthKey(d.date) === month), [deals, month]);
  const days = useMemo(() => [...new Set(monthOnly.map((d) => d.date))].sort(), [monthOnly]);
  const dayDeals = useMemo(() => (day ? monthOnly.filter((d) => d.date === day) : monthOnly), [monthOnly, day]);
  const rows = useMemo(() => summarize(dayDeals, month), [dayDeals, month]);
  const rowList = Object.values(rows).sort((a, b) => b.net - a.net);
  const total = rowList.reduce((acc, r) => ({
    count: acc.count + r.count, amount: acc.amount + r.amount, take: acc.take + r.take, expense: acc.expense + r.expense, net: acc.net + r.net, unpaid: acc.unpaid + r.unpaid,
  }), { count: 0, amount: 0, take: 0, expense: 0, net: 0, unpaid: 0 });

  const monthDeals = dayDeals;
  const fmtDay = (s) => { const [y, m, d] = s.split("-"); return `${y}/${Number(m)}/${Number(d)}`; };
  const label = day ? fmtDay(day) : month ? month.replace("-", "年") + "月" : "全期間";

  const downloadCsv = () => {
    const csv = toCsv(monthDeals, members);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `報酬_${day || month || "全期間"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // 「（削除済）」の女性の登録を、全部の月ぶん、完全に消す（元に戻せない）
  const purge = (memberId) => {
    if (members[memberId]) return; // 設定に残っている女性は、消さない
    const all = deals.filter((d) => String(d.memberId) === String(memberId));
    if (all.length === 0) return;
    const info = purgeInfo(all);
    const period = info.first ? `${fmtDay(info.first)}〜${fmtDay(info.last)}、` : "";
    const msg = `「（削除済）」の登録 ${info.count}件（${period}売上 ${yen(info.sales)}）を、全部の月ぶん、完全に消します。\n`
      + (info.unpaid ? `未払の手取り ${yen(info.unpaid)} が、まだ残っています。\n` : "")
      + "元に戻せません。先に「CSVで保存」で控えをとることをおすすめします。\n\n本当に消しますか？";
    if (window.confirm(msg)) api.deleteDeals(all.map((d) => d.id));
  };

  const payAll = (memberId) => {
    const ids = monthDeals.filter((d) => d.memberId === memberId && !d.paid).map((d) => d.id);
    if (ids.length === 0) return;
    if (window.confirm(`${members[memberId]?.name || ""} の ${label} 未払 ${ids.length}件 を支払済にしますか？`)) api.setPaid(ids, true);
  };

  return (
    <div className="page">
      {printing && (
        <PrintSheet label={label} rowList={rowList.filter((r) => printing.ids.includes(r.memberId))} monthDeals={monthDeals} members={members} mode={printing.mode} onClose={() => setPrinting(null)} />
      )}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <select value={month} onChange={(e) => { setMonth(e.target.value); setDay(""); }} className="btn">
              <option value="">全期間</option>
              {months.map((m) => <option key={m} value={m}>{m.replace("-", "年")}月</option>)}
            </select>
            <select value={day} onChange={(e) => setDay(e.target.value)} className="btn">
              <option value="">全日</option>
              {days.map((d) => <option key={d} value={d}>{fmtDay(d)}</option>)}
            </select>
          </div>
          <div className="row">
            <button className="btn" onClick={downloadCsv} disabled={monthDeals.length === 0}>CSVで保存</button>
            <button className="btn primary" onClick={() => setPrinting({ ids: rowList.map((r) => r.memberId), mode: "file" })} disabled={monthDeals.length === 0}>PDFで保存</button>
            <button className="btn" onClick={() => setPrinting({ ids: rowList.map((r) => r.memberId), mode: "separate" })} disabled={monthDeals.length === 0}>女性ごとに別々のPDF</button>
          </div>
        </div>
        <div className="grid stats" style={{ marginTop: 14 }}>
          <div className="stat"><span className="k">件数</span><span className="v">{total.count}件</span></div>
          <div className="stat"><span className="k">売上合計</span><span className="v">{yen(total.amount)}</span></div>
          <div className="stat"><span className="k">報酬総額（計の合計）</span><span className="v">{yen(total.take)}</span></div>
          <div className="stat"><span className="k">雑費合計</span><span className="v">{yen(total.expense)}</span></div>
          <div className="stat"><span className="k">報酬手取り額合計</span><span className="v" style={{ color: "var(--ok)" }}>{yen(total.net)}</span></div>
          <div className="stat"><span className="k">未払（手取り）</span><span className="v" style={{ color: total.unpaid ? "var(--warn)" : "var(--ok)" }}>{yen(total.unpaid)}</span></div>
        </div>
      </div>

      <div className="card">
        <h2>女性別（{label}）</h2>
        {rowList.length === 0 ? <div className="empty">この期間の登録はありません</div> : (
          <div className="table-wrap sum-wrap">
            <table>
              <thead><tr><th>女性</th><th className="num">件数</th><th className="num">売上</th><th className="num">報酬総額（計）</th><th className="num">雑費</th><th className="num">手取り額</th><th className="num">未払</th><th></th></tr></thead>
              <tbody>
                {rowList.map((r) => (
                  <MemberRow key={r.memberId} r={r} name={members[r.memberId]?.name || "（削除済）"} member={members[r.memberId]} label={label}
                    open={openMember === r.memberId} onToggle={() => setOpenMember(openMember === r.memberId ? null : r.memberId)}
                    onPayAll={() => payAll(r.memberId)} onPurge={members[r.memberId] ? null : () => purge(r.memberId)} onPdf={() => setPrinting({ ids: [r.memberId], mode: "file" })} detail={monthDeals.filter((d) => d.memberId === r.memberId)} api={api} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({ r, name, member, label, open, onToggle, onPayAll, onPurge, onPdf, detail, api }) {
  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={onToggle}>
        <td><b>{open ? "▾" : "▸"} {name}</b></td>
        <td className="num">{r.count}</td>
        <td className="num">{yen(r.amount)}</td>
        <td className="num">{yen(r.take)}</td>
        <td className="num">{yen(r.expense)}</td>
        <td className="num"><b>{yen(r.net)}</b></td>
        <td className="num" style={{ color: r.unpaid ? "var(--warn)" : "var(--ok)" }}>{yen(r.unpaid)}</td>
        <td>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <button className="btn small" onClick={(e) => { e.stopPropagation(); onPdf(); }}>PDF</button>
            {onPurge && <button className="btn small danger" onClick={(e) => { e.stopPropagation(); onPurge(); }}>完全に消す</button>}
            <button className="btn small" disabled={!r.unpaid} onClick={(e) => { e.stopPropagation(); onPayAll(); }}>まとめて支払済</button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} style={{ background: "#f8fafc", padding: "10px" }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <button className="btn small" onClick={onPdf}>この人だけのPDFを保存</button>
            </div>
            <div className="table-wrap"><WomanSheet member={member} deals={detail} dateLabel={label} /></div>
            <div className="sum-detail">
              {detail.map((d) => (
                <div key={d.id} className="sum-detail-row">
                  <b>{d.date.slice(5).replace("-", "/")}</b>
                  <span className="muted">{[dealCourse(d), d.client].filter(Boolean).join(" ・")}</span>
                  <span>手取り <b>{yen(dealNet(d))}</b></span>
                  <button className={"badge " + (d.paid ? "paid" : "unpaid")} style={{ border: 0, cursor: "pointer" }} onClick={() => api.setPaid([d.id], !d.paid)}>
                    {d.paid ? "支払済" : "未払"}
                  </button>
                  <button className="btn small" onClick={() => api.openEdit(d.id)}>編集</button>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// 印刷・PDF用：女性ごとに1ページの明細シート（見本のPDFと同じ形式）
// mode: "file"=1つのファイルに、女性ごと1ページ ／ "separate"=女性ごとに、別々のファイル。rowList が1人だけのときは、その人だけのPDF
function PrintSheet({ label, rowList, monthDeals, members, mode, onClose }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // 印刷の画面を開いているあいだだけ、「印刷」を押したとき、キャスト管理のほかの部分を出さず、用紙をA4横にする
  useEffect(() => {
    document.documentElement.classList.add("cm-print-open");
    const st = document.createElement("style");
    st.textContent = "@page { size: A4 landscape; margin: 12mm; }";
    document.head.appendChild(st);
    return () => {
      document.documentElement.classList.remove("cm-print-open");
      st.remove();
    };
  }, []);

  const one = rowList.length === 1; // 女性の行の「PDF」から開いた（その人だけ）
  const safeLabel = label.replace(/\//g, "-");
  const nameOf = (r) => (members[r.memberId]?.name || "削除済").replace(/[\\/:*?"<>|]/g, "");
  // 同じ名前の女性が2人いても、ファイルの名前が重ならないようにする
  const fileNames = (() => {
    const seen = {};
    return rowList.map((r) => {
      const base = `報酬_${nameOf(r)}_${safeLabel}`;
      seen[base] = (seen[base] || 0) + 1;
      return (seen[base] > 1 ? `${base}_${seen[base]}` : base) + ".pdf";
    });
  })();

  const allPages = () => [...document.querySelectorAll(".print-sheet .sheet-page")];

  // 画面のシートをそのまま画像にしてPDFにする（A4横。1ページに1人）。pages: 画面の .sheet-page の一覧
  const buildPdf = async (pages) => {
    const [{ jsPDF }, html2canvas] = await Promise.all([import("jspdf"), import("html2canvas").then((m) => m.default)]);
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 10;
    for (let i = 0; i < pages.length; i++) {
      const el = pages[i];
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", windowWidth: Math.max(el.scrollWidth, 900), scrollX: 0, scrollY: 0 });
      const ratio = canvas.height / canvas.width;
      let w = W - M * 2, h = w * ratio;
      if (h > H - M * 2) { h = H - M * 2; w = h / ratio; }
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", M, M, w, h);
    }
    return pdf.output("blob");
  };

  const inLine = isLineBrowser();

  // ファイルを渡す：スマホは共有画面（「ファイルに保存」やLINEを選べる）、パソコンはそのままダウンロード
  const deliver = async (files) => {
    const fs = files.map((f) => new File([f.blob], f.name, { type: "application/pdf" }));
    if (navigator.canShare && navigator.canShare({ files: fs })) {
      try {
        await navigator.share({ files: fs, title: files.length === 1 ? files[0].name : `報酬_${safeLabel}` });
        setMsg("保存先（「ファイルに保存」やLINEなど）を選んでください。");
        return;
      } catch (e) {
        if (e && e.name === "AbortError") { setMsg(""); return; }
      }
    }
    for (let i = 0; i < files.length; i++) {
      const url = URL.createObjectURL(files[i].blob);
      const a = document.createElement("a");
      a.href = url; a.download = files[i].name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (i < files.length - 1) await new Promise((r) => setTimeout(r, 400)); // 続けてのダウンロードを、ブラウザに断られにくくする
    }
    setMsg(files.length === 1
      ? `「${files[0].name}」をダウンロードしました（ダウンロード フォルダに入ります）。`
      : `${files.length}個のPDFをダウンロードしました（ダウンロード フォルダに入ります）。ブラウザが「複数のファイルをダウンロード」の確認を出したら、「許可」を押してください。`);
  };

  const make = async (build) => {
    if (inLine) {
      setMsg("LINEの中のブラウザでは保存できません。「Safari／Chromeで開く」を押して、開き直した画面で「PDFを保存」してください。");
      return;
    }
    setBusy(true); setMsg("PDFを作っています...");
    try {
      await deliver(await build());
    } catch (e) {
      setMsg("PDFを作れませんでした。もう一度お試しください。（" + ((e && e.message) || e) + "）");
    } finally {
      setBusy(false);
    }
  };

  // 1つのファイルに、女性ごと1ページ（1人だけのときは、その人のPDF）
  const savePdf = () => make(async () => [{ blob: await buildPdf(allPages()), name: one ? fileNames[0] : `報酬_${safeLabel}.pdf` }]);
  // 女性ごとに、別々のファイル
  const saveSeparate = () => make(async () => {
    const pages = allPages();
    const files = [];
    for (let i = 0; i < pages.length; i++) {
      setMsg(`PDFを作っています... ${i + 1}/${pages.length}`);
      files.push({ blob: await buildPdf([pages[i]]), name: fileNames[i] });
    }
    return files;
  });

  const sepMain = !one && mode === "separate"; // 「別々のファイル」を、目立つボタンにする
  const hint = inLine
    ? "LINEの中のブラウザではPDFを保存できません。「Safari／Chromeで開く」を押してください。"
    : one ? "この人だけのPDFになります。「PDFを保存」を押してください。"
    : sepMain ? "女性ごとに、別々のPDFになります。「女性ごとに別々のPDFで保存」を押してください。"
    : "女性ごとに1ページのPDFになります。「PDFを保存（1つのファイル）」を押してください。";

  // キャスト管理の外(body の直下)に出して、画面いっぱいに重ねる
  return createPortal(
    <div className="cm-root">
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <span className="muted">{msg || hint}</span>
        <div className="row">
          {inLine && <a className="btn primary" href={externalBrowserUrl()} target="_blank" rel="noreferrer">Safari／Chromeで開く</a>}
          <button className={"btn " + (inLine || sepMain ? "" : "primary")} onClick={savePdf} disabled={busy}>{busy ? "作成中..." : one ? "PDFを保存" : "PDFを保存（1つのファイル）"}</button>
          {!one && <button className={"btn " + (inLine || !sepMain ? "" : "primary")} onClick={saveSeparate} disabled={busy}>女性ごとに別々のPDFで保存</button>}
          <button className="btn" onClick={() => window.print()} disabled={busy}>印刷</button>
          <button className="btn" onClick={onClose} disabled={busy}>閉じる</button>
        </div>
      </div>
      <div className="print-sheet">
        {rowList.map((r) => (
          <div key={r.memberId} className="sheet-page">
            <WomanSheet member={members[r.memberId]} deals={monthDeals.filter((d) => d.memberId === r.memberId)} dateLabel={label} />
          </div>
        ))}
      </div>
    </div>
    </div>,
    document.body,
  );
}
