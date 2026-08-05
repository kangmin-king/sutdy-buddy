import type {
  Profile,
  DailyCondition,
  ScheduleBlock,
  PlannerItem,
  StudyLogEntry,
  StudyMaterial,
  HomeworkAssignment,
  StudySession,
  ExamRecord,
  ExamSubject,
  ExamSubjectRange,
  TutoringSchedule,
  TutoringScheduleException,
} from '../types';
import type {
  SbProfileRow,
  SbDailyConditionRow,
  SbScheduleBlockRow,
  SbPlannerItemRow,
  SbStudyLogRow,
  SbStudyMaterialRow,
  SbHomeworkAssignmentRow,
  SbStudySessionRow,
  SbExamRecordRow,
  SbExamSubjectRow,
  SbExamSubjectRangeRow,
  SbTutoringScheduleRow,
  SbTutoringScheduleExceptionRow,
} from '../types/db';

export function profileFromRow(row: SbProfileRow): Profile {
  return {
    id: row.id,
    grade: row.grade,
    mainSubjects: row.main_subjects,
    goal: row.goal,
    examDate: row.exam_date,
    workbooks: row.workbooks,
    onboardedAt: row.onboarded_at,
    role: row.role,
    inviteCode: row.invite_code,
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
    source: row.source,
    homeworkAssignmentId: row.homework_assignment_id,
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

export function homeworkAssignmentFromRow(row: SbHomeworkAssignmentRow): HomeworkAssignment {
  return {
    id: row.id,
    studentId: row.student_id,
    createdBy: row.created_by,
    subjectId: row.subject_id,
    material: row.material,
    amountPerDay: row.amount_per_day,
    startDate: row.start_date,
    endDate: row.end_date,
    updatedAt: row.updated_at,
  };
}

export function studySessionFromRow(row: SbStudySessionRow): StudySession {
  return {
    id: row.id,
    plannerItemId: row.planner_item_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    deviated: row.deviated,
  };
}

export function examRecordFromRow(row: SbExamRecordRow): ExamRecord {
  return { id: row.id, studentId: row.student_id, createdBy: row.created_by, title: row.title, examDate: row.exam_date, isMain: row.is_main, createdAt: row.created_at };
}

export function examSubjectFromRow(row: SbExamSubjectRow): ExamSubject {
  return { id: row.id, examId: row.exam_id, subjectId: row.subject_id, targetGrade: row.target_grade, targetScore: row.target_score, targetRank: row.target_rank, createdAt: row.created_at };
}

export function examSubjectRangeFromRow(row: SbExamSubjectRangeRow): ExamSubjectRange {
  return { id: row.id, examSubjectId: row.exam_subject_id, material: row.material, rangeLabel: row.range_label, assignedDates: row.assigned_dates, createdAt: row.created_at };
}

export function tutoringScheduleFromRow(row: SbTutoringScheduleRow): TutoringSchedule {
  return { id: row.id, studentId: row.student_id, managerId: row.manager_id, weekdays: row.weekdays, updatedAt: row.updated_at };
}

export function tutoringScheduleExceptionFromRow(row: SbTutoringScheduleExceptionRow): TutoringScheduleException {
  return { id: row.id, studentId: row.student_id, managerId: row.manager_id, originalDate: row.original_date, newDate: row.new_date, note: row.note, createdAt: row.created_at };
}

export function groupByDate<T extends { date: string }>(rows: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) {
    (grouped[row.date] ??= []).push(row);
  }
  return grouped;
}
