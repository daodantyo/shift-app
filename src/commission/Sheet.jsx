import { dealCourse, dealExpense, dealNet, dealSales, dealTake, num, yen } from "./calc";

// 女性1人分の明細シート（見本のPDFと同じ形式）
//   日付 / 店舗 / 勤務時間 / セラピスト名 の枠
//   No. 売上 店/コース(分) コース料金 コースバック 指名料 オプション OPバック 延長 計
//   計の行、そして 報酬総額 − 雑費 ＝ 報酬手取額
const MIN_ROWS = 8;
const n = (v) => (num(v) ? num(v).toLocaleString("ja-JP") : "0");

export default function WomanSheet({ member, deals, dateLabel }) {
  const list = deals.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  // 店舗：登録の店舗名と、店コースの「/」の前（例：SK-spa/100 の SK-spa）を合わせて重複なしで並べる
  const shops = [...new Set(list.flatMap((d) => {
    const c = dealCourse(d);
    const prefix = c.includes("/") ? c.split("/")[0].trim() : "";
    return [d.shop, prefix];
  }).filter(Boolean))];
  // 勤務時間：その日の登録に入っているものを優先。無ければ女性の基本設定
  const hours = list.map((d) => d.hours).find(Boolean) || member?.hours || "";
  const sum = (f) => list.reduce((s, d) => s + f(d), 0);
  const total = {
    sales: sum(dealSales), coursePrice: sum((d) => num(d.coursePrice)), courseBack: sum((d) => num(d.courseBack)),
    nomination: sum((d) => num(d.nomination)), opBack: sum((d) => num(d.opBack)), extension: sum((d) => num(d.extension)),
    take: sum(dealTake), expense: sum(dealExpense), net: sum(dealNet),
  };
  const blanks = Math.max(0, MIN_ROWS - list.length);

  return (
    <div className="sheet">
      <table className="sheet-head">
        <tbody>
          <tr><th>日付</th><td>{dateLabel}</td></tr>
          <tr><th>店舗</th><td>{shops.join("/") || member?.shop || ""}</td></tr>
          <tr><th>勤務時間</th><td>{hours}</td></tr>
          <tr><th>セラピスト名</th><td>{member?.name || "（削除済）"}</td></tr>
        </tbody>
      </table>

      <table className="sheet-table">
        <thead>
          <tr>
            <th className="no">No.</th><th className="num">売上</th><th>店／コース</th><th className="num">コース料金</th><th className="num">コースバック</th>
            <th className="num">指名料</th><th className="opt">オプション</th><th className="num">OPバック</th><th className="num">延長</th><th className="num">計</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d, i) => (
            <tr key={d.id}>
              <td className="no">{i + 1}</td>
              <td className="num">{n(dealSales(d))}</td>
              <td>{dealCourse(d).includes("/") ? dealCourse(d) : [d.shop, dealCourse(d)].filter(Boolean).join("/")}</td>
              <td className="num">{n(d.coursePrice)}</td>
              <td className="num">{n(d.courseBack)}</td>
              <td className="num">{n(d.nomination)}</td>
              <td className="opt">{d.optionName || (num(d.option) ? n(d.option) : "")}</td>
              <td className="num">{n(d.opBack)}</td>
              <td className="num">{n(d.extension)}</td>
              <td className="num">{n(dealTake(d))}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={"b" + i} className="blank"><td className="no">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          ))}
          <tr className="total">
            <td className="label">計</td>
            <td className="num">{n(total.sales)}</td>
            <td></td>
            <td className="num">{n(total.coursePrice)}</td>
            <td className="num">{n(total.courseBack)}</td>
            <td className="num">{n(total.nomination)}</td>
            <td></td>
            <td className="num">{n(total.opBack)}</td>
            <td className="num">{n(total.extension)}</td>
            <td className="num">{n(total.take)}</td>
          </tr>
        </tbody>
      </table>

      <div className="sheet-net">
        <div className="box"><div className="k">報酬総額</div><div className="v">{n(total.take)}</div></div>
        <div className="op">−</div>
        <div className="box"><div className="k">雑費</div><div className="v">{n(total.expense)}</div></div>
        <div className="op">＝</div>
        <div className="box wide"><div className="k">報酬手取額</div><div className="v">{n(total.net)}</div></div>
      </div>
      <div className="sheet-foot muted">売上 {yen(total.sales)}　計の合計＝報酬総額 {yen(total.take)}</div>
    </div>
  );
}
