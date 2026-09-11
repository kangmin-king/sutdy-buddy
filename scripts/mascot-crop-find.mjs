// 얼굴 crop 좌표를 찾는다. 눈(거의 검정) 위치로 얼굴 중심을 잡고, 후보 정사각형들을
// 실제 표시 크기(36px 원형)로 렌더해 비교표를 만든다 — 숫자만 보고 고르면 귀가 잘린다.
import sharp from 'sharp';

const SRC = process.argv[2];
const OUT = process.argv[3];

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const at = (x, y) => {
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

// 불투명 경계
let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
// 눈·코·입(거의 검정)
let eMinX = info.width, eMaxX = 0, eMinY = info.height, eMaxY = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const [r, g, b, a] = at(x, y);
    if (a < 40) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (r < 60 && g < 60 && b < 60) {
      if (x < eMinX) eMinX = x; if (x > eMaxX) eMaxX = x;
      if (y < eMinY) eMinY = y; if (y > eMaxY) eMaxY = y;
    }
  }
}
const cx = Math.round((minX + maxX) / 2);
const faceCx = Math.round((eMinX + eMaxX) / 2);
const faceCy = Math.round((eMinY + eMaxY) / 2);
console.log(`내용 경계  X ${minX}~${maxX}  Y ${minY}~${maxY}   가로중심 ${cx}`);
console.log(`이목구비   X ${eMinX}~${eMaxX}  Y ${eMinY}~${eMaxY}   중심 (${faceCx}, ${faceCy})`);

// 후보: 얼굴 중심을 원 안에 두되 한 변을 달리한다
const sides = (process.argv[4] ?? '640,760,880,1000').split(',').map(Number);
const cands = sides.map((s) => ({
  s,
  left: Math.max(0, Math.min(info.width - s, faceCx - Math.round(s / 2))),
  top: Math.max(0, Math.min(info.height - s, faceCy - Math.round(s * 0.46))),
}));

// 36px 원형 마스크 + 4배 확대해 비교표
const cell = 160, pad = 20;
const mask = Buffer.from(`<svg width="36" height="36"><circle cx="18" cy="18" r="18" fill="#fff"/></svg>`);
const tiles = [];
for (const c of cands) {
  const small = await sharp(SRC).extract({ left: c.left, top: c.top, width: c.s, height: c.s })
    .resize(36, 36)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png().toBuffer();
  const zoom = await sharp(small).resize(cell, cell, { kernel: 'nearest' }).png().toBuffer();
  tiles.push({ input: zoom, left: pad + tiles.length * (cell + pad), top: pad });
  console.log(`후보 s=${c.s}  left=${c.left} top=${c.top}`);
}
await sharp({
  create: { width: pad + cands.length * (cell + pad), height: cell + pad * 2, channels: 4, background: { r: 247, g: 249, b: 251, alpha: 1 } },
}).composite(tiles).png().toFile(`${OUT}/crop-sheet.png`);
console.log(`비교표: ${OUT}/crop-sheet.png`);
