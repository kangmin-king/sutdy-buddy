// 적용 전 검수 — 지시서의 검수 기준 1·2·3(36px 얼굴 / 32px 실루엣 / 다크에서 흰 사각형 없음)을
// 실제 표시 크기로 렌더해서 눈으로 확인한다. 확대본은 판단을 왜곡하므로 원래 크기도 함께 둔다.
import sharp from 'sharp';

const SRC = process.argv[2];
const OUT = process.argv[3];
const CROP = JSON.parse(process.argv[4]); // {left, top, size}

const LIGHT = { r: 247, g: 249, b: 251, alpha: 1 }; // surface 라이트
const DARK = { r: 27, g: 24, b: 50, alpha: 1 };     // surface 다크

const circle = (px) => Buffer.from(`<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`);

async function tile(px, bg, round) {
  let img = sharp(SRC).extract({ left: CROP.left, top: CROP.top, width: CROP.size, height: CROP.size }).resize(px, px);
  if (round) img = img.composite([{ input: circle(px), blend: 'dest-in' }]);
  const fg = await img.png().toBuffer();
  return sharp({ create: { width: px, height: px, channels: 4, background: bg } })
    .composite([{ input: fg }]).png().toBuffer();
}

// 왼쪽은 실제 크기, 오른쪽은 4배 확대. 라이트/다크 두 줄.
const rows = [
  { bg: LIGHT, label: 'light' },
  { bg: DARK, label: 'dark' },
];
const sizes = [36, 32, 56];
const pad = 16, zoom = 4, rowH = 56 * zoom + pad;
const width = pad + sizes.reduce((a, s) => a + s + pad + s * zoom + pad * 2, 0);
const comps = [];
let y0 = pad;
for (const row of rows) {
  let x = pad;
  for (const s of sizes) {
    const real = await tile(s, row.bg, true);
    comps.push({ input: real, left: x, top: y0 + Math.round((56 * zoom - s) / 2) });
    x += s + pad;
    const big = await sharp(real).resize(s * zoom, s * zoom, { kernel: 'nearest' }).png().toBuffer();
    comps.push({ input: big, left: x, top: y0 + Math.round((56 * zoom - s * zoom) / 2) });
    x += s * zoom + pad * 2;
  }
  y0 += rowH;
}
await sharp({ create: { width, height: pad + rows.length * rowH, channels: 4, background: { r: 120, g: 120, b: 130, alpha: 1 } } })
  .composite(comps).png().toFile(`${OUT}/verify.png`);
console.log(`검수 시트: ${OUT}/verify.png  (윗줄 라이트 / 아랫줄 다크, 각 36·32·56px의 실제크기와 4배)`);
