import type { Grade, SubjectId, StudyTypeId, DifficultyId, RestPatternId, MoodId, PlannerItemStatus, Role } from './index';

// 아래 Row 타입들은 반드시 `type`(object literal type)으로 선언한다. `interface`로 선언하면
// TypeScript가 암묵적 문자열 인덱스 시그니처를 추론하지 않아 `Record<string, unknown>`에
// 대입 불가능해지고, @supabase/supabase-js의 GenericSchema/GenericTable 제약(Row/Insert/Update가
// Record<string, unknown>를 만족해야 함)을 통과하지 못해 모든 쿼리의 타입이 `never`로 붕괴한다.
export type SbProfileRow = {
  id: string;
  grade: Grade | null;
  main_subjects: SubjectId[] | null;
  goal: string | null;
  exam_date: string | null;
  workbooks: string | null;
  onboarded_at: string;
  role: Role;
  invite_code: string | null;
  subject_colors: Record<string, string> | null;
};

export type SbDailyConditionRow = {
  id: string;
  user_id: string;
  date: string;
  sleep_hours: number;
  fatigue: number;
  focus: number;
  mood: MoodId;
  notes: string;
};

export type SbScheduleBlockRow = {
  id: string;
  user_id: string;
  date: string;
  type: string;
  label: string;
  start_time: string;
  end_time: string;
};

export type SbPlannerItemRow = {
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
  source: 'homework' | 'self';
  homework_assignment_id: string | null;
  exam_subject_range_id: string | null;
};

export type SbStudyLogRow = {
  id: string;
  user_id: string;
  date: string;
  planner_item_id: string;
  subject_id: SubjectId;
  rating: number;
  blocked_tags: string[];
  detail_note: string;
  self_message: string;
};

export type SbStudyMaterialRow = {
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
};

export type SbHomeworkAssignmentRow = {
  id: string;
  student_id: string;
  created_by: string;
  subject_id: SubjectId;
  material: string;
  amount_per_day: string;
  start_date: string;
  end_date: string;
  updated_at: string;
};

export type SbStudySessionRow = {
  id: string;
  user_id: string;
  planner_item_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  deviated: boolean;
};

export type SbStudentManagerLinkRow = {
  id: string;
  student_id: string;
  manager_id: string;
  linked_at: string;
  label: string | null;
  student_label: string | null;
};

export type SbExamRecordRow = {
  id: string;
  student_id: string;
  created_by: string;
  title: string;
  exam_date: string;
  is_main: boolean;
  created_at: string;
};

export type SbExamSubjectRow = {
  id: string;
  exam_id: string;
  subject_id: SubjectId;
  target_grade: string;
  target_score: string;
  target_rank: string;
  created_at: string;
};

export type SbExamSubjectRangeRow = {
  id: string;
  exam_subject_id: string;
  material: string;
  range_label: string;
  assigned_dates: string[];
  created_at: string;
};

export type SbTutoringScheduleRow = {
  id: string;
  student_id: string;
  manager_id: string;
  weekdays: number[];
  updated_at: string;
};

export type SbTutoringScheduleExceptionRow = {
  id: string;
  student_id: string;
  manager_id: string;
  original_date: string;
  new_date: string | null;
  note: string;
  created_at: string;
};

export type SbDeviceTokenRow = {
  id: string;
  user_id: string;
  fcm_token: string;
  platform: 'android';
  created_at: string;
  updated_at: string;
};

export type SbBannerRow = {
  id: string;
  title: string;
  image_url: string | null;
  link_url: string | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      // schedule_blocks/planner_items/study_logs/study_materials는 낙관적 로컬 업데이트를 위해
      // 클라이언트가 uid()로 UUID를 미리 만들어 그대로 insert하므로 Insert 타입에 id를 포함한다.
      // daily_conditions만 DB의 gen_random_uuid() 기본값에 맡기고(upsert 대상 식별은 user_id+date 유니크 제약을 쓴다), id를 생략한다.
      sb_profiles: { Row: SbProfileRow; Insert: SbProfileRow; Update: Partial<SbProfileRow>; Relationships: [] };
      sb_daily_conditions: {
        Row: SbDailyConditionRow;
        Insert: Omit<SbDailyConditionRow, 'id'>;
        Update: Partial<SbDailyConditionRow>;
        Relationships: [];
      };
      sb_schedule_blocks: { Row: SbScheduleBlockRow; Insert: SbScheduleBlockRow; Update: Partial<SbScheduleBlockRow>; Relationships: [] };
      sb_planner_items: { Row: SbPlannerItemRow; Insert: SbPlannerItemRow; Update: Partial<SbPlannerItemRow>; Relationships: [] };
      sb_study_logs: { Row: SbStudyLogRow; Insert: SbStudyLogRow; Update: Partial<SbStudyLogRow>; Relationships: [] };
      sb_study_materials: {
        Row: SbStudyMaterialRow;
        Insert: Omit<SbStudyMaterialRow, 'created_at'>;
        Update: Partial<SbStudyMaterialRow>;
        Relationships: [];
      };
      sb_homework_assignments: { Row: SbHomeworkAssignmentRow; Insert: Omit<SbHomeworkAssignmentRow, 'updated_at'>; Update: Partial<SbHomeworkAssignmentRow>; Relationships: [] };
      sb_study_sessions: { Row: SbStudySessionRow; Insert: SbStudySessionRow; Update: Partial<SbStudySessionRow>; Relationships: [] };
      sb_student_manager_links: { Row: SbStudentManagerLinkRow; Insert: Omit<SbStudentManagerLinkRow, 'id' | 'linked_at' | 'label' | 'student_label'>; Update: Partial<Pick<SbStudentManagerLinkRow, 'label' | 'student_label'>>; Relationships: [] };
      sb_exam_records: { Row: SbExamRecordRow; Insert: Omit<SbExamRecordRow, 'created_at'>; Update: Partial<SbExamRecordRow>; Relationships: [] };
      sb_exam_subjects: { Row: SbExamSubjectRow; Insert: Omit<SbExamSubjectRow, 'created_at'>; Update: Partial<SbExamSubjectRow>; Relationships: [] };
      sb_exam_subject_ranges: { Row: SbExamSubjectRangeRow; Insert: Omit<SbExamSubjectRangeRow, 'created_at'>; Update: Partial<SbExamSubjectRangeRow>; Relationships: [] };
      sb_tutoring_schedules: { Row: SbTutoringScheduleRow; Insert: Omit<SbTutoringScheduleRow, 'id' | 'updated_at'>; Update: Partial<SbTutoringScheduleRow>; Relationships: [] };
      sb_tutoring_schedule_exceptions: { Row: SbTutoringScheduleExceptionRow; Insert: Omit<SbTutoringScheduleExceptionRow, 'id' | 'created_at'>; Update: Partial<SbTutoringScheduleExceptionRow>; Relationships: [] };
      sb_device_tokens: { Row: SbDeviceTokenRow; Insert: Omit<SbDeviceTokenRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<SbDeviceTokenRow>; Relationships: [] };
      sb_banners: { Row: SbBannerRow; Insert: Omit<SbBannerRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<SbBannerRow>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      // 초대코드로 학생 id를 찾는 security definer 함수 (0006 마이그레이션).
      // 관리자는 연결 전이라 학생 프로필 행을 RLS로 읽을 수 없으므로 직접 select 대신 이 RPC를 쓴다.
      find_student_by_invite_code: {
        Args: { code: string };
        Returns: string | null;
      };
    };
  };
}
