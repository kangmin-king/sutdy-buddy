// 설치 요청 전 최종 점검 — 학생이 받는 것과 서버가 기대하는 것이 실제로 맞는지.
import { statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const LANDING = 'https://studybuks.store';
const APP = 'https://app.studybuks.store';
const FN = 'https://emzpjxcaydrzbwwjnuee.supabase.co/functions/v1';

const ok = (b) => (b ? 'OK  ' : '❌  ');
const rows = [];

// 1) 랜딩이 APK를 올바른 Content-Type으로 주는가 (드라이브 시절 사고 재발 방지)
{
  const head = execSync(`curl.exe -s -I --max-time 60 "${LANDING}/studybuks.apk"`, { encoding: 'utf8' });
  const ct = (head.match(/content-type:\s*(.+)/i) ?? [])[1]?.trim() ?? '(없음)';
  const len = Number((head.match(/content-length:\s*(\d+)/i) ?? [])[1] ?? 0);
  rows.push([ok(ct.includes('android.package-archive')), 'APK Content-Type', ct]);
  rows.push([ok(len > 7_000_000), 'APK 크기', `${(len / 1024 / 1024).toFixed(1)} MB`]);
}

// 2) 웹앱이 새 알림 페이로드를 쓰는가
{
  const html = execSync(`curl.exe -s --max-time 60 -H "Cache-Control: no-cache" "${APP}/"`, { encoding: 'utf8' });
  const entry = (html.match(/\/assets\/[A-Za-z0-9._-]+\.js/) ?? [])[0];
  const code = execSync(`curl.exe -s --max-time 120 "${APP}${entry}"`, { encoding: 'utf8' });
  const appChunk = (code.match(/App-[A-Za-z0-9_-]+\.js/) ?? [])[0];
  const app = execSync(`curl.exe -s --max-time 120 "${APP}/assets/${appChunk}"`, { encoding: 'utf8' });
  rows.push([ok(app.includes('planner_item_completed')), '웹앱: 새 알림 이벤트', appChunk]);
  rows.push([ok(app.includes('carry_over_planner_item')), '웹앱: 이월 RPC', '']);
  rows.push([ok(app.includes('sb_publishable_')), '웹앱: publishable 키', '']);
  rows.push([ok(!/mascot-face-v2|mascot-bunny-color/.test(app)), '웹앱: 옛 마스코트 없음', '']);
}

// 3) 엣지 함수가 살아 있고 인증을 요구하는가
for (const fn of ['send-push-notification', 'homework-not-started-reminder', 'admin-users-overview']) {
  const codeOut = execSync(`curl.exe -s -o NUL -w "%{http_code}" --max-time 60 -X POST "${FN}/${fn}" -H "Content-Type: application/json" -d "{}"`, { encoding: 'utf8' }).trim();
  rows.push([ok(codeOut === '401'), `엣지 ${fn}`, `HTTP ${codeOut} (401이어야 정상)`]);
}

// 4) og 이미지가 PNG로 서빙되는가 (카카오톡)
{
  const head = execSync(`curl.exe -s -I --max-time 60 "${LANDING}/og-image.png"`, { encoding: 'utf8' });
  const ct = (head.match(/content-type:\s*(.+)/i) ?? [])[1]?.trim() ?? '(없음)';
  rows.push([ok(ct.includes('image/png')), 'og 이미지 타입', ct]);
}

const w = Math.max(...rows.map((r) => r[1].length));
for (const [s, label, detail] of rows) console.log(`${s}${label.padEnd(w + 2)}${detail}`);
console.log(`\n${rows.every((r) => r[0].startsWith('OK')) ? '전부 통과 — 설치 요청 가능' : '⚠ 실패 항목 있음'}`);
