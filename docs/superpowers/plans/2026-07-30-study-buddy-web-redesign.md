# study-buddy 수정본 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** study-buddy 프로토타입(로컬스토리지, 번들러 없음, 규칙기반 AI)을 `study-buddy-수정본/`에 정식 Vite+React+TS 프로젝트로 재구현하되, study-planner와 같은 Supabase 프로젝트의 인증을 재사용하고, 새 스키마(자료 단위 학습 기록에 맞춘 6개 테이블)를 붙이고, 진짜 LLM 호출로 AI 추천을 교체하고, 브레인스토밍에서 합의한 3개 화면(플래너/컨디션입력/학습기록) 저마찰 재설계와 신규 "학습 자료 목표" 기능을 구현한다.

**Architecture:** Vite + React 18 + TypeScript SPA. 라우터 없이 `App.tsx`의 로컬 state로 탭/오버레이 전환(study-buddy 패턴 유지). 상태는 Context + `useReducer` 하나, 각 액션이 로컬 상태를 낙관적으로 갱신한 뒤 Supabase에 비동기로 반영한다(기존 study-buddy는 로컬스토리지에 반영했던 지점). Supabase 프로젝트는 study-planner와 동일한 프로젝트(같은 URL/키)를 쓰되, 스키마는 study-buddy의 풍부한 `PlannerItem`/`StudyLogEntry` 모델에 맞춘 신규 6개 테이블을 별도로 둔다(study-planner의 `daily_plans.subject_blocks`/`time_logs` 테이블과는 공존하되 서로 참조하지 않음 — 두 앱이 같은 계정으로 로그인해도 데이터는 독립적으로 취급). AI는 `study_materials` 기반 페이스 계산은 순수 함수로, 저녁 "내일 추천"만 신규 Edge Function(`tomorrow-recommendation`, study-planner의 `evening-recommendation`과 같은 `_shared` 유틸 재사용)으로 실제 LLM 호출을 한다.

**Tech Stack:** Vite 6, React 18, TypeScript 5, Tailwind CSS 3(PostCSS 빌드), Supabase JS v2(`@supabase/supabase-js`), Vitest(단위 테스트), Supabase Edge Functions(Deno)

## Global Constraints

- 화면 최대 너비 480px 중앙 정렬(`#app-shell` 패턴), 모바일 웹 우선.
- 색상/타이포/폰트는 study-buddy의 `index.html` Tailwind 설정값을 그대로 이식한다(디자인 변경 없음, 브레인스토밍에서 논의한 건 화면 구조/입력 흐름이지 색상 팔레트가 아니다).
- Google Fonts(Plus Jakarta Sans, Material Symbols Outlined)는 `index.html`에 `<link>`로 유지.
- 날짜 키는 `YYYY-MM-DD` 문자열(`DateKey`), 시간은 `HH:MM` 24시간제 문자열로 통일 — study-buddy의 `lib.jsx` 컨벤션을 그대로 따른다.
- Supabase 호출은 모두 `src/lib/supabase.ts`의 단일 클라이언트를 통한다. Service Role Key는 클라이언트/Edge Function 어디에서도 쓰지 않는다(Edge Function은 요청자의 JWT로 인증된 클라이언트만 사용 — study-planner의 `_shared/authClient.ts` 패턴 그대로).
- 콘솔에 `console.log`를 남기지 않는다(경고/에러는 `console.warn`/`console.error`만 허용, study-buddy 컨벤션).
- 각 태스크는 `npx tsc --noEmit` 통과를 확인하고 커밋한다.

---

### Task 1: Vite 프로젝트 스캐폴딩 + Tailwind 설정

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `index.html`
- Create: `src/index.css`
- Create: `src/main.tsx`
- Create: `.env.example`
- Create: `.gitignore`

**Interfaces:**
- Produces: 빌드 가능한 빈 Vite 프로젝트, `npm run dev`로 로컬 서버 구동. 이후 모든 태스크가 이 스캐폴딩 위에서 동작.

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "study-buddy-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.111.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vite": "^6.0.1",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `node_modules/` 생성, 에러 없음 (Node v24.18.0 / npm 11.16.0 확인됨).

- [ ] **Step 3: `vite.config.ts` 작성**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 4: `tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: `tsconfig.node.json` 작성**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: `tailwind.config.ts` 작성 (study-buddy `index.html`의 팔레트를 그대로 이식)**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: '#f7f9fb',
        'surface-dim': '#d8dadc',
        'surface-bright': '#f7f9fb',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f2f4f6',
        'surface-container': '#eceef0',
        'surface-container-high': '#e6e8ea',
        'surface-container-highest': '#e0e3e5',
        'on-surface': '#191c1e',
        'on-surface-variant': '#42474f',
        outline: '#737780',
        'outline-variant': '#c3c6d1',
        primary: '#366095',
        'on-primary': '#ffffff',
        'primary-container': '#6e96cf',
        'on-primary-container': '#002d58',
        secondary: '#196b50',
        'on-secondary': '#ffffff',
        'secondary-container': '#a2efcd',
        'on-secondary-container': '#1f6f54',
        tertiary: '#63568e',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#9a8cc8',
        'on-tertiary-container': '#302459',
        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',
        background: '#f7f9fb',
        'on-background': '#191c1e',
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -4px rgba(54,96,149,0.12)',
        card: '0 2px 12px -2px rgba(54,96,149,0.10)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 7: `postcss.config.js` 작성**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 8: `index.html` 작성**

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
<title>스터디 버디 - AI 학습 코치</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
</head>
<body>
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 9: `src/index.css` 작성**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { background: #f7f9fb; overscroll-behavior-y: none; }
body { font-family: 'Plus Jakarta Sans', sans-serif; color: #191c1e; }
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  font-size: 22px;
  line-height: 1;
  user-select: none;
}
.material-symbols-outlined.filled { font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24; }
#app-shell { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #f7f9fb; position: relative; }
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  height: 8px;
  border-radius: 9999px;
  background: #e0e3e5;
}
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 9999px;
  background: #366095;
  border: 3px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: #c3c6d1; border-radius: 9999px; }
```

- [ ] **Step 10: `src/main.tsx` 작성 (에러 바운더리 포함, study-buddy `main.jsx` 이식)**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

class SBErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Study Buddy render error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 16, whiteSpace: 'pre-wrap', fontSize: 12, color: '#ba1a1a' }}>
          {String(this.state.error.stack || this.state.error.message || this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SBErrorBoundary>
      <App />
    </SBErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 11: `src/App.tsx` 임시 스텁 작성 (Task 7에서 실제 구현으로 교체)**

```tsx
export default function App() {
  return <div style={{ padding: 24 }}>study-buddy-web scaffold OK</div>;
}
```

- [ ] **Step 12: `.env.example` 작성**

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 13: `.gitignore` 작성**

```
node_modules
dist
.env
.env.local
.superpowers
```

- [ ] **Step 14: 개발 서버 확인**

Run: `npm run dev`
Expected: `http://localhost:5173`에서 "study-buddy-web scaffold OK" 표시, 콘솔 에러 없음. 확인 후 서버 종료(Ctrl+C).

- [ ] **Step 15: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite+React+TS project with study-buddy design tokens"
```

---

### Task 2: 타입 + 상수 정의

**Files:**
- Create: `src/types/index.ts`
- Create: `src/constants.ts`

**Interfaces:**
- Produces: `DateKey`, `Profile`, `DailyCondition`, `ScheduleBlock`, `PlannerItem`, `PlannerItemStatus`, `StudyLogEntry`, `StudyMaterial`, `TomorrowRecommendation`, `TomorrowRecommendationItem` 타입. `SUBJECTS`, `getSubject`, `STUDY_TYPES`, `getStudyType`, `DIFFICULTY_LEVELS`, `MOODS`, `DIFFICULTY_CHIPS`, `REVIEW_NEEDS`, `GRADES`, `NAV_TABS`, `REST_PATTERNS`, `QUICK_TIME_CHIPS` 상수. 이후 모든 태스크가 이 타입/상수를 import한다.

- [ ] **Step 1: `src/types/index.ts` 작성**

```typescript
export type DateKey = string; // "YYYY-MM-DD"

export type Grade = '중1' | '중2' | '중3' | '고1' | '고2' | '고3';
export type SubjectId = 'korean' | 'math' | 'english' | 'science' | 'social';
export type MoodId = 'happy' | 'tired' | 'neutral' | 'stressed' | 'excited';
export type StudyTypeId = 'concept' | 'practice' | 'memorize' | 'review';
export type DifficultyId = 'easy' | 'medium' | 'hard';
export type ReviewNeedId = 'must' | 'light' | 'done';
export type PlannerItemStatus = 'planned' | 'completed' | 'partial' | 'carried_over';
export type RestPatternId = 'pomodoro_25_5' | 'block_50_10' | 'none';

export interface Profile {
  grade: Grade;
  mainSubjects: SubjectId[];
  goal: string;
  examDate: string | null;
  workbooks: string;
  onboardedAt: string;
}

export interface DailyCondition {
  date: DateKey;
  sleepHours: number;
  fatigue: number; // 1-5
  focus: number; // 1-5
  mood: MoodId;
  notes: string;
}

export interface ScheduleBlock {
  id: string;
  date: DateKey;
  type: string;
  label: string;
  startTime: string; // "HH:MM"
  endTime: string;
}

export interface PlannerItem {
  id: string;
  date: DateKey;
  order: number;
  subjectId: SubjectId;
  startTime: string;
  // 아래는 상세 페이지에서 채우는 선택 필드 — 전부 비어있을 수 있다.
  studyType: StudyTypeId | null;
  material: string;
  unit: string;
  pageRange: string;
  endTime: string | null;
  difficulty: DifficultyId | null;
  restPattern: RestPatternId | null;
  mustDo: boolean;
  status: PlannerItemStatus;
  actualMinutes: number | null;
  understanding: 'low' | 'medium' | 'high' | null;
  partialReason: string | null;
  incompleteReason: string | null;
}

export interface StudyLogEntry {
  id: string;
  date: DateKey;
  plannerItemId: string;
  subjectId: SubjectId;
  rating: number; // 1-5
  blockedTags: string[];
  detailNote: string;
  selfMessage: string;
}

export interface StudyMaterial {
  id: string;
  subjectId: SubjectId;
  materialName: string;
  totalScope: number; // pages
  currentProgress: number;
  targetPasses: number;
  targetDate: string; // "YYYY-MM-DD"
  sessionIntervalDays: number;
  createdAt: string;
}

export interface TomorrowRecommendationItem {
  subjectId: SubjectId;
  studyType: StudyTypeId;
  material: string;
  unit: string;
  pageRange: string;
  difficulty: DifficultyId;
  mustDo: boolean;
  startTime: string;
  endTime: string;
  estimatedMinutes: number;
  reason: string;
}

export interface TomorrowRecommendation {
  completionRate: number;
  incompleteCount: number;
  lowFocusWindow: string | null;
  availableMinutesTomorrow: number;
  reasons: string[];
  items: TomorrowRecommendationItem[];
}
```

- [ ] **Step 2: `src/constants.ts` 작성**

```typescript
import type {
  SubjectId,
  StudyTypeId,
  DifficultyId,
  MoodId,
  ReviewNeedId,
  Grade,
  RestPatternId,
} from './types';

export const SUBJECTS: { id: SubjectId; label: string; color: string }[] = [
  { id: 'korean', label: '국어', color: 'tertiary' },
  { id: 'math', label: '수학', color: 'primary' },
  { id: 'english', label: '영어', color: 'tertiary' },
  { id: 'science', label: '과학', color: 'secondary' },
  { id: 'social', label: '사회', color: 'secondary' },
];

export function getSubject(id: SubjectId) {
  return SUBJECTS.find((s) => s.id === id) ?? { id, label: id, color: 'primary' };
}

export const STUDY_TYPES: { id: StudyTypeId; label: string; icon: string }[] = [
  { id: 'concept', label: '개념 학습', icon: 'menu_book' },
  { id: 'practice', label: '문제 풀이', icon: 'edit' },
  { id: 'memorize', label: '암기', icon: 'psychology' },
  { id: 'review', label: '복습', icon: 'history' },
];

export function getStudyType(id: StudyTypeId | null) {
  return STUDY_TYPES.find((t) => t.id === id) ?? STUDY_TYPES[0];
}

export const DIFFICULTY_LEVELS: { id: DifficultyId; label: string }[] = [
  { id: 'easy', label: '쉬움' },
  { id: 'medium', label: '보통' },
  { id: 'hard', label: '어려움' },
];

export const MOODS: { id: MoodId; label: string; emoji: string; fatigueValue: number }[] = [
  { id: 'excited', label: '최상', emoji: '😄', fatigueValue: 1 },
  { id: 'happy', label: '좋음', emoji: '🙂', fatigueValue: 2 },
  { id: 'neutral', label: '보통', emoji: '😐', fatigueValue: 3 },
  { id: 'tired', label: '피곤', emoji: '😪', fatigueValue: 4 },
  { id: 'stressed', label: '힘듦', emoji: '😫', fatigueValue: 5 },
];

export const DIFFICULTY_CHIPS = [
  '개념이해 안됨',
  '시간부족',
  '집중안됨',
  '계산실수',
];

export const REVIEW_NEEDS: { id: ReviewNeedId; label: string }[] = [
  { id: 'must', label: '복습 필수' },
  { id: 'light', label: '가볍게 복습' },
  { id: 'done', label: '복습 완료' },
];

export const GRADES: Grade[] = ['중1', '중2', '중3', '고1', '고2', '고3'];

export const NAV_TABS = [
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'calendar', label: '캘린더', icon: 'calendar_today' },
  { id: 'planner', label: '플래너', icon: 'edit_note' },
  { id: 'check', label: '체크', icon: 'task_alt' },
  { id: 'ai', label: 'AI 분석', icon: 'auto_awesome' },
] as const;

export const REST_PATTERNS: { id: RestPatternId; label: string }[] = [
  { id: 'pomodoro_25_5', label: '25분 공부 + 5분 휴식 (뽀모도로)' },
  { id: 'block_50_10', label: '50분 공부 + 10분 휴식' },
  { id: 'none', label: '휴식 없이 쭉' },
];

// 플래너 메인 화면의 "빠른 선택 칩". resolve 함수는 Task 4의 lib.ts에서 정의한다.
export const QUICK_TIME_CHIPS = [
  { id: 'now', label: '지금 바로' },
  { id: 'after_school', label: '학교·학원 끝나고' },
  { id: 'after_dinner', label: '저녁 먹고' },
  { id: 'before_sleep', label: '자기 전' },
] as const;

export type QuickTimeChipId = (typeof QUICK_TIME_CHIPS)[number]['id'];
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음(아직 사용하는 곳이 없으므로 미사용 경고만 있을 수 있음 — `noUnusedLocals: false`로 설정했으므로 에러 아님)

- [ ] **Step 4: Commit**

```bash
git add src/types src/constants.ts
git commit -m "feat: add core types and constants"
```

---

### Task 3: 날짜/시간/빈시간/페이스 계산 순수 함수 (TDD)

**Files:**
- Create: `src/lib.ts`
- Test: `src/lib.test.ts`

**Interfaces:**
- Consumes: `ScheduleBlock`, `StudyMaterial`, `PlannerItem` (Task 2)
- Produces: `todayKey()`, `addDaysToKey()`, `formatDateKorean()`, `weekStrip()`, `timeToMinutes()`, `minutesToTime()`, `formatMinutes()`, `computeFreeGaps()`, `sumFreeMinutes()`, `getBestGap()`, `getPlannerProgress()`, `withEul()`, `uid()`, `resolveQuickTimeChip()`, `computeMaterialPace()` — Task 4(프리미티브)를 제외한 모든 화면 태스크가 이 함수들을 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성 — `src/lib.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  minutesToTime,
  formatMinutes,
  computeFreeGaps,
  sumFreeMinutes,
  getBestGap,
  getPlannerProgress,
  withEul,
  resolveQuickTimeChip,
  computeMaterialPace,
  addDaysToKey,
  uid,
} from './lib';
import type { ScheduleBlock, PlannerItem, StudyMaterial } from './types';

describe('timeToMinutes / minutesToTime', () => {
  it('converts HH:MM to minutes and back', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
  });
});

describe('formatMinutes', () => {
  it('formats minutes into 시간/분 Korean text', () => {
    expect(formatMinutes(0)).toBe('0분');
    expect(formatMinutes(45)).toBe('45분');
    expect(formatMinutes(60)).toBe('1시간');
    expect(formatMinutes(125)).toBe('2시간 5분');
  });
});

function block(overrides: Partial<ScheduleBlock>): ScheduleBlock {
  return {
    id: 'b1',
    date: '2026-07-30',
    type: 'school',
    label: '학교',
    startTime: '08:00',
    endTime: '16:00',
    ...overrides,
  };
}

describe('computeFreeGaps', () => {
  it('returns the whole window when there are no blocks', () => {
    const gaps = computeFreeGaps([], '07:00', '23:00');
    expect(gaps).toEqual([{ start: '07:00', end: '23:00', minutes: 960 }]);
  });

  it('excludes busy ranges and merges overlaps', () => {
    const blocks = [block({ startTime: '08:00', endTime: '16:00' }), block({ id: 'b2', startTime: '15:30', endTime: '17:00' })];
    const gaps = computeFreeGaps(blocks, '07:00', '23:00');
    expect(gaps).toEqual([
      { start: '07:00', end: '08:00', minutes: 60 },
      { start: '17:00', end: '23:00', minutes: 360 },
    ]);
  });

  it('drops gaps shorter than 10 minutes', () => {
    const blocks = [block({ startTime: '07:00', endTime: '07:55' }), block({ id: 'b2', startTime: '08:00', endTime: '23:00' })];
    const gaps = computeFreeGaps(blocks, '07:00', '23:00');
    expect(gaps).toEqual([]);
  });
});

describe('sumFreeMinutes / getBestGap', () => {
  const gaps = [
    { start: '07:00', end: '08:00', minutes: 60 },
    { start: '17:00', end: '23:00', minutes: 360 },
  ];
  it('sums minutes across gaps', () => {
    expect(sumFreeMinutes(gaps)).toBe(420);
  });
  it('returns the largest gap', () => {
    expect(getBestGap(gaps)).toEqual(gaps[1]);
  });
  it('returns null for an empty gap list', () => {
    expect(getBestGap([])).toBeNull();
  });
});

function plannerItem(overrides: Partial<PlannerItem>): PlannerItem {
  return {
    id: 'p1',
    date: '2026-07-30',
    order: 1,
    subjectId: 'math',
    startTime: '19:00',
    studyType: null,
    material: '',
    unit: '',
    pageRange: '',
    endTime: null,
    difficulty: null,
    restPattern: null,
    mustDo: false,
    status: 'planned',
    actualMinutes: null,
    understanding: null,
    partialReason: null,
    incompleteReason: null,
    ...overrides,
  };
}

describe('getPlannerProgress', () => {
  it('returns 0 percent for an empty list', () => {
    expect(getPlannerProgress([])).toEqual({ percent: 0, completed: 0, total: 0 });
  });
  it('computes percent completed', () => {
    const items = [plannerItem({ id: 'a', status: 'completed' }), plannerItem({ id: 'b', status: 'planned' })];
    expect(getPlannerProgress(items)).toEqual({ percent: 50, completed: 1, total: 2 });
  });
});

describe('withEul', () => {
  it('appends 을 after a syllable with batchim', () => {
    expect(withEul('수학')).toBe('수학을');
  });
  it('appends 를 after a syllable without batchim', () => {
    expect(withEul('영어')).toBe('영어를');
  });
});

describe('resolveQuickTimeChip', () => {
  const blocks = [block({ type: 'school', label: '학교', startTime: '08:00', endTime: '16:00' })];

  it('resolves "now" to the current time', () => {
    expect(resolveQuickTimeChip('now', blocks, '14:00')).toBe('14:00');
  });

  it('resolves "after_school" to 10 minutes after the last matching block today', () => {
    expect(resolveQuickTimeChip('after_school', blocks, '10:00')).toBe('16:10');
  });

  it('falls back to a constant when there is no matching block', () => {
    expect(resolveQuickTimeChip('after_school', [], '10:00')).toBe('17:00');
  });

  it('resolves the remaining presets to their constants', () => {
    expect(resolveQuickTimeChip('after_dinner', [], '10:00')).toBe('19:30');
    expect(resolveQuickTimeChip('before_sleep', [], '10:00')).toBe('22:00');
  });
});

function material(overrides: Partial<StudyMaterial>): StudyMaterial {
  return {
    id: 'm1',
    subjectId: 'math',
    materialName: '개념원리',
    totalScope: 220,
    currentProgress: 0,
    targetPasses: 1,
    targetDate: '2026-08-18', // today(07-30) + 19 days
    sessionIntervalDays: 3,
    createdAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeMaterialPace', () => {
  it('computes remaining sessions and per-session scope', () => {
    const pace = computeMaterialPace(material({}), '2026-07-30');
    // 19일 남음, 3일에 1번 -> floor(19/3) = 6세션, 220p 남음 -> ceil(220/6) = 37
    expect(pace).toEqual({ remainingDays: 19, remainingSessions: 6, remainingScope: 220, scopePerSession: 37, isOverdue: false });
  });

  it('accounts for progress and multiple passes', () => {
    const pace = computeMaterialPace(material({ totalScope: 120, currentProgress: 24, targetPasses: 2, targetDate: '2026-08-11' }), '2026-07-30');
    // 12일 남음, 3일에 1번 -> 4세션. 남은분량 = 120*2 - 24 = 216 -> ceil(216/4) = 54
    expect(pace).toEqual({ remainingDays: 12, remainingSessions: 4, remainingScope: 216, scopePerSession: 54, isOverdue: false });
  });

  it('flags overdue targets instead of dividing by zero', () => {
    const pace = computeMaterialPace(material({ targetDate: '2026-07-29' }), '2026-07-30');
    expect(pace).toEqual({ remainingDays: -1, remainingSessions: 0, remainingScope: 220, scopePerSession: 0, isOverdue: true });
  });
});

describe('addDaysToKey', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysToKey('2026-07-30', 3)).toBe('2026-08-02');
  });
});

describe('uid', () => {
  it('generates a valid UUID (DB primary key columns are typed uuid)', () => {
    expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
```

- [ ] **Step 2: Vitest 설정 추가**

`vite.config.ts`를 아래로 교체(Vitest 설정 병합):

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: { environment: 'node' },
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/lib.test.ts`
Expected: FAIL — `./lib` 모듈을 찾을 수 없음(`src/lib.ts`가 아직 없음)

- [ ] **Step 4: `src/lib.ts` 작성**

```typescript
import type { ScheduleBlock, PlannerItem, StudyMaterial, DateKey, QuickTimeChipId } from './types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getOverrideDate(): DateKey | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('date');
    if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  } catch {
    // window가 없는 테스트 환경 등 — 무시하고 실제 날짜를 쓴다.
  }
  return null;
}

export function todayKey(): DateKey {
  return getOverrideDate() ?? toDateKey(new Date());
}

export function addDaysToKey(dateKey: DateKey, days: number): DateKey {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}

export function daysBetween(fromKey: DateKey, toKeyValue: DateKey): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKeyValue.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

export function formatDateKorean(dateKey: DateKey): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}년 ${m}월 ${d}일 ${days[dt.getDay()]}요일`;
}

export function weekStrip(dateKey: DateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Monday=0
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - dow);
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  const days: { key: DateKey; label: string; date: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push({ key: toDateKey(day), label: labels[i], date: day.getDate() });
  }
  return days;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function formatMinutes(mins: number): string {
  if (mins <= 0) return '0분';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export interface FreeGap {
  start: string;
  end: string;
  minutes: number;
}

export function computeFreeGaps(blocks: ScheduleBlock[], windowStart = '07:00', windowEnd = '24:00'): FreeGap[] {
  const start = timeToMinutes(windowStart);
  const end = timeToMinutes(windowEnd === '24:00' ? '23:59' : windowEnd) + (windowEnd === '24:00' ? 1 : 0);
  const busy = (blocks || [])
    .map((b) => [timeToMinutes(b.startTime), timeToMinutes(b.endTime)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const range of busy) {
    if (merged.length && range[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], range[1]);
    } else {
      merged.push([...range]);
    }
  }

  const gaps: FreeGap[] = [];
  let cursor = start;
  for (const [s, e] of merged) {
    const gapStart = Math.max(cursor, start);
    const gapEnd = Math.min(s, end);
    if (gapEnd - gapStart >= 10) {
      gaps.push({ start: minutesToTime(gapStart), end: minutesToTime(gapEnd), minutes: gapEnd - gapStart });
    }
    cursor = Math.max(cursor, e);
  }
  if (cursor < end) {
    gaps.push({ start: minutesToTime(cursor), end: minutesToTime(end === 1440 ? 1439 : end), minutes: end - cursor });
  }
  return gaps;
}

export function sumFreeMinutes(gaps: FreeGap[]): number {
  return gaps.reduce((sum, g) => sum + g.minutes, 0);
}

export function getBestGap(gaps: FreeGap[]): FreeGap | null {
  if (!gaps.length) return null;
  return gaps.reduce((best, g) => (g.minutes > best.minutes ? g : best), gaps[0]);
}

export function getPlannerProgress(items: PlannerItem[]) {
  const total = items.length;
  const completed = items.filter((i) => i.status === 'completed').length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { percent, completed, total };
}

export function withEul(word: string): string {
  if (!word) return word;
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return word + '을';
  const hasBatchim = (last - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? '을' : '를');
}

// DB 기본 키 컬럼이 모두 `uuid` 타입이므로 반드시 유효한 UUID를 반환해야 한다
// (낙관적 로컬 업데이트에 쓰는 id가 그대로 insert 문의 id 컬럼 값이 된다).
export function uid(): string {
  return crypto.randomUUID();
}

const QUICK_TIME_FALLBACK: Record<QuickTimeChipId, string> = {
  now: '', // "now"는 항상 nowTime 인자를 그대로 쓴다 (fallback 미사용)
  after_school: '17:00',
  after_dinner: '19:30',
  before_sleep: '22:00',
};

// 빠른 선택 칩을 구체적인 "HH:MM"으로 변환한다.
// "학교·학원 끝나고"는 오늘 일정 중 type이 school/academy인 블록의 가장 늦은 종료 시각 + 10분,
// 해당하는 일정이 없으면 상수 기본값을 쓴다.
export function resolveQuickTimeChip(chipId: QuickTimeChipId, blocks: ScheduleBlock[], nowTime: string): string {
  if (chipId === 'now') return nowTime;
  if (chipId === 'after_school') {
    const matching = blocks.filter((b) => b.type === 'school' || b.type === 'academy');
    if (matching.length === 0) return QUICK_TIME_FALLBACK.after_school;
    const latestEnd = matching.reduce((max, b) => Math.max(max, timeToMinutes(b.endTime)), 0);
    return minutesToTime(latestEnd + 10);
  }
  return QUICK_TIME_FALLBACK[chipId];
}

export interface MaterialPace {
  remainingDays: number;
  remainingSessions: number;
  remainingScope: number;
  scopePerSession: number;
  isOverdue: boolean;
}

// 남은 세션 수(며칠에 한 번 × 남은 일수) 기준으로 세션당 분량을 역산한다.
// 목표일이 지났으면(remainingDays < 0) 나눗셈 없이 isOverdue만 표시한다.
export function computeMaterialPace(material: StudyMaterial, todayDateKey: DateKey): MaterialPace {
  const remainingDays = daysBetween(todayDateKey, material.targetDate);
  const remainingScope = Math.max(0, material.totalScope * material.targetPasses - material.currentProgress);

  if (remainingDays < 0) {
    return { remainingDays, remainingSessions: 0, remainingScope, scopePerSession: 0, isOverdue: true };
  }

  const remainingSessions = Math.max(1, Math.floor(remainingDays / material.sessionIntervalDays));
  const scopePerSession = remainingScope === 0 ? 0 : Math.ceil(remainingScope / remainingSessions);
  return { remainingDays, remainingSessions, remainingScope, scopePerSession, isOverdue: false };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib.test.ts`
Expected: PASS (전체 테스트)

- [ ] **Step 6: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts src/lib.ts src/lib.test.ts
git commit -m "feat: add date/time/free-gap/material-pace pure functions"
```

---

### Task 4: 공용 UI 프리미티브 컴포넌트

**Files:**
- Create: `src/primitives.tsx`

**Interfaces:**
- Consumes: `NAV_TABS`, `MOODS` (Task 2)
- Produces: `Icon`, `TopAppBar`, `BackBar`, `BottomNav`, `Card`, `Button`, `Chip`, `ChipGroup`, `SliderField`, `EmojiPicker`, `StarRating`, `ProgressRing`, `ProgressBar`, `ToggleSwitch`, `BottomSheet`, `AiTipCard`, `SectionTitle`, `TextField`, `TextArea`, `SelectField`, `Collapsible` — 이후 모든 화면 태스크가 이 컴포넌트들을 import한다. study-buddy `primitives.jsx`를 TS로 이식하고, 브레인스토밍에서 합의한 "더 자세히 펼치기" 패턴을 위해 `Collapsible`을 신규 추가한다.

- [ ] **Step 1: `src/primitives.tsx` 작성**

```tsx
import React from 'react';
import { NAV_TABS, MOODS } from './constants';

export function Icon({ name, className = '', filled = false }: { name: string; className?: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}>{name}</span>;
}

export function TopAppBar({ title = '스터디 버디', onBell }: { title?: string; onBell?: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-surface/90 backdrop-blur px-5 py-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
          SB
        </div>
        <span className="text-lg font-bold text-primary">{title}</span>
      </div>
      <button onClick={onBell} className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
        <Icon name="notifications" />
      </button>
    </header>
  );
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-surface/90 backdrop-blur px-3 py-4">
      <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container">
        <Icon name="arrow_back" />
      </button>
      <span className="text-lg font-bold text-on-surface">{title}</span>
    </header>
  );
}

export type TabId = (typeof NAV_TABS)[number]['id'];

export function BottomNav({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-surface-container-lowest border-t border-outline-variant/50 flex justify-around py-2 z-30">
      {NAV_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}
          >
            <Icon name={tab.icon} filled={isActive} />
            <span className="text-[11px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Card({ children, className = '', tint = null }: { children: React.ReactNode; className?: string; tint?: string | null }) {
  const tintClass = tint ? `bg-${tint}-container/10` : 'bg-surface-container-lowest';
  return <div className={`rounded-2xl p-4 shadow-card ${tintClass} ${className}`}>{children}</div>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'error';

export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  icon = null,
  disabled = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  className?: string;
  icon?: string | null;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base = 'rounded-full font-semibold text-sm px-5 py-3 flex items-center justify-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-on-primary',
    secondary: 'bg-secondary text-on-secondary',
    ghost: 'bg-transparent border-[1.5px] border-primary text-primary',
    outline: 'bg-transparent border-[1.5px] border-outline-variant text-on-surface',
    error: 'bg-transparent border-[1.5px] border-error text-error',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {icon && <Icon name={icon} className="!text-[18px]" />}
      {children}
    </button>
  );
}

export function Chip({ label, active, onClick, icon = null }: { label: string; active: boolean; onClick: () => void; icon?: string | null }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium flex items-center gap-1 transition ${active ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}
    >
      {icon && <Icon name={icon} className="!text-[18px]" />}
      {label}
    </button>
  );
}

interface ChipOption {
  id: string;
  label: string;
}

export function ChipGroup<T extends ChipOption>({
  options,
  value,
  onChange,
  multi = false,
  getIcon = null,
}: {
  options: T[];
  value: string | string[];
  onChange: (value: any) => void;
  multi?: boolean;
  getIcon?: ((opt: T) => string) | null;
}) {
  const isSelected = (id: string) => (multi ? (value as string[]).includes(id) : value === id);
  const toggle = (id: string) => {
    if (multi) {
      const list = value as string[];
      onChange(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
    } else {
      onChange(id);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Chip key={opt.id} label={opt.label} active={isSelected(opt.id)} onClick={() => toggle(opt.id)} icon={getIcon ? getIcon(opt) : null} />
      ))}
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  valueLabel,
  minLabel,
  maxLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  valueLabel: string;
  minLabel: string;
  maxLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-on-surface-variant">{label}</span>
        <span className="text-base font-bold text-primary">{valueLabel}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      <div className="flex justify-between text-xs text-on-surface-variant mt-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function EmojiPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {MOODS.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition ${value === m.id ? 'border-primary bg-primary-container/20' : 'border-transparent bg-surface-container'}`}
        >
          <span className="text-2xl">{m.emoji}</span>
          <span className="text-[11px] font-medium text-on-surface-variant">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

export function StarRating({ value, onChange, size = 'text-2xl' }: { value: number; onChange: (n: number) => void; size?: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} className={`${size} leading-none`}>
          <span className={n <= value ? 'text-primary' : 'text-outline-variant'}>★</span>
        </button>
      ))}
    </div>
  );
}

export function ProgressRing({ percent, size = 88, stroke = 10 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e0e3e5" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#366095"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50%" y="50%" transform={`rotate(90 ${size / 2} ${size / 2})`} textAnchor="middle" dominantBaseline="middle" className="fill-on-surface font-bold" style={{ fontSize: 18 }}>
        {percent}%
      </text>
    </svg>
  );
}

export function ProgressBar({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <div className={`h-3 rounded-full bg-surface-container-high overflow-hidden ${className}`}>
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

export function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      {label && <span className="text-sm font-medium text-on-surface">{label}</span>}
      <span
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-primary' : 'bg-surface-container-high'}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </label>
  );
}

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[480px] bg-surface-container-lowest rounded-t-2xl p-5 pb-8">
        <div className="w-10 h-1.5 rounded-full bg-outline-variant mx-auto mb-4" />
        {title && <h3 className="text-base font-bold mb-3">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function AiTipCard({ text, icon = 'auto_awesome', tint = 'tertiary' }: { text: string; icon?: string; tint?: string }) {
  return (
    <Card tint={tint} className="flex gap-3">
      <div className={`w-8 h-8 rounded-full bg-${tint}-container/40 flex items-center justify-center shrink-0`}>
        <Icon name={icon} className={`!text-[18px] text-${tint}`} />
      </div>
      <div>
        <p className="text-xs font-bold text-on-surface-variant mb-1">AI 버디의 조언</p>
        <p className="text-sm text-on-surface leading-relaxed">{text}</p>
      </div>
    </Card>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-bold text-on-surface">{children}</h2>
      {action}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-surface-container px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">{label}</label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl bg-surface-container px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary resize-none"
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl bg-surface-container px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary">
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// 브레인스토밍에서 합의한 "기본은 최소 입력, 더 자세히는 펼쳐서" 패턴의 공용 구현.
export function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      {!open && (
        <button onClick={() => setOpen(true)} className="text-xs font-semibold text-primary">
          {label} ⌄
        </button>
      )}
      {open && (
        <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/primitives.tsx
git commit -m "feat: add shared UI primitive components"
```

---

### Task 5: Supabase 클라이언트 + DB 마이그레이션

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `supabase/migrations/0001_study_buddy_web.sql`
- Create: `src/types/db.ts`

**Interfaces:**
- Produces: `supabase` 클라이언트(default export 아님, named export), `Database` 타입 — Task 7(AppState)과 이후 모든 화면이 사용.

study-planner와 **같은 Supabase 프로젝트**(같은 URL/anon key)를 쓰지만, study-planner의 `profiles`/`daily_plans`/`time_logs` 테이블과 이름이 겹치지 않도록 전부 `sb_` 접두사를 쓴다(같은 계정으로 두 앱에 로그인해도 데이터는 서로 독립적으로 취급된다 — Global Constraints 참고).

- [ ] **Step 1: `supabase/migrations/0001_study_buddy_web.sql` 작성**

```sql
create table sb_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  grade text not null check (grade in ('중1', '중2', '중3', '고1', '고2', '고3')),
  main_subjects text[] not null default '{}',
  goal text not null default '',
  exam_date date,
  workbooks text not null default '',
  onboarded_at timestamptz not null default now()
);
alter table sb_profiles enable row level security;
create policy "select own profile" on sb_profiles for select using (auth.uid() = id);
create policy "insert own profile" on sb_profiles for insert with check (auth.uid() = id);
create policy "update own profile" on sb_profiles for update using (auth.uid() = id);

create table sb_daily_conditions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  sleep_hours numeric not null,
  fatigue smallint not null check (fatigue between 1 and 5),
  focus smallint not null check (focus between 1 and 5),
  mood text not null,
  notes text not null default '',
  unique (user_id, date)
);
alter table sb_daily_conditions enable row level security;
create policy "own daily conditions" on sb_daily_conditions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table sb_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type text not null,
  label text not null,
  start_time time not null,
  end_time time not null
);
alter table sb_schedule_blocks enable row level security;
create policy "own schedule blocks" on sb_schedule_blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table sb_planner_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  "order" smallint not null,
  subject_id text not null,
  start_time time not null,
  study_type text,
  material text not null default '',
  unit text not null default '',
  page_range text not null default '',
  end_time time,
  difficulty text,
  rest_pattern text,
  must_do boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'completed', 'partial', 'carried_over')),
  actual_minutes int,
  understanding text,
  partial_reason text,
  incomplete_reason text
);
alter table sb_planner_items enable row level security;
create policy "own planner items" on sb_planner_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table sb_study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  planner_item_id uuid not null references sb_planner_items(id) on delete cascade,
  subject_id text not null,
  rating smallint not null check (rating between 1 and 5),
  blocked_tags text[] not null default '{}',
  detail_note text not null default '',
  self_message text not null default ''
);
alter table sb_study_logs enable row level security;
create policy "own study logs" on sb_study_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table sb_study_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  material_name text not null,
  total_scope int not null check (total_scope > 0),
  current_progress int not null default 0 check (current_progress >= 0),
  target_passes smallint not null default 1 check (target_passes > 0),
  target_date date not null,
  session_interval_days smallint not null default 1 check (session_interval_days > 0),
  created_at timestamptz not null default now()
);
alter table sb_study_materials enable row level security;
create policy "own study materials" on sb_study_materials for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: 사용자가 Supabase SQL Editor에서 마이그레이션 실행**

기존 프로젝트(study-planner)와 같은 Supabase 대시보드 SQL Editor에서 위 SQL을 실행하도록 안내하고 완료 확인을 받는다.

- [ ] **Step 3: `src/types/db.ts` 작성**

```typescript
import type { Grade, SubjectId, StudyTypeId, DifficultyId, RestPatternId, MoodId, PlannerItemStatus } from './index';

export interface SbProfileRow {
  id: string;
  grade: Grade;
  main_subjects: SubjectId[];
  goal: string;
  exam_date: string | null;
  workbooks: string;
  onboarded_at: string;
}

export interface SbDailyConditionRow {
  id: string;
  user_id: string;
  date: string;
  sleep_hours: number;
  fatigue: number;
  focus: number;
  mood: MoodId;
  notes: string;
}

export interface SbScheduleBlockRow {
  id: string;
  user_id: string;
  date: string;
  type: string;
  label: string;
  start_time: string;
  end_time: string;
}

export interface SbPlannerItemRow {
  id: string;
  user_id: string;
  date: string;
  order: number;
  subject_id: SubjectId;
  start_time: string;
  study_type: StudyTypeId | null;
  material: string;
  unit: string;
  page_range: string;
  end_time: string | null;
  difficulty: DifficultyId | null;
  rest_pattern: RestPatternId | null;
  must_do: boolean;
  status: PlannerItemStatus;
  actual_minutes: number | null;
  understanding: 'low' | 'medium' | 'high' | null;
  partial_reason: string | null;
  incomplete_reason: string | null;
}

export interface SbStudyLogRow {
  id: string;
  user_id: string;
  date: string;
  planner_item_id: string;
  subject_id: SubjectId;
  rating: number;
  blocked_tags: string[];
  detail_note: string;
  self_message: string;
}

export interface SbStudyMaterialRow {
  id: string;
  user_id: string;
  subject_id: SubjectId;
  material_name: string;
  total_scope: number;
  current_progress: number;
  target_passes: number;
  target_date: string;
  session_interval_days: number;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      // schedule_blocks/planner_items/study_logs/study_materials는 낙관적 로컬 업데이트를 위해
      // 클라이언트가 uid()로 UUID를 미리 만들어 그대로 insert하므로 Insert 타입에 id를 포함한다.
      // daily_conditions만 DB의 gen_random_uuid() 기본값에 맡기고(upsert 대상 식별은 user_id+date 유니크 제약을 쓴다), id를 생략한다.
      sb_profiles: { Row: SbProfileRow; Insert: SbProfileRow; Update: Partial<SbProfileRow> };
      sb_daily_conditions: { Row: SbDailyConditionRow; Insert: Omit<SbDailyConditionRow, 'id'>; Update: Partial<SbDailyConditionRow> };
      sb_schedule_blocks: { Row: SbScheduleBlockRow; Insert: SbScheduleBlockRow; Update: Partial<SbScheduleBlockRow> };
      sb_planner_items: { Row: SbPlannerItemRow; Insert: SbPlannerItemRow; Update: Partial<SbPlannerItemRow> };
      sb_study_logs: { Row: SbStudyLogRow; Insert: SbStudyLogRow; Update: Partial<SbStudyLogRow> };
      sb_study_materials: { Row: SbStudyMaterialRow; Insert: Omit<SbStudyMaterialRow, 'created_at'>; Update: Partial<SbStudyMaterialRow> };
    };
  };
}
```

- [ ] **Step 4: `src/lib/supabase.ts` 작성**

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/db';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in values.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
```

- [ ] **Step 5: `.env` 안내**

사용자가 study-planner에서 쓰던 것과 같은 `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` 값을 `study-buddy-수정본/.env`에 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`로 복사해 넣도록 안내한다(`.env.example` 참고, `.env`는 `.gitignore`에 이미 포함됨).

- [ ] **Step 6: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 7: Commit**

```bash
git add src/lib src/types/db.ts supabase
git commit -m "feat: add Supabase client and study-buddy-web schema migration"
```

---

### Task 6: 인증 화면 + 세션 컨텍스트

**Files:**
- Create: `src/state/AuthContext.tsx`
- Create: `src/screens/AuthScreen.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 5), `Card`/`Button`/`TextField` (Task 4)
- Produces: `AuthProvider`, `useAuth()` → `{ session: Session | null, loading: boolean }` — Task 13(App 조립)이 이 훅으로 로그인 여부를 분기한다.

- [ ] **Step 1: `src/state/AuthContext.tsx` 작성**

```tsx
import React from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthValue {
  session: Session | null;
  loading: boolean;
}

const AuthContext = React.createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: `src/screens/AuthScreen.tsx` 작성**

```tsx
import React from 'react';
import { supabase } from '../lib/supabase';
import { Card, Button, TextField } from '../primitives';

export default function AuthScreen() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mode, setMode] = React.useState<'signIn' | 'signUp'>('signIn');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { error: authError } =
      mode === 'signUp' ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (authError) setError(authError.message);
  };

  return (
    <div className="px-5 pt-24">
      <Card>
        <h1 className="text-xl font-bold text-primary text-center mb-4">스터디 버디</h1>
        <div className="space-y-3">
          <TextField label="이메일" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <TextField label="비밀번호" value={password} onChange={setPassword} placeholder="********" type="password" />
        </div>
        {error && <p className="text-sm text-error mt-3">{error}</p>}
        <Button className="w-full mt-4" onClick={handleSubmit} disabled={submitting}>
          {mode === 'signUp' ? '회원가입' : '로그인'}
        </Button>
        <button
          onClick={() => setMode((m) => (m === 'signUp' ? 'signIn' : 'signUp'))}
          className="w-full text-center text-sm text-on-surface-variant mt-3"
        >
          {mode === 'signUp' ? '이미 계정이 있어요' : '처음이에요, 회원가입할게요'}
        </button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add src/state/AuthContext.tsx src/screens/AuthScreen.tsx
git commit -m "feat: add auth context and auth screen"
```

---

### Task 7: AppState — Supabase 연동 Context + useReducer

**Files:**
- Create: `src/state/mappers.ts`
- Create: `src/state/AppStateContext.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6), `supabase` (Task 5), DB row types (Task 5), `Profile`/`DailyCondition`/`ScheduleBlock`/`PlannerItem`/`StudyLogEntry`/`StudyMaterial` (Task 2), `uid()`/`addDaysToKey()` (Task 3)
- Produces: `AppStateProvider`, `useAppState()` → `{ state, actions }`. `state`: `{ profile, conditions: Record<DateKey, DailyCondition>, scheduleBlocks: Record<DateKey, ScheduleBlock[]>, plannerItems: Record<DateKey, PlannerItem[]>, studyLogs: Record<DateKey, StudyLogEntry[]>, studyMaterials: StudyMaterial[], loading: boolean }`. `actions`: `saveProfile, saveCondition, upsertScheduleBlock, deleteScheduleBlock, addPlannerItem, updatePlannerItem, deletePlannerItem, carryOverPlannerItem, addStudyLog, addStudyMaterial, updateStudyMaterial, deleteStudyMaterial, applyTomorrowRecommendation`. 이후 모든 화면 태스크가 이 훅을 사용한다. (study-buddy의 `latestRecommendation`/`setRecommendation`/`clearAllData`는 실제로 호출되지 않던 죽은 코드였으므로 이식하지 않는다.)

- [ ] **Step 1: `src/state/mappers.ts` 작성 — DB row ↔ 앱 타입 변환**

```typescript
import type { Profile, DailyCondition, ScheduleBlock, PlannerItem, StudyLogEntry, StudyMaterial } from '../types';
import type {
  SbProfileRow,
  SbDailyConditionRow,
  SbScheduleBlockRow,
  SbPlannerItemRow,
  SbStudyLogRow,
  SbStudyMaterialRow,
} from '../types/db';

export function profileFromRow(row: SbProfileRow): Profile {
  return {
    grade: row.grade,
    mainSubjects: row.main_subjects,
    goal: row.goal,
    examDate: row.exam_date,
    workbooks: row.workbooks,
    onboardedAt: row.onboarded_at,
  };
}

export function conditionFromRow(row: SbDailyConditionRow): DailyCondition {
  return { date: row.date, sleepHours: row.sleep_hours, fatigue: row.fatigue, focus: row.focus, mood: row.mood, notes: row.notes };
}

export function scheduleBlockFromRow(row: SbScheduleBlockRow): ScheduleBlock {
  return { id: row.id, date: row.date, type: row.type, label: row.label, startTime: row.start_time.slice(0, 5), endTime: row.end_time.slice(0, 5) };
}

export function plannerItemFromRow(row: SbPlannerItemRow): PlannerItem {
  return {
    id: row.id,
    date: row.date,
    order: row.order,
    subjectId: row.subject_id,
    startTime: row.start_time.slice(0, 5),
    studyType: row.study_type,
    material: row.material,
    unit: row.unit,
    pageRange: row.page_range,
    endTime: row.end_time ? row.end_time.slice(0, 5) : null,
    difficulty: row.difficulty,
    restPattern: row.rest_pattern,
    mustDo: row.must_do,
    status: row.status,
    actualMinutes: row.actual_minutes,
    understanding: row.understanding,
    partialReason: row.partial_reason,
    incompleteReason: row.incomplete_reason,
  };
}

export function studyLogFromRow(row: SbStudyLogRow): StudyLogEntry {
  return {
    id: row.id,
    date: row.date,
    plannerItemId: row.planner_item_id,
    subjectId: row.subject_id,
    rating: row.rating,
    blockedTags: row.blocked_tags,
    detailNote: row.detail_note,
    selfMessage: row.self_message,
  };
}

export function studyMaterialFromRow(row: SbStudyMaterialRow): StudyMaterial {
  return {
    id: row.id,
    subjectId: row.subject_id,
    materialName: row.material_name,
    totalScope: row.total_scope,
    currentProgress: row.current_progress,
    targetPasses: row.target_passes,
    targetDate: row.target_date,
    sessionIntervalDays: row.session_interval_days,
    createdAt: row.created_at,
  };
}

export function groupByDate<T extends { date: string }>(rows: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) {
    (grouped[row.date] ??= []).push(row);
  }
  return grouped;
}
```

- [ ] **Step 2: `src/state/AppStateContext.tsx` 작성**

```tsx
import React from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { uid, addDaysToKey } from '../lib';
import {
  profileFromRow,
  conditionFromRow,
  scheduleBlockFromRow,
  plannerItemFromRow,
  studyLogFromRow,
  studyMaterialFromRow,
  groupByDate,
} from './mappers';
import type {
  Profile,
  DailyCondition,
  ScheduleBlock,
  PlannerItem,
  StudyLogEntry,
  StudyMaterial,
  DateKey,
  TomorrowRecommendationItem,
} from '../types';

interface AppState {
  profile: Profile | null;
  conditions: Record<DateKey, DailyCondition>;
  scheduleBlocks: Record<DateKey, ScheduleBlock[]>;
  plannerItems: Record<DateKey, PlannerItem[]>;
  studyLogs: Record<DateKey, StudyLogEntry[]>;
  studyMaterials: StudyMaterial[];
  loading: boolean;
}

const EMPTY_STATE: AppState = {
  profile: null,
  conditions: {},
  scheduleBlocks: {},
  plannerItems: {},
  studyLogs: {},
  studyMaterials: [],
  loading: true,
};

interface AppStateActions {
  saveProfile: (profile: Profile) => Promise<void>;
  saveCondition: (date: DateKey, condition: DailyCondition) => Promise<void>;
  upsertScheduleBlock: (date: DateKey, block: ScheduleBlock) => Promise<void>;
  deleteScheduleBlock: (date: DateKey, id: string) => Promise<void>;
  addPlannerItem: (date: DateKey, item: Omit<PlannerItem, 'id' | 'order'>) => Promise<void>;
  updatePlannerItem: (date: DateKey, id: string, patch: Partial<PlannerItem>) => Promise<void>;
  deletePlannerItem: (date: DateKey, id: string) => Promise<void>;
  carryOverPlannerItem: (date: DateKey, id: string) => Promise<void>;
  addStudyLog: (date: DateKey, entry: Omit<StudyLogEntry, 'id'>) => Promise<void>;
  addStudyMaterial: (material: Omit<StudyMaterial, 'id' | 'createdAt'>) => Promise<void>;
  updateStudyMaterial: (id: string, patch: Partial<StudyMaterial>) => Promise<void>;
  deleteStudyMaterial: (id: string) => Promise<void>;
  applyTomorrowRecommendation: (date: DateKey, items: TomorrowRecommendationItem[]) => Promise<void>;
}

const AppStateContext = React.createContext<{ state: AppState; actions: AppStateActions } | null>(null);

async function loadAll(userId: string): Promise<AppState> {
  const [profileRes, conditionsRes, blocksRes, itemsRes, logsRes, materialsRes] = await Promise.all([
    supabase.from('sb_profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('sb_daily_conditions').select('*').eq('user_id', userId),
    supabase.from('sb_schedule_blocks').select('*').eq('user_id', userId),
    supabase.from('sb_planner_items').select('*').eq('user_id', userId).order('order'),
    supabase.from('sb_study_logs').select('*').eq('user_id', userId),
    supabase.from('sb_study_materials').select('*').eq('user_id', userId),
  ]);

  const conditionRows = (conditionsRes.data ?? []).map(conditionFromRow);
  const conditions: Record<DateKey, DailyCondition> = {};
  for (const c of conditionRows) conditions[c.date] = c;

  return {
    profile: profileRes.data ? profileFromRow(profileRes.data) : null,
    conditions,
    scheduleBlocks: groupByDate((blocksRes.data ?? []).map(scheduleBlockFromRow)),
    plannerItems: groupByDate((itemsRes.data ?? []).map(plannerItemFromRow)),
    studyLogs: groupByDate((logsRes.data ?? []).map(studyLogFromRow)),
    studyMaterials: (materialsRes.data ?? []).map(studyMaterialFromRow),
    loading: false,
  };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [state, setState] = React.useState<AppState>(EMPTY_STATE);

  React.useEffect(() => {
    let cancelled = false;
    loadAll(userId).then((loaded) => {
      if (!cancelled) setState(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const actions: AppStateActions = React.useMemo(
    () => ({
      async saveProfile(profile) {
        setState((s) => ({ ...s, profile }));
        const { error } = await supabase.from('sb_profiles').upsert({
          id: userId,
          grade: profile.grade,
          main_subjects: profile.mainSubjects,
          goal: profile.goal,
          exam_date: profile.examDate,
          workbooks: profile.workbooks,
          onboarded_at: profile.onboardedAt,
        });
        if (error) console.error('saveProfile failed:', error.message);
      },

      async saveCondition(date, condition) {
        setState((s) => ({ ...s, conditions: { ...s.conditions, [date]: condition } }));
        const { error } = await supabase.from('sb_daily_conditions').upsert(
          {
            user_id: userId,
            date,
            sleep_hours: condition.sleepHours,
            fatigue: condition.fatigue,
            focus: condition.focus,
            mood: condition.mood,
            notes: condition.notes,
          },
          { onConflict: 'user_id,date' }
        );
        if (error) console.error('saveCondition failed:', error.message);
      },

      async upsertScheduleBlock(date, block) {
        const list = state.scheduleBlocks[date] ?? [];
        const exists = list.some((b) => b.id === block.id);
        const nextList = exists ? list.map((b) => (b.id === block.id ? block : b)) : [...list, block];
        nextList.sort((a, b) => a.startTime.localeCompare(b.startTime));
        setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: nextList } }));

        const row = { id: block.id, user_id: userId, date, type: block.type, label: block.label, start_time: block.startTime, end_time: block.endTime };
        const { error } = await supabase.from('sb_schedule_blocks').upsert(row);
        if (error) console.error('upsertScheduleBlock failed:', error.message);
      },

      async deleteScheduleBlock(date, id) {
        const previous = state.scheduleBlocks[date] ?? [];
        setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: previous.filter((b) => b.id !== id) } }));
        const { error } = await supabase.from('sb_schedule_blocks').delete().eq('id', id);
        if (error) {
          console.error('deleteScheduleBlock failed:', error.message);
          setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: previous } }));
        }
      },

      async addPlannerItem(date, item) {
        const list = state.plannerItems[date] ?? [];
        const id = uid();
        const order = list.length + 1;
        const fullItem: PlannerItem = { ...item, id, order };
        setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: [...list, fullItem] } }));

        const { error } = await supabase.from('sb_planner_items').insert({
          id,
          user_id: userId,
          date,
          order,
          subject_id: fullItem.subjectId,
          start_time: fullItem.startTime,
          study_type: fullItem.studyType,
          material: fullItem.material,
          unit: fullItem.unit,
          page_range: fullItem.pageRange,
          end_time: fullItem.endTime,
          difficulty: fullItem.difficulty,
          rest_pattern: fullItem.restPattern,
          must_do: fullItem.mustDo,
          status: fullItem.status,
          actual_minutes: fullItem.actualMinutes,
          understanding: fullItem.understanding,
          partial_reason: fullItem.partialReason,
          incomplete_reason: fullItem.incompleteReason,
        });
        if (error) console.error('addPlannerItem failed:', error.message);
      },

      async updatePlannerItem(date, id, patch) {
        const list = state.plannerItems[date] ?? [];
        setState((s) => ({
          ...s,
          plannerItems: { ...s.plannerItems, [date]: list.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
        }));

        const dbPatch: Record<string, unknown> = {};
        if ('order' in patch) dbPatch.order = patch.order;
        if ('subjectId' in patch) dbPatch.subject_id = patch.subjectId;
        if ('startTime' in patch) dbPatch.start_time = patch.startTime;
        if ('studyType' in patch) dbPatch.study_type = patch.studyType;
        if ('material' in patch) dbPatch.material = patch.material;
        if ('unit' in patch) dbPatch.unit = patch.unit;
        if ('pageRange' in patch) dbPatch.page_range = patch.pageRange;
        if ('endTime' in patch) dbPatch.end_time = patch.endTime;
        if ('difficulty' in patch) dbPatch.difficulty = patch.difficulty;
        if ('restPattern' in patch) dbPatch.rest_pattern = patch.restPattern;
        if ('mustDo' in patch) dbPatch.must_do = patch.mustDo;
        if ('status' in patch) dbPatch.status = patch.status;
        if ('actualMinutes' in patch) dbPatch.actual_minutes = patch.actualMinutes;
        if ('understanding' in patch) dbPatch.understanding = patch.understanding;
        if ('partialReason' in patch) dbPatch.partial_reason = patch.partialReason;
        if ('incompleteReason' in patch) dbPatch.incomplete_reason = patch.incompleteReason;

        const { error } = await supabase.from('sb_planner_items').update(dbPatch).eq('id', id);
        if (error) console.error('updatePlannerItem failed:', error.message);
      },

      async deletePlannerItem(date, id) {
        const previous = state.plannerItems[date] ?? [];
        setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: previous.filter((i) => i.id !== id) } }));
        const { error } = await supabase.from('sb_planner_items').delete().eq('id', id);
        if (error) {
          console.error('deletePlannerItem failed:', error.message);
          setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: previous } }));
        }
      },

      async carryOverPlannerItem(date, id) {
        const todayList = state.plannerItems[date] ?? [];
        const source = todayList.find((i) => i.id === id);
        if (!source) return;
        const updatedToday = todayList.map((i) => (i.id === id ? { ...i, status: 'carried_over' as const } : i));

        const tomorrowKey = addDaysToKey(date, 1);
        const tomorrowList = state.plannerItems[tomorrowKey] ?? [];
        const cloneId = uid();
        const order = tomorrowList.length + 1;
        const clone: PlannerItem = { ...source, id: cloneId, order, status: 'planned', actualMinutes: null, understanding: null };

        setState((s) => ({
          ...s,
          plannerItems: { ...s.plannerItems, [date]: updatedToday, [tomorrowKey]: [...tomorrowList, clone] },
        }));

        const { error: updateError } = await supabase.from('sb_planner_items').update({ status: 'carried_over' }).eq('id', id);
        if (updateError) console.error('carryOverPlannerItem (update) failed:', updateError.message);

        const { error: insertError } = await supabase.from('sb_planner_items').insert({
          id: cloneId,
          user_id: userId,
          date: tomorrowKey,
          order,
          subject_id: clone.subjectId,
          start_time: clone.startTime,
          study_type: clone.studyType,
          material: clone.material,
          unit: clone.unit,
          page_range: clone.pageRange,
          end_time: clone.endTime,
          difficulty: clone.difficulty,
          rest_pattern: clone.restPattern,
          must_do: clone.mustDo,
          status: clone.status,
          actual_minutes: clone.actualMinutes,
          understanding: clone.understanding,
          partial_reason: null,
          incomplete_reason: null,
        });
        if (insertError) console.error('carryOverPlannerItem (insert) failed:', insertError.message);
      },

      async addStudyLog(date, entry) {
        const list = state.studyLogs[date] ?? [];
        const id = uid();
        const fullEntry: StudyLogEntry = { ...entry, id };
        setState((s) => ({ ...s, studyLogs: { ...s.studyLogs, [date]: [...list, fullEntry] } }));

        const { error } = await supabase.from('sb_study_logs').insert({
          id,
          user_id: userId,
          date,
          planner_item_id: fullEntry.plannerItemId,
          subject_id: fullEntry.subjectId,
          rating: fullEntry.rating,
          blocked_tags: fullEntry.blockedTags,
          detail_note: fullEntry.detailNote,
          self_message: fullEntry.selfMessage,
        });
        if (error) console.error('addStudyLog failed:', error.message);
      },

      async addStudyMaterial(material) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullMaterial: StudyMaterial = { ...material, id, createdAt };
        setState((s) => ({ ...s, studyMaterials: [...s.studyMaterials, fullMaterial] }));

        const { error } = await supabase.from('sb_study_materials').insert({
          id,
          user_id: userId,
          subject_id: fullMaterial.subjectId,
          material_name: fullMaterial.materialName,
          total_scope: fullMaterial.totalScope,
          current_progress: fullMaterial.currentProgress,
          target_passes: fullMaterial.targetPasses,
          target_date: fullMaterial.targetDate,
          session_interval_days: fullMaterial.sessionIntervalDays,
        });
        if (error) console.error('addStudyMaterial failed:', error.message);
      },

      async updateStudyMaterial(id, patch) {
        setState((s) => ({ ...s, studyMaterials: s.studyMaterials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

        const dbPatch: Record<string, unknown> = {};
        if ('materialName' in patch) dbPatch.material_name = patch.materialName;
        if ('totalScope' in patch) dbPatch.total_scope = patch.totalScope;
        if ('currentProgress' in patch) dbPatch.current_progress = patch.currentProgress;
        if ('targetPasses' in patch) dbPatch.target_passes = patch.targetPasses;
        if ('targetDate' in patch) dbPatch.target_date = patch.targetDate;
        if ('sessionIntervalDays' in patch) dbPatch.session_interval_days = patch.sessionIntervalDays;

        const { error } = await supabase.from('sb_study_materials').update(dbPatch).eq('id', id);
        if (error) console.error('updateStudyMaterial failed:', error.message);
      },

      async deleteStudyMaterial(id) {
        const previous = state.studyMaterials;
        setState((s) => ({ ...s, studyMaterials: s.studyMaterials.filter((m) => m.id !== id) }));
        const { error } = await supabase.from('sb_study_materials').delete().eq('id', id);
        if (error) {
          console.error('deleteStudyMaterial failed:', error.message);
          setState((s) => ({ ...s, studyMaterials: previous }));
        }
      },

      async applyTomorrowRecommendation(date, items) {
        const existing = state.plannerItems[date] ?? [];
        const newItems: PlannerItem[] = items.map((it, idx) => ({
          id: uid(),
          date,
          order: existing.length + idx + 1,
          subjectId: it.subjectId,
          startTime: it.startTime,
          studyType: it.studyType,
          material: it.material,
          unit: it.unit,
          pageRange: it.pageRange,
          endTime: it.endTime,
          difficulty: it.difficulty,
          restPattern: null,
          mustDo: it.mustDo,
          status: 'planned',
          actualMinutes: null,
          understanding: null,
          partialReason: null,
          incompleteReason: null,
        }));
        setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: [...existing, ...newItems] } }));

        const { error } = await supabase.from('sb_planner_items').insert(
          newItems.map((it) => ({
            id: it.id,
            user_id: userId,
            date: it.date,
            order: it.order,
            subject_id: it.subjectId,
            start_time: it.startTime,
            study_type: it.studyType,
            material: it.material,
            unit: it.unit,
            page_range: it.pageRange,
            end_time: it.endTime,
            difficulty: it.difficulty,
            rest_pattern: it.restPattern,
            must_do: it.mustDo,
            status: it.status,
            actual_minutes: it.actualMinutes,
            understanding: it.understanding,
            partial_reason: it.partialReason,
            incomplete_reason: it.incompleteReason,
          }))
        );
        if (error) console.error('applyTomorrowRecommendation failed:', error.message);
      },
    }),
    [userId, state]
  );

  return <AppStateContext.Provider value={{ state, actions }}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add src/state/mappers.ts src/state/AppStateContext.tsx
git commit -m "feat: add Supabase-backed app state context"
```

---

### Task 8: 온보딩 화면

**Files:**
- Create: `src/screens/Onboarding.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `GRADES`/`SUBJECTS` (Task 2), `Button`/`ChipGroup`/`TextField`/`SelectField` (Task 4)
- Produces: `OnboardingScreen` default export, prop `{ onComplete: () => void }` — Task 18(App 조립)이 사용.

- [ ] **Step 1: `src/screens/Onboarding.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { GRADES, SUBJECTS } from '../constants';
import { Button, ChipGroup, TextField, SelectField } from '../primitives';
import type { Grade, SubjectId } from '../types';

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { actions } = useAppState();
  const [grade, setGrade] = React.useState<Grade>(GRADES[2]);
  const [mainSubjects, setMainSubjects] = React.useState<SubjectId[]>(['math']);
  const [goal, setGoal] = React.useState('');
  const [examDate, setExamDate] = React.useState('');
  const [workbooks, setWorkbooks] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await actions.saveProfile({
      grade,
      mainSubjects,
      goal,
      examDate: examDate || null,
      workbooks,
      onboardedAt: new Date().toISOString(),
    });
    setSubmitting(false);
    onComplete();
  };

  return (
    <div className="px-5 pt-8 pb-10">
      <h1 className="text-center text-xl font-bold text-primary mb-6">스터디 버디</h1>

      <div className="rounded-3xl bg-gradient-to-br from-primary-container/30 via-secondary-container/20 to-tertiary-container/30 p-6 mb-6 text-center">
        <div className="text-5xl mb-3">🤖📚</div>
        <h2 className="text-2xl font-extrabold text-on-surface mb-1">나를 가장 잘 아는 학습 파트너</h2>
        <p className="text-sm text-on-surface-variant">나에게 맞는 학습 루틴을 함께 만들어볼게요.</p>
      </div>

      <div className="space-y-5">
        <SelectField label="학년" value={grade} onChange={(v) => setGrade(v as Grade)} options={GRADES.map((g) => ({ id: g, label: g }))} />

        <div>
          <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">주요 과목</label>
          <ChipGroup options={SUBJECTS} value={mainSubjects} onChange={setMainSubjects} multi />
        </div>

        <TextField label="학습 목표" value={goal} onChange={setGoal} placeholder='예: "내신 수학 2등급 목표"' />
        <TextField label="시험 일정" value={examDate} onChange={setExamDate} type="date" />
        <TextField label="사용하는 문제집" value={workbooks} onChange={setWorkbooks} placeholder="예: 쎈 수학, 자이스토리 영어" />
      </div>

      <Button className="w-full mt-8" onClick={handleSubmit} disabled={submitting}>
        {submitting ? '시작하는 중...' : '시작하기'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/screens/Onboarding.tsx
git commit -m "feat: add onboarding screen"
```

---

### Task 9: 즉시 반응형 AI 규칙 로직 (TDD)

**Files:**
- Create: `src/ai.ts`
- Test: `src/ai.test.ts`

**Interfaces:**
- Consumes: `computeFreeGaps`/`sumFreeMinutes`/`getBestGap`/`withEul` (Task 3), `getSubject` (Task 2), `DailyCondition`/`PlannerItem`/`ScheduleBlock` (Task 2)
- Produces: `getHomeTip(condition, plannerItems, mustDoItem)`, `recommendedDifficultyFor(condition)`, `getFreeTimeAndSuggestion(blocks, condition, mostPostponedSubjectLabel?)` — Task 10(홈), Task 11(캘린더), Task 12(플래너)가 사용. 무거운 개인화 추천(`getTomorrowRecommendation`)은 순수 함수로 남기지 않고 Task 17에서 Edge Function 호출로 구현한다(네트워크가 필요하므로 여기서는 제외).

- [ ] **Step 1: 실패하는 테스트 작성 — `src/ai.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { getHomeTip, recommendedDifficultyFor, getFreeTimeAndSuggestion } from './ai';
import type { DailyCondition, PlannerItem, ScheduleBlock } from './types';

function condition(overrides: Partial<DailyCondition>): DailyCondition {
  return { date: '2026-07-30', sleepHours: 7, fatigue: 3, focus: 3, mood: 'neutral', notes: '', ...overrides };
}

function item(overrides: Partial<PlannerItem>): PlannerItem {
  return {
    id: 'p1', date: '2026-07-30', order: 1, subjectId: 'math', startTime: '19:00',
    studyType: null, material: '', unit: '', pageRange: '', endTime: null, difficulty: null,
    restPattern: null, mustDo: false, status: 'planned', actualMinutes: null, understanding: null,
    partialReason: null, incompleteReason: null, ...overrides,
  };
}

describe('getHomeTip', () => {
  it('asks for condition input when none exists', () => {
    expect(getHomeTip(null, [], null).tone).toBe('neutral');
  });
  it('asks to plan when planner is empty', () => {
    const tip = getHomeTip(condition({}), [], null);
    expect(tip.message).toContain('플래너가 비어있어요');
  });
  it('celebrates when everything is completed', () => {
    const items = [item({ status: 'completed' })];
    expect(getHomeTip(condition({}), items, null).tone).toBe('encouraging');
  });
  it('suggests only the must-do item when fatigue is high', () => {
    const mustDo = item({ mustDo: true, id: 'm1' });
    const tip = getHomeTip(condition({ fatigue: 5 }), [mustDo, item({ id: 'p2' })], mustDo);
    expect(tip.message).toContain('수학');
  });
});

describe('recommendedDifficultyFor', () => {
  it('recommends hard when focus is high and fatigue is low', () => {
    expect(recommendedDifficultyFor(condition({ focus: 5, fatigue: 1 }))).toBe('hard');
  });
  it('recommends easy when fatigue is high', () => {
    expect(recommendedDifficultyFor(condition({ fatigue: 5 }))).toBe('easy');
  });
  it('defaults to medium', () => {
    expect(recommendedDifficultyFor(condition({}))).toBe('medium');
  });
  it('defaults to medium when there is no condition yet', () => {
    expect(recommendedDifficultyFor(null)).toBe('medium');
  });
});

function block(overrides: Partial<ScheduleBlock>): ScheduleBlock {
  return { id: 'b1', date: '2026-07-30', type: 'school', label: '학교', startTime: '08:00', endTime: '16:00', ...overrides };
}

describe('getFreeTimeAndSuggestion', () => {
  it('suggests a short review session when there is no free gap', () => {
    const result = getFreeTimeAndSuggestion([block({ startTime: '00:00', endTime: '23:59' })], null);
    expect(result.bestGap).toBeNull();
    expect(result.suggestionText).toContain('복습');
  });
  it('names the best gap and a subject in the suggestion', () => {
    const result = getFreeTimeAndSuggestion([block({})], condition({}), '영어');
    expect(result.suggestionText).toContain('영어');
    expect(result.bestGap?.start).toBe('16:00');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/ai.test.ts`
Expected: FAIL — `./ai` 모듈 없음

- [ ] **Step 3: `src/ai.ts` 작성**

```typescript
import { computeFreeGaps, sumFreeMinutes, getBestGap, withEul } from './lib';
import { getSubject } from './constants';
import type { DailyCondition, PlannerItem, ScheduleBlock, DifficultyId } from './types';

export function getHomeTip(condition: DailyCondition | null, plannerItems: PlannerItem[], mustDoItem: PlannerItem | null) {
  if (!condition) {
    return { message: '오늘 컨디션을 입력하면 더 정확한 조언을 드릴 수 있어요!', tone: 'neutral' as const };
  }
  if (!plannerItems || plannerItems.length === 0) {
    return { message: '아직 오늘 플래너가 비어있어요. 지금 계획을 세워볼까요?', tone: 'neutral' as const };
  }
  const completed = plannerItems.filter((i) => i.status === 'completed').length;
  if (completed === plannerItems.length) {
    return { message: '오늘 계획을 모두 완료했어요! 정말 잘했어요 🎉', tone: 'encouraging' as const };
  }
  if (condition.fatigue >= 4) {
    const label = mustDoItem ? `${getSubject(mustDoItem.subjectId).label} 과제` : '필수 과제';
    return { message: `오늘은 피로도가 높아요. ${label}만 마쳐도 충분해요.`, tone: 'encouraging' as const };
  }
  if (mustDoItem && mustDoItem.status !== 'completed') {
    return {
      message: `${mustDoItem.material || getSubject(mustDoItem.subjectId).label}: ${mustDoItem.unit || ''}만 마치면 오늘 목표 달성이에요.`,
      tone: 'encouraging' as const,
    };
  }
  return { message: '오늘도 한 걸음씩 나아가고 있어요. 화이팅!', tone: 'encouraging' as const };
}

export function recommendedDifficultyFor(condition: DailyCondition | null): DifficultyId {
  if (!condition) return 'medium';
  if (condition.focus >= 4 && condition.fatigue <= 2) return 'hard';
  if (condition.fatigue >= 4 || condition.focus <= 2) return 'easy';
  return 'medium';
}

export function getFreeTimeAndSuggestion(blocks: ScheduleBlock[], condition: DailyCondition | null, mostPostponedSubjectLabel?: string) {
  const gaps = computeFreeGaps(blocks);
  const totalFreeMinutes = sumFreeMinutes(gaps);
  const bestGap = getBestGap(gaps);
  const recommendedDifficulty = recommendedDifficultyFor(condition);

  let suggestionText: string;
  if (!bestGap) {
    suggestionText = '오늘은 빈 시간이 거의 없어요. 짧게라도 복습해볼까요?';
  } else {
    const hours = (bestGap.minutes / 60).toFixed(1).replace(/\.0$/, '');
    const firstBlock = Math.min(90, bestGap.minutes);
    const subjectPhrase = mostPostponedSubjectLabel || '핵심 과목';
    suggestionText = `오늘 ${bestGap.start} 이후로 ${hours}시간이 비어 있어요. 첫 ${firstBlock}분은 ${withEul(subjectPhrase)} 학습을 추천해요.`;
  }

  return { freeGaps: gaps, totalFreeMinutes, bestGap, recommendedDifficulty, suggestionText };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/ai.test.ts`
Expected: PASS (전체 테스트)

- [ ] **Step 5: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add src/ai.ts src/ai.test.ts
git commit -m "feat: add rule-based home tip and free-time suggestion logic"
```

---

### Task 10: 홈 화면 (+ 학습 자료 목표 카드 통합)

**Files:**
- Create: `src/screens/Home.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `todayKey`/`formatDateKorean`/`formatMinutes`/`getPlannerProgress`/`computeMaterialPace` (Task 3), `getHomeTip`/`getFreeTimeAndSuggestion` (Task 9), `getSubject`/`getStudyType`/`MOODS` (Task 2), `Icon`/`TopAppBar`/`Card`/`ProgressRing`/`SectionTitle`/`AiTipCard` (Task 4)
- Produces: `HomeScreen` default export, props `{ onNavigate: (tab: TabId) => void; onOpenOverlay: (overlay: 'condition' | 'aiRecommendation') => void }` — Task 18(App 조립)이 사용.

가장 시급한 학습 자료(목표일이 가장 가까우면서 기한이 지나지 않은 자료) 하나를 골라 "오늘의 시험 대비 목표" 카드로 보여준다. 여러 자료의 "오늘이 학습일인지" 판정에는 마지막 학습일 추적이 필요한데, 이번 스코프에서는 그 추적을 스키마에 넣지 않기로 했으므로(Task 5 스키마에 `last_studied_date` 없음) 매일 방문 시 가장 시급한 자료 하나를 항상 보여주는 방식으로 단순화한다.

- [ ] **Step 1: `src/screens/Home.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, formatDateKorean, formatMinutes, getPlannerProgress, computeMaterialPace } from '../lib';
import { getHomeTip, getFreeTimeAndSuggestion } from '../ai';
import { getSubject, getStudyType, MOODS } from '../constants';
import { Icon, TopAppBar, Card, ProgressRing, SectionTitle, AiTipCard, Button } from '../primitives';
import type { TabId } from '../primitives';
import type { StudyMaterial } from '../types';

function mostUrgentMaterial(materials: StudyMaterial[], today: string): { material: StudyMaterial; pace: ReturnType<typeof computeMaterialPace> } | null {
  const candidates = materials
    .map((material) => ({ material, pace: computeMaterialPace(material, today) }))
    .filter((c) => !c.pace.isOverdue && c.pace.remainingScope > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.pace.remainingDays < best.pace.remainingDays ? c : best), candidates[0]);
}

export default function HomeScreen({
  onNavigate,
  onOpenOverlay,
}: {
  onNavigate: (tab: TabId) => void;
  onOpenOverlay: (overlay: 'condition' | 'aiRecommendation') => void;
}) {
  const { state } = useAppState();
  const date = todayKey();
  const condition = state.conditions[date] ?? null;
  const blocks = state.scheduleBlocks[date] ?? [];
  const items = state.plannerItems[date] ?? [];
  const mustDoItem = items.find((i) => i.mustDo && i.status !== 'completed') ?? items.find((i) => i.mustDo) ?? null;

  const { totalFreeMinutes } = getFreeTimeAndSuggestion(blocks, condition);
  const progress = getPlannerProgress(items);
  const tip = getHomeTip(condition, items, mustDoItem);
  const urgent = mostUrgentMaterial(state.studyMaterials, date);

  const profile = state.profile;

  return (
    <div className="px-5 pt-4 pb-10">
      <TopAppBar />

      <p className="text-xs font-semibold text-on-surface-variant mt-2">{formatDateKorean(date)}</p>
      <h1 className="text-xl font-bold text-on-surface mt-1 mb-5 leading-snug">
        안녕하세요{profile && profile.mainSubjects[0] ? `, ${getSubject(profile.mainSubjects[0]).label} 학습자님` : ''}!<br />
        오늘 하루도 화이팅해요.
      </h1>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card tint="primary">
          <Icon name="mood" className="!text-[20px] text-primary mb-1" />
          <p className="text-xs text-on-surface-variant mb-1">오늘 컨디션</p>
          {condition ? (
            <p className="text-base font-bold">{MOODS.find((m) => m.id === condition.mood)?.label ?? '-'}</p>
          ) : (
            <button onClick={() => onOpenOverlay('condition')} className="text-sm font-semibold text-primary underline">
              컨디션 입력하기
            </button>
          )}
        </Card>
        <Card tint="secondary">
          <Icon name="timer" className="!text-[20px] text-secondary mb-1" />
          <p className="text-xs text-on-surface-variant mb-1">공부 가능 시간</p>
          <p className="text-base font-bold">{formatMinutes(totalFreeMinutes)}</p>
        </Card>
      </div>

      <Card className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-on-surface mb-1">플래너 진행률</p>
          <p className="text-xs text-on-surface-variant mb-2">
            {progress.total}개의 계획 중 {progress.completed}개 완료
          </p>
          <button onClick={() => onNavigate('planner')} className="text-xs font-semibold text-primary underline">
            오늘 플래너 보기
          </button>
        </div>
        <ProgressRing percent={progress.percent} />
      </Card>

      {urgent && (
        <Card className="mb-4">
          <p className="text-xs font-bold text-on-surface-variant mb-1">📐 오늘의 시험 대비 목표</p>
          <p className="text-sm font-bold text-on-surface mb-1">
            {getSubject(urgent.material.subjectId).label} {urgent.material.materialName} {urgent.pace.scopePerSession}p
          </p>
          <p className="text-xs text-on-surface-variant mb-3">
            목표일 {urgent.material.targetDate} · D-{urgent.pace.remainingDays}
          </p>
          <Button
            className="w-full"
            variant="ghost"
            onClick={() => onNavigate('planner')}
          >
            플래너에 반영하기
          </Button>
        </Card>
      )}

      <SectionTitle action={<button onClick={() => onNavigate('check')} className="text-xs font-semibold text-primary">전체보기</button>}>
        필수 과제
      </SectionTitle>
      {mustDoItem ? (
        <Card className="!bg-primary text-on-primary mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs bg-white/20 rounded-full px-2 py-1">{mustDoItem.startTime} 시작</span>
            <Icon name="alarm" />
          </div>
          <p className="text-lg font-bold mb-1">
            {getSubject(mustDoItem.subjectId).label}: {mustDoItem.material || getStudyType(mustDoItem.studyType).label}
          </p>
          <p className="text-sm opacity-90 mb-3">
            {mustDoItem.unit} {mustDoItem.pageRange}
          </p>
          <button onClick={() => onNavigate('check')} className="w-full bg-white text-primary rounded-full py-2.5 text-sm font-bold">
            학습 체크하기
          </button>
        </Card>
      ) : (
        <Card className="mb-5 text-center text-sm text-on-surface-variant py-6">
          아직 오늘의 필수 과제가 없어요.{' '}
          <button onClick={() => onNavigate('planner')} className="text-primary font-semibold underline">
            플래너 만들기
          </button>
        </Card>
      )}

      <AiTipCard text={tip.message} />

      <button onClick={() => onOpenOverlay('aiRecommendation')} className="mt-3 text-xs font-semibold text-primary flex items-center gap-1">
        AI 분석 보기 <Icon name="trending_up" className="!text-[16px]" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/screens/Home.tsx
git commit -m "feat: add home screen with study-material goal card"
```

---

### Task 11: 캘린더 화면

**Files:**
- Create: `src/screens/Calendar.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `todayKey`/`weekStrip`/`formatMinutes`/`uid` (Task 3), `getFreeTimeAndSuggestion` (Task 9), `DIFFICULTY_LEVELS` (Task 2), `TopAppBar`/`Card`/`SectionTitle`/`ChipGroup`/`TextField`/`Button`/`Icon` (Task 4)
- Produces: `CalendarScreen` default export, props `{ onNavigate: (tab: TabId) => void }` — Task 18이 사용.

- [ ] **Step 1: `src/screens/Calendar.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, weekStrip, formatMinutes, uid } from '../lib';
import { getFreeTimeAndSuggestion } from '../ai';
import { DIFFICULTY_LEVELS } from '../constants';
import { TopAppBar, Card, SectionTitle, ChipGroup, TextField, Button, Icon } from '../primitives';
import type { TabId } from '../primitives';
import type { ScheduleBlock } from '../types';

const BLOCK_TYPES = [
  { id: 'school', label: '학교' },
  { id: 'academy', label: '학원' },
  { id: 'meal', label: '식사' },
  { id: 'rest', label: '휴식' },
  { id: 'commute', label: '이동' },
  { id: 'other', label: '기타' },
];

export default function CalendarScreen({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { state, actions } = useAppState();
  const [selectedDate, setSelectedDate] = React.useState(todayKey());
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ type: 'school', label: '', startTime: '08:00', endTime: '16:00' });

  const blocks = state.scheduleBlocks[selectedDate] ?? [];
  const condition = state.conditions[selectedDate] ?? null;
  const { totalFreeMinutes, bestGap, recommendedDifficulty, suggestionText } = getFreeTimeAndSuggestion(blocks, condition);

  const days = weekStrip(selectedDate);

  const addBlock = () => {
    if (!form.label.trim()) return;
    const block: ScheduleBlock = { id: uid(), date: selectedDate, ...form };
    actions.upsertScheduleBlock(selectedDate, block);
    setForm({ type: 'school', label: '', startTime: '08:00', endTime: '16:00' });
    setShowForm(false);
  };

  const [y, m] = selectedDate.split('-');

  return (
    <div className="px-5 pt-4 pb-28">
      <TopAppBar />

      <div className="flex items-center justify-between mt-2 mb-3">
        <p className="text-base font-bold">
          {y}년 {Number(m)}월
        </p>
        <button onClick={() => setSelectedDate(todayKey())} className="text-xs font-semibold bg-surface-container rounded-full px-3 py-1.5">
          오늘
        </button>
      </div>

      <div className="flex justify-between mb-5">
        {days.map((d) => (
          <button
            key={d.key}
            onClick={() => setSelectedDate(d.key)}
            className={`flex flex-col items-center gap-1 w-9 py-2 rounded-xl ${d.key === selectedDate ? 'bg-primary text-on-primary' : 'text-on-surface'}`}
          >
            <span className="text-[11px]">{d.label}</span>
            <span className="text-sm font-bold">{d.date}</span>
          </button>
        ))}
      </div>

      <Card tint="secondary" className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="event_available" className="text-secondary" />
          <span className="text-sm font-bold">오늘 공부 가능 시간 요약</span>
        </div>
        <div className="grid grid-cols-3 text-center">
          <div>
            <p className="text-xs text-on-surface-variant">총 시간</p>
            <p className="text-sm font-bold">{formatMinutes(totalFreeMinutes)}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">최적 시간</p>
            <p className="text-sm font-bold">{bestGap ? `${bestGap.start}~${bestGap.end}` : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">추천 난이도</p>
            <p className="text-sm font-bold">{DIFFICULTY_LEVELS.find((d) => d.id === recommendedDifficulty)?.label}</p>
          </div>
        </div>
      </Card>

      <SectionTitle
        action={
          <button onClick={() => setShowForm((s) => !s)} className="text-primary flex items-center gap-1 text-xs font-semibold">
            <Icon name="add_circle" className="!text-[18px]" /> 일정 추가
          </button>
        }
      >
        오늘의 일과
      </SectionTitle>

      {showForm && (
        <Card className="mb-4 space-y-3">
          <ChipGroup options={BLOCK_TYPES} value={form.type} onChange={(type) => setForm((f) => ({ ...f, type }))} />
          <TextField label="일정 이름" value={form.label} onChange={(label) => setForm((f) => ({ ...f, label }))} placeholder="예: 정규 수업" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="시작" type="time" value={form.startTime} onChange={(startTime) => setForm((f) => ({ ...f, startTime }))} />
            <TextField label="종료" type="time" value={form.endTime} onChange={(endTime) => setForm((f) => ({ ...f, endTime }))} />
          </div>
          <Button className="w-full" onClick={addBlock}>
            추가하기
          </Button>
        </Card>
      )}

      <div className="space-y-2 mb-5">
        {blocks.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">등록된 일정이 없어요. 일정을 추가해보세요.</p>}
        {blocks.map((b) => {
          const bt = BLOCK_TYPES.find((t) => t.id === b.type) ?? BLOCK_TYPES[0];
          return (
            <div key={b.id} className="flex items-center justify-between rounded-xl bg-surface-container-high px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{b.label}</p>
                <p className="text-xs text-on-surface-variant">
                  {bt.label} · {b.startTime} - {b.endTime}
                </p>
              </div>
              <button onClick={() => actions.deleteScheduleBlock(selectedDate, b.id)} className="text-on-surface-variant">
                <Icon name="close" className="!text-[18px]" />
              </button>
            </div>
          );
        })}
      </div>

      <Card tint="tertiary">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="lightbulb" className="text-tertiary" />
          <span className="text-sm font-bold">AI 추천 분석</span>
        </div>
        <p className="text-sm text-on-surface leading-relaxed mb-3">{suggestionText}</p>
        <Button variant="ghost" onClick={() => onNavigate('planner')}>
          추천 플랜 만들기
        </Button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/screens/Calendar.tsx
git commit -m "feat: add calendar screen"
```

---

### Task 12: 플래너 메인 화면 (빠른 추가)

**Files:**
- Create: `src/screens/PlannerCreate.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `todayKey`/`uid`/`resolveQuickTimeChip`/`getPlannerProgress` (Task 3), `SUBJECTS`/`QUICK_TIME_CHIPS`/`getSubject` (Task 2), `TopAppBar`/`Card`/`SectionTitle`/`ChipGroup`/`Button`/`Icon` (Task 4)
- Produces: `PlannerCreateScreen` default export(인자 없음) — Task 18이 사용. 항목을 탭하면 내부적으로 Task 13의 `PlannerItemDetailScreen`으로 전환한다(전역 오버레이가 아니라 이 화면 내부의 로컬 state로 처리). Task 17에서 이 파일에 "학습 자료 목표" 진입 버튼을 추가하는 수정이 더해진다.

브레인스토밍에서 합의한 대로 메인 화면은 **과목 + 시작 시간(빠른 선택 칩)만** 입력받는다. 나머지 필드는 Task 13의 상세 페이지 몫이다.

- [ ] **Step 1: `src/screens/PlannerCreate.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, uid, resolveQuickTimeChip } from '../lib';
import { SUBJECTS, QUICK_TIME_CHIPS, getSubject } from '../constants';
import { TopAppBar, Card, SectionTitle, ChipGroup, Button, Icon } from '../primitives';
import PlannerItemDetailScreen from './PlannerItemDetail';
import type { SubjectId } from '../types';
import type { QuickTimeChipId } from '../constants';

export default function PlannerCreateScreen() {
  const { state, actions } = useAppState();
  const date = todayKey();
  const items = (state.plannerItems[date] ?? []).slice().sort((a, b) => a.order - b.order);
  const blocks = state.scheduleBlocks[date] ?? [];

  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [chipId, setChipId] = React.useState<QuickTimeChipId>('now');

  if (selectedItemId) {
    const item = items.find((i) => i.id === selectedItemId);
    if (item) {
      return <PlannerItemDetailScreen item={item} allItemsToday={items} onBack={() => setSelectedItemId(null)} />;
    }
    setSelectedItemId(null);
  }

  const nowTime = new Date().toTimeString().slice(0, 5);

  const handleAdd = () => {
    const startTime = resolveQuickTimeChip(chipId, blocks, nowTime);
    actions.addPlannerItem(date, {
      date,
      subjectId,
      startTime,
      studyType: null,
      material: '',
      unit: '',
      pageRange: '',
      endTime: null,
      difficulty: null,
      restPattern: null,
      mustDo: false,
      status: 'planned',
      actualMinutes: null,
      understanding: null,
      partialReason: null,
      incompleteReason: null,
    });
    setShowForm(false);
  };

  return (
    <div className="px-5 pt-4 pb-28">
      <TopAppBar />
      <h1 className="text-xl font-bold mt-2 mb-1">오늘의 학습</h1>
      <p className="text-sm text-on-surface-variant mb-4">과목 + 시작 시간만 입력하면 끝. 나머지는 눌러서 원할 때 채워요.</p>

      {!showForm && (
        <Button className="w-full mb-4" onClick={() => setShowForm(true)} icon="add_task">
          + 과목 추가
        </Button>
      )}

      {showForm && (
        <Card className="mb-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">과목 선택</p>
            <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">언제 시작할까요?</p>
            <ChipGroup options={[...QUICK_TIME_CHIPS]} value={chipId} onChange={setChipId} />
          </div>
          <Button className="w-full" onClick={handleAdd}>
            추가하기
          </Button>
        </Card>
      )}

      <SectionTitle>오늘의 학습 목록 ({items.length})</SectionTitle>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">아직 추가된 학습이 없어요.</p>}
        {items.map((it) => (
          <button key={it.id} onClick={() => setSelectedItemId(it.id)} className="w-full text-left">
            <Card className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                <div>
                  <p className="text-sm font-bold text-on-surface">
                    {getSubject(it.subjectId).label} {it.mustDo && <span className="text-tertiary">★</span>}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {it.startTime} 시작{it.material ? ` · ${it.material}` : ''}
                  </p>
                </div>
              </div>
              <Icon name="chevron_right" className="text-outline-variant" />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 아직 `./PlannerItemDetail`가 없으므로 에러(모듈 없음) — Task 13에서 해소됨. 이 태스크만 단독 커밋하지 않고 Task 13과 함께 확인한다.

- [ ] **Step 3: Commit (Task 13과 함께 커밋 — Step 2 참고)**

이 태스크는 커밋하지 않고 다음 태스크로 진행한다.

---

### Task 13: 플래너 상세 페이지

**Files:**
- Create: `src/screens/PlannerItemDetail.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `timeToMinutes`/`minutesToTime`/`todayKey` (Task 3), `STUDY_TYPES`/`DIFFICULTY_LEVELS`/`REST_PATTERNS`/`getSubject` (Task 2), `BackBar`/`Card`/`ChipGroup`/`TextField`/`SelectField`/`ToggleSwitch`/`Icon`/`Button` (Task 4)
- Produces: `PlannerItemDetailScreen` default export, props `{ item: PlannerItem; allItemsToday: PlannerItem[]; onBack: () => void }` — Task 12(`PlannerCreateScreen`)이 사용.

시간 충돌은 `item`과 시작/종료 시각이 모두 있는 다른 오늘자 항목들 사이에서만 검사한다(둘 중 하나라도 종료 시각이 비어있으면 그 항목과는 비교하지 않는다 — 상세를 아직 안 채운 항목끼리는 충돌을 판단할 근거가 없기 때문). "자동 조정하기"는 이 항목의 시작 시각을 충돌하는 항목들 중 가장 늦은 종료 시각으로 옮기고, 기존 소요시간(있었다면)을 유지해 종료 시각도 함께 민다.

- [ ] **Step 1: `src/screens/PlannerItemDetail.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, timeToMinutes, minutesToTime } from '../lib';
import { STUDY_TYPES, DIFFICULTY_LEVELS, REST_PATTERNS, getSubject } from '../constants';
import { BackBar, Card, ChipGroup, TextField, SelectField, ToggleSwitch, Icon, Button } from '../primitives';
import type { PlannerItem, StudyTypeId, DifficultyId, RestPatternId } from '../types';

export default function PlannerItemDetailScreen({
  item,
  allItemsToday,
  onBack,
}: {
  item: PlannerItem;
  allItemsToday: PlannerItem[];
  onBack: () => void;
}) {
  const { actions } = useAppState();
  const date = todayKey();

  const [studyType, setStudyType] = React.useState<StudyTypeId | null>(item.studyType);
  const [material, setMaterial] = React.useState(item.material);
  const [unit, setUnit] = React.useState(item.unit);
  const [pageRange, setPageRange] = React.useState(item.pageRange);
  const [endTime, setEndTime] = React.useState(item.endTime ?? '');
  const [difficulty, setDifficulty] = React.useState<DifficultyId | null>(item.difficulty);
  const [restPattern, setRestPattern] = React.useState<RestPatternId>(item.restPattern ?? 'none');
  const [mustDo, setMustDo] = React.useState(item.mustDo);
  const [startTime, setStartTime] = React.useState(item.startTime);

  const others = allItemsToday.filter((i) => i.id !== item.id);
  const conflicts = endTime
    ? others.filter((o) => o.endTime && timeToMinutes(startTime) < timeToMinutes(o.endTime!) && timeToMinutes(endTime) > timeToMinutes(o.startTime))
    : [];

  const autoAdjust = () => {
    if (conflicts.length === 0) return;
    const latestEnd = conflicts.reduce((max, c) => Math.max(max, timeToMinutes(c.endTime!)), 0);
    const durationMinutes = endTime ? timeToMinutes(endTime) - timeToMinutes(startTime) : null;
    setStartTime(minutesToTime(latestEnd));
    if (durationMinutes !== null) setEndTime(minutesToTime(latestEnd + Math.max(0, durationMinutes)));
  };

  const sorted = allItemsToday.slice().sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((i) => i.id === item.id);
  const canMoveUp = index > 0;
  const canMoveDown = index >= 0 && index < sorted.length - 1;

  const moveOrder = (direction: -1 | 1) => {
    const swapWith = sorted[index + direction];
    if (!swapWith) return;
    actions.updatePlannerItem(date, item.id, { order: swapWith.order });
    actions.updatePlannerItem(date, swapWith.id, { order: item.order });
  };

  const handleSave = () => {
    actions.updatePlannerItem(date, item.id, {
      studyType,
      material,
      unit,
      pageRange,
      startTime,
      endTime: endTime || null,
      difficulty,
      restPattern,
      mustDo,
    });
    onBack();
  };

  return (
    <div className="pb-10">
      <BackBar title={`${getSubject(item.subjectId).label} · ${startTime} 시작`} onBack={handleSave} />
      <div className="px-5 pt-2 space-y-4">
        <Card className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">학습 유형</p>
            <ChipGroup options={STUDY_TYPES} value={studyType ?? ''} onChange={(v) => setStudyType(v as StudyTypeId)} getIcon={(o) => o.icon} />
          </div>

          <TextField label="교재/자료명" value={material} onChange={setMaterial} placeholder="예: 쎈 수학 (상)" />

          <div className="grid grid-cols-2 gap-3">
            <TextField label="단원" value={unit} onChange={setUnit} placeholder="예: 2단원" />
            <TextField label="페이지" value={pageRange} onChange={setPageRange} placeholder="예: 42-50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="시작" type="time" value={startTime} onChange={setStartTime} />
            <TextField label="종료" type="time" value={endTime} onChange={setEndTime} />
          </div>

          {conflicts.length > 0 && (
            <div className="rounded-xl bg-error-container/40 px-3 py-2.5 text-sm text-on-error-container">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="warning" className="!text-[18px]" />
                이 시간에는 이미 "{getSubject(conflicts[0].subjectId).label}" 학습이 있어요.
              </div>
              <button onClick={autoAdjust} className="text-primary font-semibold underline text-sm">
                자동 조정하기
              </button>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">난이도</p>
            <ChipGroup options={DIFFICULTY_LEVELS} value={difficulty ?? ''} onChange={(v) => setDifficulty(v as DifficultyId)} />
          </div>

          <SelectField label="휴식 패턴" value={restPattern} onChange={(v) => setRestPattern(v as RestPatternId)} options={REST_PATTERNS} />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-on-surface">학습 순서</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant">{index + 1}번째</span>
              <button onClick={() => moveOrder(-1)} disabled={!canMoveUp} className="disabled:opacity-30">
                <Icon name="arrow_upward" className="!text-[18px]" />
              </button>
              <button onClick={() => moveOrder(1)} disabled={!canMoveDown} className="disabled:opacity-30">
                <Icon name="arrow_downward" className="!text-[18px]" />
              </button>
            </div>
          </div>

          <ToggleSwitch checked={mustDo} onChange={setMustDo} label="필수 과제로 표시" />
        </Card>

        <p className="text-xs text-on-surface-variant text-center">전부 비워둬도 저장 가능 — 나중에 다시 들어와서 채워도 돼요.</p>

        <Button className="w-full" onClick={handleSave}>
          저장
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음(Task 12+13 함께)

- [ ] **Step 3: Commit**

```bash
git add src/screens/PlannerCreate.tsx src/screens/PlannerItemDetail.tsx
git commit -m "feat: split planner into quick-add main and detail screens"
```

---

### Task 14: 실행 체크 화면

**Files:**
- Create: `src/screens/ExecutionCheck.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `todayKey`/`timeToMinutes`/`getPlannerProgress` (Task 3), `getSubject`/`getStudyType` (Task 2), `Icon`/`TopAppBar`/`Card`/`ProgressBar`/`AiTipCard`/`Button`/`BottomSheet`/`TextField`/`Chip` (Task 4)
- Produces: `ExecutionCheckScreen` default export, props `{ onOpenStudyLog: (item: PlannerItem) => void; onOpenAiRecommendation: () => void }` — Task 18이 사용.

- [ ] **Step 1: `src/screens/ExecutionCheck.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, timeToMinutes, getPlannerProgress } from '../lib';
import { getSubject, getStudyType } from '../constants';
import { Icon, TopAppBar, Card, ProgressBar, AiTipCard, Button, BottomSheet, TextField, Chip } from '../primitives';
import type { PlannerItem, PlannerItemStatus } from '../types';

const REASON_CHIPS = ['집중이 안 됐어요', '생각보다 어려웠어요', '다른 일이 생겼어요', '시간이 부족했어요', '다른 일정과 겹쳤어요', '너무 피곤했어요'];

function StatusIcon({ status }: { status: PlannerItemStatus }) {
  if (status === 'completed') return <Icon name="check_circle" filled className="!text-[26px] text-secondary" />;
  if (status === 'partial') return <Icon name="radio_button_checked" className="!text-[26px] text-tertiary" />;
  return <Icon name="circle" className="!text-[26px] text-outline-variant" />;
}

export default function ExecutionCheckScreen({
  onOpenStudyLog,
  onOpenAiRecommendation,
}: {
  onOpenStudyLog: (item: PlannerItem) => void;
  onOpenAiRecommendation: () => void;
}) {
  const { state, actions } = useAppState();
  const date = todayKey();
  const items = (state.plannerItems[date] ?? []).slice().sort((a, b) => a.order - b.order);
  const progress = getPlannerProgress(items);

  const [sheetItem, setSheetItem] = React.useState<PlannerItem | null>(null);
  const [reason, setReason] = React.useState('');
  const [actualMinutes, setActualMinutes] = React.useState('');

  const openSheet = (item: PlannerItem) => {
    setSheetItem(item);
    setActualMinutes(item.actualMinutes != null ? String(item.actualMinutes) : '');
    setReason(item.partialReason ?? item.incompleteReason ?? '');
  };

  const setStatus = (status: PlannerItemStatus) => {
    if (!sheetItem) return;
    const patch: Partial<PlannerItem> = { status };
    if (status === 'completed') {
      const plannedMinutes = sheetItem.endTime ? Math.max(0, timeToMinutes(sheetItem.endTime) - timeToMinutes(sheetItem.startTime)) : 0;
      patch.actualMinutes = actualMinutes === '' ? plannedMinutes : Number(actualMinutes);
    } else if (status === 'partial') {
      patch.partialReason = reason;
      patch.actualMinutes = actualMinutes === '' ? null : Number(actualMinutes);
    } else if (status === 'carried_over') {
      patch.incompleteReason = reason;
    }
    actions.updatePlannerItem(date, sheetItem.id, patch);
    setSheetItem(null);
  };

  const understandingOptions: { id: 'low' | 'medium' | 'high'; label: string }[] = [
    { id: 'low', label: '낮음' },
    { id: 'medium', label: '보통' },
    { id: 'high', label: '높음' },
  ];

  return (
    <div className="px-5 pt-4 pb-40">
      <TopAppBar />

      <p className="text-xs font-semibold text-on-surface-variant mt-2">오늘의 달성률</p>
      <h1 className="text-2xl font-extrabold mb-1">{progress.percent}% 완료</h1>
      <p className="text-sm text-on-surface-variant mb-2">
        {progress.completed}/{progress.total} 작업 완료
      </p>
      <ProgressBar percent={progress.percent} className="mb-5" />

      <h2 className="text-base font-bold mb-3">학습 체크리스트</h2>
      <div className="space-y-3 mb-5">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">오늘 플래너에 항목이 없어요.</p>}
        {items.map((it) => (
          <Card key={it.id}>
            <div className="flex items-start gap-3">
              <button onClick={() => openSheet(it)} className="mt-0.5">
                <StatusIcon status={it.status} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-bold ${it.status === 'completed' ? 'line-through opacity-50' : ''}`}>
                    {getSubject(it.subjectId).label}: {it.material || getStudyType(it.studyType).label}
                  </p>
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-surface-container text-on-surface-variant shrink-0">
                    {it.status === 'completed' ? '완료' : it.status === 'partial' ? '일부 완료' : it.status === 'carried_over' ? '내일로 조정' : '예정'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {it.startTime}
                  {it.endTime ? ` - ${it.endTime}` : ''}
                </p>
                {(it.partialReason || it.incompleteReason) && (
                  <span className="inline-block mt-1.5 text-xs bg-surface-container-high rounded-full px-2 py-1">{it.partialReason || it.incompleteReason}</span>
                )}
                {it.status === 'completed' && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/40">
                    <span className="text-xs text-on-surface-variant">실제 {it.actualMinutes ?? '-'}분</span>
                    <div className="flex gap-1">
                      {understandingOptions.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => actions.updatePlannerItem(date, it.id, { understanding: u.id })}
                          className={`text-[11px] rounded-full px-2 py-0.5 ${it.understanding === u.id ? 'bg-primary text-on-primary' : 'bg-surface-container'}`}
                        >
                          {u.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {it.status === 'completed' && (
                  <button onClick={() => onOpenStudyLog(it)} className="mt-2 text-xs font-semibold text-primary underline">
                    학습 기록 작성하기
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AiTipCard
        icon="analytics"
        text={`오늘은 ${progress.total}개 중 ${progress.completed}개를 완료했어요. ${progress.percent < 100 ? '무리하지 말고 남은 항목은 내일로 조정해도 괜찮아요.' : '정말 훌륭해요!'}`}
      />

      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-5 pb-3 pt-2 bg-gradient-to-t from-surface via-surface/95 z-20">
        <Button className="w-full" onClick={onOpenAiRecommendation} icon="auto_awesome">
          AI 내일 플래너 보기
        </Button>
      </div>

      <BottomSheet open={!!sheetItem} onClose={() => setSheetItem(null)} title={sheetItem ? `${getSubject(sheetItem.subjectId).label} 상태 변경` : ''}>
        {sheetItem && (
          <div className="space-y-4">
            <TextField label="실제 학습 시간(분)" type="number" value={actualMinutes} onChange={setActualMinutes} placeholder="예: 45" />
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => setStatus('completed')}>
                완료
              </Button>
              <Button variant="ghost" onClick={() => setStatus('partial')}>
                일부 완료
              </Button>
              <Button variant="outline" onClick={() => setStatus('carried_over')}>
                내일로 조정
              </Button>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant mb-1.5">사유 (선택)</p>
              <div className="flex flex-wrap gap-2">
                {REASON_CHIPS.map((r) => (
                  <Chip key={r} label={r} active={reason === r} onClick={() => setReason(r === reason ? '' : r)} />
                ))}
              </div>
            </div>
            {sheetItem.status === 'carried_over' && (
              <Button variant="error" className="w-full" onClick={() => actions.deletePlannerItem(date, sheetItem.id)}>
                삭제
              </Button>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/screens/ExecutionCheck.tsx
git commit -m "feat: add execution check screen"
```

---

### Task 15: 컨디션 입력 화면 (간소화)

**Files:**
- Create: `src/screens/ConditionInput.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `todayKey` (Task 3), `MOODS` (Task 2), `BackBar`/`Card`/`SliderField`/`TextArea`/`Button`/`Collapsible` (Task 4)
- Produces: `ConditionInputScreen` default export, props `{ onBack: () => void }` — Task 18이 사용.

브레인스토밍 합의: 이모지 5개(최상/좋음/보통/피곤/힘듦) 탭 한 번이 기본 저장 경로이고, 수면시간/집중도 슬라이더는 "더 자세히"를 펼쳐야 나온다. 피로도는 별도 슬라이더 없이 선택한 이모지의 `fatigueValue`(Task 2 `MOODS`)에서 그대로 가져온다.

- [ ] **Step 1: `src/screens/ConditionInput.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey } from '../lib';
import { MOODS } from '../constants';
import { BackBar, Card, SliderField, TextArea, Button, Collapsible } from '../primitives';
import type { MoodId } from '../types';

export default function ConditionInputScreen({ onBack }: { onBack: () => void }) {
  const { state, actions } = useAppState();
  const date = todayKey();
  const existing = state.conditions[date];

  const [mood, setMood] = React.useState<MoodId | null>(existing?.mood ?? null);
  const [sleepHours, setSleepHours] = React.useState(existing?.sleepHours ?? 7);
  const [focus, setFocus] = React.useState(existing?.focus ?? 3);
  const [notes, setNotes] = React.useState(existing?.notes ?? '');

  const handleSubmit = () => {
    if (!mood) return;
    const fatigue = MOODS.find((m) => m.id === mood)!.fatigueValue;
    actions.saveCondition(date, { date, sleepHours, fatigue, focus, mood, notes });
    onBack();
  };

  return (
    <div className="pb-10">
      <BackBar title="컨디션 입력" onBack={onBack} />
      <div className="px-5 pt-2 space-y-5">
        <div>
          <h1 className="text-xl font-bold mb-1">오늘 컨디션 어때요?</h1>
          <p className="text-sm text-on-surface-variant">하나만 골라주세요</p>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {MOODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMood(m.id)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition ${mood === m.id ? 'border-primary bg-primary-container/20' : 'border-transparent bg-surface-container'}`}
            >
              <span className="text-2xl">{m.emoji}</span>
              <span className="text-[11px] font-medium text-on-surface-variant">{m.label}</span>
            </button>
          ))}
        </div>

        <Button className="w-full" onClick={handleSubmit} disabled={!mood}>
          완료
        </Button>

        <Collapsible label="더 자세히 적을래요">
          <Card>
            <SliderField
              label="수면 시간"
              value={sleepHours}
              min={0}
              max={12}
              step={0.5}
              onChange={setSleepHours}
              valueLabel={`${sleepHours}시간`}
              minLabel="0시간"
              maxLabel="12시간+"
            />
          </Card>
          <Card>
            <SliderField
              label="집중 잘 될 것 같은 정도"
              value={focus}
              min={1}
              max={5}
              step={1}
              onChange={setFocus}
              valueLabel={String(focus)}
              minLabel="낮음"
              maxLabel="높음"
            />
          </Card>
          <TextArea label="특이사항이 있나요?" value={notes} onChange={setNotes} placeholder="자유롭게 적어주세요." />
          <p className="text-xs text-on-surface-variant text-center">안 펼쳐도 그냥 저장돼요 — AI 조언 정확도만 조금 낮아질 뿐이에요.</p>
        </Collapsible>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/screens/ConditionInput.tsx
git commit -m "feat: add simplified emoji-first condition input screen"
```

---

### Task 16: 학습 기록 화면 (간소화)

**Files:**
- Create: `src/screens/StudyLog.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `todayKey` (Task 3), `DIFFICULTY_CHIPS`/`getSubject` (Task 2), `BackBar`/`Card`/`StarRating`/`ChipGroup`/`TextArea`/`TextField`/`Button`/`Collapsible` (Task 4)
- Produces: `StudyLogScreen` default export, props `{ plannerItem: PlannerItem; onBack: () => void }` — Task 18이 사용.

브레인스토밍 합의: 별점 + 막힌 부분 태그가 기본 화면에 바로 보이고, "자세히 적기"를 펼치면 막힌 부분 서술(교재·페이지·문제번호까지)과 오늘의 한 줄 메모가 나온다.

- [ ] **Step 1: `src/screens/StudyLog.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey } from '../lib';
import { DIFFICULTY_CHIPS, getSubject } from '../constants';
import { BackBar, Card, StarRating, ChipGroup, TextArea, TextField, Button, Collapsible } from '../primitives';
import type { PlannerItem } from '../types';

export default function StudyLogScreen({ plannerItem, onBack }: { plannerItem: PlannerItem; onBack: () => void }) {
  const { actions } = useAppState();
  const date = todayKey();

  const [rating, setRating] = React.useState(3);
  const [blockedTags, setBlockedTags] = React.useState<string[]>([]);
  const [detailNote, setDetailNote] = React.useState('');
  const [selfMessage, setSelfMessage] = React.useState('');

  const handleSubmit = () => {
    actions.addStudyLog(date, {
      date,
      plannerItemId: plannerItem.id,
      subjectId: plannerItem.subjectId,
      rating,
      blockedTags,
      detailNote,
      selfMessage,
    });
    onBack();
  };

  return (
    <div className="pb-10">
      <BackBar title={`학습 기록 · ${getSubject(plannerItem.subjectId).label}`} onBack={onBack} />
      <div className="px-5 pt-2 space-y-4">
        <Card className="space-y-4">
          <div>
            <p className="text-sm text-on-surface-variant mb-2">오늘 이해 잘 됐나요?</p>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div>
            <p className="text-sm text-on-surface-variant mb-2">막힌 부분 있었나요? (선택)</p>
            <ChipGroup options={DIFFICULTY_CHIPS.map((d) => ({ id: d, label: d }))} value={blockedTags} onChange={setBlockedTags} multi />
          </div>

          <Button className="w-full" onClick={handleSubmit}>
            저장하고 다음
          </Button>

          <Collapsible label="자세히 적기">
            <TextField label="어디가 막혔는지 (선택)" value={detailNote} onChange={setDetailNote} placeholder="예: 쎈 수학 87번, 이차함수 최댓값" />
            <TextArea label="오늘의 한 줄 메모 (선택)" value={selfMessage} onChange={setSelfMessage} rows={2} placeholder="예: 오늘은 집중이 잘 안 됐지만 끝까지 했다" />
          </Collapsible>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/screens/StudyLog.tsx
git commit -m "feat: add simplified study log screen"
```

---

### Task 17: 학습 자료 목표 화면 (신규)

**Files:**
- Create: `src/screens/StudyMaterials.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `todayKey`/`computeMaterialPace` (Task 3), `SUBJECTS`/`getSubject` (Task 2), `BackBar`/`Card`/`ChipGroup`/`TextField`/`Button`/`ProgressBar` (Task 4)
- Produces: `StudyMaterialsScreen` default export, props `{ onBack: () => void }` — Task 12(플래너 메인 상단 진입 버튼)와 Task 18이 사용.

- [ ] **Step 1: `src/screens/StudyMaterials.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, computeMaterialPace } from '../lib';
import { SUBJECTS, getSubject } from '../constants';
import { BackBar, Card, ChipGroup, TextField, Button, ProgressBar } from '../primitives';
import type { SubjectId } from '../types';

export default function StudyMaterialsScreen({ onBack }: { onBack: () => void }) {
  const { state, actions } = useAppState();
  const today = todayKey();

  const [showForm, setShowForm] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [materialName, setMaterialName] = React.useState('');
  const [totalScope, setTotalScope] = React.useState('');
  const [currentProgress, setCurrentProgress] = React.useState('0');
  const [targetPasses, setTargetPasses] = React.useState(1);
  const [targetDate, setTargetDate] = React.useState('');
  const [sessionIntervalDays, setSessionIntervalDays] = React.useState('3');

  const canSubmit = materialName.trim() && Number(totalScope) > 0 && targetDate && Number(sessionIntervalDays) > 0;

  const handleAdd = () => {
    if (!canSubmit) return;
    actions.addStudyMaterial({
      subjectId,
      materialName: materialName.trim(),
      totalScope: Number(totalScope),
      currentProgress: Number(currentProgress) || 0,
      targetPasses,
      targetDate,
      sessionIntervalDays: Number(sessionIntervalDays),
    });
    setMaterialName('');
    setTotalScope('');
    setCurrentProgress('0');
    setTargetPasses(1);
    setTargetDate('');
    setSessionIntervalDays('3');
    setShowForm(false);
  };

  const previewPace =
    canSubmit &&
    computeMaterialPace(
      {
        id: 'preview',
        subjectId,
        materialName,
        totalScope: Number(totalScope),
        currentProgress: Number(currentProgress) || 0,
        targetPasses,
        targetDate,
        sessionIntervalDays: Number(sessionIntervalDays),
        createdAt: '',
      },
      today
    );

  return (
    <div className="pb-10">
      <BackBar title="학습 자료 목표" onBack={onBack} />
      <div className="px-5 pt-2 space-y-4">
        {!showForm && (
          <Button className="w-full" onClick={() => setShowForm(true)} icon="add_circle">
            + 학습 자료 추가
          </Button>
        )}

        {showForm && (
          <Card className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-on-surface-variant mb-2">과목</p>
              <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
            </div>
            <TextField label="자료명" value={materialName} onChange={setMaterialName} placeholder="예: 개념원리" />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="전체 분량(p)" value={totalScope} onChange={setTotalScope} type="number" placeholder="220" />
              <TextField label="지금까지" value={currentProgress} onChange={setCurrentProgress} type="number" placeholder="0" />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface-variant mb-2">목표 회독 수</p>
              <ChipGroup
                options={[1, 2, 3].map((n) => ({ id: String(n), label: `${n}회독` }))}
                value={String(targetPasses)}
                onChange={(v) => setTargetPasses(Number(v))}
              />
            </div>
            <TextField label="이 자료, 언제까지 끝낼까요?" value={targetDate} onChange={setTargetDate} type="date" />
            <TextField label="며칠에 한 번 공부할까요?" value={sessionIntervalDays} onChange={setSessionIntervalDays} type="number" placeholder="3" />

            {previewPace && (
              <div className="rounded-xl bg-primary-container/20 px-3 py-2.5 text-sm text-primary">
                📐 D-{previewPace.remainingDays}, {sessionIntervalDays}일에 1번 → 총 {previewPace.remainingSessions}번 세션 남음
                <br />
                세션당 <b>{previewPace.scopePerSession}p</b>
              </div>
            )}

            <Button className="w-full" onClick={handleAdd} disabled={!canSubmit}>
              저장
            </Button>
          </Card>
        )}

        <h2 className="text-base font-bold">내 학습 자료</h2>
        <div className="space-y-2">
          {state.studyMaterials.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">아직 등록한 학습 자료가 없어요.</p>}
          {state.studyMaterials.map((material) => {
            const pace = computeMaterialPace(material, today);
            const donePercent = Math.round((material.currentProgress / (material.totalScope * material.targetPasses)) * 100);
            return (
              <Card key={material.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] bg-primary-container/40 text-primary rounded-full px-2.5 py-0.5">{getSubject(material.subjectId).label}</span>
                  <span className={`text-[11px] font-semibold ${pace.isOverdue ? 'text-error' : 'text-on-surface-variant'}`}>
                    {pace.isOverdue ? '기한이 지났어요' : `목표일 ${material.targetDate} · D-${pace.remainingDays}`}
                  </span>
                </div>
                <p className="text-sm font-bold text-on-surface my-1">{material.materialName}</p>
                <p className="text-xs text-on-surface-variant mb-2">
                  {material.totalScope * material.targetPasses}p 중 {material.currentProgress}p · {material.sessionIntervalDays}일에 1번
                </p>
                <ProgressBar percent={donePercent} className="mb-2" />
                {!pace.isOverdue && pace.remainingScope > 0 && (
                  <p className="text-xs text-primary font-semibold">→ 다음 세션({pace.remainingSessions}번 남음): {pace.scopePerSession}p씩</p>
                )}
                <button
                  onClick={() => actions.deleteStudyMaterial(material.id)}
                  className="mt-2 text-xs text-on-surface-variant underline"
                >
                  삭제
                </button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/screens/PlannerCreate.tsx`에 진입 버튼 연결**

Task 12에서 작성한 `PlannerCreateScreen`의 import 목록에 `import StudyMaterialsScreen from './StudyMaterials';` 를 추가하고, 컴포넌트 최상단에 `const [showMaterials, setShowMaterials] = React.useState(false);` 를 추가한다. `selectedItemId` 분기 바로 다음에 아래 분기를 추가한다:

```tsx
if (showMaterials) {
  return <StudyMaterialsScreen onBack={() => setShowMaterials(false)} />;
}
```

`<TopAppBar />` 바로 아래, `<h1>오늘의 학습</h1>` 바로 위에 진입 버튼을 추가한다:

```tsx
<button onClick={() => setShowMaterials(true)} className="flex items-center gap-1 text-xs font-semibold text-primary mb-2">
  <Icon name="target" className="!text-[16px]" /> 학습 자료 목표
</button>
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음(Task 12/13/17이 모두 갖춰진 상태에서 통과)

- [ ] **Step 4: Commit**

```bash
git add src/screens/StudyMaterials.tsx src/screens/PlannerCreate.tsx
git commit -m "feat: add study materials goal screen with pace preview"
```

---

### Task 18: 내일 추천 Edge Function + 화면

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/openai.ts`
- Create: `supabase/functions/_shared/authClient.ts`
- Create: `supabase/functions/tomorrow-recommendation/index.ts`
- Create: `src/screens/TomorrowRecommendation.tsx`

**Interfaces:**
- Consumes: `useAppState()` (Task 7), `todayKey`/`addDaysToKey`/`timeToMinutes`/`minutesToTime`/`getPlannerProgress`/`computeFreeGaps`/`getBestGap`/`sumFreeMinutes` (Task 3), `getSubject`/`SUBJECTS`/`STUDY_TYPES`/`DIFFICULTY_LEVELS` (Task 2), `BackBar`/`Card`/`Button`/`Icon` (Task 4)
- Produces: `TomorrowRecommendationScreen` default export, props `{ onBack: () => void; onApplied: () => void }` — Task 19이 사용. Edge Function `tomorrow-recommendation`은 study-planner의 `evening-recommendation`과 같은 `_shared` 유틸 패턴(요청자 JWT로 인증, Service Role Key 미사용, CORS 헤더 포함)을 따르되 study-buddy-web의 스키마/응답 형태에 맞춘 별도 함수다.

- [ ] **Step 1: `supabase/functions/_shared/cors.ts` 작성 (study-planner와 동일 패턴)**

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
```

- [ ] **Step 2: `supabase/functions/_shared/openai.ts` 작성**

```typescript
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

export async function callOpenAIJson(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`OpenAI returned no content (finish_reason: ${choice?.finish_reason ?? 'unknown'})`);
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('OpenAI response was not valid JSON');
  }
}
```

- [ ] **Step 3: `supabase/functions/_shared/authClient.ts` 작성**

```typescript
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export class AuthError extends Error {}

export interface AuthedRequest {
  supabase: SupabaseClient;
  userId: string;
}

export async function authenticateRequest(req: Request): Promise<AuthedRequest> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new AuthError('Missing Authorization header');
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const jwt = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    throw new AuthError('Invalid or expired session');
  }
  return { supabase, userId: data.user.id };
}
```

- [ ] **Step 4: `supabase/functions/tomorrow-recommendation/index.ts` 작성**

요청 바디는 클라이언트가 이미 계산한 요약치를 담는다(무거운 집계는 순수 함수로 클라이언트에서, Edge Function은 "어떤 항목을 왜 추천할지"만 LLM에 맡긴다).

```typescript
import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { callOpenAIJson } from '../_shared/openai.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface RequestBody {
  completion_rate: number;
  incomplete_items: { subject_label: string; material: string; unit: string; page_range: string }[];
  most_postponed_subject_label: string | null;
  fatigue_high: boolean;
  tomorrow_free_gaps: { start: string; end: string; minutes: number }[];
  main_subject_labels: string[];
}

interface RecommendationItem {
  subject_label: string;
  study_type: 'concept' | 'practice' | 'memorize' | 'review';
  material: string;
  unit: string;
  page_range: string;
  difficulty: 'easy' | 'medium' | 'hard';
  must_do: boolean;
  start_time: string;
  end_time: string;
  estimated_minutes: number;
  reason: string;
}

interface RecommendationResult {
  reasons: string[];
  items: RecommendationItem[];
}

function isRecommendationResult(value: unknown): value is RecommendationResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.reasons) || !Array.isArray(v.items)) return false;
  return v.items.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const i = item as Record<string, unknown>;
    return typeof i.subject_label === 'string' && typeof i.study_type === 'string' && typeof i.start_time === 'string' && typeof i.end_time === 'string';
  });
}

const SYSTEM_PROMPT = `당신은 중고등학생의 학습 코치입니다. 오늘 학습 실행 데이터를 참고해서 내일 학습 계획 초안(최대 4개 항목)을 만듭니다.
훈계하거나 평가하는 톤이 아니라, 옆에서 같이 고민해주는 따뜻한 톤으로 작성하세요.
- 오늘 미완료 항목이 있으면 우선 배치하세요.
- 자주 미루는 과목이 있으면 그 과목을 우선 배치하고 이유를 reasons에 남기세요.
- 오늘 피로도가 높았다면(fatigue_high=true) 난이도를 medium 이하로 제안하세요.
- 항목의 start_time/end_time은 반드시 tomorrow_free_gaps 안에 들어오게 배치하세요.
- 추천할 데이터가 부족하면 main_subject_labels 중 하나를 가볍게(easy, concept) 제안하세요.
반드시 다음 형식의 JSON으로만 답하세요:
{"reasons": ["..."], "items": [{"subject_label": "...", "study_type": "concept|practice|memorize|review", "material": "...", "unit": "...", "page_range": "...", "difficulty": "easy|medium|hard", "must_do": true|false, "start_time": "HH:MM", "end_time": "HH:MM", "estimated_minutes": 0, "reason": "..."}]}`;

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    await authenticateRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), { status: 401, headers: corsHeaders });
    }
    throw err;
  }

  try {
    const body: RequestBody = await req.json();
    const userPrompt = `[오늘 완료율] ${body.completion_rate}%
[오늘 미완료 항목] ${JSON.stringify(body.incomplete_items)}
[자주 미루는 과목] ${body.most_postponed_subject_label ?? '데이터 부족'}
[오늘 피로도 높음] ${body.fatigue_high}
[내일 빈 시간대] ${JSON.stringify(body.tomorrow_free_gaps)}
[주요 과목] ${body.main_subject_labels.join(', ')}`;

    const raw = await callOpenAIJson(SYSTEM_PROMPT, userPrompt);
    if (!isRecommendationResult(raw)) {
      throw new Error('OpenAI response did not match the expected recommendation shape');
    }

    return new Response(JSON.stringify(raw), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
```

- [ ] **Step 5: 사용자가 Edge Function 배포 + 환경변수 설정**

```bash
npx supabase functions deploy tomorrow-recommendation
```

study-planner에서 이미 설정한 `OPENAI_API_KEY`(및 선택적으로 `OPENAI_MODEL`) Supabase 프로젝트 시크릿을 그대로 공유하므로 별도 설정이 필요 없다(같은 프로젝트).

- [ ] **Step 6: `src/screens/TomorrowRecommendation.tsx` 작성**

```tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { supabase } from '../lib/supabase';
import { todayKey, addDaysToKey, timeToMinutes, minutesToTime, getPlannerProgress, computeFreeGaps, getBestGap, sumFreeMinutes, formatMinutes } from '../lib';
import { getSubject, SUBJECTS, STUDY_TYPES, DIFFICULTY_LEVELS } from '../constants';
import { BackBar, Card, Button, Icon } from '../primitives';
import type { TomorrowRecommendation, TomorrowRecommendationItem, StudyTypeId, DifficultyId } from '../types';

function subjectIdFromLabel(label: string) {
  return SUBJECTS.find((s) => s.label === label)?.id ?? SUBJECTS[0].id;
}

export default function TomorrowRecommendationScreen({ onBack, onApplied }: { onBack: () => void; onApplied: () => void }) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const tomorrow = addDaysToKey(today, 1);

  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [recommendation, setRecommendation] = React.useState<TomorrowRecommendation | null>(null);
  const [applied, setApplied] = React.useState(false);

  React.useEffect(() => {
    const fetchRecommendation = async () => {
      const todayItems = state.plannerItems[today] ?? [];
      const progress = getPlannerProgress(todayItems);
      const incomplete = todayItems.filter((i) => i.status === 'partial' || i.status === 'carried_over');

      const recentDates = [1, 2, 3, 4, 5, 6, 7].map((n) => addDaysToKey(today, -n));
      const recentIncomplete = recentDates.flatMap((d) => (state.plannerItems[d] ?? []).filter((i) => i.status === 'partial' || i.status === 'carried_over'));
      const tally: Record<string, number> = {};
      for (const i of [...incomplete, ...recentIncomplete]) tally[i.subjectId] = (tally[i.subjectId] ?? 0) + 1;
      const mostPostponed = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const windowTally: Record<number, number> = {};
      for (const i of incomplete) {
        const bucket = Math.floor(timeToMinutes(i.startTime) / 120) * 120;
        windowTally[bucket] = (windowTally[bucket] ?? 0) + 1;
      }
      const topWindow = Object.entries(windowTally).sort((a, b) => b[1] - a[1])[0];
      const lowFocusWindow = topWindow ? `${minutesToTime(Number(topWindow[0]))}~${minutesToTime(Number(topWindow[0]) + 120)}` : null;

      const tomorrowBlocks = state.scheduleBlocks[tomorrow] ?? [];
      const gaps = computeFreeGaps(tomorrowBlocks);
      const availableMinutesTomorrow = sumFreeMinutes(gaps);
      const condition = state.conditions[today] ?? null;

      try {
        const { data, error } = await supabase.functions.invoke('tomorrow-recommendation', {
          body: {
            completion_rate: progress.percent,
            incomplete_items: incomplete.map((i) => ({ subject_label: getSubject(i.subjectId).label, material: i.material, unit: i.unit, page_range: i.pageRange })),
            most_postponed_subject_label: mostPostponed ? getSubject(mostPostponed as any).label : null,
            fatigue_high: (condition?.fatigue ?? 0) >= 4,
            tomorrow_free_gaps: gaps,
            main_subject_labels: (state.profile?.mainSubjects ?? []).map((s) => getSubject(s).label),
          },
        });

        if (error || !data || data.error) {
          throw new Error(data?.error ?? error?.message ?? 'unknown error');
        }

        const items: TomorrowRecommendationItem[] = (data.items as any[]).map((it) => ({
          subjectId: subjectIdFromLabel(it.subject_label),
          studyType: it.study_type as StudyTypeId,
          material: it.material,
          unit: it.unit,
          pageRange: it.page_range,
          difficulty: it.difficulty as DifficultyId,
          mustDo: it.must_do,
          startTime: it.start_time,
          endTime: it.end_time,
          estimatedMinutes: it.estimated_minutes,
          reason: it.reason,
        }));

        setRecommendation({
          completionRate: progress.percent,
          incompleteCount: incomplete.length,
          lowFocusWindow,
          availableMinutesTomorrow,
          reasons: data.reasons as string[],
          items,
        });
      } catch (err) {
        // AI 추천 실패해도 화면이 깨지지 않고 안내만 보여준다 — study-planner EveningPlanScreen과 동일한 폴백 원칙.
        setErrorMessage('AI 추천을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendation();
  }, []);

  const handleApply = () => {
    if (!recommendation) return;
    actions.applyTomorrowRecommendation(tomorrow, recommendation.items);
    setApplied(true);
    setTimeout(onApplied, 900);
  };

  return (
    <div className="pb-10">
      <BackBar title="AI 내일 플래너 추천" onBack={onBack} />
      <div className="px-5 pt-2">
        {loading && <p className="text-sm text-on-surface-variant text-center py-10">추천을 준비하고 있어요...</p>}

        {!loading && errorMessage && (
          <Card className="text-center py-6">
            <p className="text-sm text-on-surface-variant">{errorMessage}</p>
          </Card>
        )}

        {!loading && recommendation && (
          <>
            <div className="rounded-3xl bg-gradient-to-br from-tertiary-container/40 to-primary-container/30 p-5 mb-5">
              <span className="inline-block text-xs font-bold bg-white/60 rounded-full px-3 py-1 mb-2">AI 버디의 제안</span>
              <h1 className="text-xl font-extrabold mb-4">내일 학습 추천 초안</h1>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">오늘 완료율</p>
                  <p className="text-lg font-bold">{recommendation.completionRate}%</p>
                </div>
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">미완료 항목</p>
                  <p className="text-lg font-bold">{recommendation.incompleteCount}개</p>
                </div>
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">집중 낮은 시간</p>
                  <p className="text-lg font-bold">{recommendation.lowFocusWindow ?? '-'}</p>
                </div>
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">내일 공부 가능</p>
                  <p className="text-lg font-bold">{formatMinutes(recommendation.availableMinutesTomorrow)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 mb-1">
                <Icon name="info" className="!text-[18px] text-primary mt-0.5" />
                <span className="text-sm font-bold">추천 근거 & 조정 포인트</span>
              </div>
              <ul className="list-disc list-inside text-sm text-on-surface-variant space-y-1">
                {recommendation.reasons.length ? recommendation.reasons.map((r, i) => <li key={i}>{r}</li>) : <li>오늘 계획을 잘 지켰어요. 내일도 비슷한 흐름으로 진행해요.</li>}
              </ul>
            </div>

            <h2 className="text-base font-bold mb-3">내일의 추천 학습 순서 (총 {recommendation.items.length}개)</h2>
            <div className="space-y-3 mb-6">
              {recommendation.items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">추천할 항목이 아직 없어요. 오늘 플래너를 먼저 작성해보세요.</p>}
              {recommendation.items.map((it, idx) => (
                <Card key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-primary">{idx === 0 ? '가장 먼저 추천' : `학습 순서 ${idx + 1}`}</span>
                    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-surface-container">{DIFFICULTY_LEVELS.find((d) => d.id === it.difficulty)?.label}</span>
                  </div>
                  <p className="text-sm font-bold">
                    {getSubject(it.subjectId).label} <span className="text-on-surface-variant font-normal">[{STUDY_TYPES.find((t) => t.id === it.studyType)?.label}]</span>
                  </p>
                  {(it.material || it.unit || it.pageRange) && (
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {it.material} {it.unit} {it.pageRange}
                    </p>
                  )}
                  <p className="text-xs italic text-tertiary mt-2 bg-tertiary-container/20 rounded-lg px-2 py-1.5">💡 {it.reason}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <Icon name="alarm" className="!text-[16px]" /> {it.startTime} - {it.endTime}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="timer" className="!text-[16px]" /> {it.estimatedMinutes}분 예상
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            {recommendation.items.length > 0 && (
              <>
                <p className="text-xs text-on-surface-variant text-center mb-3">적용하면 내일 플래너에 {recommendation.items.length}개 항목이 추가돼요.</p>
                <Button className="w-full" onClick={handleApply} disabled={applied}>
                  {applied ? '완료! ✓' : '내일 플래너로 적용'}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 8: Commit**

```bash
git add supabase/functions src/screens/TomorrowRecommendation.tsx
git commit -m "feat: add tomorrow-recommendation edge function and screen"
```

---

### Task 19: App 조립 (인증/온보딩 게이트 + 탭/오버레이 셸) + 전체 QA

**Files:**
- Modify: `src/App.tsx` (Task 1의 스텁을 실제 구현으로 교체)

**Interfaces:**
- Consumes: 이 계획의 모든 이전 태스크(`AuthProvider`/`useAuth`, `AppStateProvider`/`useAppState`, 8개 화면 전부, `BottomNav`/`TabId`)
- Produces: 없음(최상위 컴포넌트, `main.tsx`가 사용).

- [ ] **Step 1: `src/App.tsx` 작성**

```tsx
import React from 'react';
import { AuthProvider, useAuth } from './state/AuthContext';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { BottomNav } from './primitives';
import type { TabId } from './primitives';
import AuthScreen from './screens/AuthScreen';
import OnboardingScreen from './screens/Onboarding';
import HomeScreen from './screens/Home';
import CalendarScreen from './screens/Calendar';
import PlannerCreateScreen from './screens/PlannerCreate';
import ExecutionCheckScreen from './screens/ExecutionCheck';
import ConditionInputScreen from './screens/ConditionInput';
import StudyLogScreen from './screens/StudyLog';
import TomorrowRecommendationScreen from './screens/TomorrowRecommendation';
import type { PlannerItem } from './types';

type Overlay = 'condition' | 'studyLog' | 'aiRecommendation' | null;

function AppShell() {
  const { state } = useAppState();
  const [activeTab, setActiveTab] = React.useState<TabId>('home');
  const [overlay, setOverlay] = React.useState<Overlay>(null);
  const [studyLogItem, setStudyLogItem] = React.useState<PlannerItem | null>(null);

  if (state.loading) {
    return (
      <div id="app-shell" className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-on-surface-variant">불러오는 중...</p>
      </div>
    );
  }

  if (!state.profile) {
    return (
      <div id="app-shell">
        <OnboardingScreen onComplete={() => setActiveTab('home')} />
      </div>
    );
  }

  const openStudyLog = (item: PlannerItem) => {
    setStudyLogItem(item);
    setOverlay('studyLog');
  };
  const closeOverlay = () => setOverlay(null);

  let overlayScreen: React.ReactNode = null;
  if (overlay === 'condition') {
    overlayScreen = <ConditionInputScreen onBack={closeOverlay} />;
  } else if (overlay === 'studyLog' && studyLogItem) {
    overlayScreen = <StudyLogScreen plannerItem={studyLogItem} onBack={closeOverlay} />;
  } else if (overlay === 'aiRecommendation') {
    overlayScreen = (
      <TomorrowRecommendationScreen
        onBack={closeOverlay}
        onApplied={() => {
          closeOverlay();
          setActiveTab('home');
        }}
      />
    );
  }

  return (
    <div id="app-shell">
      {overlayScreen ?? (
        <>
          {activeTab === 'home' && <HomeScreen onNavigate={setActiveTab} onOpenOverlay={setOverlay} />}
          {activeTab === 'calendar' && <CalendarScreen onNavigate={setActiveTab} />}
          {activeTab === 'planner' && <PlannerCreateScreen />}
          {activeTab === 'check' && <ExecutionCheckScreen onOpenStudyLog={openStudyLog} onOpenAiRecommendation={() => setOverlay('aiRecommendation')} />}
          {activeTab === 'ai' && <TomorrowRecommendationScreen onBack={() => setActiveTab('home')} onApplied={() => setActiveTab('home')} />}
          <BottomNav active={activeTab} onChange={setActiveTab} />
        </>
      )}
    </div>
  );
}

function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-on-surface-variant">불러오는 중...</p>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음

- [ ] **Step 3: 개발 서버 기동**

Run: `npm run dev`
Expected: `http://localhost:5173`에서 앱이 뜨고, 로그인 화면이 보임(에러 없음). 이후 QA는 Browser 프리뷰로 진행한다(`.claude/launch.json`에 `study-buddy-web` 설정이 없다면 아래 내용으로 새로 추가):

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "study-buddy-web", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 4: 수동 QA — 전체 흐름**

1. 회원가입 → 온보딩(학년/과목/목표/시험일정/문제집) 제출 → 탭 셸(홈/캘린더/플래너/체크/AI 분석) 진입 확인.
2. 홈에서 "컨디션 입력하기" → 이모지 탭 한 번으로 저장 → 홈 화면에 반영 확인.
3. 캘린더에서 오늘 일정 2~3개 추가 → "공부 가능 시간 요약"이 갱신되는지 확인.
4. 플래너에서 "+ 과목 추가" → 과목 + 빠른 시간 칩만으로 항목 추가 → 목록에 카드로 나타나는지 확인.
5. 방금 추가한 카드를 탭해 상세 페이지 진입 → 교재/단원/페이지/난이도/휴식패턴/필수여부 입력 후 저장 → 목록에 반영 확인.
6. 같은 시간대에 항목을 하나 더 만들어 상세 페이지에서 시간 충돌 경고와 "자동 조정하기"가 동작하는지 확인.
7. 플래너 상단 "학습 자료 목표" → 자료 추가(목표일, 며칠에 한 번) → 세션당 분량 미리보기가 뜨는지, 저장 후 목록에 진행률 바와 함께 나오는지 확인. 홈 화면에 "오늘의 시험 대비 목표" 카드가 뜨는지 확인.
8. 체크 탭에서 항목 상태를 완료로 바꾸고 "학습 기록 작성하기" → 별점 + 막힌 부분 태그 화면이 바로 보이는지, "자세히 적기"를 펼쳐야 서술/메모가 나오는지 확인.
9. "AI 내일 플래너 보기" → 로딩 후 추천 카드가 뜨는지(Edge Function 배포 완료 후), 실패 시 에러 문구로 안전하게 폴백하는지 확인. "내일 플래너로 적용" 클릭.
10. URL에 `?date=` 파라미터로 내일 날짜를 지정해 재접속 → 적용된 항목이 플래너에 보이는지 확인.
11. 브라우저 새로고침 → 모든 데이터가 Supabase에서 다시 로드되어 유지되는지 확인(로그인 상태 포함).
12. 반응형: 브라우저 폭을 375px로 좁혀 모든 화면이 480px 컨테이너 안에서 깨지지 않는지 확인.

- [ ] **Step 5: 전체 유닛 테스트 재확인**

Run: `npx vitest run`
Expected: 모든 테스트 PASS (`lib.test.ts`, `ai.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx .claude/launch.json
git commit -m "feat: assemble app shell with auth/onboarding gates and tab navigation"
```

---

## 완료 후 전체 검증

1. `npx tsc -b` — 전체 타입 에러 없음
2. `npx vitest run` — 전체 테스트 통과
3. Browser 프리뷰에서 신규 계정 회원가입 → 온보딩 → 홈/캘린더/플래너(메인+상세)/체크/컨디션입력/학습기록/학습자료목표/AI 내일 추천까지 전체 시나리오 수동 확인(Task 19 Step 4)
4. Supabase 테이블 에디터에서 `sb_planner_items`, `sb_study_materials` 등에 실제 데이터가 쌓이는지 확인
5. `tomorrow-recommendation` Edge Function이 정상 응답하거나(데이터 충분 시), 실패 시 화면이 깨지지 않고 안전하게 폴백하는지(Task 18 Step 6의 catch 분기) 확인
6. 최종 리뷰 후 `master`에 머지(이 저장소는 이번 계획으로 처음 커밋되므로 `master`가 곧 메인 브랜치)
