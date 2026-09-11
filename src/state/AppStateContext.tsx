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
  dayStartOf,
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
import {
  track,
  setCommonProperties,
  setUserProperties,
  incrementUserProperty,
  applySessionReplayPolicy,
  APP_PLATFORM,
} from '../lib/analytics';

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
  // 초기 로드가 실패했다. `profile === null`만으로는 "아직 온보딩을 안 했다"와 구별할 수 없어서
  // 따로 둔다 — 구별하지 않으면 네트워크가 잠깐 끊긴 기존 사용자에게 온보딩 화면이 뜨고,
  // 그걸 끝내면 초대코드가 재발급되고 과목 색이 초기화되고 역할까지 바뀔 수 있다.
  loadFailed: boolean;
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
  loadFailed: false,
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
  /** 연결에 성공했는지. 실패하면 입력한 초대코드를 지우지 말 것. */
  linkByInviteCode: (code: string) => Promise<boolean>;
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
  /** 제안을 보냈는지. 실패하면 시트를 닫지 말 것 — 교재·범위를 다시 타이핑해야 한다. */
  createHomeworkProposal: (
    studentId: string,
    proposal: { date: DateKey; subjectId: SubjectId; material: string; pageRange: string }
  ) => Promise<boolean>;
  respondToHomeworkProposal: (proposalId: string, accept: boolean) => Promise<void>;
  loadSentHomeworkProposals: (studentId: string) => Promise<void>;
  /** 만들어진 시험 id. **실패하면 null** — 호출부는 폼을 닫기 전에 반드시 확인할 것. */
  createExamRecord: (studentId: string, exam: { title: string; examDate: string; isMain: boolean }) => Promise<string | null>;
  deleteExamRecord: (studentId: string, examId: string) => Promise<void>;
  addExamSubject: (examId: string, subject: { subjectId: SubjectId; targetGrade: string; targetScore: string; targetRank: string }) => Promise<void>;
  deleteExamSubject: (studentId: string, examId: string, subjectId: string) => Promise<void>;
  // 아래 셋은 **저장에 성공했는지**를 돌려준다. 시트를 닫거나 입력을 비우기 전에 확인할 것 —
  // 실패했는데 닫아버리면 사용자가 방금 친 내용을 통째로 다시 입력해야 한다.
  registerHomeworkRange: (
    studentId: string,
    examSubjectId: string,
    params: { subjectId: SubjectId; material: string; selectedDates: DateKey[] } & HomeworkScope
  ) => Promise<boolean>;
  updateHomeworkRange: (
    studentId: string,
    rangeId: string,
    params: { material: string; selectedDates: DateKey[] } & HomeworkScope
  ) => Promise<boolean>;
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
  // 초기 로드가 실패했을 때(loadFailed) 다시 시도한다. 실패 화면의 버튼이 부른다.
  retryInitialLoad: () => void;
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

// 학습 세션 이벤트에 과목·출처를 붙이려면 plannerItemId로 항목을 되찾아야 한다. 방금 낙관적으로
// 추가된 항목도 찾을 수 있도록 state가 아니라 ref(plannerItemsRef)를 넘겨 쓴다.
function findPlannerItem(byDate: Record<DateKey, PlannerItem[]>, id: string): PlannerItem | undefined {
  for (const date in byDate) {
    const found = byDate[date].find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
}

function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

// 오늘 기준 며칠 뒤인지. 오늘이면 0, 어제면 -1. "계획을 며칠 앞서 세우는가"를 보려고 쓴다.
function dayOffsetFromToday(date: DateKey): number {
  return daysBetween(todayKey(), date);
}

// 프로필·연결 정보가 바뀔 때마다 user property를 현재 상태로 맞춘다. 이벤트마다 같은 값을
// 실어 보내는 대신 여기 한 곳에서만 갱신한다.
function syncUserProperties(state: AppState): void {
  const profile = state.profile;
  if (!profile) return;
  setCommonProperties({ role: profile.role, is_onboarded: Boolean(profile.onboardedAt) });
  // 역할이 확정되는 지점이 여기뿐이라, 세션 리플레이 허용 여부도 같이 정한다.
  applySessionReplayPolicy(profile.role);
  setUserProperties({
    role: profile.role,
    is_onboarded: Boolean(profile.onboardedAt),
    onboarded_at: profile.onboardedAt ?? undefined,
    grade: profile.grade ?? undefined,
    main_subjects: profile.mainSubjects ?? undefined,
    main_subject_count: profile.mainSubjects?.length,
    has_goal: Boolean(profile.goal && profile.goal.trim()),
    has_workbooks: Boolean(profile.workbooks && profile.workbooks.trim()),
    main_exam_date: profile.examDate ?? undefined,
    linked_manager_count: state.linkedManagers.length,
    managed_student_count: state.managedStudents.length,
    app_platform: APP_PLATFORM,
  });
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

  // **네 조회 모두 실패를 던진다.** 예전에는 `.data`만 보고 실패를 무시했다. 그러면
  // ① 프로필 조회가 실패하면 profile=null이 되어 기존 사용자가 온보딩 화면으로 떨어지고,
  // ② 나머지가 실패하면 학생에게 "숙제가 사라진" 빈 화면이 보인다 — 둘 다 사용자가
  // 잘못된 상태를 기준으로 다음 행동을 하게 만든다(온보딩 재작성, 숙제 재생성).
  // 던진 예외는 AppStateProvider가 loadFailed로 받아 재시도 화면을 띄운다.
  if (profileRes.error) throw profileRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (homeworkRes.error) throw homeworkRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

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
    loadFailed: false,
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

  // 재시도 버튼이 초기 로드를 다시 돌리게 하는 카운터. 값이 바뀌면 아래 effect가 다시 뛴다.
  const [reloadNonce, setReloadNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    // 재시도로 다시 들어올 때는 로딩 상태로 되돌려야 한다 — 그러지 않으면 실패 화면이
    // 그대로 남아 눌러도 아무 일도 안 하는 것처럼 보인다.
    setState((s) => (s.loadFailed ? { ...s, loading: true, loadFailed: false, error: null } : s));
    loadAll(userId)
      .then((loaded) => {
        if (!cancelled) setState(loaded);
        // 로그인 직후 본인 허용앱 사용 구간도 불러온다. loadAll 자체엔 안 넣는다 — 부가 정보라
        // 실패해도 나머지 로드를 막으면 안 된다.
        void actions.loadAllowedAppIntervals(userId);
      })
      .catch((err) => {
        // 여기서 잡지 않으면 unhandled rejection이 되고 loading이 true에 영구히 머물러
        // "불러오는 중..."에서 멈춘다. 온보딩으로 떨어뜨리지 않는 것이 핵심이다.
        console.error('loadAll failed:', err);
        if (!cancelled) setState((s) => ({ ...s, loading: false, loadFailed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadNonce]);

  // 프로필이 들어오거나 연결 관계가 바뀔 때마다 user property를 다시 맞춘다. 온보딩 직후
  // saveProfile로 프로필이 세팅되는 경로도 여기로 흡수된다.
  React.useEffect(() => {
    syncUserProperties(state);
  }, [state.profile, state.linkedManagers, state.managedStudents]);

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
          // **낙관적으로 넣은 항목을 ref와 state 양쪽에서 되돌린다.** 되돌리지 않으면 DB에는
          // 없는 유령 항목이 화면에 남는데, 그 대가가 크다:
          //  - 지연 숙제 생성 이펙트가 이 항목을 보고 "이미 만들었다"고 판단해 같은 세션에서
          //    재시도를 막는다(그래서 실패가 조용히 굳는다).
          //  - 학생이 그 항목을 완료 체크하면 update가 0행에 걸리는데 PostgREST는 이걸 오류로
          //    주지 않는다. 화면은 완료로 바뀌고 **선생님에게 "숙제를 완료했어요" 알림까지 간다** —
          //    존재하지 않는 숙제에 대해서.
          console.error('addPlannerItem failed:', error.message);
          plannerItemsRef.current = {
            ...plannerItemsRef.current,
            [date]: (plannerItemsRef.current[date] ?? []).filter((i) => i.id !== id),
          };
          setState((s) => ({
            ...s,
            plannerItems: { ...s.plannerItems, [date]: (s.plannerItems[date] ?? []).filter((i) => i.id !== id) },
            error: WRITE_FAILURE_MESSAGE,
          }));
          return;
        }

        track('Created Planner Item', {
          subject_id: fullItem.subjectId,
          source: fullItem.source,
          is_must_do: fullItem.mustDo,
          has_page_range: Boolean(fullItem.pageRange),
          day_offset: dayOffsetFromToday(date),
        });
        incrementUserProperty('planner_items_created');

        if (fullItem.source === 'self') {
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
          // 되돌리지 않으면 **학생이 완료 체크한 숙제가 화면에만 남고 DB에는 안 들어간다.**
          // 이 앱에서 제일 중요한 기록이고, 학생은 다음에 앱을 열었을 때 체크가 사라진 것을 보고
          // "했는데 없어졌다"고 겪는다. previousItem은 지금까지 추적 이벤트용으로만 쓰였다.
          console.error('updatePlannerItem failed:', error.message);
          setState((s) => ({
            ...s,
            plannerItems: previousItem
              ? { ...s.plannerItems, [date]: (s.plannerItems[date] ?? []).map((i) => (i.id === id ? previousItem : i)) }
              : s.plannerItems,
            error: WRITE_FAILURE_MESSAGE,
          }));
        } else if (patch.status === 'completed' && previousItem && previousItem.status !== 'completed') {
          track('Completed Planner Item', {
            subject_id: previousItem.subjectId,
            source: previousItem.source,
            is_must_do: previousItem.mustDo,
            actual_minutes: patch.actualMinutes ?? previousItem.actualMinutes ?? undefined,
            understanding: patch.understanding ?? previousItem.understanding ?? undefined,
            day_offset: dayOffsetFromToday(date),
          });
          if (previousItem.source === 'homework') incrementUserProperty('homework_completed_count');

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

        // **한 트랜잭션으로 보낸다**(0027 마이그레이션). 예전에는 update와 insert를 따로 보냈고,
        // update가 실패해도 멈추지 않고 insert를 이어서 보냈다. 그래서 한쪽만 성공하면
        //   - update 실패 + insert 성공 → 숙제가 중복되고
        //   - update 성공 + insert 실패 → **새로고침하면 숙제가 사라졌다**
        // 두 번째는 학생이 숙제를 잃는데 선생님 화면에는 "이월함"으로 보여 아무도 못 알아챈다.
        const { error } = await supabase.rpc('carry_over_planner_item', {
          source_item_id: id,
          target_item_id: cloneId,
          target_date: tomorrowKey,
          target_order: order,
        });
        if (error) {
          // 실패하면 낙관적 반영을 되돌린다. 이월은 "오늘 것을 내일로 옮긴다"라 화면 두 곳이
          // 함께 바뀌므로, 한 곳만 되돌리면 오늘과 내일이 어긋난 채 남는다.
          console.error('carryOverPlannerItem failed:', error.message);
          setState((s) => ({
            ...s,
            plannerItems: { ...s.plannerItems, [date]: todayList, [tomorrowKey]: tomorrowList },
            error: WRITE_FAILURE_MESSAGE,
          }));
          return;
        }

        track('Carried Over Planner Item', {
          subject_id: source.subjectId,
          source: source.source,
          day_offset: dayOffsetFromToday(date),
        });
      },

      async linkByInviteCode(code) {
        // 조회와 링크 생성을 **한 RPC 안에서** 한다(0026 마이그레이션). 예전에는
        // find_student_by_invite_code로 id를 받은 뒤 클라이언트가 직접 insert했는데, 그 insert
        // 정책이 `auth.uid() = manager_id`만 봐서 **초대코드를 몰라도 학생 UUID만 알면 링크를
        // 만들 수 있었다.** 코드 검증과 insert가 떨어져 있으면 검증을 건너뛴 경로가 생긴다.
        const { data: studentId, error } = await supabase.rpc('link_student_by_invite_code', {
          code: code.trim().toUpperCase(),
        });
        if (error) {
          // RPC는 코드를 못 찾으면 예외를 던진다 — 네트워크 실패와 구별해서 보여준다.
          const notFound = error.message.includes('초대코드를 찾을 수 없습니다');
          console.error('linkByInviteCode failed:', error.message);
          setState((s) => ({ ...s, error: notFound ? '초대코드를 찾을 수 없어요. 다시 확인해주세요.' : WRITE_FAILURE_MESSAGE }));
          track('Linked Account', { result: notFound ? 'code_not_found' : 'link_failed' });
          return false;
        }
        if (!studentId) {
          setState((s) => ({ ...s, error: '초대코드를 찾을 수 없어요. 다시 확인해주세요.' }));
          track('Linked Account', { result: 'code_not_found' });
          return false;
        }
        // 연결 직후 학생 목록을 다시 불러와야 관리자 화면에 바로 나타난다.
        const managedStudents = await fetchManagedStudents(userId);
        setState((s) => ({ ...s, managedStudents }));
        track('Linked Account', { result: 'success', managed_student_count: managedStudents.length });
        return true;
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
          track('Created Homework Assignment', {
            subject_id: assignment.subjectId,
            amount_per_day: assignment.amountPerDay,
            span_days: daysBetween(assignment.startDate, assignment.endDate) + 1,
            starts_in_days: dayOffsetFromToday(assignment.startDate),
          });
          notifyUser(studentId, '숙제가 등록됐어요', assignment.material ? `${assignment.material} 숙제가 새로 등록됐어요` : '새 숙제가 등록됐어요');
        }
      },

      async updateHomeworkAssignment(id, patch) {
        const previousAssignment = state.homeworkAssignments.find((a) => a.id === id);
        const studentId = previousAssignment?.studentId;
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
          // 되돌리지 않으면 선생님 화면에는 고친 숙제가, DB에는 옛 숙제가 남는다.
          // 선생님은 "10쪽으로 바꿨다"고 믿고 학생은 옛 내용을 본다.
          console.error('updateHomeworkAssignment failed:', error.message);
          setState((s) => ({
            ...s,
            homeworkAssignments: previousAssignment ? s.homeworkAssignments.map((a) => (a.id === id ? previousAssignment : a)) : s.homeworkAssignments,
            error: WRITE_FAILURE_MESSAGE,
          }));
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

        const item = findPlannerItem(plannerItemsRef.current, plannerItemId);
        track('Started Study Session', { subject_id: item?.subjectId, source: item?.source, is_must_do: item?.mustDo });
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
          return;
        }

        const item = findPlannerItem(plannerItemsRef.current, plannerItemId);
        track('Ended Study Session', {
          subject_id: item?.subjectId,
          source: item?.source,
          duration_seconds: durationSeconds ?? undefined,
          // 화면에서 정지를 누른 경우에만 displayedSeconds가 넘어온다. 없으면 앱을 벗어나서
          // 자동으로 끝난 세션이다 — 이 구분이 "타이머를 켜두고 딴짓" 패턴을 잡아준다.
          ended_reason: displayedSeconds === undefined ? 'auto' : 'manual',
        });
        incrementUserProperty('total_study_sessions');
        if (durationSeconds) incrementUserProperty('total_study_minutes', Math.round(durationSeconds / 60));
        setUserProperties({ last_study_session_at: endedAt });
      },

      // 별칭 두 액션은 실패해도 되돌리지 않으면 화면에만 새 이름이 남는다. 다음에 앱을 열면
      // 옛 이름으로 돌아가 있어서 "바꿨는데 안 바뀌었다"가 된다. 키가 없던 상태(기본 이름)와
      // 값이 있던 상태를 구별해야 하므로, 없었으면 키를 지워서 되돌린다.
      async updateStudentLabel(studentId, label) {
        const hadPrevious = studentId in state.studentLabels;
        const previousLabel = state.studentLabels[studentId];
        setState((s) => ({ ...s, studentLabels: { ...s.studentLabels, [studentId]: label } }));
        const { error } = await supabase
          .from('sb_student_manager_links')
          .update({ label })
          .eq('student_id', studentId)
          .eq('manager_id', userId);
        if (error) {
          console.error('updateStudentLabel failed:', error.message);
          setState((s) => {
            const next = { ...s.studentLabels };
            if (hadPrevious) next[studentId] = previousLabel;
            else delete next[studentId];
            return { ...s, studentLabels: next, error: WRITE_FAILURE_MESSAGE };
          });
        }
      },

      async updateManagerLabel(managerId, label) {
        const hadPrevious = managerId in state.managerLabels;
        const previousLabel = state.managerLabels[managerId];
        setState((s) => ({ ...s, managerLabels: { ...s.managerLabels, [managerId]: label } }));
        const { error } = await supabase
          .from('sb_student_manager_links')
          .update({ student_label: label })
          .eq('manager_id', managerId)
          .eq('student_id', userId);
        if (error) {
          console.error('updateManagerLabel failed:', error.message);
          setState((s) => {
            const next = { ...s.managerLabels };
            if (hadPrevious) next[managerId] = previousLabel;
            else delete next[managerId];
            return { ...s, managerLabels: next, error: WRITE_FAILURE_MESSAGE };
          });
        }
      },

      async registerDeviceToken(token) {
        // updated_at을 명시적으로 넣는다. 컬럼 기본값 now()는 INSERT에만 걸리고 트리거도 없어서,
        // 예전에는 같은 기기가 앱을 다시 켜도(같은 FCM 토큰 → 충돌 → UPDATE) 값이 처음 등록
        // 시각에 멈춰 있었다. 그래서 "이 기기가 마지막으로 서버에 붙은 게 언제냐"를 알 방법이
        // 없었다 — 2026-09-09에 키를 갈면서 "학생이 새 APK를 깔았는지"를 확인해야 했는데 이 값이
        // 죽어 있어 확인이 불가능했다. 앱을 켤 때마다 갱신되므로 그 자체가 최근 접속 신호가 된다.
        const { error } = await supabase
          .from('sb_device_tokens')
          .upsert(
            { user_id: userId, fcm_token: token, platform: 'android', updated_at: new Date().toISOString() },
            { onConflict: 'user_id,fcm_token' }
          );
        if (error) {
          console.error('registerDeviceToken failed:', error.message);
          return;
        }
        // 이벤트로 남기지 않는다 — 앱을 켤 때마다 불려서 노이즈만 된다. "푸시를 받을 수 있는
        // 사용자"인지만 user property로 남기면 리텐션 분석에 필요한 건 다 된다.
        setUserProperties({ push_enabled: true });
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
          return false;
        }

        track('Sent Homework Proposal', {
          subject_id: proposal.subjectId,
          has_page_range: Boolean(proposal.pageRange),
          day_offset: dayOffsetFromToday(proposal.date),
        });
        notifyUser(studentId, '숙제 제안이 왔어요', proposal.material ? `${proposal.material} 숙제를 제안했어요. 확인해보세요` : '새 숙제를 제안했어요');
        return true;
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

        track('Responded To Homework Proposal', {
          response: accept ? 'accepted' : 'rejected',
          subject_id: proposal.subjectId,
          // 제안이 온 지 얼마나 지나서 답했는지. 낮으면 알림이 실제로 먹힌다는 뜻이다.
          hours_to_respond: Math.round((Date.now() - Date.parse(proposal.createdAt)) / 3_600_000),
        });

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
          // 되돌리지 않으면 DB에 없는 시험이 목록에 남고, 호출부가 그 id를 선택한다.
          // 선생님이 그 시험 아래에 과목·교재 범위를 넣으면 전부 외래키 위반으로 실패한다 —
          // "시험은 보이는데 아무것도 등록이 안 되는" 상태가 된다.
          // null을 돌려줘서 호출부가 폼을 닫지 않고 다시 시도할 수 있게 한다.
          console.error('createExamRecord failed:', error.message);
          setState((s) => ({ ...s, examRecords: s.examRecords.filter((e) => e.id !== id), error: WRITE_FAILURE_MESSAGE }));
          return null;
        }
        track('Created Exam Record', { is_main: exam.isMain, days_until_exam: dayOffsetFromToday(exam.examDate) });
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
        // 실패했을 때 되돌릴 기준점. 이 액션은 서로 다른 두 테이블에 연달아 쓰기 때문에
        // 중간에서 실패하면 화면과 DB가 갈라진다 — 아래 두 실패 경로에서 모두 여기로 되돌린다.
        const previousRanges = state.examSubjectRanges;
        const previousStudentItems = studentPlannerItemsRef.current[studentId] ?? {};

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
          setState((s) => ({ ...s, examSubjectRanges: previousRanges, error: WRITE_FAILURE_MESSAGE }));
          return false;
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
          // 범위 행은 이미 들어갔는데 날짜별 숙제가 안 들어간 상태다. 그대로 두면 **선생님은
          // "시험 범위를 배정했다"고 믿는데 학생 화면에는 숙제가 하나도 없다** — 갈라진 채로
          // 아무도 모른다. 방금 만든 범위를 지워서 "배정 안 됨"으로 되돌린다.
          console.error('registerHomeworkRange (items) failed:', itemsError.message);
          const { error: cleanupError } = await supabase.from('sb_exam_subject_ranges').delete().eq('id', rangeId);
          if (cleanupError) {
            // 보상 삭제까지 실패하면 고아 범위가 남는다. 화면은 되돌리되 로그는 남겨 둔다.
            console.error('registerHomeworkRange (range cleanup) failed:', cleanupError.message);
          }
          studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: previousStudentItems };
          setState((s) => ({
            ...s,
            examSubjectRanges: previousRanges,
            studentPlannerItems: { ...s.studentPlannerItems, [studentId]: previousStudentItems },
            error: WRITE_FAILURE_MESSAGE,
          }));
          return false;
        }

        track('Registered Homework Range', {
          subject_id: params.subjectId,
          mode: params.mode,
          date_count: selectedDates.length,
          // 자유 입력 모드는 페이지 수를 알 수 없다 — 그때는 아예 안 붙인다.
          page_count: params.mode === 'pages' ? params.endPage - params.startPage + 1 : undefined,
        });
        notifyUser(studentId, '숙제가 등록됐어요', params.material ? `${params.material} 숙제가 새로 등록됐어요` : '새 숙제가 등록됐어요');
        return true;
      },

      async updateHomeworkRange(studentId, rangeId, params) {
        // 이미 지난 날짜거나 학생이 완료 처리한 항목은 절대 건드리지 않는다("과거는 보존, 이후만
        // 반영" — 기존 숙제 등록 기능과 같은 원칙). 잠긴 날짜를 제외한 나머지만 지우고 새로 등록한다.
        const today = todayKey();
        const currentByDate = studentPlannerItemsRef.current[studentId] ?? {};
        const linkedItems = Object.values(currentByDate)
          .flat()
          .filter((i) => i.examSubjectRangeId === rangeId);
        // 고칠 항목이 하나도 없으면 할 일이 없다. 실패는 아니므로 폼은 닫아준다.
        if (linkedItems.length === 0) return true;
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
          return false;
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

        // 아래 두 쓰기는 실패해도 계속 진행한다 — 범위 행은 이미 갱신됐고, 여기서 멈추면
        // 날짜 목록과 숙제 항목이 더 크게 어긋난다. 다만 하나라도 실패하면 호출부에
        // 실패를 알려서 수정 폼이 닫히지 않게 한다.
        let allWritesOk = true;

        if (removable.length > 0) {
          const { error: deleteError } = await supabase
            .from('sb_planner_items')
            .delete()
            .in('id', removable.map((i) => i.id));
          if (deleteError) {
            console.error('updateHomeworkRange (delete) failed:', deleteError.message);
            setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
            allWritesOk = false;
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
            allWritesOk = false;
          }
        }
        // 알림은 실제로 뭔가 바뀐 경우에만 보낸다 — 전부 실패했는데 "숙제 내용이 바뀌었어요"가
        // 가면 학생이 열어봐도 달라진 게 없다.
        if (allWritesOk) {
          notifyUser(studentId, '숙제 내용이 바뀌었어요', '숙제 내용이 수정됐어요. 확인해보세요');
        }
        return allWritesOk;
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
        // 되돌릴 기준점. ref와 state 둘 다 갱신하는 액션이라 실패 시 양쪽을 같이 복구해야 한다.
        const previousForStudent = studentPlannerItemsRef.current[studentId] ?? {};
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
          // 선생님이 학생 숙제를 고치는 경로다. 되돌리지 않으면 선생님 화면에만 바뀐 내용이
          // 남고 학생은 옛 숙제를 본다 — 둘이 다른 숙제를 보고 있는 줄 아무도 모른다.
          console.error('updateStudentPlannerItem failed:', error.message);
          studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: previousForStudent };
          setState((s) => ({
            ...s,
            studentPlannerItems: { ...s.studentPlannerItems, [studentId]: previousForStudent },
            error: WRITE_FAILURE_MESSAGE,
          }));
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
        const previousSchedules = state.tutoringSchedules;
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
          // 과외 요일은 캘린더 표시와 숙제 배정 날짜 계산에 함께 쓰인다. 화면에만 바뀐 요일이
          // 남으면 선생님이 없는 요일에 숙제를 배정하게 된다.
          console.error('upsertTutoringSchedule failed:', error.message);
          setState((s) => ({ ...s, tutoringSchedules: previousSchedules, error: WRITE_FAILURE_MESSAGE }));
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
          // 되돌리지 않으면 DB에 없는 보강 일정이 캘린더에 남는다. 선생님은 날짜를 옮겼다고
          // 믿는데 학생 화면에는 원래 날짜가 그대로다.
          console.error('addTutoringException failed:', error.message);
          setState((s) => ({ ...s, tutoringScheduleExceptions: s.tutoringScheduleExceptions.filter((e) => e.id !== id), error: WRITE_FAILURE_MESSAGE }));
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
        // 하루 경계는 자정이 아니라 새벽 4시다(lib.ts의 DAY_ROLLOVER_HOUR). 여기가 자정으로
        // 남아 있으면 밤 12시를 넘긴 순간 허용앱 사용시간만 0으로 돌아가, 같은 화면에서
        // 숙제는 어제 것이 보이는데 사용시간은 초기화된 상태가 된다.
        const dayStart = dayStartOf(new Date());
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

      retryInitialLoad() {
        setReloadNonce((n) => n + 1);
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
