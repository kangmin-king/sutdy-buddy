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
