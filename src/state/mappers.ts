import type {
  Profile,
  PlannerItem,
  HomeworkAssignment,
  StudySession,
  ExamRecord,
  ExamSubject,
  ExamSubjectRange,
  TutoringSchedule,
  TutoringScheduleException,
  HomeworkProposal,
  SchoolTimetableSlot,
  HomeworkReminderSetting,
  AllowedAppInterval,
} from '../types';
import type {
  SbProfileRow,
  SbPlannerItemRow,
  SbHomeworkAssignmentRow,
  SbStudySessionRow,
  SbExamRecordRow,
  SbHomeworkProposalRow,
  SbExamSubjectRow,
  SbExamSubjectRangeRow,
  SbTutoringScheduleRow,
  SbTutoringScheduleExceptionRow,
  SbSchoolTimetableSlotRow,
  SbHomeworkReminderSettingRow,
  AllowedAppIntervalRow,
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
    subjectColors: row.subject_colors ?? {},
  };
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
    examSubjectRangeId: row.exam_subject_range_id,
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

export function homeworkProposalFromRow(row: SbHomeworkProposalRow): HomeworkProposal {
  return {
    id: row.id,
    studentId: row.student_id,
    managerId: row.manager_id,
    date: row.date,
    subjectId: row.subject_id,
    material: row.material,
    pageRange: row.page_range,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

export function schoolTimetableSlotFromRow(row: SbSchoolTimetableSlotRow): SchoolTimetableSlot {
  return { id: row.id, studentId: row.student_id, weekday: row.weekday, period: row.period, subject: row.subject, updatedAt: row.updated_at };
}

// Postgres time은 "21:00:00"으로 오는데 UI(TextField type="time")와 비교·표시는 "HH:MM"으로
// 한다. scheduleBlockFromRow가 하던 slice(0, 5)와 같은 처리다.
export function homeworkReminderSettingFromRow(row: SbHomeworkReminderSettingRow): HomeworkReminderSetting {
  return { studentId: row.student_id, remindAt: row.remind_at.slice(0, 5), enabled: row.enabled };
}

export function allowedAppIntervalFromRow(row: AllowedAppIntervalRow): AllowedAppInterval {
  return { id: row.id, userId: row.user_id, startedAt: row.started_at, endedAt: row.ended_at };
}

export function groupByDate<T extends { date: string }>(rows: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) {
    (grouped[row.date] ??= []).push(row);
  }
  return grouped;
}
