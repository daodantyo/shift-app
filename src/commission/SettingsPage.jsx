import { useRef, useState } from "react";
import { num, scoutSettings, todayStr } from "./calc";
import HoursInput from "./HoursInput";

export default function SettingsPage({ data, deals, api, user }) {
  return (
    <div className="page">
      <MembersCard members={data.members} deals={deals} api={api} />
      <CoursesCard settings={data.settings || {}} api={api} />
      <ScoutCard settings={data.settings || {}} api={api} />
      <BackupCard data={data} api={api} />
      <div className="card">
        <h2>アカウント</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
          ログイン中：<b>{user?.email}</b><br />
          データは、キャスト管理のお店のデータの中に保存されます。見られるのは、このお店のログインの人だけです。
        </p>
      </div>
      <div className="card">
        <h2>計算のしくみ</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>売上は手入力です（目安として コース料金 ＋ 指名料 ＋ OPバック ＋ 延長 が自動で入ります）。計（女性の取り分）＝ コースバック ＋ 指名料 ＋ OPバック ＋ 延長。</li>
          <li>コースバック・OPバックは金額を手入力します。オプションは内容の文字を入れます。</li>
          <li>報酬手取り額 ＝ 計（報酬総額） − 雑費。集計では女性ごとに月の合計を出します。</li>
          <li>「スカウトバック」の表：報酬 ＝ 女子給（登録の「計」）の合計 × 率 ＋ 勤務加算（同じ日は1回）。その合計に消費税。率などは上の「スカウトバックの計算」で変えます。</li>
          <li>「支払」は女性への手取りの支払い状況です。集計の「未払」は支払済にしていない登録の手取り合計です。</li>
        </ul>
      </div>
    </div>
  );
}

function MembersCard({ members, deals, api }) {
  const [name, setName] = useState("");
  const [shop, setShop] = useState("");
  const [hours, setHours] = useState("");
  const [scout, setScout] = useState("");
  const [editing, setEditing] = useState(null); // {id, name, shop, hours, scout}
  const shopList = [...new Set(Object.values(members).map((m) => m.shop).filter(Boolean))];
  const ids = Object.keys(members).sort((a, b) => (members[a].createdAt || 0) - (members[b].createdAt || 0));

  const add = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    await api.addMember({ name: n, shop: shop.trim(), hours: hours.trim(), scout: scout.trim(), active: true });
    setName(""); setShop(""); setHours(""); setScout("");
  };

  const del = (id) => {
    const used = deals.filter((d) => d.memberId === id).length;
    const msg = used
      ? `${members[id].name} には ${used}件 の登録があります。削除すると登録一覧で「（削除済）」と表示されます。代わりに「非表示」にすることもできます。本当に削除しますか？`
      : `${members[id].name} を削除しますか？`;
    if (window.confirm(msg)) api.deleteMember(id);
  };

  return (
    <div className="card">
      <h2>女性</h2>
      <form className="grid" onSubmit={add}>
        <div className="field"><label>名前</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="名前を入力" /></div>
        <div className="field"><label>店舗名</label><input list="shop-list" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="例：○○店" /></div>
        <div className="field"><label>担当者（スカウト）</label><input value={scout} onChange={(e) => setScout(e.target.value)} placeholder="例：前田" /></div>
        <div className="field hours"><label>勤務時間</label><HoursInput value={hours} onChange={setHours} /></div>
        <div className="field"><label>&nbsp;</label><button className="btn primary" type="submit" disabled={!name.trim()}>追加</button></div>
        <datalist id="shop-list">{shopList.map((s) => <option key={s} value={s} />)}</datalist>
      </form>
      {ids.length === 0 ? <div className="empty">まだ登録がありません</div> : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <tbody>
              {ids.map((id) => {
                const m = members[id];
                const isEdit = editing?.id === id;
                return (
                  <tr key={id} style={{ opacity: m.active === false ? 0.5 : 1 }}>
                    <td style={{ width: "60%" }}>
                      {isEdit ? (
                        <div className="grid">
                          <input className="btn" value={editing.name} autoFocus placeholder="名前" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                          <input className="btn" list="shop-list" value={editing.shop} placeholder="店舗名" onChange={(e) => setEditing({ ...editing, shop: e.target.value })} />
                          <input className="btn" value={editing.scout} placeholder="担当者（スカウト）" onChange={(e) => setEditing({ ...editing, scout: e.target.value })} />
                          <div className="field hours"><HoursInput value={editing.hours} onChange={(v) => setEditing({ ...editing, hours: v })} /></div>
                        </div>
                      ) : (
                        <>
                          <b>{m.name}</b>
                          {m.active === false && <span className="muted"> （非表示）</span>}
                          <div className="muted">{[m.shop, m.hours, m.scout ? `担当者 ${m.scout}` : ""].filter(Boolean).join("　") || "店舗・勤務時間 未設定"}</div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        {isEdit ? (
                          <>
                            <button className="btn small primary" onClick={async () => { if (editing.name.trim()) await api.updateMember(id, { name: editing.name.trim(), shop: (editing.shop || "").trim(), hours: (editing.hours || "").trim(), scout: (editing.scout || "").trim() }); setEditing(null); }}>保存</button>
                            <button className="btn small" onClick={() => setEditing(null)}>取消</button>
                          </>
                        ) : (
                          <>
                            <button className="btn small" onClick={() => setEditing({ id, name: m.name, shop: m.shop || "", hours: m.hours || "", scout: m.scout || "" })}>編集</button>
                            <button className="btn small" onClick={() => api.updateMember(id, { active: m.active === false })}>{m.active === false ? "表示する" : "非表示"}</button>
                            <button className="btn small danger" onClick={() => del(id)}>削除</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BackupCard({ data, api }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const last = data.meta?.lastBackupAt;
  const counts = { members: Object.keys(data.members).length, deals: Object.keys(data.deals).length };

  const download = async () => {
    const payload = { app: "commission-app", version: 3, exportedAt: new Date().toISOString(), members: data.members, deals: data.deals, settings: data.settings || {} };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `報酬バックアップ_${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    await api.markBackedUp();
  };

  const restore = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      let p;
      try { p = JSON.parse(text); } catch { window.alert("このファイルはバックアップファイルではありません。"); return; }
      if (!p || p.app !== "commission-app" || typeof p !== "object") { window.alert("このファイルはバックアップファイルではありません。"); return; }
      const n = { members: Object.keys(p.members || {}).length, deals: Object.keys(p.deals || {}).length };
      const when = p.exportedAt ? new Date(p.exportedAt).toLocaleString("ja-JP") : "不明";
      const ok = window.confirm(
        `バックアップ（${when} 保存）から復元します。

女性 ${n.members}名 / 登録 ${n.deals}件

今のデータ（女性 ${counts.members}名 / 登録 ${counts.deals}件）はすべて置き換わります。よろしいですか？`
      );
      if (!ok) return;
      await api.restoreAll(p);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>バックアップ</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        全データ（女性・登録・設定）を1つのファイルに保存します。週に1回くらい取っておくと安心です。
        {last ? ` 前回：${new Date(last).toLocaleDateString("ja-JP")}` : " まだ保存していません。"}
      </p>
      <div className="row">
        <button className="btn primary" onClick={download}>全データをファイルに保存</button>
        <button className="btn" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>ファイルから復元</button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={restore} />
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>復元すると、今のデータはファイルの内容にすべて置き換わります。復元の前にも一度「保存」しておくと安全です。</p>
    </div>
  );
}

// コース料金表（分 → 料金）。登録の「店コース」の末尾の数字が一致すると コース料金 が自動で入る
function CoursesCard({ settings, api }) {
  const [courses, setCourses] = useState(() => Object.values(settings.courses || {}).map((c) => ({ min: String(c.min ?? ""), price: String(c.price ?? ""), back: c.back === undefined || c.back === null ? "" : String(c.back) })));
  const [dirty, setDirty] = useState(false);

  const setCourse = (i, k, v) => { setCourses((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c))); setDirty(true); };

  const save = async () => {
    const list = courses.filter((c) => String(c.min).trim() !== "" && c.price !== "").map((c) => ({ min: String(c.min).trim(), price: num(c.price), back: c.back === "" ? null : num(c.back) }));
    await api.saveSettings({ courses: list.reduce((o, c, i) => ({ ...o, ["c" + i]: c }), {}) });
    setCourses(list.map((c) => ({ min: String(c.min), price: String(c.price), back: c.back === null ? "" : String(c.back) })));
    setDirty(false);
  };

  return (
    <div className="card">
      <h2>コース料金表</h2>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted">店コース（例：SK-spa/100、クラリス80、60 など自由）・料金・女性バック。登録の「店コース」と同じ文字か、数字だけの行なら末尾の数字が一致すると、コース料金とコースバックが自動で入ります（あとから書き換えできます）</span>
        <button type="button" className="btn small" onClick={() => { setCourses((cs) => [...cs, { min: "", price: "", back: "" }]); setDirty(true); }}>＋コースを追加</button>
      </div>
      {courses.map((c, i) => (
        <div className="tier tier3" key={i}>
          <input className="btn" type="text" placeholder="店コース（例：SK-spa/100、60）" value={c.min} onChange={(e) => setCourse(i, "min", e.target.value)} />
          <input className="btn" type="number" min="0" placeholder="料金（円）" value={c.price} onChange={(e) => setCourse(i, "price", e.target.value)} />
          <input className="btn" type="number" min="0" placeholder="女性バック（円）" value={c.back} onChange={(e) => setCourse(i, "back", e.target.value)} />
          <button type="button" className="btn small danger" onClick={() => { setCourses((cs) => cs.filter((_, j) => j !== i)); setDirty(true); }}>×</button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        <button className="btn accent" onClick={save} disabled={!dirty}>保存する</button>
      </div>
    </div>
  );
}

// スカウトバックの計算（率・勤務加算・消費税）。入れていないときは 15% / 1,000円 / 10%
function ScoutCard({ settings, api }) {
  const cur = scoutSettings(settings);
  const [f, setF] = useState({ rate: String(cur.rate), perDay: String(cur.perDay), tax: String(cur.tax) });
  const [dirty, setDirty] = useState(false);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setDirty(true); };
  const ok = ["rate", "perDay", "tax"].every((k) => f[k] !== "" && Number.isFinite(Number(f[k])) && Number(f[k]) >= 0);

  const save = async () => {
    await api.saveSettings({ scoutback: { rate: Number(f.rate), perDay: Number(f.perDay), tax: Number(f.tax) } });
    setDirty(false);
  };

  return (
    <div className="card">
      <h2>スカウトバックの計算</h2>
      <p className="muted" style={{ marginTop: 0 }}>「スカウトバック」の表の計算に使います。報酬 ＝ 女子給の合計 × 率 ＋ 勤務加算（1勤務ごと）。その合計に消費税がかかります。</p>
      <div className="grid">
        <div className="field"><label>女子給にかける率（％）</label><input type="number" min="0" step="any" value={f.rate} onChange={set("rate")} /></div>
        <div className="field"><label>勤務加算（1勤務あたり・円）</label><input type="number" min="0" step="1" value={f.perDay} onChange={set("perDay")} /></div>
        <div className="field"><label>消費税（％）</label><input type="number" min="0" step="any" value={f.tax} onChange={set("tax")} /></div>
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        <button className="btn accent" onClick={save} disabled={!dirty || !ok}>保存する</button>
      </div>
    </div>
  );
}
