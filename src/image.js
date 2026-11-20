// 画像を、ブラウザの中で小さくして、文字(data URL)にする。
// 面接の写真・書類を、データベースに入れるために使う(有料の保存場所は、使わない)。
// 外のサービスには、送らない。ここで作った文字は、お店のログインだけが読める場所に入る。

// 縦横の長いほうが maxPx に収まるように、小さくした大きさを返す(元より大きくはしない)
export function fitSize(w, h, maxPx) {
  const longest = Math.max(w, h);
  if (!longest || longest <= maxPx) return { w, h };
  const scale = maxPx / longest;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

// data URL の、おおよその大きさ(KB)
export function dataUrlSizeKB(dataUrl) {
  return Math.round(((dataUrl || "").length * 3) / 4 / 1024);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした。")); };
    img.src = url;
  });
}

// 画像を、白い背景に描いて、JPEG の文字にする(JPEG は透明を持てないので、白で塗る)
function drawJpeg(img, maxPx, quality) {
  const { w, h } = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxPx);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

// 大きさの上限(maxKB)に収まるまで、少しずつ小さくする順番(大きさ・画質)
export function shrinkSteps(maxPx, quality) {
  return [
    [maxPx, quality],
    [maxPx, Math.max(0.5, quality - 0.12)],
    [Math.round(maxPx * 0.8), 0.7],
    [Math.round(maxPx * 0.6), 0.65],
  ];
}

// 1枚の画像から、「大きい画像」と(いるなら)小さな画像(thumb = その人の画面の並び用、mini = 一覧の顔写真用)を作る。
// 上限に収まらなければ、エラー(呼ぶ側が、理由を画面に出す)
export async function makeImageSet(file, { maxPx, quality = 0.82, maxKB, thumbPx = 0, miniPx = 0 }) {
  if (!file || !/^image\//.test(file.type || "")) throw new Error("画像のファイルを選んでください。");
  const img = await loadImage(file);
  let data = "";
  for (const [px, q] of shrinkSteps(maxPx, quality)) {
    data = drawJpeg(img, px, q);
    if (dataUrlSizeKB(data) <= maxKB) break;
  }
  const kb = dataUrlSizeKB(data);
  if (kb > maxKB) throw new Error("画像が大きすぎて、小さくできませんでした。");
  const thumb = thumbPx ? drawJpeg(img, thumbPx, 0.7) : "";
  const mini = miniPx ? drawJpeg(img, miniPx, 0.65) : "";
  return { data, thumb, mini, kb };
}
