// 報酬計算のロジック（画面と切り離した純粋な関数群）

export function yen(n) {
  const v = Math.round(Number(n) || 0);
  return "¥" + v.toLocaleString("ja-JP");
}

export const num = (x) => Number(x) || 0;

// バック額 = 金額 × 率%（円未満切り捨て）
export function calcBack(amount, rate) {
  return Math.floor((num(amount) * num(rate)) / 100);
}

// 内訳から出す売上の目安 = コース料金 + 指名料 + OPバック + 延長（オプションは文字なので金額に含めない）
export function autoSales(d) {
  return num(d.coursePrice) + num(d.nomination) + num(d.opBack) + num(d.extension);
}

// 売上：手入力で保存された金額(amount)をそのまま使う。無い場合だけ内訳の合計
export function dealSales(d) {
  if (d.amount !== undefined && d.amount !== null && d.amount !== "") return num(d.amount);
  return autoSales(d);
}

// 計（女性の取り分）= コースバック + 指名料 + OPバック + 延長
export function dealTake(d) {
  return num(d.courseBack) + num(d.nomination) + num(d.opBack) + num(d.extension);
}

// 雑費（女性の取り分から引く）と 手取り = 計 − 雑費
export function dealExpense(d) {
  return num(d.expense);
}
export function dealNet(d) {
  return dealTake(d) - dealExpense(d);
}

// 店コース（文字）。古い登録は 分 の数字だけなのでそのまま出す
export function dealCourse(d) {
  if (d.course) return String(d.course);
  return d.courseMin ? String(d.courseMin) : "";
}

export function monthKey(date) {
  return (date || "").slice(0, 7); // "2026-09-08" -> "2026-09"
}

export function todayStr() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 種別 (type) の形:
// { name, mode: "rate" | "fixed", value, tierBasis: "amount" | "count", tiers: [{ min, value }] }
//  - mode=rate  : 売上 × value%
//  - mode=fixed : 1件あたり value 円
//  - tiers      : 月間の売上合計(amount) または 件数(count) が min 以上なら value に置き換える（段階制）
export function resolveValue(type, monthlyAmount, monthlyCount) {
  let v = Number(type.value) || 0;
  const basis = type.tierBasis === "count" ? monthlyCount : monthlyAmount;
  const tiers = Object.values(type.tiers || {})
    .filter((t) => t && t.min !== "" && t.min !== null && t.min !== undefined)
    .map((t) => ({ min: Number(t.min) || 0, value: Number(t.value) || 0 }))
    .sort((a, b) => a.min - b.min);
  for (const t of tiers) {
    if (basis >= t.min) v = t.value;
  }
  return v;
}

// deals: [{ id, date, memberId, typeId, amount, manualCommission? }]
// types: { [typeId]: type }
// 戻り値: { [dealId]: { commission, label } }
export function computeCommissions(deals, types) {
  const amountTotals = {};
  const countTotals = {};
  for (const d of deals) {
    const k = `${d.memberId}|${d.typeId}|${monthKey(d.date)}`;
    amountTotals[k] = (amountTotals[k] || 0) + dealSales(d);
    countTotals[k] = (countTotals[k] || 0) + 1;
  }
  const out = {};
  for (const d of deals) {
    if (d.manualCommission !== undefined && d.manualCommission !== null && d.manualCommission !== "") {
      out[d.id] = { commission: Math.round(Number(d.manualCommission) || 0), label: "手入力" };
      continue;
    }
    const t = types[d.typeId];
    if (!t) {
      out[d.id] = { commission: 0, label: "種別なし" };
      continue;
    }
    const k = `${d.memberId}|${d.typeId}|${monthKey(d.date)}`;
    const v = resolveValue(t, amountTotals[k] || 0, countTotals[k] || 0);
    if (t.mode === "fixed") {
      out[d.id] = { commission: Math.round(v), label: `固定 ${yen(v)}` };
    } else {
      out[d.id] = { commission: Math.floor((dealSales(d) * v) / 100), label: `${v}%` };
    }
  }
  return out;
}

// 月別・女性別の集計
export function summarize(deals, month) {
  const rows = {};
  for (const d of deals) {
    if (month && monthKey(d.date) !== month) continue;
    const r = (rows[d.memberId] = rows[d.memberId] || {
      memberId: d.memberId,
      count: 0,
      amount: 0,
      take: 0,
      expense: 0,
      net: 0,
      paid: 0,
      unpaid: 0,
    });
    r.count += 1;
    r.amount += dealSales(d);
    r.take += dealTake(d);
    r.expense += dealExpense(d);
    r.net += dealNet(d);
    if (d.paid) r.paid += dealNet(d);
    else r.unpaid += dealNet(d);
  }
  return rows;
}

export function toCsv(deals, members) {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["日付", "女性", "店舗", "勤務時間", "売上", "店コース", "コース料金", "コースバック", "指名料", "オプション", "OPバック", "延長", "計", "雑費", "手取り", "顧客・案件", "支払", "メモ"];
  const lines = [head.map(esc).join(",")];
  for (const d of deals) {
    lines.push(
      [
        d.date,
        members[d.memberId]?.name || "",
        d.shop,
        d.hours,
        dealSales(d),
        dealCourse(d),
        num(d.coursePrice),
        num(d.courseBack),
        num(d.nomination),
        d.optionName || (num(d.option) ? num(d.option) : ""),
        num(d.opBack),
        num(d.extension),
        dealTake(d),
        dealExpense(d),
        dealNet(d),
        d.client,
        d.paid ? "支払済" : "未払",
        d.memo,
      ]
        .map(esc)
        .join(",")
    );
  }
  return "﻿" + lines.join("\r\n");
}

// ---- 紹介スカウトバック（勤務・報酬管理表） ----
// 担当者（スカウト）への報酬 ＝ 女子給の合計 × 率% ＋ 1勤務あたりの勤務加算。そこに消費税。
export const SCOUT_DEFAULTS = { rate: 15, perDay: 1000, tax: 10 };

// 設定（settings.scoutback）。入っていない・おかしな値のところは初期値（15% / 1,000円 / 10%）
export function scoutSettings(settings) {
  const s = (settings && settings.scoutback) || {};
  const pick = (v, d) => {
    if (v === "" || v === null || v === undefined) return d;
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : d;
  };
  return { rate: pick(s.rate, SCOUT_DEFAULTS.rate), perDay: pick(s.perDay, SCOUT_DEFAULTS.perDay), tax: pick(s.tax, SCOUT_DEFAULTS.tax) };
}

// 「予約」の列：店コースの文字。数字だけのとき（例：60）は「60分」にする
export function dealReserve(d) {
  const c = dealCourse(d).trim();
  return /^\d+$/.test(c) ? c + "分" : c;
}

// 登録の一覧 → 表の行。日付→登録順に並べ、同じ日の最初の行にだけ 勤務=1
// 女子給 ＝ 計（コースバック＋指名料＋OPバック＋延長）
export function scoutRows(deals) {
  const list = deals.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  const seen = new Set();
  return list.map((d) => {
    const first = !seen.has(d.date);
    seen.add(d.date);
    return {
      id: d.id,
      date: d.date,
      hours: d.hours || "",
      reserve: dealReserve(d),
      work: first ? 1 : 0,
      coursePrice: num(d.coursePrice),
      pay: dealTake(d),
      memo: d.memo || "",
    };
  });
}

// 集計。rows は scoutRows の行（勤務・備考を直したものでもよい）、cfg は scoutSettings の結果
export function scoutTotals(rows, cfg) {
  const days = new Set(rows.filter((r) => r.date).map((r) => r.date)).size; // 勤務日数（日付の重複なし）
  const pay = rows.reduce((s, r) => s + num(r.pay), 0);
  const bonus = Math.round((pay * cfg.rate) / 100);
  const workCount = rows.reduce((s, r) => s + num(r.work), 0);
  const perDayTotal = workCount * cfg.perDay;
  const subtotal = bonus + perDayTotal;
  const tax = Math.round((subtotal * cfg.tax) / 100);
  return { days, pay, bonus, workCount, perDayTotal, subtotal, tax, total: subtotal + tax };
}
