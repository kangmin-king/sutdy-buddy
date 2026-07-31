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
