import type {
  SubjectId,
  StudyTypeId,
  DifficultyId,
  MoodId,
  ReviewNeedId,
  Grade,
  RestPatternId,
} from './types';

// color는 타임라인(오늘 타임라인/캘린더 시간대 그리드)에서 과목별로 구분되는 색으로만 쓰인다
// (ChecklistTimeline/TimelineColumn) — 과목마다 겹치지 않게 6개 전부 다른 값을 준다.
export const SUBJECTS: { id: SubjectId; label: string; color: string }[] = [
  { id: 'korean', label: '국어', color: 'tertiary' },
  { id: 'math', label: '수학', color: 'primary' },
  { id: 'english', label: '영어', color: 'rose' },
  { id: 'science', label: '과학', color: 'secondary' },
  { id: 'social', label: '사회', color: 'amber' },
  { id: 'etc', label: '기타', color: 'slate' },
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
  { id: 'calendar', label: '캘린더', icon: 'calendar_today' },
  { id: 'planner', label: '플래너', icon: 'edit_note' },
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'check', label: '체크', icon: 'task_alt' },
  { id: 'distractionStop', label: '딴짓 멈춰', icon: 'phonelink_lock' },
] as const;

// 딴짓 멈춰는 초기 설정 이후로는 대부분 네이티브 알림(상단바 내려서)으로 여닫아서, 하단 탭 대신
// 오른쪽 아래 떠 있는 원형 버튼으로 옮겼다(App.tsx의 StudentAppShell).
// "캘린더"는 선생님 캘린더 탭과 같은 월간 그리드(과외 요일/시험일 표시). 오늘 시간대별 타임라인은
// 별도 탭 없이 스터디플래너 탭 하단에 붙어 있다(StudentPlanner.tsx).
export const STUDENT_NAV_TABS = [
  { id: 'calendar', label: '캘린더', icon: 'calendar_today' },
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'planner', label: '스터디플래너', icon: 'edit_note' },
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
