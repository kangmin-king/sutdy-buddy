import React from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  uid,
  addDaysToKey,
  todayKey,
  shouldGenerateHomeworkItem,
  splitPagesAcrossDates,
  computeMissedHomeworkRedistribution,
  resolvePlannerItemManagerId,
} from '../lib';
import {
  profileFromRow,
  plannerItemFromRow,
  homeworkAssignmentFromRow,
  studySessionFromRow,
  groupByDate,
  examRecordFromRow,
  examSubjectFromRow,
  examSubjectRangeFromRow,
  tutoringScheduleFromRow,
  tutoringScheduleExceptionFromRow,
  homeworkProposalFromRow,
  schoolTimetableSlotFromRow,
  homeworkReminderSettingFromRow,
  allowedAppIntervalFromRow,
} from './mappers';
import type {
  Profile,
  PlannerItem,
  HomeworkAssignment,
  StudySession,
  DateKey,
  ExamRecord,
  ExamSubject,
  ExamSubjectRange,
  TutoringSchedule,
  TutoringScheduleException,
  SubjectId,
  HomeworkProposal,
  SchoolTimetableSlot,
  HomeworkReminderSetting,
  AllowedAppInterval,
} from '../types';
import type { SbPlannerItemRow, SbProfileRow, SbHomeworkAssignmentRow } from '../types/db';

interface AppState {
  profile: Profile | null;
  plannerItems: Record<DateKey, PlannerItem[]>;
  homeworkAssignments: HomeworkAssignment[];
  studySessions: Record<string, StudySession[]>;
  allowedAppIntervals: Record<string, AllowedAppInterval[]>;
  managedStudents: Profile[];
  examRecords: ExamRecord[];
  examSubjects: ExamSubject[];
  examSubjectRanges: ExamSubjectRange[];
  tutoringSchedules: TutoringSchedule[];
  tutoringScheduleExceptions: TutoringScheduleException[];
  studentLabels: Record<string, string>;
  studentPlannerItems: Record<string, Record<DateKey, PlannerItem[]>>;
  linkedManagers: Profile[];
  managerLabels: Record<string, string>;
  homeworkProposals: HomeworkProposal[];
  sentHomeworkProposals: Record<string, HomeworkProposal[]>;
  schoolTimetable: SchoolTimetableSlot[];
  studentSchoolTimetables: Record<string, SchoolTimetableSlot[]>;
  // 숙제 미시작 알림 설정. 관리자 로그인에서만 채운다(설정 UI가 관리자 쪽에만 있다).
  // 키가 없는 학생은 기본값(DEFAULT_HOMEWORK_REMIND_AT · 켜짐)이다 — DB에 행이 없는 것과 같다.
  homeworkReminderSettings: Record<string, HomeworkReminderSetting>;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE: AppState = {
  profile: null,
  plannerItems: {},
  homeworkAssignments: [],
  studySessions: {},
  allowedAppIntervals: {},
  managedStudents: [],
  examRecords: [],
  examSubjects: [],
  examSubjectRanges: [],
  tutoringSchedules: [],
  tutoringScheduleExceptions: [],
  studentLabels: {},
  studentPlannerItems: {},
  linkedManagers: [],
  managerLabels: {},
  homeworkProposals: [],
  sentHomeworkProposals: {},
  schoolTimetable: [],
  studentSchoolTimetables: {},
  homeworkReminderSettings: {},
  loading: true,
  error: null,
};

const WRITE_FAILURE_MESSAGE = '저장하지 못했어요. 다시 시도해주세요.';

// 푸시알림은 이미 DB 저장이 끝난 뒤에 보내는 부가 동작이라, 실패해도 "저장 실패"처럼 보이는
// WRITE_FAILURE_MESSAGE는 띄우지 않고 콘솔에만 남긴다.
async function notifyUser(userId: string, title: string, body: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-push-notification', { body: { userId, title, body } });
    if (error) console.error('send-push-notification failed:', error.message);
  } catch (err) {
    console.error('send-push-notification threw:', err);
  }
}

// 숙제 범위는 대부분 "몇 페이지부터 몇 페이지"지만, 모의고사처럼 페이지 단위가 아닌 학습도 있다.
// mode: 'pages'면 날짜별로 자동 분배(splitPagesAcrossDates), 'custom'이면 선택한 모든 날짜에
// customLabel을 그대로 반복해서 넣는다(분배 없음 — 관리자가 직접 쓴 문구 그대로).
type HomeworkScope = { mode: 'pages'; startPage: number; endPage: number } | { mode: 'custom'; customLabel: string };

interface AppStateActions {
  saveProfile: (profile: Profile) => Promise<void>;
  updateSubjectColor: (subjectId: SubjectId, color: string) => Promise<void>;
  addPlannerItem: (date: DateKey, item: Omit<PlannerItem, 'id' | 'order'>) => Promise<void>;
  updatePlannerItem: (date: DateKey, id: string, patch: Partial<PlannerItem>) => Promise<void>;
  deletePlannerItem: (date: DateKey, id: string) => Promise<void>;
  carryOverPlannerItem: (date: DateKey, id: string) => Promise<void>;
  linkByInviteCode: (code: string) => Promise<void>;
  createHomeworkAssignment: (
    studentId: string,
    assignment: Omit<HomeworkAssignment, 'id' | 'studentId' | 'createdBy' | 'updatedAt'>
  ) => Promise<void>;
  updateHomeworkAssignment: (id: string, patch: Partial<HomeworkAssignment>) => Promise<void>;
  startStudySession: (plannerItemId: string) => Promise<string>;
  endStudySession: (plannerItemId: string, sessionId: string, displayedSeconds?: number) => Promise<void>;
  updateStudentLabel: (studentId: string, label: string) => Promise<void>;
  updateManagerLabel: (managerId: string, label: string) => Promise<void>;
  registerDeviceToken: (token: string) => Promise<void>;
  createHomeworkProposal: (
    studentId: string,
    proposal: { date: DateKey; subjectId: SubjectId; material: string; pageRange: string }
  ) => Promise<void>;
  respondToHomeworkProposal: (proposalId: string, accept: boolean) => Promise<void>;
  loadSentHomeworkProposals: (studentId: string) => Promise<void>;
  createExamRecord: (studentId: string, exam: { title: string; examDate: string; isMain: boolean }) => Promise<string>;
  deleteExamRecord: (studentId: string, examId: string) => Promise<void>;
  addExamSubject: (examId: string, subject: { subjectId: SubjectId; targetGrade: string; targetScore: string; targetRank: string }) => Promise<void>;
  deleteExamSubject: (studentId: string, examId: string, subjectId: string) => Promise<void>;
  registerHomeworkRange: (
    studentId: string,
    examSubjectId: string,
    params: { subjectId: SubjectId; material: string; selectedDates: DateKey[] } & HomeworkScope
  ) => Promise<void>;
  updateHomeworkRange: (
    studentId: string,
    rangeId: string,
    params: { material: string; selectedDates: DateKey[] } & HomeworkScope
  ) => Promise<void>;
  deleteExamRange: (studentId: string, rangeId: string) => Promise<void>;
  updateStudentPlannerItem: (studentId: string, date: DateKey, id: string, patch: Partial<PlannerItem>) => Promise<void>;
  updateHomeworkAmountForDate: (
    studentId: string,
    itemId: string,
    date: DateKey,
    rangeId: string | null,
    newValue: string
  ) => Promise<void>;
  deleteStudentHomeworkItem: (studentId: string, date: DateKey, itemId: string) => Promise<void>;
  upsertTutoringSchedule: (studentId: string, weekdays: number[]) => Promise<void>;
  addTutoringException: (studentId: string, exception: { originalDate: DateKey; newDate: DateKey | null; note: string }) => Promise<void>;
  loadStudentPlannerItems: (studentId: string) => Promise<void>;
  upsertHomeworkReminderSetting: (studentId: string, setting: { remindAt: string; enabled: boolean }) => Promise<void>;
  upsertSchoolTimetableSlot: (weekday: number, period: number, subject: string) => Promise<void>;
  deleteSchoolTimetableSlot: (slotId: string) => Promise<void>;
  loadStudentSchoolTimetable: (studentId: string) => Promise<void>;
  loadAllowedAppIntervals: (userId: string) => Promise<void>;
  recordAllowedAppIntervals: (rows: { user_id: string; started_at: string; ended_at: string }[]) => Promise<void>;
  dismissError: () => void;
}

const AppStateContext = React.createContext<{ state: AppState; actions: AppStateActions } | null>(null);

function groupByPlannerItemId(rows: StudySession[]): Record<string, StudySession[]> {
  const grouped: Record<string, StudySession[]> = {};
  for (const row of rows) {
    (grouped[row.plannerItemId] ??= []).push(row);
  }
  return grouped;
}

// 관리자가 담당하는 학생 프로필 목록. 최초 로드(loadAll)와 초대코드 연결 직후(linkByInviteCode)
// 양쪽에서 쓰이므로 헬퍼로 분리한다.
// 관리자가 남의 프로필 행을 읽을 수 있게 해주는 RLS 정책은 0006 마이그레이션에 있다.
async function fetchManagedStudents(managerId: string): Promise<Profile[]> {
  const linksRes = await supabase.from('sb_student_manager_links').select('*').eq('manager_id', managerId);
  const studentIds = (linksRes.data ?? []).map((link) => link.student_id);
  if (studentIds.length === 0) return [];
  const studentsRes = await supabase.from('sb_profiles').select('*').in('id', studentIds);
  return ((studentsRes.data ?? []) as SbProfileRow[]).map(profileFromRow);
}

// 관리자가 자기 화면에서만 보는 학생 별칭. sb_student_manager_links.label에서 읽는다(0007 마이그레이션).
async function fetchStudentLabels(managerId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('sb_student_manager_links').select('student_id, label').eq('manager_id', managerId);
  const labels: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.label) labels[row.student_id] = row.label;
  }
  return labels;
}

// 학생이 연결된 관리자(선생님/학부모) 프로필 목록. fetchManagedStudents의 방향을 뒤집은 버전.
async function fetchLinkedManagers(studentId: string): Promise<Profile[]> {
  const linksRes = await supabase.from('sb_student_manager_links').select('*').eq('student_id', studentId);
  const managerIds = (linksRes.data ?? []).map((link) => link.manager_id);
  if (managerIds.length === 0) return [];
  const managersRes = await supabase.from('sb_profiles').select('*').in('id', managerIds);
  return ((managersRes.data ?? []) as SbProfileRow[]).map(profileFromRow);
}

// 학생이 자기 화면에서만 보는 관리자 별칭. sb_student_manager_links.student_label에서 읽는다(0014 마이그레이션).
async function fetchManagerLabels(studentId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('sb_student_manager_links').select('manager_id, student_label').eq('student_id', studentId);
  const labels: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.student_label) labels[row.manager_id] = row.student_label;
  }
  return labels;
}

// 시험/과목/교재범위 중 하나를 지울 때 공통으로 쓰는 정리 로직. rangeIds에 걸린 숙제 항목 중
// 아직 지나지 않고 완료도 안 된(=removable) 항목은 실제로 지워서 캘린더/홈에서도 사라지게 하고,
// 이미 지났거나 완료된(=locked) 항목은 기록으로 남기되 참조만 끊는다(examSubjectRangeId → null).
// updateHomeworkRange/deleteExamRange가 항목 단위로 쓰던 판단 기준과 동일하다.
async function deleteRangeLinkedItems(
  studentId: string,
  rangeIds: Set<string>,
  studentPlannerItemsRef: React.MutableRefObject<Record<string, Record<DateKey, PlannerItem[]>>>,
  setState: React.Dispatch<React.SetStateAction<AppState>>
): Promise<void> {
  if (rangeIds.size === 0) return;
  const today = todayKey();
  const current = studentPlannerItemsRef.current[studentId] ?? {};
  const linked = Object.values(current)
    .flat()
    .filter((i) => i.examSubjectRangeId && rangeIds.has(i.examSubjectRangeId));
  const removableIds = new Set(linked.filter((i) => !(i.date < today || i.status === 'completed')).map((i) => i.id));

  const updated: Record<DateKey, PlannerItem[]> = {};
  for (const date in current) {
    updated[date] = current[date]
      .filter((i) => !removableIds.has(i.id))
      .map((i) => (i.examSubjectRangeId && rangeIds.has(i.examSubjectRangeId) ? { ...i, examSubjectRangeId: null } : i));
  }
  studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: updated };
  setState((s) => ({ ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: updated } }));

  if (removableIds.size > 0) {
    const { error } = await supabase.from('sb_planner_items').delete().in('id', Array.from(removableIds));
    if (error) console.error('deleteRangeLinkedItems failed:', error.message);
  }
}

async function loadAll(userId: string): Promise<AppState> {
  const [profileRes, itemsRes, homeworkRes, sessionsRes] = await Promise.all([
    supabase.from('sb_profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('sb_planner_items').select('*').eq('user_id', userId).order('order'),
    supabase.from('sb_homework_assignments').select('*').eq('student_id', userId),
    supabase.from('sb_study_sessions').select('*').eq('user_id', userId),
  ]);

  const profile = profileRes.data ? profileFromRow(profileRes.data) : null;

  let managedStudents: Profile[] = [];
  let homeworkRows = homeworkRes.data ?? [];
  let sessionRows = sessionsRes.data ?? [];
  let examRecords: ExamRecord[] = [];
  let examSubjects: ExamSubject[] = [];
  let examSubjectRanges: ExamSubjectRange[] = [];
  let tutoringSchedules: TutoringSchedule[] = [];
  let tutoringScheduleExceptions: TutoringScheduleException[] = [];
  let studentLabels: Record<string, string> = {};
  let linkedManagers: Profile[] = [];
  let managerLabels: Record<string, string> = {};
  let homeworkProposals: HomeworkProposal[] = [];
  let schoolTimetable: SchoolTimetableSlot[] = [];
  let homeworkReminderSettings: Record<string, HomeworkReminderSetting> = {};

  if (profile?.role === 'manager') {
    managedStudents = await fetchManagedStudents(userId);
    studentLabels = await fetchStudentLabels(userId);
    const studentIds = managedStudents.map((s) => s.id);
    // 관리자 계정에서는 위 병렬 조회(student_id/user_id = 본인)가 항상 비어 있다.
    // 담당 학생들 기준으로 다시 조회해야 등록해둔 숙제와 학습 세션이 보인다.
    if (studentIds.length > 0) {
      const [managerHomeworkRes, managerSessionsRes, examRes, scheduleRes, exceptionRes, reminderRes] = await Promise.all([
        supabase.from('sb_homework_assignments').select('*').in('student_id', studentIds),
        supabase.from('sb_study_sessions').select('*').in('user_id', studentIds),
        supabase.from('sb_exam_records').select('*').in('student_id', studentIds),
        supabase.from('sb_tutoring_schedules').select('*').eq('manager_id', userId),
        supabase.from('sb_tutoring_schedule_exceptions').select('*').eq('manager_id', userId),
        supabase.from('sb_homework_reminder_settings').select('*').in('student_id', studentIds),
      ]);
      homeworkRows = managerHomeworkRes.data ?? [];
      sessionRows = managerSessionsRes.data ?? [];
      for (const row of reminderRes.data ?? []) {
        const setting = homeworkReminderSettingFromRow(row);
        homeworkReminderSettings[setting.studentId] = setting;
      }
      examRecords = (examRes.data ?? []).map(examRecordFromRow);
      tutoringSchedules = (scheduleRes.data ?? []).map(tutoringScheduleFromRow);
      tutoringScheduleExceptions = (exceptionRes.data ?? []).map(tutoringScheduleExceptionFromRow);

      const examIds = examRecords.map((e) => e.id);
      if (examIds.length > 0) {
        const subjectsRes = await supabase.from('sb_exam_subjects').select('*').in('exam_id', examIds);
        examSubjects = (subjectsRes.data ?? []).map(examSubjectFromRow);
        const subjectIds = examSubjects.map((s) => s.id);
        if (subjectIds.length > 0) {
          const rangesRes = await supabase.from('sb_exam_subject_ranges').select('*').in('exam_subject_id', subjectIds);
          examSubjectRanges = (rangesRes.data ?? []).map(examSubjectRangeFromRow);
        }
      }
    } else {
      homeworkRows = [];
      sessionRows = [];
    }
  } else if (profile?.role === 'student') {
    // 학생 본인 계정: 선생님/학부모가 등록해준 시험 일정·과목별 목표·교재 범위·과외 요일을 읽기 전용으로 본다.
    const [examRes, scheduleRes, exceptionRes, managersRes, managerLabelsResult, proposalsRes, timetableRes] = await Promise.all([
      supabase.from('sb_exam_records').select('*').eq('student_id', userId),
      supabase.from('sb_tutoring_schedules').select('*').eq('student_id', userId),
      supabase.from('sb_tutoring_schedule_exceptions').select('*').eq('student_id', userId),
      fetchLinkedManagers(userId),
      fetchManagerLabels(userId),
      supabase.from('sb_homework_proposals').select('*').eq('student_id', userId).eq('status', 'pending'),
      supabase.from('sb_school_timetable_slots').select('*').eq('student_id', userId),
    ]);
    linkedManagers = managersRes;
    managerLabels = managerLabelsResult;
    homeworkProposals = (proposalsRes.data ?? []).map(homeworkProposalFromRow);
    schoolTimetable = (timetableRes.data ?? []).map(schoolTimetableSlotFromRow);
    examRecords = (examRes.data ?? []).map(examRecordFromRow);
    tutoringSchedules = (scheduleRes.data ?? []).map(tutoringScheduleFromRow);
    tutoringScheduleExceptions = (exceptionRes.data ?? []).map(tutoringScheduleExceptionFromRow);
    const examIds = examRecords.map((e) => e.id);
    if (examIds.length > 0) {
      const subjectsRes = await supabase.from('sb_exam_subjects').select('*').in('exam_id', examIds);
      examSubjects = (subjectsRes.data ?? []).map(examSubjectFromRow);
      const subjectIds = examSubjects.map((s) => s.id);
      if (subjectIds.length > 0) {
        const rangesRes = await supabase.from('sb_exam_subject_ranges').select('*').in('exam_subject_id', subjectIds);
        examSubjectRanges = (rangesRes.data ?? []).map(examSubjectRangeFromRow);
      }
    }
  }

  return {
    profile,
    plannerItems: groupByDate((itemsRes.data ?? []).map(plannerItemFromRow)),
    homeworkAssignments: homeworkRows.map(homeworkAssignmentFromRow),
    studySessions: groupByPlannerItemId(sessionRows.map(studySessionFromRow)),
    // loadAll과 별도로 로그인 직후 loadAllowedAppIntervals가 채운다(아래 useEffect 참고).
    allowedAppIntervals: {},
    managedStudents,
    examRecords,
    examSubjects,
    examSubjectRanges,
    tutoringSchedules,
    tutoringScheduleExceptions,
    studentLabels,
    studentPlannerItems: {},
    linkedManagers,
    managerLabels,
    homeworkProposals,
    sentHomeworkProposals: {},
    schoolTimetable,
    studentSchoolTimetables: {},
    homeworkReminderSettings,
    loading: false,
    error: null,
  };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [state, setState] = React.useState<AppState>(EMPTY_STATE);

  // 커밋을 기다리지 않고 동기적으로 읽을 수 있는 plannerItems 미러(addPlannerItem 참고).
  // 커밋될 때마다 실제 state로 다시 맞춰주므로 다른 액션(삭제/이월 등)과도 어긋나지 않는다.
  const plannerItemsRef = React.useRef<Record<DateKey, PlannerItem[]>>(EMPTY_STATE.plannerItems);
  React.useEffect(() => {
    plannerItemsRef.current = state.plannerItems;
  }, [state.plannerItems]);

  // 관리자가 보고 있는 학생들의 plannerItems 미러. registerHomeworkRange는 DB insert 페이로드에
  // 들어갈 order를 만들기 전에 "그 날짜에 이미 있는 항목"을 알아야 하는데, setState 콜백 안에서
  // 계산하면 그 값이 insert에 반영되지 않는다(리뷰에서 order가 항상 1로 저장되던 원인).
  const studentPlannerItemsRef = React.useRef<Record<string, Record<DateKey, PlannerItem[]>>>(EMPTY_STATE.studentPlannerItems);
  React.useEffect(() => {
    studentPlannerItemsRef.current = state.studentPlannerItems;
  }, [state.studentPlannerItems]);

  React.useEffect(() => {
    let cancelled = false;
    loadAll(userId).then((loaded) => {
      if (!cancelled) setState(loaded);
      // 로그인 직후 본인 허용앱 사용 구간도 불러온다. loadAll 자체엔 안 넣는다 — 부가 정보라
      // 실패해도 나머지 로드를 막으면 안 된다.
      void actions.loadAllowedAppIntervals(userId);
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
          role: profile.role,
          invite_code: profile.inviteCode,
          subject_colors: profile.subjectColors,
        });
        if (error) {
          console.error('saveProfile failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async updateSubjectColor(subjectId, color) {
        const previous = state.profile;
        if (!previous) return;
        const nextColors = { ...previous.subjectColors, [subjectId]: color };
        setState((s) => (s.profile ? { ...s, profile: { ...s.profile, subjectColors: nextColors } } : s));
        const { error } = await supabase.from('sb_profiles').update({ subject_colors: nextColors }).eq('id', userId);
        if (error) {
          console.error('updateSubjectColor failed:', error.message);
          setState((s) => (s.profile ? { ...s, profile: { ...s.profile, subjectColors: previous.subjectColors }, error: WRITE_FAILURE_MESSAGE } : s));
        }
      },

      async addPlannerItem(date, item) {
        // 목록은 반드시 "현재" 상태에서 파생해야 한다. 숙제 지연 생성 이펙트는 한 tick 안에서
        // addPlannerItem을 여러 번 연달아 호출하는데, 바깥 `state` 클로저를 읽으면 모든 호출이
        // 같은 (오래된) 목록을 보고 서로의 낙관적 항목을 덮어써 버린다. 그러면 이펙트가 다시
        // 돌 때 앞선 배정이 "아직 생성 안 됨"으로 보여 DB 행이 중복 insert된다.
        // plannerItemsRef는 setState 커밋을 기다리지 않고 동기적으로 갱신되므로, 같은 tick 안의
        // 연속 호출도 직전 호출의 항목을 보고 order를 이어서 매길 수 있다.
        const list = plannerItemsRef.current[date] ?? [];
        const id = uid();
        const order = list.length === 0 ? 1 : Math.max(...list.map((i) => i.order)) + 1;
        const fullItem: PlannerItem = { ...item, id, order };
        plannerItemsRef.current = { ...plannerItemsRef.current, [date]: [...list, fullItem] };
        setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: [...(s.plannerItems[date] ?? []), fullItem] } }));

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
          source: fullItem.source,
          homework_assignment_id: fullItem.homeworkAssignmentId,
          exam_subject_range_id: fullItem.examSubjectRangeId,
        });
        if (error) {
          console.error('addPlannerItem failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        } else if (fullItem.source === 'self') {
          for (const manager of state.linkedManagers) {
            notifyUser(manager.id, '학생이 스스로 계획을 세웠어요', fullItem.material ? `${fullItem.material} 계획을 새로 추가했어요` : '새 계획을 추가했어요');
          }
        }
      },

      async updatePlannerItem(date, id, patch) {
        const previousItem = (state.plannerItems[date] ?? []).find((i) => i.id === id);
        setState((s) => {
          const list = s.plannerItems[date] ?? [];
          return {
            ...s,
            plannerItems: { ...s.plannerItems, [date]: list.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
          };
        });

        const dbPatch: Partial<SbPlannerItemRow> = {};
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
        if (error) {
          console.error('updatePlannerItem failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        } else if (patch.status === 'completed' && previousItem && previousItem.status !== 'completed') {
          const managerId = resolvePlannerItemManagerId(previousItem, state);
          if (managerId) {
            notifyUser(managerId, '학생이 숙제를 완료했어요', previousItem.material ? `${previousItem.material} 학습을 완료했어요` : '배정한 학습을 완료했어요');
          }
        }
      },

      async deletePlannerItem(date, id) {
        const previous = state.plannerItems[date] ?? [];
        setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: previous.filter((i) => i.id !== id) } }));
        const { error } = await supabase.from('sb_planner_items').delete().eq('id', id);
        if (error) {
          console.error('deletePlannerItem failed:', error.message);
          setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: previous }, error: WRITE_FAILURE_MESSAGE }));
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
        const clone: PlannerItem = {
          ...source,
          id: cloneId,
          order,
          status: 'planned',
          actualMinutes: null,
          understanding: null,
          partialReason: null,
          incompleteReason: null,
        };

        setState((s) => ({
          ...s,
          plannerItems: { ...s.plannerItems, [date]: updatedToday, [tomorrowKey]: [...tomorrowList, clone] },
        }));

        const { error: updateError } = await supabase.from('sb_planner_items').update({ status: 'carried_over' }).eq('id', id);
        if (updateError) {
          console.error('carryOverPlannerItem (update) failed:', updateError.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }

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
          source: clone.source,
          homework_assignment_id: clone.homeworkAssignmentId,
          exam_subject_range_id: clone.examSubjectRangeId,
        });
        if (insertError) {
          console.error('carryOverPlannerItem (insert) failed:', insertError.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async linkByInviteCode(code) {
        // 아직 링크가 없는 상태라 RLS상 학생 프로필 행을 직접 select할 수 없다.
        // 정확한 코드를 아는 경우에만 id 하나를 돌려주는 security definer RPC를 쓴다(0006 마이그레이션).
        const { data: studentId, error: lookupError } = await supabase.rpc('find_student_by_invite_code', {
          code: code.trim().toUpperCase(),
        });
        if (lookupError) {
          console.error('linkByInviteCode (lookup) failed:', lookupError.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          return;
        }
        if (!studentId) {
          setState((s) => ({ ...s, error: '초대코드를 찾을 수 없어요. 다시 확인해주세요.' }));
          return;
        }
        const { error } = await supabase.from('sb_student_manager_links').insert({ student_id: studentId, manager_id: userId });
        if (error) {
          console.error('linkByInviteCode failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          return;
        }
        // 연결 직후 학생 목록을 다시 불러와야 관리자 화면에 바로 나타난다.
        const managedStudents = await fetchManagedStudents(userId);
        setState((s) => ({ ...s, managedStudents }));
      },

      async createHomeworkAssignment(studentId, assignment) {
        const id = uid();
        setState((s) => ({
          ...s,
          homeworkAssignments: [
            ...s.homeworkAssignments,
            { id, studentId, createdBy: userId, ...assignment, updatedAt: new Date().toISOString() },
          ],
        }));

        const { error } = await supabase.from('sb_homework_assignments').insert({
          id,
          student_id: studentId,
          created_by: userId,
          subject_id: assignment.subjectId,
          material: assignment.material,
          amount_per_day: assignment.amountPerDay,
          start_date: assignment.startDate,
          end_date: assignment.endDate,
        });
        if (error) {
          console.error('createHomeworkAssignment failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        } else {
          notifyUser(studentId, '숙제가 등록됐어요', assignment.material ? `${assignment.material} 숙제가 새로 등록됐어요` : '새 숙제가 등록됐어요');
        }
      },

      async updateHomeworkAssignment(id, patch) {
        const studentId = state.homeworkAssignments.find((a) => a.id === id)?.studentId;
        setState((s) => ({
          ...s,
          homeworkAssignments: s.homeworkAssignments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }));

        const dbPatch: Partial<SbHomeworkAssignmentRow> = {};
        if ('subjectId' in patch) dbPatch.subject_id = patch.subjectId;
        if ('material' in patch) dbPatch.material = patch.material;
        if ('amountPerDay' in patch) dbPatch.amount_per_day = patch.amountPerDay;
        if ('startDate' in patch) dbPatch.start_date = patch.startDate;
        if ('endDate' in patch) dbPatch.end_date = patch.endDate;

        const { error } = await supabase.from('sb_homework_assignments').update(dbPatch).eq('id', id);
        if (error) {
          console.error('updateHomeworkAssignment failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        } else if (studentId) {
          notifyUser(studentId, '숙제 내용이 바뀌었어요', '숙제 내용이 수정됐어요. 확인해보세요');
        }
      },

      async startStudySession(plannerItemId) {
        const id = uid();
        const startedAt = new Date().toISOString();
        setState((s) => ({
          ...s,
          studySessions: {
            ...s.studySessions,
            [plannerItemId]: [
              ...(s.studySessions[plannerItemId] ?? []),
              { id, plannerItemId, startedAt, endedAt: null, durationSeconds: null },
            ],
          },
        }));
        // 호출자(StudentHome의 handleStart)는 이 id를 받아야 실시간 카운터를 돌리는 "실행 중
        // 세션"으로 등록한다. 여기서 insert 네트워크 왕복을 기다렸다가 id를 돌려주면 응답이 오는
        // 동안 타이머가 멈춰 있는 것처럼 보인다 — 로컬 상태는 이미 위에서 반영했으니 네트워크는
        // 백그라운드로 보내고 id는 즉시 돌려준다.
        supabase
          .from('sb_study_sessions')
          .insert({
            id,
            user_id: userId,
            planner_item_id: plannerItemId,
            started_at: startedAt,
            ended_at: null,
            duration_seconds: null,
          })
          .then(({ error }) => {
            if (error) {
              console.error('startStudySession failed:', error.message);
              setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
            }
          });
        return id;
      },

      async endStudySession(plannerItemId, sessionId, displayedSeconds) {
        const endedAt = new Date().toISOString();
        // startedAt is immutable once a session is created, so reading it from the outer `state`
        // closure (rather than deriving inside the setState updater) is safe here — unlike
        // updatePlannerItem's list derivation, there's no risk of acting on a stale sibling write.
        const existing = (state.studySessions[plannerItemId] ?? []).find((sess) => sess.id === sessionId);
        // 화면의 실시간 경과는 1초 주기로만 갱신되는 now를 기준으로 보여준다. 여기서 정지 시각
        // 기준으로 다시 정밀 계산하면(Date.now() 재조회) 마지막으로 화면에 보이던 값과 어긋나
        // 정지하는 순간 숫자가 위아래로 튀어 보인다. 호출자가 화면에 보이던 그 값을
        // displayedSeconds로 넘겨주면 그걸 그대로 저장해서 "보이던 값 = 저장되는 값"을 보장한다.
        // (자동 이탈 종료처럼 화면 값이 없는 호출은 기존대로 정밀 계산한다.)
        const durationSeconds = existing
          ? (displayedSeconds ?? Math.floor((Date.parse(endedAt) - Date.parse(existing.startedAt)) / 1000))
          : null;

        setState((s) => {
          const list = s.studySessions[plannerItemId] ?? [];
          const updated = list.map((sess) => (sess.id === sessionId ? { ...sess, endedAt, durationSeconds } : sess));
          return { ...s, studySessions: { ...s.studySessions, [plannerItemId]: updated } };
        });

        const { error } = await supabase
          .from('sb_study_sessions')
          .update({ ended_at: endedAt, duration_seconds: durationSeconds })
          .eq('id', sessionId);
        if (error) {
          console.error('endStudySession failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async updateStudentLabel(studentId, label) {
        setState((s) => ({ ...s, studentLabels: { ...s.studentLabels, [studentId]: label } }));
        const { error } = await supabase
          .from('sb_student_manager_links')
          .update({ label })
          .eq('student_id', studentId)
          .eq('manager_id', userId);
        if (error) {
          console.error('updateStudentLabel failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async updateManagerLabel(managerId, label) {
        setState((s) => ({ ...s, managerLabels: { ...s.managerLabels, [managerId]: label } }));
        const { error } = await supabase
          .from('sb_student_manager_links')
          .update({ student_label: label })
          .eq('manager_id', managerId)
          .eq('student_id', userId);
        if (error) {
          console.error('updateManagerLabel failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async registerDeviceToken(token) {
        const { error } = await supabase
          .from('sb_device_tokens')
          .upsert({ user_id: userId, fcm_token: token, platform: 'android' }, { onConflict: 'user_id,fcm_token' });
        if (error) console.error('registerDeviceToken failed:', error.message);
      },

      async createHomeworkProposal(studentId, proposal) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullProposal: HomeworkProposal = {
          id,
          studentId,
          managerId: userId,
          date: proposal.date,
          subjectId: proposal.subjectId,
          material: proposal.material,
          pageRange: proposal.pageRange,
          status: 'pending',
          createdAt,
          respondedAt: null,
        };
        setState((s) => ({
          ...s,
          sentHomeworkProposals: {
            ...s.sentHomeworkProposals,
            [studentId]: [...(s.sentHomeworkProposals[studentId] ?? []), fullProposal],
          },
        }));

        const { error } = await supabase.from('sb_homework_proposals').insert({
          id,
          student_id: studentId,
          manager_id: userId,
          date: proposal.date,
          subject_id: proposal.subjectId,
          material: proposal.material,
          page_range: proposal.pageRange,
          status: 'pending',
        });
        if (error) {
          console.error('createHomeworkProposal failed:', error.message);
          setState((s) => ({
            ...s,
            sentHomeworkProposals: {
              ...s.sentHomeworkProposals,
              [studentId]: (s.sentHomeworkProposals[studentId] ?? []).filter((p) => p.id !== id),
            },
            error: WRITE_FAILURE_MESSAGE,
          }));
        } else {
          notifyUser(studentId, '숙제 제안이 왔어요', proposal.material ? `${proposal.material} 숙제를 제안했어요. 확인해보세요` : '새 숙제를 제안했어요');
        }
      },

      async respondToHomeworkProposal(proposalId, accept) {
        const proposal = state.homeworkProposals.find((p) => p.id === proposalId);
        if (!proposal) return;
        setState((s) => ({ ...s, homeworkProposals: s.homeworkProposals.filter((p) => p.id !== proposalId) }));

        const { error } = await supabase
          .from('sb_homework_proposals')
          .update({ status: accept ? 'accepted' : 'rejected', responded_at: new Date().toISOString() })
          .eq('id', proposalId);
        if (error) {
          console.error('respondToHomeworkProposal failed:', error.message);
          setState((s) => ({ ...s, homeworkProposals: [...s.homeworkProposals, proposal], error: WRITE_FAILURE_MESSAGE }));
          return;
        }

        if (accept) {
          await actions.addPlannerItem(proposal.date, {
            date: proposal.date,
            subjectId: proposal.subjectId,
            startTime: '09:00',
            studyType: null,
            material: proposal.material,
            unit: '',
            pageRange: proposal.pageRange,
            endTime: null,
            difficulty: null,
            restPattern: null,
            mustDo: false,
            status: 'planned',
            actualMinutes: null,
            understanding: null,
            partialReason: null,
            incompleteReason: null,
            source: 'homework',
            homeworkAssignmentId: null,
            examSubjectRangeId: null,
          });
        }
      },

      async loadSentHomeworkProposals(studentId) {
        const { data, error } = await supabase
          .from('sb_homework_proposals')
          .select('*')
          .eq('student_id', studentId)
          .eq('manager_id', userId)
          .order('created_at', { ascending: false });
        if (error) {
          console.error('loadSentHomeworkProposals failed:', error.message);
          return;
        }
        const proposals = (data ?? []).map(homeworkProposalFromRow);
        setState((s) => ({ ...s, sentHomeworkProposals: { ...s.sentHomeworkProposals, [studentId]: proposals } }));
      },

      async createExamRecord(studentId, exam) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullExam: ExamRecord = { id, studentId, createdBy: userId, title: exam.title, examDate: exam.examDate, isMain: exam.isMain, createdAt };
        setState((s) => ({ ...s, examRecords: [...s.examRecords, fullExam] }));

        const { error } = await supabase.from('sb_exam_records').insert({
          id,
          student_id: studentId,
          created_by: userId,
          title: exam.title,
          exam_date: exam.examDate,
          is_main: exam.isMain,
        });
        if (error) {
          console.error('createExamRecord failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
        return id;
      },

      async deleteExamRecord(studentId, examId) {
        // 이 시험 아래 모든 과목/교재범위가 딸려 지워진다. 아직 하지 않은 숙제는 캘린더/홈에서도
        // 사라지도록 실제로 지우고, 이미 지났거나 완료된 기록은 참조만 끊고 남겨둔다.
        const removedSubjectIds = new Set(state.examSubjects.filter((s) => s.examId === examId).map((s) => s.id));
        const removedRangeIds = new Set(state.examSubjectRanges.filter((r) => removedSubjectIds.has(r.examSubjectId)).map((r) => r.id));
        const previousExamRecords = state.examRecords;
        const previousExamSubjects = state.examSubjects;
        const previousExamSubjectRanges = state.examSubjectRanges;

        await deleteRangeLinkedItems(studentId, removedRangeIds, studentPlannerItemsRef, setState);

        setState((s) => ({
          ...s,
          examRecords: s.examRecords.filter((e) => e.id !== examId),
          examSubjects: s.examSubjects.filter((sub) => sub.examId !== examId),
          examSubjectRanges: s.examSubjectRanges.filter((r) => !removedSubjectIds.has(r.examSubjectId)),
        }));

        const { error } = await supabase.from('sb_exam_records').delete().eq('id', examId);
        if (error) {
          console.error('deleteExamRecord failed:', error.message);
          setState((s) => ({
            ...s,
            examRecords: previousExamRecords,
            examSubjects: previousExamSubjects,
            examSubjectRanges: previousExamSubjectRanges,
            error: WRITE_FAILURE_MESSAGE,
          }));
        }
      },

      async addExamSubject(examId, subject) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullSubject: ExamSubject = { id, examId, ...subject, createdAt };
        setState((s) => ({ ...s, examSubjects: [...s.examSubjects, fullSubject] }));

        const { error } = await supabase.from('sb_exam_subjects').insert({
          id,
          exam_id: examId,
          subject_id: subject.subjectId,
          target_grade: subject.targetGrade,
          target_score: subject.targetScore,
          target_rank: subject.targetRank,
        });
        if (error) {
          console.error('addExamSubject failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async deleteExamSubject(studentId, examId, subjectId) {
        const removedRangeIds = new Set(state.examSubjectRanges.filter((r) => r.examSubjectId === subjectId).map((r) => r.id));
        const previousExamSubjects = state.examSubjects;
        const previousExamSubjectRanges = state.examSubjectRanges;

        await deleteRangeLinkedItems(studentId, removedRangeIds, studentPlannerItemsRef, setState);

        setState((s) => ({
          ...s,
          examSubjects: s.examSubjects.filter((sub) => sub.id !== subjectId),
          examSubjectRanges: s.examSubjectRanges.filter((r) => r.examSubjectId !== subjectId),
        }));

        const { error } = await supabase.from('sb_exam_subjects').delete().eq('id', subjectId);
        if (error) {
          console.error('deleteExamSubject failed:', error.message);
          setState((s) => ({
            ...s,
            examSubjects: previousExamSubjects,
            examSubjectRanges: previousExamSubjectRanges,
            error: WRITE_FAILURE_MESSAGE,
          }));
        }
      },

      async registerHomeworkRange(studentId, examSubjectId, params) {
        // 선택 순서 그대로 두면 저장/표시 모두 뒤죽박죽이 된다. 한 번 정렬해서 분배/저장/낙관적 상태에 모두 쓴다.
        const selectedDates = [...params.selectedDates].sort();
        const distribution =
          params.mode === 'pages'
            ? splitPagesAcrossDates(params.startPage, params.endPage, selectedDates)
            : selectedDates.map((date) => ({ date, pageRange: params.customLabel }));
        const rangeLabel = params.mode === 'pages' ? `${params.startPage}~${params.endPage}페이지` : params.customLabel;
        const rangeId = uid();
        const createdAt = new Date().toISOString();
        const fullRange: ExamSubjectRange = {
          id: rangeId,
          examSubjectId,
          material: params.material,
          rangeLabel,
          assignedDates: selectedDates,
          createdAt,
        };
        setState((s) => ({ ...s, examSubjectRanges: [...s.examSubjectRanges, fullRange] }));

        const { error: rangeError } = await supabase.from('sb_exam_subject_ranges').insert({
          id: rangeId,
          exam_subject_id: examSubjectId,
          material: params.material,
          range_label: rangeLabel,
          assigned_dates: selectedDates,
        });
        if (rangeError) {
          console.error('registerHomeworkRange (range) failed:', rangeError.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          return;
        }

        // 학생 계정 이름으로 각 날짜에 숙제 항목을 즉시 생성한다(지연 생성 없음). 학생의 plannerItems가
        // 아니라 studentPlannerItems[studentId]에 낙관적으로 반영한다 — 관리자는 자기 자신의
        // plannerItems를 갖지 않는다.
        // order는 반드시 insert 페이로드를 만들기 전에 확정해야 한다. setState 콜백 안에서 계산하면
        // 그 값은 낙관적 상태에만 남고 DB에는 자리표시자가 들어간다(addPlannerItem과 같은 이유로 ref를 쓴다).
        // 여러 날짜가 한 번에 들어오므로 날짜별로 각각 그 날의 마지막 order 다음 값을 이어 매긴다.
        const merged: Record<DateKey, PlannerItem[]> = { ...(studentPlannerItemsRef.current[studentId] ?? {}) };
        const newItems: PlannerItem[] = distribution.map(({ date, pageRange }) => {
          const list = merged[date] ?? [];
          const order = list.length === 0 ? 1 : Math.max(...list.map((i) => i.order)) + 1;
          const item: PlannerItem = {
            id: uid(),
            date,
            order,
            subjectId: params.subjectId,
            startTime: '09:00',
            studyType: null,
            material: params.material,
            unit: '',
            pageRange,
            endTime: null,
            difficulty: null,
            restPattern: null,
            mustDo: false,
            status: 'planned' as const,
            actualMinutes: null,
            understanding: null,
            partialReason: null,
            incompleteReason: null,
            source: 'homework' as const,
            homeworkAssignmentId: null,
            examSubjectRangeId: rangeId,
          };
          merged[date] = [...list, item];
          return item;
        });

        studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: merged };
        setState((s) => ({ ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: merged } }));

        const { error: itemsError } = await supabase.from('sb_planner_items').insert(
          newItems.map((it) => ({
            id: it.id,
            user_id: studentId,
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
            source: it.source,
            homework_assignment_id: it.homeworkAssignmentId,
            exam_subject_range_id: it.examSubjectRangeId,
          }))
        );
        if (itemsError) {
          console.error('registerHomeworkRange (items) failed:', itemsError.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        } else {
          notifyUser(studentId, '숙제가 등록됐어요', params.material ? `${params.material} 숙제가 새로 등록됐어요` : '새 숙제가 등록됐어요');
        }
      },

      async updateHomeworkRange(studentId, rangeId, params) {
        // 이미 지난 날짜거나 학생이 완료 처리한 항목은 절대 건드리지 않는다("과거는 보존, 이후만
        // 반영" — 기존 숙제 등록 기능과 같은 원칙). 잠긴 날짜를 제외한 나머지만 지우고 새로 등록한다.
        const today = todayKey();
        const currentByDate = studentPlannerItemsRef.current[studentId] ?? {};
        const linkedItems = Object.values(currentByDate)
          .flat()
          .filter((i) => i.examSubjectRangeId === rangeId);
        if (linkedItems.length === 0) return;
        const subjectId = linkedItems[0].subjectId;
        const lockedDates = new Set(linkedItems.filter((i) => i.date < today || i.status === 'completed').map((i) => i.date));
        const removable = linkedItems.filter((i) => !lockedDates.has(i.date));
        const selectedDates = [...params.selectedDates].sort().filter((d) => !lockedDates.has(d));
        const distribution =
          params.mode === 'pages'
            ? splitPagesAcrossDates(params.startPage, params.endPage, selectedDates)
            : selectedDates.map((date) => ({ date, pageRange: params.customLabel }));
        const rangeLabel = params.mode === 'pages' ? `${params.startPage}~${params.endPage}페이지` : params.customLabel;
        const assignedDates = Array.from(new Set([...lockedDates, ...selectedDates])).sort();

        setState((s) => ({
          ...s,
          examSubjectRanges: s.examSubjectRanges.map((r) =>
            r.id === rangeId ? { ...r, material: params.material, rangeLabel, assignedDates } : r
          ),
        }));
        const { error: rangeError } = await supabase
          .from('sb_exam_subject_ranges')
          .update({ material: params.material, range_label: rangeLabel, assigned_dates: assignedDates })
          .eq('id', rangeId);
        if (rangeError) {
          console.error('updateHomeworkRange (range) failed:', rangeError.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          return;
        }

        const merged: Record<DateKey, PlannerItem[]> = { ...currentByDate };
        for (const removed of removable) {
          merged[removed.date] = (merged[removed.date] ?? []).filter((i) => i.id !== removed.id);
        }
        const newItems: PlannerItem[] = distribution.map(({ date, pageRange }) => {
          const list = merged[date] ?? [];
          const order = list.length === 0 ? 1 : Math.max(...list.map((i) => i.order)) + 1;
          const item: PlannerItem = {
            id: uid(),
            date,
            order,
            subjectId,
            startTime: '09:00',
            studyType: null,
            material: params.material,
            unit: '',
            pageRange,
            endTime: null,
            difficulty: null,
            restPattern: null,
            mustDo: false,
            status: 'planned' as const,
            actualMinutes: null,
            understanding: null,
            partialReason: null,
            incompleteReason: null,
            source: 'homework' as const,
            homeworkAssignmentId: null,
            examSubjectRangeId: rangeId,
          };
          merged[date] = [...list, item];
          return item;
        });

        studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: merged };
        setState((s) => ({ ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: merged } }));

        if (removable.length > 0) {
          const { error: deleteError } = await supabase
            .from('sb_planner_items')
            .delete()
            .in('id', removable.map((i) => i.id));
          if (deleteError) {
            console.error('updateHomeworkRange (delete) failed:', deleteError.message);
            setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          }
        }

        if (newItems.length > 0) {
          const { error: itemsError } = await supabase.from('sb_planner_items').insert(
            newItems.map((it) => ({
              id: it.id,
              user_id: studentId,
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
              source: it.source,
              homework_assignment_id: it.homeworkAssignmentId,
              exam_subject_range_id: it.examSubjectRangeId,
            }))
          );
          if (itemsError) {
            console.error('updateHomeworkRange (items) failed:', itemsError.message);
            setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          }
        }
        notifyUser(studentId, '숙제 내용이 바뀌었어요', '숙제 내용이 수정됐어요. 확인해보세요');
      },

      async deleteExamRange(studentId, rangeId) {
        // updateHomeworkRange와 같은 원칙: 이미 지났거나 완료된 항목은 남겨두고(참조만 끊는다),
        // 아직 하지 않은 미래 날짜 항목만 실제로 지운다.
        const previousExamSubjectRanges = state.examSubjectRanges;

        await deleteRangeLinkedItems(studentId, new Set([rangeId]), studentPlannerItemsRef, setState);

        setState((s) => ({ ...s, examSubjectRanges: s.examSubjectRanges.filter((r) => r.id !== rangeId) }));

        const { error: deleteRangeError } = await supabase.from('sb_exam_subject_ranges').delete().eq('id', rangeId);
        if (deleteRangeError) {
          console.error('deleteExamRange (range) failed:', deleteRangeError.message);
          setState((s) => ({ ...s, examSubjectRanges: previousExamSubjectRanges, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async updateStudentPlannerItem(studentId, date, id, patch) {
        setState((s) => {
          const list = s.studentPlannerItems[studentId]?.[date] ?? [];
          const updatedList = list.map((i) => (i.id === id ? { ...i, ...patch } : i));
          const nextForStudent = { ...(s.studentPlannerItems[studentId] ?? {}), [date]: updatedList };
          studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: nextForStudent };
          return { ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: nextForStudent } };
        });

        const dbPatch: Partial<SbPlannerItemRow> = {};
        if ('material' in patch) dbPatch.material = patch.material;
        if ('pageRange' in patch) dbPatch.page_range = patch.pageRange;
        if ('status' in patch) dbPatch.status = patch.status;

        const { error } = await supabase.from('sb_planner_items').update(dbPatch).eq('id', id);
        if (error) {
          console.error('updateStudentPlannerItem failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async updateHomeworkAmountForDate(studentId, itemId, date, rangeId, newValue) {
        // 이 날짜의 항목은 입력한 그대로 저장한다(예: 아파서 4장만 했다 → "1~4페이지").
        await actions.updateStudentPlannerItem(studentId, date, itemId, { pageRange: newValue });

        // 페이지 범위로 등록된 교재라면, 오늘 입력한 값의 마지막 숫자를 "실제로 도달한 페이지"로 보고
        // 남은(아직 안 하고 완료도 아닌) 날짜들에 나머지 분량을 다시 나눠 담는다. 자유 입력(모의고사 등)
        // 범위거나 아예 범위에 연결되지 않은 항목이면 건드리지 않는다.
        if (!rangeId) return;
        const range = state.examSubjectRanges.find((r) => r.id === rangeId);
        if (!range) return;
        const totalMatch = range.rangeLabel.match(/^(\d+)~(\d+)페이지$/);
        if (!totalMatch) return;
        const totalEnd = Number(totalMatch[2]);

        const nums = newValue.match(/\d+/g);
        const endReached = nums && nums.length > 0 ? Number(nums[nums.length - 1]) : null;
        if (endReached === null || endReached >= totalEnd) return;

        const currentItems = studentPlannerItemsRef.current[studentId] ?? {};
        const futureItems = Object.values(currentItems)
          .flat()
          .filter((i) => i.examSubjectRangeId === rangeId && i.date > date && i.status !== 'completed');
        if (futureItems.length === 0) return;

        const futureDates = Array.from(new Set(futureItems.map((i) => i.date))).sort();
        const distribution = splitPagesAcrossDates(endReached + 1, totalEnd, futureDates);

        const updatedByDate: Record<DateKey, PlannerItem[]> = { ...currentItems };
        const dbUpdates: { id: string; pageRange: string }[] = [];
        for (const { date: futureDate, pageRange } of distribution) {
          updatedByDate[futureDate] = (updatedByDate[futureDate] ?? []).map((i) => {
            if (i.examSubjectRangeId === rangeId) {
              dbUpdates.push({ id: i.id, pageRange });
              return { ...i, pageRange };
            }
            return i;
          });
        }
        studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: updatedByDate };
        setState((s) => ({ ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: updatedByDate } }));

        const results = await Promise.all(
          dbUpdates.map(({ id, pageRange }) => supabase.from('sb_planner_items').update({ page_range: pageRange }).eq('id', id))
        );
        if (results.some((r) => r.error)) {
          console.error('updateHomeworkAmountForDate (redistribute) failed');
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async deleteStudentHomeworkItem(studentId, date, itemId) {
        // 홈/캘린더에서 그날 숙제 하나만 지운다. 진도관리의 등록 이력(assignedDates)에서도 그 날짜를
        // 빼서, 나중에 그 범위를 "수정"으로 열었을 때 이미 지운 날짜가 다시 나타나지 않게 한다.
        const previousItems = studentPlannerItemsRef.current[studentId]?.[date] ?? [];
        const item = previousItems.find((i) => i.id === itemId);
        if (!item) return;
        const previousRanges = state.examSubjectRanges;

        const nextForDate = previousItems.filter((i) => i.id !== itemId);
        const nextForStudent = { ...(studentPlannerItemsRef.current[studentId] ?? {}), [date]: nextForDate };
        studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: nextForStudent };
        setState((s) => ({
          ...s,
          studentPlannerItems: { ...s.studentPlannerItems, [studentId]: nextForStudent },
          examSubjectRanges: item.examSubjectRangeId
            ? s.examSubjectRanges.map((r) =>
                r.id === item.examSubjectRangeId ? { ...r, assignedDates: r.assignedDates.filter((d) => d !== date) } : r
              )
            : s.examSubjectRanges,
        }));

        const { error } = await supabase.from('sb_planner_items').delete().eq('id', itemId);
        if (error) {
          console.error('deleteStudentHomeworkItem failed:', error.message);
          studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: { ...studentPlannerItemsRef.current[studentId], [date]: previousItems } };
          setState((s) => ({
            ...s,
            studentPlannerItems: { ...s.studentPlannerItems, [studentId]: { ...s.studentPlannerItems[studentId], [date]: previousItems } },
            examSubjectRanges: previousRanges,
            error: WRITE_FAILURE_MESSAGE,
          }));
          return;
        }

        if (item.examSubjectRangeId) {
          const range = previousRanges.find((r) => r.id === item.examSubjectRangeId);
          if (range) {
            const { error: rangeError } = await supabase
              .from('sb_exam_subject_ranges')
              .update({ assigned_dates: range.assignedDates.filter((d) => d !== date) })
              .eq('id', range.id);
            if (rangeError) console.error('deleteStudentHomeworkItem (range update) failed:', rangeError.message);
          }
        }
      },

      async upsertTutoringSchedule(studentId, weekdays) {
        setState((s) => {
          const exists = s.tutoringSchedules.some((sch) => sch.studentId === studentId && sch.managerId === userId);
          const updated = exists
            ? s.tutoringSchedules.map((sch) =>
                sch.studentId === studentId && sch.managerId === userId ? { ...sch, weekdays, updatedAt: new Date().toISOString() } : sch
              )
            : [...s.tutoringSchedules, { id: uid(), studentId, managerId: userId, weekdays, updatedAt: new Date().toISOString() }];
          return { ...s, tutoringSchedules: updated };
        });

        const { error } = await supabase
          .from('sb_tutoring_schedules')
          .upsert({ student_id: studentId, manager_id: userId, weekdays }, { onConflict: 'student_id,manager_id' });
        if (error) {
          console.error('upsertTutoringSchedule failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async addTutoringException(studentId, exception) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullException: TutoringScheduleException = { id, studentId, managerId: userId, ...exception, createdAt };
        setState((s) => ({ ...s, tutoringScheduleExceptions: [...s.tutoringScheduleExceptions, fullException] }));

        const { error } = await supabase.from('sb_tutoring_schedule_exceptions').insert({
          student_id: studentId,
          manager_id: userId,
          original_date: exception.originalDate,
          new_date: exception.newDate,
          note: exception.note,
        });
        if (error) {
          console.error('addTutoringException failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async loadStudentPlannerItems(studentId) {
        const { data, error } = await supabase.from('sb_planner_items').select('*').eq('user_id', studentId).order('order');
        if (error) {
          console.error('loadStudentPlannerItems failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          return;
        }
        let grouped = groupByDate((data ?? []).map(plannerItemFromRow));

        // 밀린 숙제 자동 재분배: 매니저가 이 학생 화면을 열 때도 학생 본인이 열 때와 동일하게 계산한다.
        const studentRanges = state.examSubjectRanges.filter((r) => {
          const subject = state.examSubjects.find((s) => s.id === r.examSubjectId);
          const exam = subject ? state.examRecords.find((e) => e.id === subject.examId) : undefined;
          return exam?.studentId === studentId;
        });
        const updates = computeMissedHomeworkRedistribution(Object.values(grouped).flat(), studentRanges, todayKey());
        if (updates.length > 0) {
          const updatesById = new Map(updates.map((u) => [u.id, u.pageRange]));
          grouped = Object.fromEntries(
            Object.entries(grouped).map(([date, dateItems]) => [
              date,
              dateItems.map((i) => (updatesById.has(i.id) ? { ...i, pageRange: updatesById.get(i.id)! } : i)),
            ])
          );
          const results = await Promise.all(
            updates.map(({ id, pageRange }) => supabase.from('sb_planner_items').update({ page_range: pageRange }).eq('id', id))
          );
          const failed = results.filter((r) => r.error);
          if (failed.length > 0) {
            console.error('loadStudentPlannerItems (redistribute) failed:', failed.map((r) => r.error?.message));
            setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          }
        }

        studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: grouped };
        setState((s) => ({ ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: grouped } }));

        // 매니저가 이 학생 화면을 열 때도 그 학생의 허용앱 사용 구간을 불러온다. 부가 정보라
        // 실패해도 위에서 이미 반영된 학생 planner 로드를 막지 않는다.
        void this.loadAllowedAppIntervals(studentId);
      },

      // 숙제 미시작 알림 설정. 실패하면 이전 값(없었으면 없던 상태)으로 되돌린다 — 낙관적
      // 업데이트만 하고 롤백을 안 하면 매니저는 "9시로 바꿨다"고 믿는데 서버는 21시로 남는다.
      async upsertHomeworkReminderSetting(studentId, setting) {
        const previous = state.homeworkReminderSettings[studentId];
        const optimistic: HomeworkReminderSetting = { studentId, remindAt: setting.remindAt, enabled: setting.enabled };
        setState((s) => ({ ...s, homeworkReminderSettings: { ...s.homeworkReminderSettings, [studentId]: optimistic } }));

        const { error } = await supabase.from('sb_homework_reminder_settings').upsert(
          {
            student_id: studentId,
            remind_at: setting.remindAt,
            enabled: setting.enabled,
            updated_by: userId,
          },
          { onConflict: 'student_id' }
        );
        if (error) {
          console.error('upsertHomeworkReminderSetting failed:', error.message);
          setState((s) => {
            const next = { ...s.homeworkReminderSettings };
            if (previous) next[studentId] = previous;
            else delete next[studentId];
            return { ...s, homeworkReminderSettings: next, error: WRITE_FAILURE_MESSAGE };
          });
        }
      },

      async upsertSchoolTimetableSlot(weekday, period, subject) {
        const trimmed = subject.trim();
        if (!trimmed) {
          await actions.deleteSchoolTimetableSlot(
            state.schoolTimetable.find((slot) => slot.weekday === weekday && slot.period === period)?.id ?? ''
          );
          return;
        }
        const existing = state.schoolTimetable.find((slot) => slot.weekday === weekday && slot.period === period);
        const id = existing?.id ?? uid();
        const updatedAt = new Date().toISOString();
        const optimisticSlot: SchoolTimetableSlot = { id, studentId: userId, weekday, period, subject: trimmed, updatedAt };
        setState((s) => ({
          ...s,
          schoolTimetable: [...s.schoolTimetable.filter((slot) => slot.id !== id), optimisticSlot],
        }));
        const { error } = await supabase
          .from('sb_school_timetable_slots')
          .upsert({ id, student_id: userId, weekday, period, subject: trimmed }, { onConflict: 'student_id,weekday,period' });
        if (error) {
          console.error('upsertSchoolTimetableSlot failed:', error.message);
          setState((s) => ({
            ...s,
            schoolTimetable: existing ? [...s.schoolTimetable.filter((slot) => slot.id !== id), existing] : s.schoolTimetable.filter((slot) => slot.id !== id),
            error: WRITE_FAILURE_MESSAGE,
          }));
        }
      },

      async deleteSchoolTimetableSlot(slotId) {
        if (!slotId) return;
        const existing = state.schoolTimetable.find((slot) => slot.id === slotId);
        setState((s) => ({ ...s, schoolTimetable: s.schoolTimetable.filter((slot) => slot.id !== slotId) }));
        const { error } = await supabase.from('sb_school_timetable_slots').delete().eq('id', slotId);
        if (error) {
          console.error('deleteSchoolTimetableSlot failed:', error.message);
          if (existing) setState((s) => ({ ...s, schoolTimetable: [...s.schoolTimetable, existing], error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async loadStudentSchoolTimetable(studentId) {
        const { data, error } = await supabase.from('sb_school_timetable_slots').select('*').eq('student_id', studentId);
        if (error) {
          console.error('loadStudentSchoolTimetable failed:', error.message);
          return;
        }
        const slots = (data ?? []).map(schoolTimetableSlotFromRow);
        setState((s) => ({ ...s, studentSchoolTimetables: { ...s.studentSchoolTimetables, [studentId]: slots } }));
      },

      async loadAllowedAppIntervals(userId) {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
          .from('sb_allowed_app_intervals')
          .select('*')
          .eq('user_id', userId)
          .gte('started_at', dayStart.toISOString())
          .order('started_at');
        if (error) {
          console.error('loadAllowedAppIntervals failed:', error.message);
          return;
        }
        const intervals = (data ?? []).map(allowedAppIntervalFromRow);
        setState((s) => ({ ...s, allowedAppIntervals: { ...s.allowedAppIntervals, [userId]: intervals } }));
      },

      async recordAllowedAppIntervals(rows) {
        if (rows.length === 0) return;
        // (user_id, started_at) unique 인덱스 덕분에 같은 구간을 다시 보내도 행이 늘지 않는다.
        // 전송 성공 후 네이티브 목록 비우기가 실패하면 다음 실행이 또 보내기 때문에 필요하다.
        const { error } = await supabase
          .from('sb_allowed_app_intervals')
          .upsert(rows, { onConflict: 'user_id,started_at', ignoreDuplicates: true });
        if (error) {
          console.error('recordAllowedAppIntervals failed:', error.message);
          throw new Error(error.message);
        }
      },

      dismissError() {
        setState((s) => ({ ...s, error: null }));
      },
    }),
    [userId, state]
  );

  // 지연 숙제 생성: 학생 본인 계정에서만, 오늘 아직 생성되지 않은 숙제 배정 건에 대해
  // 오늘 날짜 planner item을 만든다. `loadAll`이 끝난 뒤(profile/homeworkAssignments/plannerItems가
  // 채워진 뒤) 실행되어야 하므로 별도 useEffect로 둔다 — 매 렌더마다 재평가되지만, 이미 생성된
  // 배정은 alreadyGenerated로 걸러지므로 중복 insert는 발생하지 않는다.
  React.useEffect(() => {
    if (state.loading || !state.profile || state.profile.role !== 'student') return;
    const today = todayKey();
    const todayItems = state.plannerItems[today] ?? [];
    const alreadyGenerated = new Set(
      todayItems.filter((item) => item.source === 'homework' && item.homeworkAssignmentId).map((item) => item.homeworkAssignmentId)
    );
    const toGenerate = state.homeworkAssignments.filter(
      (assignment) => shouldGenerateHomeworkItem(assignment, today) && !alreadyGenerated.has(assignment.id)
    );
    toGenerate.forEach((assignment) => {
      actions.addPlannerItem(today, {
        date: today,
        subjectId: assignment.subjectId,
        startTime: '09:00',
        studyType: null,
        material: assignment.material,
        unit: '',
        pageRange: assignment.amountPerDay,
        endTime: null,
        difficulty: null,
        restPattern: null,
        mustDo: false,
        status: 'planned',
        actualMinutes: null,
        understanding: null,
        partialReason: null,
        incompleteReason: null,
        source: 'homework',
        homeworkAssignmentId: assignment.id,
        examSubjectRangeId: null,
      });
    });
  }, [state.loading, state.profile, state.plannerItems, state.homeworkAssignments, actions]);

  // 밀린 숙제 자동 재분배: 학생 본인 계정에서, 과거 날짜에 놓친 페이지 범위 숙제가 있으면 남은
  // 분량을 오늘/미래 날짜에 자동으로 다시 나눠 담는다. 계산 결과가 기존과 같으면(이미 반영됨)
  // updates가 비어 있어 아무 것도 쓰지 않는다 — 매 렌더마다 돌아도 안전하다.
  React.useEffect(() => {
    if (state.loading || !state.profile || state.profile.role !== 'student') return;
    const items = Object.values(state.plannerItems).flat();
    const updates = computeMissedHomeworkRedistribution(items, state.examSubjectRanges, todayKey());
    if (updates.length === 0) return;

    const updatesById = new Map(updates.map((u) => [u.id, u.pageRange]));
    // nextPlannerItems must be derived inside the functional updater from the fresh `s`, not the
    // outer `state.plannerItems` closure — this effect can land in the same passive-effect flush
    // as the "지연 숙제 생성" effect above (which calls addPlannerItem with a functional updater).
    // Reading the outer closure here would let this wholesale replacement silently discard a
    // homework item that effect just added, causing it to look "not yet generated" on the next
    // run and get re-inserted as a duplicate DB row.
    setState((s) => {
      const nextPlannerItems: Record<DateKey, PlannerItem[]> = {};
      for (const [date, dateItems] of Object.entries(s.plannerItems)) {
        nextPlannerItems[date] = dateItems.map((i) => (updatesById.has(i.id) ? { ...i, pageRange: updatesById.get(i.id)! } : i));
      }
      return { ...s, plannerItems: nextPlannerItems };
    });

    Promise.all(
      updates.map(({ id, pageRange }) => supabase.from('sb_planner_items').update({ page_range: pageRange }).eq('id', id))
    ).then((results) => {
      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        console.error('missed-homework redistribute failed:', failed.map((r) => r.error?.message));
        setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading, state.profile, state.plannerItems, state.examSubjectRanges]);

  return <AppStateContext.Provider value={{ state, actions }}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
