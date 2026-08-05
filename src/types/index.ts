export type DateKey = string; // "YYYY-MM-DD"

export type Grade = '중1' | '중2' | '중3' | '고1' | '고2' | '고3';
export type SubjectId = 'korean' | 'math' | 'english' | 'science' | 'social';
export type MoodId = 'happy' | 'tired' | 'neutral' | 'stressed' | 'excited';
export type StudyTypeId = 'concept' | 'practice' | 'memorize' | 'review';
export type DifficultyId = 'easy' | 'medium' | 'hard';
export type ReviewNeedId = 'must' | 'light' | 'done';
export type PlannerItemStatus = 'planned' | 'completed' | 'partial' | 'carried_over';
export type RestPatternId = 'pomodoro_25_5' | 'block_50_10' | 'none';
export type Role = 'student' | 'manager';

export interface Profile {
  grade: Grade | null;
  mainSubjects: SubjectId[] | null;
  goal: string | null;
  examDate: string | null;
  workbooks: string | null;
  onboardedAt: string;
  role: Role;
  inviteCode: string | null;
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
  source: 'homework' | 'self';
  homeworkAssignmentId: string | null;
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

export interface HomeworkAssignment {
  id: string;
  studentId: string;
  createdBy: string;
  subjectId: SubjectId;
  material: string;
  amountPerDay: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  updatedAt: string;
}

export interface StudySession {
  id: string;
  plannerItemId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  deviated: boolean;
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
  reasons: string[];
  items: TomorrowRecommendationItem[];
}
