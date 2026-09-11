// 코덱스에 코드 리뷰를 맡기는 도구.
//
// read-only 모드에서는 코덱스에 셸도 파일 읽기 도구도 없다 — 소스를 stdin으로 통째로 넘겨야 한다.
// PowerShell로 파이프하면 PS 5.1이 UTF-8을 ANSI로 읽어 한글이 깨지므로, 여기서 바이트를 그대로 쓴다.
// codex.cmd를 spawn하면 EINVAL이 나므로 JS 엔트리를 node로 직접 띄운다.
//
// 사용: node codex-review.mjs <배치이름>

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CODEX = 'C:\\Users\\UserK\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js';
const ROOT = 'C:\\Users\\UserK\\\ud074\ub85c\ub4dc\\sutdy-buddy';
const OUT_DIR = 'C:\\Users\\UserK\\AppData\\Local\\Temp\\claude\\C--Users-UserK----\\96ff5d32-8e31-4a68-bb0b-2558e94d3132\\scratchpad';

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const TS = ['.ts', '.tsx'];

const BATCHES = {
  core: {
    title: '핵심 로직 — 상태 관리, 순수 함수, 공용 컴포넌트',
    files: () => [
      join(ROOT, 'src/lib.ts'),
      join(ROOT, 'src/constants.ts'),
      join(ROOT, 'src/primitives.tsx'),
      join(ROOT, 'src/App.tsx'),
      ...walk(join(ROOT, 'src/state'), TS),
      ...walk(join(ROOT, 'src/types'), TS),
      ...walk(join(ROOT, 'src/lib'), TS),
    ],
  },
  student: {
    title: '학생 화면',
    files: () => [...walk(join(ROOT, 'src/screens/student'), TS), ...walk(join(ROOT, 'src/screens/shared'), TS)],
  },
  manager: {
    title: '매니저(과외쌤·학부모) 화면',
    files: () => [...walk(join(ROOT, 'src/screens/manager'), TS), ...walk(join(ROOT, 'src/screens/shared'), TS)],
  },
  server: {
    title: '서버 — Supabase 엣지 함수와 마이그레이션',
    files: () => [...walk(join(ROOT, 'supabase/functions'), TS), ...walk(join(ROOT, 'supabase/migrations'), ['.sql'])],
  },
  landing: {
    title: '랜딩 페이지',
    files: () => walk(join(ROOT, 'landing/src'), TS),
  },
};

const name = process.argv[2];
const batch = BATCHES[name];
if (!batch) {
  console.error(`배치 이름을 주세요: ${Object.keys(BATCHES).join(' | ')}`);
  process.exit(1);
}

const prompt = `당신은 이 앱의 코드를 처음 보는 시니어 엔지니어입니다. **코드 리뷰**를 부탁합니다.

# 리뷰 대상

${batch.title}

아래에 소스를 그대로 붙입니다. 당신은 셸도 파일 접근도 없습니다 — 붙여진 내용만으로 판단하고,
**보이지 않는 것에 대해 추측하지 마세요.** 확인이 필요하면 "이 파일이 필요하다"고 말해 주세요.

# 이 제품이 무엇인가

한국 과외 학습관리 앱. 과외 선생님(또는 학부모) 한 명이 학생 몇 명을 관리합니다.
학생은 오늘 숙제를 보고 타이머로 공부하고 완료를 체크합니다. 매니저는 숙제를 내고,
학생이 했는지 보고, 시험 범위를 날짜별로 쪼개 배정합니다.

- React + Vite + TypeScript, Tailwind, Capacitor(안드로이드), Supabase(Postgres + RLS + 엣지 함수)
- **실사용자는 학생 2명, 매니저 2명.** 파일럿이고 스토어에 없습니다. A/B 테스트는 성립하지 않습니다.
- 모바일 480px 폭 전제. 브라우저로도 쓰이고 아이폰은 웹앱뿐입니다.
- 코드 주석이 한국어로 길게 달려 있습니다. **왜 그렇게 했는지가 대개 주석에 있으니 먼저 읽어 주세요** —
  이미 이유가 있는 결정을 "고쳐야 한다"고 하면 리뷰의 값이 떨어집니다.

디자인 시스템과 이미 내려진 결정은 맨 앞의 \`docs/design.md\`에 있습니다. 먼저 읽어 주세요.

# 무엇을 찾아 주세요 (우선순위 순)

1. **정확성 버그** — 특히 이런 것들:
   - 날짜·시간 경계 (이 앱은 하루가 **자정이 아니라 새벽 4시**에 넘어갑니다)
   - 비동기 경합, stale closure, 유실되는 상태
   - 실패 경로를 안 다루는 곳 (에러 무시, 낙관적 업데이트 롤백 누락)
   - 데이터가 조용히 사라지거나 어긋나는 경로
2. **사용자가 막히는 지점** — 되돌릴 수 없는 동작, 빠져나올 수 없는 화면, 빈 상태에서 다음 행동이
   없는 곳, 눌렀는데 아무 일도 안 나는 컨트롤
3. **RLS·권한 구멍** — 다른 사람의 데이터가 보이거나 쓰일 수 있는 경로 (서버 배치에서 특히)
4. **접근성** — 다만 이미 한 바퀴 돌았습니다: 전역 \`:focus-visible\`, 라벨-입력 연결(useId),
   44px 터치 타깃, aria-label, 대비 실측. **이미 된 것을 다시 지적하지 말고 놓친 것만** 짚어 주세요.
5. **구조·중복** — 같은 규칙이 두 곳에 있어 한쪽만 고치게 될 위험

# 형식

각 항목을 이렇게 주세요.

- **[심각도] 한 줄 요약** — 심각도는 치명/높음/보통/낮음
- **위치**: 파일명과 함수명 (줄 번호는 붙여진 소스 기준으로 대략)
- **왜 문제인가**: 어떤 입력·순서에서 무엇이 잘못되는지 **구체적인 시나리오로**
- **어떻게 고치는가**: 적용할 수 있는 코드로. 말로만 된 제안은 쓸 수 없습니다
- **확신도**: 확실 / 추정 — 추정이면 무엇을 확인해야 하는지

**심각한 것부터** 정렬해 주세요. 스타일·포매팅 취향은 제외합니다(포매터가 있습니다).
아무것도 못 찾은 영역이 있으면 "이 영역은 문제를 못 찾았다"고 명시해 주세요 —
억지로 채우지 마세요.

한국어로 답해 주세요.

---

# 참고 문서: docs/design.md

\`\`\`markdown
${readFileSync(join(ROOT, 'docs/design.md'), 'utf8')}
\`\`\`

---

# 소스

`;

const files = batch.files();
const seen = new Set();
let body = '';
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  if (seen.has(rel)) continue;
  seen.add(rel);
  const ext = rel.endsWith('.sql') ? 'sql' : rel.endsWith('.tsx') ? 'tsx' : 'ts';
  body += `\n## ${rel}\n\n\`\`\`${ext}\n${readFileSync(f, 'utf8')}\n\`\`\`\n`;
}

const input = Buffer.from(prompt + body, 'utf8');
const inPath = join(OUT_DIR, `codex-in-${name}.md`);
const outPath = join(OUT_DIR, `codex-out-${name}.md`);
writeFileSync(inPath, input);
console.log(`[${name}] 파일 ${seen.size}개, 입력 ${(input.length / 1024).toFixed(0)} KB → 코덱스 호출`);

const child = spawn(process.execPath, [CODEX, 'exec', '-s', 'read-only', '-C', ROOT, '--skip-git-repo-check', '-'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
let out = '';
let err = '';
child.stdout.on('data', (d) => (out += d.toString('utf8')));
child.stderr.on('data', (d) => (err += d.toString('utf8')));
child.on('close', (code) => {
  writeFileSync(outPath, out, 'utf8');
  if (err.trim()) writeFileSync(outPath + '.err.txt', err, 'utf8');
  console.log(`[${name}] exit=${code}  응답 ${(out.length / 1024).toFixed(0)} KB → ${outPath}`);
});
child.stdin.write(input);
child.stdin.end();
