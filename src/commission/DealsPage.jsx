import { useEffect, useMemo, useRef, useState } from "react";
import { autoSales, dealCourse, dealNet, dealSales, dealTake, monthKey, num, todayStr, yen } from "./calc";
import HoursInput from "./HoursInput";

// 店舗1つぶんの入力（店舗・勤務時間・コース・指名・オプション・延長・雑費・メモ）。日付と女性は、全部の店舗で共通
const BLOCK = {
  shop: "", hours: "",
  sales: "", salesTouched: false, course: "", coursePrice: "", courseBack: "", nomination: "", option: "", opBack: "", extension: "", expense: "", optionName: "",
  client: "", memo: "",
};
const EMPTY = { date: todayStr(), memberId: "", ...BLOCK };

let extraSeq = 0;
const newExtra = () => ({ ...BLOCK, key: "x" + ++extraSeq }); // 2つ目以降の店舗

// 1店舗ぶんの金額の計算（売上は、内訳の合計を自動で入れる。手で書き換えたらその値を使う）
const calcOf = (b) => {
  const computedSales = autoSales(b);
  return { computedSales, sales: b.salesTouched ? num(b.sales) : computedSales, take: dealTake(b), net: dealNet(b) };
};

// 1店舗ぶんの、保存する中身（1店舗＝1件の登録）
const payloadOf = (b, date, memberId) => {
  const c = calcOf(b);
  return {
    date,
    memberId,
    shop: (b.shop || "").trim(),
    hours: (b.hours || "").trim(),
    course: (b.course || "").trim(),
    coursePrice: num(b.coursePrice),
    courseBack: num(b.courseBack),
    nomination: num(b.nomination),
    option: null,
    opBack: num(b.opBack),
    extension: num(b.extension),
    expense: num(b.expense),
    optionName: (b.optionName || "").trim(),
    amount: c.sales,
    take: c.take,
    net: c.net,
    client: (b.client || "").trim(),
    memo: (b.memo || "").trim(),
  };
};

const str = (v) => (v === undefined || v === null ? "" : String(v));

// 保存してある登録 → 入力欄に入れる中身
const formFromDeal = (d) => {
  // 古い登録（コース欄がなく売上だけのもの）はコース料金に売上を入れて編集できるようにする
  const legacy = d.coursePrice === undefined && d.nomination === undefined && d.option === undefined && d.extension === undefined;
  return {
    date: d.date, memberId: d.memberId, shop: d.shop || "", hours: d.hours || "",
    course: dealCourse(d), coursePrice: legacy ? str(d.amount) : str(d.coursePrice),
    sales: str(d.amount), salesTouched: !legacy && d.amount !== undefined && d.amount !== null && num(d.amount) !== autoSales(d),
    courseBack: str(d.courseBack), nomination: str(d.nomination), option: str(d.option), opBack: str(d.opBack), extension: str(d.extension), expense: str(d.expense), optionName: d.optionName || "",
    client: d.client || "", memo: d.memo || "",
  };
};

const shortDate = (date) => String(date || "").slice(5).replace("-", "/");

// スマホ用：登録1件ぶんのカード（日付・女性・金額と、「編集」「削除」のボタンが、横に動かさなくても見える）
function DealCard({ d, name, onEdit, onDelete, onPaid }) {
  const opt = d.optionName || (num(d.option) ? yen(d.option) : "");
  const rows = [
    ["コース", [dealCourse(d), num(d.coursePrice) ? yen(d.coursePrice) : "", num(d.courseBack) ? `（バック ${yen(d.courseBack)}）` : ""].filter(Boolean).join(" ")],
    ["指名料", num(d.nomination) ? yen(d.nomination) : ""],
    ["オプション", [opt, num(d.opBack) ? `（バック ${yen(d.opBack)}）` : ""].filter(Boolean).join(" ")],
    ["延長", num(d.extension) ? yen(d.extension) : ""],
    ["雑費", num(d.expense) ? yen(d.expense) : ""],
  ].filter((r) => r[1]);
  const sub = [d.shop, d.hours ? `勤務 ${d.hours}` : ""].filter(Boolean).join(" ・");
  const note = [d.client, d.memo].filter(Boolean).join(" ・");
  return (
    <div className="deal-card">
      <div className="deal-card-top">
        <b className="deal-card-date">{shortDate(d.date)}</b>
        <span className="deal-card-name">{name}</span>
        <button type="button" className={"badge " + (d.paid ? "paid" : "unpaid")} style={{ border: 0, cursor: "pointer" }} onClick={onPaid} title="クリックで切り替え">
          {d.paid ? "支払済" : "未払"}
        </button>
      </div>
      {sub && <div className="deal-card-sub">{sub}</div>}
      <div className="deal-card-nums">
        <div><span>売上</span><b>{yen(dealSales(d))}</b></div>
        <div><span>計</span><b>{yen(dealTake(d))}</b></div>
        <div><span>手取り</span><b className="net">{yen(dealNet(d))}</b></div>
      </div>
      {rows.length > 0 && (
        <div className="deal-card-det">
          {rows.map(([k, v]) => <div key={k}><span>{k}</span>{v}</div>)}
        </div>
      )}
      {note && <div className="deal-card-note">{note}</div>}
      <div className="deal-card-act">
        <button type="button" className="btn" onClick={onEdit}>編集</button>
        <button type="button" className="btn danger" onClick={onDelete}>削除</button>
      </div>
    </div>
  );
}

// 店舗1つぶんの入力の部品。first=1つ目の店舗（店舗・勤務時間は、女性を選ぶと自動で入るので、「直す」を押したときだけ入力欄を出す）
function ShopBlock({ b, patch, first, memberId, title, onRemove, findPreset }) {
  // ふだんはしまっておく入力：店舗・勤務時間（1つ目だけ）／売上（自動で計算される）／メモ・顧客名
  const [metaOpen, setMetaOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const c = calcOf(b);
  const set = (k) => (e) => patch({ [k]: e.target.value });
  const numInput = (k) => <input type="number" inputMode="numeric" min="0" value={b[k]} onChange={set(k)} placeholder="0" />;

  // 店コースは自由入力（例：クラリス/80）。設定のコース料金表と一致すれば、コース料金・コースバックが空のときだけ、自動で入れる
  const setCourse = (e) => {
    const v = e.target.value;
    const preset = findPreset(v);
    const next = { course: v };
    if (preset) {
      if (!b.coursePrice && preset.price !== undefined && preset.price !== null) next.coursePrice = String(preset.price);
      if (!b.courseBack && preset.back !== undefined && preset.back !== null && preset.back !== "") next.courseBack = String(preset.back);
    }
    patch(next);
  };
  const setSales = (e) => { const v = e.target.value; patch({ sales: v, salesTouched: v !== "" }); };

  const body = (
    <>
      {/* 店舗名は、いつも出す（女性を選ぶと、その女性の店舗名が入る。書き換えれば、この登録だけ変わる） */}
      <div className="grid" style={{ marginTop: 10 }}>
        <div className="field"><label>店舗名{first ? "" : "（必ず入れてください）"}</label><input list="deal-shop-list" value={b.shop} onChange={set("shop")} placeholder="例：○○店" /></div>
      </div>
      {/* 勤務時間：1つ目は、女性を選ぶと自動で入るので、「直す」を押したときだけ入力欄を出す。2つ目からは、いつも出す */}
      {first && memberId && (
        <div className="in-meta">
          <span>勤務 <b>{b.hours || "未設定"}</b></span>
          <button type="button" className="linkbtn" onClick={() => setMetaOpen((v) => !v)}>{metaOpen ? "閉じる" : "直す"}</button>
        </div>
      )}
      {(!first || (memberId && metaOpen)) && (
        <div className="grid" style={{ marginTop: 8 }}>
          <div className="field hours"><label>勤務時間</label><HoursInput value={b.hours} onChange={(v) => patch({ hours: v })} /></div>
        </div>
      )}

      <div className="in-group">
        <h3>コース</h3>
        <div className="in-grid">
          <div className="field"><label>店コース</label>
            <input list="course-list" value={b.course} onChange={setCourse} placeholder="例：SK-spa/100" />
          </div>
          <div className="field"><label>コース料金</label>{numInput("coursePrice")}</div>
          <div className="field"><label>コースバック</label>{numInput("courseBack")}</div>
        </div>
      </div>

      <div className="in-group">
        <h3>指名・オプション・延長</h3>
        <div className="in-grid">
          <div className="field"><label>指名料</label>{numInput("nomination")}</div>
          <div className="field"><label>延長</label>{numInput("extension")}</div>
          <div className="field"><label>オプション（内容）</label><input list="option-list" value={b.optionName} onChange={set("optionName")} placeholder="例：ディープリンパetc" /></div>
          <div className="field"><label>OPバック</label>{numInput("opBack")}</div>
        </div>
      </div>

      <div className="in-group">
        <h3>引く分</h3>
        <div className="in-grid one">
          <div className="field"><label>雑費</label>{numInput("expense")}</div>
        </div>
      </div>

      <div className="in-result">
        <div className="field calc"><label>売上{b.salesTouched ? "（手入力）" : ""}</label><div className="calc-box">{yen(c.sales)}</div></div>
        <div className="field calc"><label>計（女性の取り分）</label><div className="calc-box strong">{yen(c.take)}</div></div>
        <div className="field calc"><label>手取り（計 − 雑費）</label><div className="calc-box net">{yen(c.net)}</div></div>
      </div>
      <div style={{ marginTop: 6 }}>
        <button type="button" className="linkbtn" onClick={() => setSalesOpen((v) => !v)}>{salesOpen ? "売上の入力を閉じる" : "売上を直す"}</button>
      </div>
      {salesOpen && (
        <div className="field" style={{ maxWidth: 240 }}><label>売上（空にすると、自動の計算に戻ります）</label>
          <input type="number" inputMode="numeric" min="0" value={b.salesTouched ? b.sales : (c.computedSales ? String(c.computedSales) : "")} onChange={setSales} placeholder="0" className="sales-input" />
        </div>
      )}

      {(memoOpen || b.client || b.memo) ? (
        <div className="grid" style={{ marginTop: 12 }}>
          <div className="field"><label>顧客・案件名（任意）</label><input value={b.client} onChange={set("client")} placeholder="例：田中様" /></div>
          <div className="field"><label>メモ</label><input value={b.memo} onChange={set("memo")} /></div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="linkbtn" onClick={() => setMemoOpen(true)}>＋ メモ・顧客名を書く</button>
        </div>
      )}
    </>
  );

  if (!title) return body;
  return (
    <div className="in-shop">
      <div className="in-shop-head">
        <b>{title}</b>
        {onRemove && <button type="button" className="btn small danger" onClick={onRemove}>この店舗を消す</button>}
      </div>
      {body}
    </div>
  );
}

export default function DealsPage({ data, deals, api, goSettings, editRequest }) {
  const members = data.members;
  const courses = Object.values((data.settings || {}).courses || {}).filter((c) => c && c.min !== "" && c.min !== undefined);
  const memberIds = Object.keys(members).filter((id) => members[id].active !== false);

  const withDefaults = (f, memberId) => ({ ...f, memberId, shop: members[memberId]?.shop || "", hours: members[memberId]?.hours || "" });
  const startDeal = editRequest ? deals.find((d) => d.id === editRequest) || null : null; // 「集計」の「編集」から来たときの、直す登録
  const [form, setForm] = useState(() => (startDeal ? formFromDeal(startDeal) : withDefaults({ ...EMPTY }, memberIds[0] || ""))); // 日付・女性・1つ目の店舗
  const [extras, setExtras] = useState([]); // 2つ目以降の店舗（新しく登録するときだけ）
  const [resetKey, setResetKey] = useState(0); // 入力を全部やり直すとき、店舗の部品を作り直す印
  const [formErr, setFormErr] = useState("");
  const shopList = [...new Set([...Object.values(members).map((m) => m.shop), ...deals.map((d) => d.shop)].filter(Boolean))];
  const [editId, setEditId] = useState(startDeal ? startDeal.id : null);
  const openedByRequest = useRef(!!startDeal);
  // 「集計」から来たときは、入力欄が見えるように、画面のいちばん上へ
  useEffect(() => {
    if (openedByRequest.current) window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const [filterMonth, setFilterMonth] = useState(monthKey(todayStr()));
  const [filterMember, setFilterMember] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // 女性を選び直したら、その女性の店舗名・勤務時間を、1つ目の店舗に、自動で入れる
  const setMember = (e) => setForm((f) => withDefaults(f, e.target.value));
  const patchFirst = (p) => setForm((f) => ({ ...f, ...p }));
  const patchExtra = (key, p) => setExtras((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const addExtra = () => setExtras((xs) => [...xs, newExtra()]);
  const removeExtra = (key) => setExtras((xs) => xs.filter((x) => x.key !== key));
  const findPreset = (text) => {
    const key = String(text || "").trim().toLowerCase();
    if (!key) return null;
    const tail = key.match(/(\d+)\s*$/);
    return courses.find((c) => {
      const k = String(c.min).trim().toLowerCase();
      if (!k) return false;
      if (k === key) return true;
      return /^\d+$/.test(k) && tail && tail[1] === k;
    }) || null;
  };
  const courseList = [...new Set([...courses.map((c) => String(c.min).trim()), ...deals.map((d) => dealCourse(d))].filter(Boolean))];

  const blocks = [form, ...extras];
  const sum = blocks.reduce((acc, b) => {
    const c = calcOf(b);
    return { sales: acc.sales + c.sales, take: acc.take + c.take, net: acc.net + c.net };
  }, { sales: 0, take: 0, net: 0 });

  const ready = memberIds.length > 0;
  const valid = form.date && form.memberId;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    if (!editId) {
      const bad = extras.findIndex((x) => !(x.shop || "").trim());
      if (bad >= 0) { setFormErr(`${bad + 2}つ目の店舗名を入れてください。`); return; }
    }
    setFormErr("");
    setSaving(true);
    let done = 0;
    try {
      if (editId) {
        await api.updateDeal(editId, payloadOf(form, form.date, form.memberId));
      } else {
        // 店舗ごとに、別々の登録として保存する（日付・女性は同じ）
        for (const b of blocks) {
          await api.addDeal({ ...payloadOf(b, form.date, form.memberId), paid: false });
          done++;
        }
      }
      setForm(withDefaults({ ...EMPTY, date: form.date }, form.memberId));
      setExtras([]);
      setEditId(null);
      setResetKey((k) => k + 1);
    } catch (err) {
      if (!editId && done > 0) {
        // 途中まで保存できた：保存できた店舗は、入力から外す（もう一度押しても、重ならないように）
        const [h, ...t] = blocks.slice(done);
        setForm((f) => ({ date: f.date, memberId: f.memberId, ...h }));
        setExtras(t);
        setResetKey((k) => k + 1);
        setFormErr(`${done}件は登録できました。${done + 1}件目で、うまくいきませんでした。残りの店舗が入力に残っています。もう一度、登録するを押してください。`);
      } else {
        setFormErr(editId ? "更新できませんでした。もう一度お試しください。" : "登録できませんでした。もう一度お試しください。");
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (d) => {
    setEditId(d.id);
    setExtras([]);
    setFormErr("");
    setResetKey((k) => k + 1);
    setForm(formFromDeal(d));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditId(null);
    setExtras([]);
    setFormErr("");
    setResetKey((k) => k + 1);
    setForm(withDefaults({ ...EMPTY }, memberIds[0] || ""));
  };

  const removeDeal = (d) => { if (window.confirm("この登録を削除しますか？")) api.deleteDeal(d.id); };
  const nameOf = (id) => members[id]?.name || "（削除済）";

  // 女性の選ぶ欄：非表示の女性の登録を直すときも、その女性の名前が出るようにする
  const pickIds = form.memberId && !memberIds.includes(form.memberId) && members[form.memberId] ? [...memberIds, form.memberId] : memberIds;

  const months = useMemo(() => {
    const s = new Set(deals.map((d) => monthKey(d.date)));
    s.add(monthKey(todayStr()));
    return [...s].sort().reverse();
  }, [deals]);

  const shown = deals.filter((d) => (!filterMonth || monthKey(d.date) === filterMonth) && (!filterMember || d.memberId === filterMember));
  const shownSales = shown.reduce((s, d) => s + dealSales(d), 0);
  const shownTake = shown.reduce((s, d) => s + dealTake(d), 0);
  const shownNet = shown.reduce((s, d) => s + dealNet(d), 0);

  return (
    <div className="page">
      {!ready && (
        <div className="card">
          <h2>はじめに</h2>
          <p className="muted">先に「設定」で女性を登録してください。</p>
          <button className="btn primary" onClick={goSettings}>設定を開く</button>
        </div>
      )}

      <form className="card" onSubmit={submit}>
        <h2>{editId ? "登録内容を編集" : "新しく登録"}</h2>
        <div className="grid">
          <div className="field"><label>日付</label><input type="date" value={form.date} onChange={set("date")} required /></div>
          <div className="field"><label>女性</label>
            <select value={form.memberId} onChange={setMember} required>
              <option value="">選択</option>
              {pickIds.map((id) => <option key={id} value={id}>{members[id].name}{members[id].active === false ? "（非表示）" : ""}</option>)}
            </select></div>
        </div>
        <datalist id="deal-shop-list">{shopList.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="course-list">{courseList.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="option-list">{[...new Set(deals.map((d) => d.optionName).filter(Boolean))].map((s) => <option key={s} value={s} />)}</datalist>

        <ShopBlock key={`${resetKey}-0`} b={form} patch={patchFirst} first memberId={form.memberId} title={extras.length > 0 ? "店舗 1" : null} findPreset={findPreset} />
        {extras.map((x, i) => (
          <ShopBlock key={x.key} b={x} patch={(p) => patchExtra(x.key, p)} title={`店舗 ${i + 2}`} onRemove={() => removeExtra(x.key)} findPreset={findPreset} />
        ))}

        {!editId && (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={addExtra}>＋ 別の店舗を足す</button>
            {extras.length === 0 && <span className="muted" style={{ marginLeft: 8 }}>同じ日に、ほかの店舗でも働いたとき</span>}
          </div>
        )}

        {extras.length > 0 && (
          <div className="in-total">
            <h3>全部の店舗の合計（{extras.length + 1}店舗。保存すると、店舗ごとに別々の登録になります）</h3>
            <div className="in-result" style={{ marginTop: 6 }}>
              <div className="field calc"><label>売上</label><div className="calc-box">{yen(sum.sales)}</div></div>
              <div className="field calc"><label>計（女性の取り分）</label><div className="calc-box strong">{yen(sum.take)}</div></div>
              <div className="field calc"><label>手取り</label><div className="calc-box net">{yen(sum.net)}</div></div>
            </div>
          </div>
        )}

        {formErr && <div className="auth-err" style={{ marginTop: 10 }}>{formErr}</div>}

        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          {!form.memberId && <span className="muted">女性を選ぶと登録できます</span>}
          {editId && <button type="button" className="btn" onClick={cancelEdit}>キャンセル</button>}
          <button type="submit" className="btn accent" disabled={!valid || saving}>{editId ? "更新する" : extras.length > 0 ? `${extras.length + 1}店舗ぶんを登録する` : "登録する"}</button>
        </div>
      </form>

      <div className="card">
        <h2>登録一覧</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="btn">
            <option value="">全期間</option>
            {months.map((m) => <option key={m} value={m}>{m.replace("-", "年")}月</option>)}
          </select>
          <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)} className="btn">
            <option value="">全員</option>
            {Object.keys(members).map((id) => <option key={id} value={id}>{members[id].name}</option>)}
          </select>
          <span className="muted">{shown.length}件 / 売上 {yen(shownSales)} / 計 {yen(shownTake)} / 手取り {yen(shownNet)}</span>
        </div>
        {shown.length === 0 ? <div className="empty">登録がありません</div> : (<>
          <div className="deal-cards">
            {shown.map((d) => (
              <DealCard key={d.id} d={d} name={nameOf(d.memberId)} onEdit={() => startEdit(d)} onDelete={() => removeDeal(d)} onPaid={() => api.setPaid([d.id], !d.paid)} />
            ))}
          </div>
          <div className="table-wrap deal-table">
            <table>
              <thead><tr>
                <th>日付</th><th>女性</th><th>店舗</th><th>勤務時間</th>
                <th className="num">売上</th><th>店コース</th><th className="num">コース料金</th><th className="num">コースバック</th><th className="num">指名料</th><th>オプション</th><th className="num">OPバック</th><th className="num">延長</th><th className="num">計</th><th className="num">雑費</th><th className="num">手取り</th>
                <th>顧客・メモ</th><th>支払</th><th></th>
              </tr></thead>
              <tbody>
                {shown.map((d) => {
                  return (
                    <tr key={d.id}>
                      <td>{shortDate(d.date)}</td>
                      <td>{nameOf(d.memberId)}</td>
                      <td>{d.shop}</td>
                      <td>{d.hours}</td>
                      <td className="num"><b>{yen(dealSales(d))}</b></td>
                      <td>{dealCourse(d)}</td>
                      <td className="num">{yen(d.coursePrice)}</td>
                      <td className="num">{yen(d.courseBack)}</td>
                      <td className="num">{yen(d.nomination)}</td>
                      <td>{d.optionName || (num(d.option) ? yen(d.option) : "")}</td>
                      <td className="num">{yen(d.opBack)}</td>
                      <td className="num">{yen(d.extension)}</td>
                      <td className="num"><b>{yen(dealTake(d))}</b></td>
                      <td className="num">{yen(d.expense)}</td>
                      <td className="num"><b>{yen(dealNet(d))}</b></td>
                      <td className="muted">{[d.client, d.memo].filter(Boolean).join(" ・")}</td>
                      <td>
                        <button className={"badge " + (d.paid ? "paid" : "unpaid")} style={{ border: 0, cursor: "pointer" }}
                          onClick={() => api.setPaid([d.id], !d.paid)} title="クリックで切り替え">
                          {d.paid ? "支払済" : "未払"}
                        </button>
                      </td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <button className="btn small" onClick={() => startEdit(d)}>編集</button>
                          <button className="btn small danger" onClick={() => removeDeal(d)}>削除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </div>
  );
}
