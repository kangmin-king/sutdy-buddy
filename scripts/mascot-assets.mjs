// 마스코트 자산 생성 — 코덱스가 만든 원본(투명 PNG)에서 앱·랜딩이 쓸 파일을 뽑는다.
// .NET PNG 인코더는 팔레트 최적화를 안 해서 546KB가 나왔다. sharp로 다시 만든다.
import sharp from 'sharp';
import { statSync } from 'node:fs';

const SRC = 'C:\\Users\\UserK\\Desktop\\study-bugs-mascot-v1\\study-bugs-mascot-v1.png';
const OUT = process.argv[2];

const meta = await sharp(SRC).metadata();
console.log('원본', `${meta.width}x${meta.height}`, meta.hasAlpha ? '알파 있음' : '알파 없음');

// 전신 — 랜딩 히어로 최대 표시 256x288(max-w-64 / max-h-72)이므로 3배로 넉넉히 768폭.
// trim()으로 투명 여백을 잘라내 실제 그림이 프레임을 채우게 한다.
await sharp(SRC).trim().resize({ width: 768, withoutEnlargement: true })
  .png({ compressionLevel: 9, palette: true }).toFile(`${OUT}/body.png`);
await sharp(SRC).trim().resize({ width: 768, withoutEnlargement: true })
  .webp({ quality: 92, alphaQuality: 100 }).toFile(`${OUT}/body.webp`);

// 얼굴 crop — 원형 아바타(상단바 36px, 랜딩 32~56px)용. 후보 비교에서 고른 D안.
// 귀가 원 안에 읽히면서 얼굴도 충분히 큰 지점이다.
const FACE = { left: 182, top: 150, width: 780, height: 780 };
await sharp(SRC).extract(FACE).resize(512, 512)
  .png({ compressionLevel: 9, palette: true }).toFile(`${OUT}/face.png`);
await sharp(SRC).extract(FACE).resize(512, 512)
  .webp({ quality: 92, alphaQuality: 100 }).toFile(`${OUT}/face.webp`);

// og 이미지 — 카카오톡 등의 링크 미리보기. **PNG여야 하고 절대 URL이어야 한다**(index.html 주석 참고).
// 투명 배경을 그대로 쓰면 클라이언트에 따라 검게 깔리므로 라이트 surface(#F7F9FB)를 깐다.
// 크기·비율은 기존 og-image.png(1042x1251)를 그대로 따른다 — 그림만 바꾸는 최소 변경이다.
await sharp({
  create: { width: 1042, height: 1251, channels: 4, background: { r: 247, g: 249, b: 251, alpha: 1 } },
})
  .composite([{ input: await sharp(SRC).trim().resize({ height: 1100, withoutEnlargement: true }).toBuffer(), gravity: 'center' }])
  .png({ compressionLevel: 9, palette: true })
  .toFile(`${OUT}/og-image.png`);

for (const f of ['body.png', 'body.webp', 'face.png', 'face.webp', 'og-image.png']) {
  const m = await sharp(`${OUT}/${f}`).metadata();
  console.log(
    f.padEnd(12),
    `${m.width}x${m.height}`.padEnd(10),
    `${(statSync(`${OUT}/${f}`).size / 1024).toFixed(0)} KB`.padStart(7),
    m.hasAlpha ? '알파 O' : '알파 X'
  );
}
