// 「キャスト」タブの「削除」を押したときの、確認の文と、記録の数え方。画面には依存しない(単体でテストできる)。
//
// 削除は、キャストの名簿(cast)から、その女性を外すだけ。出勤(shifts)・指名や売上(stats)は、データには残る。
// ただし、一覧・集計・ランキングは、名簿にいるキャストだけを数えるので、削除すると、画面には出なくなる。
// 同じ名前で追加し直しても、新しい ID になるので、前の記録にはつながらない。
// だから、消す前に、「どれくらいの記録が、画面から消えるか」を伝える。

// その女性の、出勤した日の数と、指名・ドリンク・売上のどれかを入れた日の数
export function castRecordCounts(castId, shifts, stats) {
  const days = (obj) => Object.values((obj && obj[castId]) || {}).filter((v) => v && typeof v === "object");
  const worked = days(shifts).filter((s) => s.status && s.status !== "off").length;
  const stat = days(stats).filter((s) => ["douhan", "shimei", "drink", "sales"].some((k) => (Number(s[k]) || 0) > 0)).length;
  return { worked, stat };
}

// 確認の文。記録があれば、数を出す。いつも、元に戻せないことと、バックアップのことを伝える
export function removeCastConfirm(name, counts) {
  let text = `${name} さんを、キャストの一覧から削除しますか？`;
  const parts = [];
  if (counts && counts.worked) parts.push(`出勤 ${counts.worked} 日`);
  if (counts && counts.stat) parts.push(`指名・売上などの記録 ${counts.stat} 日`);
  if (parts.length) text += `\n\n${name} さんの記録（${parts.join("、")}）は、データには残りますが、一覧・集計・ランキングには出なくなります。`;
  text += "\n\n元に戻せません。同じ名前で追加し直しても、前の記録にはつながりません。\n先に「今すぐバックアップ」を取ると、安心です。";
  return text;
}
