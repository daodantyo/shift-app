// 「キャスト」タブの「完全に削除」。その女性を、名簿から外すだけでなく、ひもづく記録も、全部、消す。
// 画面には依存しない(単体でテストできる)。
//
// 消すもの(shops/<お店ID>/ の下):
//   data/cast の名簿 ・ data/shifts/<ID>(出勤) ・ data/stats/<ID>(指名・ドリンク・売上)
//   castLine/<ID>(LINE の登録) ・ shiftRequests の、その女性の希望シフト ・ lottery/<LINE の ID>(抽選の記録)
// 消さないもの: 日ごとの売上合計(data/sales)・予定表(data/schedule)・「報酬」「面接」のデータ(別の名簿・別の置き場所)。

const sid = (v) => String(v);
const entries = (obj) => Object.entries(obj && typeof obj === "object" ? obj : {});

// 消すものの一覧(updates は、shops/<お店ID> からの、相対パス → 値。null は、消す)と、確認の画面に出す数
export function castRemovalPlan(castId, { cast, shifts, stats, requests, castLine, lottery } = {}) {
  const id = sid(castId);
  const list = Array.isArray(cast) ? cast : [];
  const newCast = list.filter((c) => c && sid(c.id) !== id);

  const without = (obj) => Object.fromEntries(entries(obj).filter(([k]) => k !== id));
  const newShifts = without(shifts);
  const newStats = without(stats);

  const dayList = (obj) => entries(obj && obj[id]).map(([, v]) => v).filter((v) => v && typeof v === "object");
  const worked = dayList(shifts).filter((s) => s.status && s.status !== "off").length;
  const stat = dayList(stats).filter((s) => ["douhan", "shimei", "drink", "sales"].some((k) => (Number(s[k]) || 0) > 0)).length;

  const updates = { "data/cast": newCast, [`data/shifts/${id}`]: null, [`data/stats/${id}`]: null };

  const line = entries(castLine).find(([k]) => k === id);
  if (line) updates[`castLine/${id}`] = null;

  const reqKeys = entries(requests).filter(([, r]) => r && sid(r.castId) === id).map(([k]) => k);
  for (const k of reqKeys) updates[`shiftRequests/${k}`] = null;

  // 抽選の記録は、LINE の ID ごと。ほかの(残る)キャストも、同じ LINE の ID を使っているときは、その人の記録なので、消さない
  const uid = line && line[1] && line[1].lineUserId;
  let lotteryDays = 0;
  if (uid) {
    const keep = new Set(newCast.map((c) => sid(c.id)));
    const sharedWithOther = entries(castLine).some(([k, v]) => k !== id && keep.has(k) && v && v.lineUserId === uid);
    if (!sharedWithOther && lottery && lottery[uid]) {
      updates[`lottery/${uid}`] = null;
      lotteryDays = entries(lottery[uid]).length;
    }
  }

  return {
    newCast, newShifts, newStats, updates,
    counts: { worked, stat, requests: reqKeys.length, line: !!line, lottery: lotteryDays },
  };
}

// 確認の文。消えるものを、数つきで、ならべる。いつも、元に戻せないことと、バックアップのことを伝える
export function removeCastConfirm(name, counts) {
  const c = counts || {};
  const items = ["キャストの名簿"];
  if (c.worked) items.push(`出勤の記録（${c.worked} 日）`);
  if (c.stat) items.push(`指名・ドリンク・売上の記録（${c.stat} 日）`);
  if (c.line) items.push("LINE の登録");
  if (c.requests) items.push(`届いている希望シフト（${c.requests} 件）`);
  if (c.lottery) items.push(`抽選の記録（${c.lottery} 日）`);
  return [
    `${name} さんを、完全に削除しますか？`,
    `次のものが、すべて消えます:\n${items.map((t) => `・${t}`).join("\n")}`,
    "（日ごとの売上合計・予定表・「報酬」「面接」の記録は、消えません）",
    "元に戻せません。先に「今すぐバックアップ」を取ると、安心です。",
  ].join("\n\n");
}
