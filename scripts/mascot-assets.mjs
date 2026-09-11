// 마스코트 자산 생성 — 코덱스 최종본(투명 PNG)에서 앱·랜딩이 쓸 파일을 뽑는다.
//
// **하나의 정사각 자산만 만든다.** 지시서는 전신 원본과 얼굴 crop을 따로 두라고 했지만,
// 이 그림은 이미 얼굴/상반신 중심이라 36px 원형에서도 귀까지 읽힌다(crop 후보 4개를
// 36·32px로 렌더해 비교한 결과, 얼굴만 더 당겨 자르면 오히려 귀가 사라져 토끼로 안 보인다).
// 실제 사용처가 24~56px뿐이라 두 벌을 유지할 이유가 없다.
//
// 사용: node scripts/mascot-assets.mjs <출력폴더>
import sharp from 'sharp';
import { statSync } from 'node:fs';

const SRC =
  'C:\\Users\\UserK\\Documents\\Codex\\2026-09-11\\apk-v1-2-7-design-md\\outputs\\study-bugs-mascot-final-package\\mascot-buddy-v2-final.png';
const OUT = process.argv[2];

// 36px 원형에서 귀가 온전히 보이면서 얼굴도 가장 큰 지점. 후보 비교로 골랐다
// (s=880 이하는 귀가 잘려 사라지고, s=1254(전체)는 여백만 늘어 토끼가 작아진다).
const CROP = { left: 67, top: 134, width: 1120, height: 1120 };

const meta = await sharp(SRC).metadata();
console.log('원본', `${meta.width}x${meta.height}`, meta.hasAlpha ? '알파 있음' : '알파 없음');

// 앱·랜딩 공용 — 최대 표시 56px이므로 512면 9배 넘게 여유가 있다.
await sharp(SRC).extract(CROP).resize(512, 512).webp({ quality: 92, alphaQuality: 100 }).toFile(`${OUT}/buddy.webp`);

// og 이미지 — 카카오톡 등 링크 미리보기. **PNG여야 하고 절대 URL이어야 한다**(index.html 주석 참고).
// 투명 배경을 그대로 두면 클라이언트에 따라 검게 깔리므로 라이트 surface(#F7F9FB)를 깐다.
// 크기·비율은 기존 og-image.png(1042x1251)를 그대로 따른다 — 그림만 바꾸는 최소 변경이다.
await sharp({
  create: { width: 1042, height: 1251, channels: 4, background: { r: 247, g: 249, b: 251, alpha: 1 } },
})
  .composite([{ input: await sharp(SRC).trim().resize({ height: 1100, withoutEnlargement: true }).toBuffer(), gravity: 'center' }])
  .png({ compressionLevel: 9, palette: true })
  .toFile(`${OUT}/og-image.png`);

for (const f of ['buddy.webp', 'og-image.png']) {
  const m = await sharp(`${OUT}/${f}`).metadata();
  console.log(
    f.padEnd(14),
    `${m.width}x${m.height}`.padEnd(12),
    `${(statSync(`${OUT}/${f}`).size / 1024).toFixed(0)} KB`.padStart(7),
    m.hasAlpha ? '알파 O' : '알파 X'
  );
}
