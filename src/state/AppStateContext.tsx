import React from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { uid, addDaysToKey, todayKey, shouldGenerateHomeworkItem, splitPagesAcrossDates } from '../lib';
import {
  profileFromRow,
  conditionFromRow,
  scheduleBlockFromRow,
  plannerItemFromRow,
  studyLogFromRow,
  studyMaterialFromRow,
  homeworkAssignmentFromRow,
  studySessionFromRow,
  groupByDate,
  examRecordFromRow,
  examSubjectFromRow,
  examSubjectRangeFromRow,
  tutoringScheduleFromRow,
  tutoringScheduleExceptionFromRow,
} from './mappers';
import type {
  Profile,
  DailyCondition,
  ScheduleBlock,
  PlannerItem,
  StudyLogEntry,
  StudyMaterial,
  HomeworkAssignment,
  StudySession,
  DateKey,
  TomorrowRecommendationItem,
  ExamRecord,
  ExamSubject,
  ExamSubjectRange,
  TutoringSchedule,
  TutoringScheduleException,
  SubjectId,
} from '../types';
import type { SbPlannerItemRow, SbStudyMaterialRow, SbProfileRow, SbHomeworkAssignmentRow } from '../types/db';

interface AppState {
  profile: Profile | null;
  conditions: Record<DateKey, DailyCondition>;
  scheduleBlocks: Record<DateKey, ScheduleBlock[]>;
  plannerItems: Record<DateKey, PlannerItem[]>;
  studyLogs: Record<DateKey, StudyLogEntry[]>;
  studyMaterials: StudyMaterial[];
  homeworkAssignments: HomeworkAssignment[];
  studySessions: Record<string, StudySession[]>;
  managedStudents: Profile[];
  examRecords: ExamRecord[];
  examSubjects: ExamSubject[];
  examSubjectRanges: ExamSubjectRange[];
  tutoringSchedules: TutoringSchedule[];
  tutoringScheduleExceptions: TutoringScheduleException[];
  studentLabels: Record<string, string>;
  studentPlannerItems: Record<string, Record<DateKey, PlannerItem[]>>;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE: AppState = {
  profile: null,
  conditions: {},
  scheduleBlocks: {},
  plannerItems: {},
  studyLogs: {},
  studyMaterials: [],
  homeworkAssignments: [],
  studySessions: {},
  managedStudents: [],
  examRecords: [],
  examSubjects: [],
  examSubjectRanges: [],
  tutoringSchedules: [],
  tutoringScheduleExceptions: [],
  studentLabels: {},
  studentPlannerItems: {},
  loading: true,
  error: null,
};

const WRITE_FAILURE_MESSAGE = '저장하지 못했어요. 다시 시도해주세요.';

// 숙제 범위는 대부분 "몇 페이지부터 몇 페이지"지만, 모의고사처럼 페이지 단위가 아닌 학습도 있다.
// mode: 'pages'면 날짜별로 자동 분배(splitPagesAcrossDates), 'custom'이면 선택한 모든 날짜에
// customLabel을 그대로 반복해서 넣는다(분배 없음 — 관리자가 직접 쓴 문구 그대로).
type HomeworkScope = { mode: 'pages'; startPage: number; endPage: number } | { mode: 'custom'; customLabel: string };

interface AppStateActions {
  saveProfile: (profile: Profile) => Promise<void>;
  saveCondition: (date: DateKey, condition: DailyCondition) => Promise<void>;
  upsertScheduleBlock: (date: DateKey, block: ScheduleBlock) => Promise<void>;
  deleteScheduleBlock: (date: DateKey, id: string) => Promise<void>;
  addPlannerItem: (date: DateKey, item: Omit<PlannerItem, 'id' | 'order'>) => Promise<void>;
  updatePlannerItem: (date: DateKey, id: string, patch: Partial<PlannerItem>) => Promise<void>;
  deletePlannerItem: (date: DateKey, id: string) => Promise<void>;
  carryOverPlannerItem: (date: DateKey, id: string) => Promise<void>;
  addStudyLog: (date: DateKey, entry: Omit<StudyLogEntry, 'id'>) => Promise<void>;
  addStudyMaterial: (material: Omit<StudyMaterial, 'id' | 'createdAt'>) => Promise<void>;
  updateStudyMaterial: (id: string, patch: Partial<StudyMaterial>) => Promise<void>;
  deleteStudyMaterial: (id: string) => Promise<void>;
  applyTomorrowRecommendation: (date: DateKey, items: TomorrowRecommendationItem[]) => Promise<void>;
  linkByInviteCode: (code: string) => Promise<void>;
  createHomeworkAssignment: (
    studentId: string,
    assignment: Omit<HomeworkAssignment, 'id' | 'studentId' | 'createdBy' | 'updatedAt'>
  ) => Promise<void>;
  updateHomeworkAssignment: (id: string, patch: Partial<HomeworkAssignment>) => Promise<void>;
  startStudySession: (plannerItemId: string) => Promise<string>;
  endStudySession: (plannerItemId: string, sessionId: string, deviated: boolean) => Promise<void>;
  updateStudentLabel: (studentId: string, label: string) => Promise<void>;
  createExamRecord: (studentId: string, exam: { title: string; examDate: string; isMain: boolean }) => Promise<string>;
  addExamSubject: (examId: string, subject: { subjectId: SubjectId; targetGrade: string; targetScore: string; targetRank: string }) => Promise<void>;
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
  upsertTutoringSchedule: (studentId: string, weekdays: number[]) => Promise<void>;
  addTutoringException: (studentId: string, exception: { originalDate: DateKey; newDate: DateKey | null; note: string }) => Promise<void>;
  loadStudentPlannerItems: (studentId: string) => Promise<void>;
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

async function loadAll(userId: string): Promise<AppState> {
  const [profileRes, conditionsRes, blocksRes, itemsRes, logsRes, materialsRes, homeworkRes, sessionsRes] = await Promise.all([
    supabase.from('sb_profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('sb_daily_conditions').select('*').eq('user_id', userId),
    supabase.from('sb_schedule_blocks').select('*').eq('user_id', userId),
    supabase.from('sb_planner_items').select('*').eq('user_id', userId).order('order'),
    supabase.from('sb_study_logs').select('*').eq('user_id', userId),
    supabase.from('sb_study_materials').select('*').eq('user_id', userId),
    supabase.from('sb_homework_assignments').select('*').eq('student_id', userId),
    supabase.from('sb_study_sessions').select('*').eq('user_id', userId),
  ]);

  const conditionRows = (conditionsRes.data ?? []).map(conditionFromRow);
  const conditions: Record<DateKey, DailyCondition> = {};
  for (const c of conditionRows) conditions[c.date] = c;

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

  if (profile?.role === 'manager') {
    managedStudents = await fetchManagedStudents(userId);
    studentLabels = await fetchStudentLabels(userId);
    const studentIds = managedStudents.map((s) => s.id);
    // 관리자 계정에서는 위 병렬 조회(student_id/user_id = 본인)가 항상 비어 있다.
    // 담당 학생들 기준으로 다시 조회해야 등록해둔 숙제와 학습 세션이 보인다.
    if (studentIds.length > 0) {
      const [managerHomeworkRes, managerSessionsRes, examRes, scheduleRes, exceptionRes] = await Promise.all([
        supabase.from('sb_homework_assignments').select('*').in('student_id', studentIds),
        supabase.from('sb_study_sessions').select('*').in('user_id', studentIds),
        supabase.from('sb_exam_records').select('*').in('student_id', studentIds),
        supabase.from('sb_tutoring_schedules').select('*').eq('manager_id', userId),
        supabase.from('sb_tutoring_schedule_exceptions').select('*').eq('manager_id', userId),
      ]);
      homeworkRows = managerHomeworkRes.data ?? [];
      sessionRows = managerSessionsRes.data ?? [];
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
  }

  return {
    profile,
    conditions,
    scheduleBlocks: groupByDate((blocksRes.data ?? []).map(scheduleBlockFromRow)),
    plannerItems: groupByDate((itemsRes.data ?? []).map(plannerItemFromRow)),
    studyLogs: groupByDate((logsRes.data ?? []).map(studyLogFromRow)),
    studyMaterials: (materialsRes.data ?? []).map(studyMaterialFromRow),
    homeworkAssignments: homeworkRows.map(homeworkAssignmentFromRow),
    studySessions: groupByPlannerItemId(sessionRows.map(studySessionFromRow)),
    managedStudents,
    examRecords,
    examSubjects,
    examSubjectRanges,
    tutoringSchedules,
    tutoringScheduleExceptions,
    studentLabels,
    studentPlannerItems: {},
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
        });
        if (error) {
          console.error('saveProfile failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async saveCondition(date, condition) {
        setState((s) => ({ ...s, conditions: { ...s.conditions, [date]: condition } }));
        const { error } = await supabase.from('sb_daily_conditions').upsert(
          {
            user_id: userId,
            date,
            sleep_hours: condition.sleepHours,
            fatigue: condition.fatigue,
            focus: condition.focus,
            mood: condition.mood,
            notes: condition.notes,
          },
          { onConflict: 'user_id,date' }
        );
        if (error) {
          console.error('saveCondition failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async upsertScheduleBlock(date, block) {
        const list = state.scheduleBlocks[date] ?? [];
        const exists = list.some((b) => b.id === block.id);
        const nextList = exists ? list.map((b) => (b.id === block.id ? block : b)) : [...list, block];
        nextList.sort((a, b) => a.startTime.localeCompare(b.startTime));
        setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: nextList } }));

        const row = { id: block.id, user_id: userId, date, type: block.type, label: block.label, start_time: block.startTime, end_time: block.endTime };
        const { error } = await supabase.from('sb_schedule_blocks').upsert(row);
        if (error) {
          console.error('upsertScheduleBlock failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async deleteScheduleBlock(date, id) {
        const previous = state.scheduleBlocks[date] ?? [];
        setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: previous.filter((b) => b.id !== id) } }));
        const { error } = await supabase.from('sb_schedule_blocks').delete().eq('id', id);
        if (error) {
          console.error('deleteScheduleBlock failed:', error.message);
          setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: previous }, error: WRITE_FAILURE_MESSAGE }));
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
        }
      },

      async updatePlannerItem(date, id, patch) {
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

      async addStudyLog(date, entry) {
        const list = state.studyLogs[date] ?? [];
        const id = uid();
        const fullEntry: StudyLogEntry = { ...entry, id };
        setState((s) => ({ ...s, studyLogs: { ...s.studyLogs, [date]: [...list, fullEntry] } }));

        const { error } = await supabase.from('sb_study_logs').insert({
          id,
          user_id: userId,
          date,
          planner_item_id: fullEntry.plannerItemId,
          subject_id: fullEntry.subjectId,
          rating: fullEntry.rating,
          blocked_tags: fullEntry.blockedTags,
          detail_note: fullEntry.detailNote,
          self_message: fullEntry.selfMessage,
        });
        if (error) {
          console.error('addStudyLog failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async addStudyMaterial(material) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullMaterial: StudyMaterial = { ...material, id, createdAt };
        setState((s) => ({ ...s, studyMaterials: [...s.studyMaterials, fullMaterial] }));

        const { error } = await supabase.from('sb_study_materials').insert({
          id,
          user_id: userId,
          subject_id: fullMaterial.subjectId,
          material_name: fullMaterial.materialName,
          total_scope: fullMaterial.totalScope,
          current_progress: fullMaterial.currentProgress,
          target_passes: fullMaterial.targetPasses,
          target_date: fullMaterial.targetDate,
          session_interval_days: fullMaterial.sessionIntervalDays,
        });
        if (error) {
          console.error('addStudyMaterial failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async updateStudyMaterial(id, patch) {
        setState((s) => ({ ...s, studyMaterials: s.studyMaterials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

        const dbPatch: Partial<SbStudyMaterialRow> = {};
        if ('materialName' in patch) dbPatch.material_name = patch.materialName;
        if ('totalScope' in patch) dbPatch.total_scope = patch.totalScope;
        if ('currentProgress' in patch) dbPatch.current_progress = patch.currentProgress;
        if ('targetPasses' in patch) dbPatch.target_passes = patch.targetPasses;
        if ('targetDate' in patch) dbPatch.target_date = patch.targetDate;
        if ('sessionIntervalDays' in patch) dbPatch.session_interval_days = patch.sessionIntervalDays;

        const { error } = await supabase.from('sb_study_materials').update(dbPatch).eq('id', id);
        if (error) {
          console.error('updateStudyMaterial failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async deleteStudyMaterial(id) {
        const previous = state.studyMaterials;
        setState((s) => ({ ...s, studyMaterials: s.studyMaterials.filter((m) => m.id !== id) }));
        const { error } = await supabase.from('sb_study_materials').delete().eq('id', id);
        if (error) {
          console.error('deleteStudyMaterial failed:', error.message);
          setState((s) => ({ ...s, studyMaterials: previous, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async applyTomorrowRecommendation(date, items) {
        const existing = state.plannerItems[date] ?? [];
        const baseOrder = existing.length === 0 ? 1 : Math.max(...existing.map((i) => i.order)) + 1;
        const newItems: PlannerItem[] = items.map((it, idx) => ({
          id: uid(),
          date,
          order: baseOrder + idx,
          subjectId: it.subjectId,
          startTime: it.startTime,
          studyType: it.studyType,
          material: it.material,
          unit: it.unit,
          pageRange: it.pageRange,
          endTime: it.endTime,
          difficulty: it.difficulty,
          restPattern: null,
          mustDo: it.mustDo,
          status: 'planned',
          actualMinutes: null,
          understanding: null,
          partialReason: null,
          incompleteReason: null,
          source: 'self' as const,
          homeworkAssignmentId: null,
          examSubjectRangeId: null,
        }));
        setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: [...existing, ...newItems] } }));

        const { error } = await supabase.from('sb_planner_items').insert(
          newItems.map((it) => ({
            id: it.id,
            user_id: userId,
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
        if (error) {
          console.error('applyTomorrowRecommendation failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async linkByInviteCode(code) {
        // 아직 링크가 없는 상태라 RLS상 학생 프로필 행을 직접 select할 수 없다.
        // 정확한 코드를 아는 경우에만 id 하나를 돌려주는 security definer RPC를 쓴다(0006 마이그레이션).
        const { data: studentId, error: lookupError } = await supabase.rpc('find_student_by_invite_code', {
          code: code.toUpperCase(),
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
        }
      },

      async updateHomeworkAssignment(id, patch) {
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
              { id, plannerItemId, startedAt, endedAt: null, durationSeconds: null, deviated: false },
            ],
          },
        }));
        const { error } = await supabase.from('sb_study_sessions').insert({
          id,
          user_id: userId,
          planner_item_id: plannerItemId,
          started_at: startedAt,
          ended_at: null,
          duration_seconds: null,
          deviated: false,
        });
        if (error) {
          console.error('startStudySession failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
        return id;
      },

      async endStudySession(plannerItemId, sessionId, deviated) {
        const endedAt = new Date().toISOString();
        // startedAt is immutable once a session is created, so reading it from the outer `state`
        // closure (rather than deriving inside the setState updater) is safe here — unlike
        // updatePlannerItem's list derivation, there's no risk of acting on a stale sibling write.
        const existing = (state.studySessions[plannerItemId] ?? []).find((sess) => sess.id === sessionId);
        const durationSeconds = existing ? Math.round((Date.parse(endedAt) - Date.parse(existing.startedAt)) / 1000) : null;

        setState((s) => {
          const list = s.studySessions[plannerItemId] ?? [];
          const updated = list.map((sess) => (sess.id === sessionId ? { ...sess, endedAt, deviated, durationSeconds } : sess));
          return { ...s, studySessions: { ...s.studySessions, [plannerItemId]: updated } };
        });

        const { error } = await supabase
          .from('sb_study_sessions')
          .update({ ended_at: endedAt, deviated, duration_seconds: durationSeconds })
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
        const grouped = groupByDate((data ?? []).map(plannerItemFromRow));
        setState((s) => ({ ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: grouped } }));
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

  return <AppStateContext.Provider value={{ state, actions }}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
