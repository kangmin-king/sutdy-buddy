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

// 딴짓 멈춰는 초기 설정 이후로는 대부분 네이티브 알림(상단바 내려서)으로 여닫아서, 하단 탭 대신
// 오른쪽 아래 떠 있는 원형 버튼으로 옮겼다(App.tsx의 StudentAppShell).
// "캘린더"는 선생님 캘린더 탭과 같은 월간 그리드(과외 요일/시험일 표시). 오늘 시간대별 타임라인은
// 별도 탭 없이 스터디플래너 탭 하단에 붙어 있다(StudentPlanner.tsx).
export const STUDENT_NAV_TABS = [
  { id: 'calendar', label: '캘린더', icon: 'calendar_today' },
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'planner', label: '스터디플래너', icon: 'edit_note' },
] as const;
