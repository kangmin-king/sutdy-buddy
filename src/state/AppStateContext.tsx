import React from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { uid, addDaysToKey, todayKey, shouldGenerateHomeworkItem } from '../lib';
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
  loading: true,
  error: null,
};

const WRITE_FAILURE_MESSAGE = '저장하지 못했어요. 다시 시도해주세요.';

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

async function loadAll(userId: string): Promise<AppState> {
  const [profileRes, conditionsRes, blocksRes, itemsRes, logsRes, materialsRes, homeworkRes, sessionsRes, linksRes] = await Promise.all([
    supabase.from('sb_profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('sb_daily_conditions').select('*').eq('user_id', userId),
    supabase.from('sb_schedule_blocks').select('*').eq('user_id', userId),
    supabase.from('sb_planner_items').select('*').eq('user_id', userId).order('order'),
    supabase.from('sb_study_logs').select('*').eq('user_id', userId),
    supabase.from('sb_study_materials').select('*').eq('user_id', userId),
    supabase.from('sb_homework_assignments').select('*').eq('student_id', userId),
    supabase.from('sb_study_sessions').select('*').eq('user_id', userId),
    supabase.from('sb_student_manager_links').select('*').or(`student_id.eq.${userId},manager_id.eq.${userId}`),
  ]);

  const conditionRows = (conditionsRes.data ?? []).map(conditionFromRow);
  const conditions: Record<DateKey, DailyCondition> = {};
  for (const c of conditionRows) conditions[c.date] = c;

  const profile = profileRes.data ? profileFromRow(profileRes.data) : null;

  let managedStudents: Profile[] = [];
  if (profile?.role === 'manager') {
    const studentIds = (linksRes.data ?? []).map((link) => link.student_id);
    if (studentIds.length > 0) {
      const studentsRes = await supabase.from('sb_profiles').select('*').in('id', studentIds);
      managedStudents = ((studentsRes.data ?? []) as SbProfileRow[]).map(profileFromRow);
    }
  }

  return {
    profile,
    conditions,
    scheduleBlocks: groupByDate((blocksRes.data ?? []).map(scheduleBlockFromRow)),
    plannerItems: groupByDate((itemsRes.data ?? []).map(plannerItemFromRow)),
    studyLogs: groupByDate((logsRes.data ?? []).map(studyLogFromRow)),
    studyMaterials: (materialsRes.data ?? []).map(studyMaterialFromRow),
    homeworkAssignments: (homeworkRes.data ?? []).map(homeworkAssignmentFromRow),
    studySessions: groupByPlannerItemId((sessionsRes.data ?? []).map(studySessionFromRow)),
    managedStudents,
    loading: false,
    error: null,
  };
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [state, setState] = React.useState<AppState>(EMPTY_STATE);

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
        const list = state.plannerItems[date] ?? [];
        const id = uid();
        const order = list.length === 0 ? 1 : Math.max(...list.map((i) => i.order)) + 1;
        const fullItem: PlannerItem = { ...item, id, order };
        setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: [...list, fullItem] } }));

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
          }))
        );
        if (error) {
          console.error('applyTomorrowRecommendation failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async linkByInviteCode(code) {
        const { data: student } = await supabase.from('sb_profiles').select('id').eq('invite_code', code.toUpperCase()).maybeSingle();
        if (!student) {
          setState((s) => ({ ...s, error: '초대코드를 찾을 수 없어요. 다시 확인해주세요.' }));
          return;
        }
        const { error } = await supabase.from('sb_student_manager_links').insert({ student_id: student.id, manager_id: userId });
        if (error) {
          console.error('linkByInviteCode failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
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
