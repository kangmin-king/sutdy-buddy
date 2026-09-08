import type { SubjectId, Grade } from './types';

// 색상 선택기(오늘 타임라인 점 클릭)에서 고를 수 있는 기본 12색. 과목 기본색도 전부 이 팔레트
// 안에서 고른다 — 커스텀 색과 같은 톤으로 섞여도 어색하지 않게.
export const SUBJECT_COLOR_PALETTE: string[] = [
  '#ef4444', // 빨강
  '#f97316', // 주황
  '#f59e0b', // 호박
  '#eab308', // 노랑
  '#84cc16', // 라임
  '#22c55e', // 초록
  '#14b8a6', // 청록
  '#06b6d4', // 하늘
  '#3b82f6', // 파랑
  '#6366f1', // 남색
  '#a855f7', // 보라
  '#ec4899', // 분홍
];

// color는 타임라인(오늘 타임라인/캘린더 시간대 그리드)에서 과목별로 구분되는 기본 색(hex)이다
// (ChecklistTimeline/TimelineColumn) — 과목마다 겹치지 않게 6개 전부 다른 값을 준다. 학생이
// 직접 고른 색(Profile.subjectColors)이 있으면 resolveSubjectColor에서 이 기본값을 덮어쓴다.
export const SUBJECTS: { id: SubjectId; label: string; color: string }[] = [
  { id: 'korean', label: '국어', color: '#a855f7' },
  { id: 'math', label: '수학', color: '#3b82f6' },
  { id: 'english', label: '영어', color: '#ec4899' },
  { id: 'science', label: '과학', color: '#22c55e' },
  { id: 'social', label: '사회', color: '#f97316' },
  { id: 'etc', label: '기타', color: '#6366f1' },
];

export function getSubject(id: SubjectId) {
  return SUBJECTS.find((s) => s.id === id) ?? { id, label: id, color: '#3b82f6' };
}

// 학생이 직접 고른 색이 있으면 그걸, 없으면 과목 기본색을 쓴다.
export function resolveSubjectColor(id: SubjectId, customColors?: Record<string, string>): string {
  return customColors?.[id] ?? getSubject(id).color;
}

export const GRADES: Grade[] = ['중1', '중2', '중3', '고1', '고2', '고3'];

// 숙제 미시작 알림의 기본 시각. 정의는 알림 함수와 공유하는 파일 하나에만 있다 —
// 여기서는 앱 코드가 늘 쓰는 import 경로(constants)로 다시 내보내기만 한다.
export { DEFAULT_HOMEWORK_REMIND_AT } from '../supabase/functions/_shared/homeworkReminder';

// 탭 하나가 질문 하나만 담당한다 — 홈은 "오늘 뭐 하지", 캘린더는 "언제 뭐 있지", 나는 "내 정보".
// 예전에는 플래너 탭이 따로 있었는데, 오늘 할 일을 홈·플래너·캘린더가 서로 다른 부분집합으로
// 보여줘서(플래너는 source==='self'만) 학생이 오늘 할 일을 보려면 세 곳을 다 봐야 했다.
// 오늘 것은 홈 하나로 합치고, 날짜별 타임라인·시험 일정은 캘린더로 옮겼다.
// 홈이 가운데인 건 선생님 탭(MANAGER_TABS)과 같은 배치를 쓰기 위함이다.
// 딴짓 멈춰는 초기 설정 이후로는 대부분 네이티브 알림(상단바 내려서)으로 여닫아서 하단 탭 대신
// 오른쪽 아래 떠 있는 원형 버튼에 있고, "나" 탭에도 진입점을 둔다.
export const STUDENT_NAV_TABS = [
  { id: 'calendar', label: '캘린더', icon: 'calendar_today' },
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'me', label: '나', icon: 'person' },
] as const;
