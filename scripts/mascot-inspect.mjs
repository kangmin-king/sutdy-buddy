// 생성된 마스코트가 사양의 팔레트를 실제로 지켰는지 확인한다.
// 이미지 생성 도구는 hex를 정확히 지키지 않는 경우가 많아서, 눈으로 보고 넘기면 안 된다.
import sharp from 'sharp';

const SRC = process.argv[2];
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
console.log(`${info.width}x${info.height}  채널 ${info.channels}`);

// 불투명 픽셀의 색 빈도
const counts = new Map();
let opaque = 0;
for (let i = 0; i < data.length; i += info.channels) {
  const a = data[i + 3];
  if (a < 250) continue;
  opaque++;
  const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
const hex = (s) => '#' + s.split(',').map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();

console.log(`\n불투명 픽셀 ${opaque.toLocaleString()}개 중 상위 색:`);
for (const [k, n] of top) {
  console.log(`  ${hex(k).padEnd(9)} ${((n / opaque) * 100).toFixed(1).padStart(5)}%  rgb(${k})`);
}

// 사양의 기준색과 가장 가까운 실제 색을 찾아 편차를 본다
const SPEC = {
  '윤곽선 outline': '#7C789B',
  '몸통 on-surface(다크)': '#E9E8F5',
  '귀 안쪽 tertiary(다크)': '#B0A3E0',
  '볼터치 primary(다크)': '#A29BF2',
  '눈코입 on-surface(라이트)': '#191C1E',
  '노트 secondary(다크)': '#6FD9AE',
};
const toRgb = (h) => h.slice(1).match(/../g).map((x) => parseInt(x, 16));
// 상위 N색만 보면 안 된다 — 안티에일리어싱 때문에 몸통 색 변종이 상위를 전부 차지해서
// 눈·노트 같은 작은 면적의 색이 비교에서 빠진다. 전체 색 목록에서 가장 가까운 것을 찾는다.
console.log('\n사양 대비 실제 (전체 픽셀에서 가장 가까운 색):');
for (const [label, spec] of Object.entries(SPEC)) {
  const s = toRgb(spec);
  let best = null;
  let within = 0;
  for (const [k, n] of counts) {
    const c = k.split(',').map(Number);
    const d = Math.max(Math.abs(c[0] - s[0]), Math.abs(c[1] - s[1]), Math.abs(c[2] - s[2]));
    if (!best || d < best.d) best = { d, hex: hex(k) };
    if (d <= 12) within += n;
  }
  const pct = ((within / opaque) * 100).toFixed(2);
  const verdict = best.d <= 8 ? '일치' : best.d <= 24 ? `근사 (Δ${best.d})` : `⚠ 어긋남 (Δ${best.d})`;
  console.log(`  ${label.padEnd(26)} 사양 ${spec}  실제 ${best.hex}  ${verdict.padEnd(16)} 면적 ${pct}%`);
}

// 투명 여백
const { info: t } = await sharp(SRC).trim().toBuffer({ resolveWithObject: true });
console.log(`\ntrim 후 실제 그림 크기: ${t.width}x${t.height} (원본 여백이 ${info.width - t.width}x${info.height - t.height})`);
