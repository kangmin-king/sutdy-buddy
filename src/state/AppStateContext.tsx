import React from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { uid, addDaysToKey } from '../lib';
import {
  profileFromRow,
  conditionFromRow,
  scheduleBlockFromRow,
  plannerItemFromRow,
  studyLogFromRow,
  studyMaterialFromRow,
  groupByDate,
} from './mappers';
import type {
  Profile,
  DailyCondition,
  ScheduleBlock,
  PlannerItem,
  StudyLogEntry,
  StudyMaterial,
  DateKey,
  TomorrowRecommendationItem,
} from '../types';
import type { SbPlannerItemRow, SbStudyMaterialRow } from '../types/db';

interface AppState {
  profile: Profile | null;
  conditions: Record<DateKey, DailyCondition>;
  scheduleBlocks: Record<DateKey, ScheduleBlock[]>;
  plannerItems: Record<DateKey, PlannerItem[]>;
  studyLogs: Record<DateKey, StudyLogEntry[]>;
  studyMaterials: StudyMaterial[];
  loading: boolean;
}

const EMPTY_STATE: AppState = {
  profile: null,
  conditions: {},
  scheduleBlocks: {},
  plannerItems: {},
  studyLogs: {},
  studyMaterials: [],
  loading: true,
};

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
}

const AppStateContext = React.createContext<{ state: AppState; actions: AppStateActions } | null>(null);

async function loadAll(userId: string): Promise<AppState> {
  const [profileRes, conditionsRes, blocksRes, itemsRes, logsRes, materialsRes] = await Promise.all([
    supabase.from('sb_profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('sb_daily_conditions').select('*').eq('user_id', userId),
    supabase.from('sb_schedule_blocks').select('*').eq('user_id', userId),
    supabase.from('sb_planner_items').select('*').eq('user_id', userId).order('order'),
    supabase.from('sb_study_logs').select('*').eq('user_id', userId),
    supabase.from('sb_study_materials').select('*').eq('user_id', userId),
  ]);

  const conditionRows = (conditionsRes.data ?? []).map(conditionFromRow);
  const conditions: Record<DateKey, DailyCondition> = {};
  for (const c of conditionRows) conditions[c.date] = c;

  return {
    profile: profileRes.data ? profileFromRow(profileRes.data) : null,
    conditions,
    scheduleBlocks: groupByDate((blocksRes.data ?? []).map(scheduleBlockFromRow)),
    plannerItems: groupByDate((itemsRes.data ?? []).map(plannerItemFromRow)),
    studyLogs: groupByDate((logsRes.data ?? []).map(studyLogFromRow)),
    studyMaterials: (materialsRes.data ?? []).map(studyMaterialFromRow),
    loading: false,
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
        });
        if (error) console.error('saveProfile failed:', error.message);
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
        if (error) console.error('saveCondition failed:', error.message);
      },

      async upsertScheduleBlock(date, block) {
        const list = state.scheduleBlocks[date] ?? [];
        const exists = list.some((b) => b.id === block.id);
        const nextList = exists ? list.map((b) => (b.id === block.id ? block : b)) : [...list, block];
        nextList.sort((a, b) => a.startTime.localeCompare(b.startTime));
        setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: nextList } }));

        const row = { id: block.id, user_id: userId, date, type: block.type, label: block.label, start_time: block.startTime, end_time: block.endTime };
        const { error } = await supabase.from('sb_schedule_blocks').upsert(row);
        if (error) console.error('upsertScheduleBlock failed:', error.message);
      },

      async deleteScheduleBlock(date, id) {
        const previous = state.scheduleBlocks[date] ?? [];
        setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: previous.filter((b) => b.id !== id) } }));
        const { error } = await supabase.from('sb_schedule_blocks').delete().eq('id', id);
        if (error) {
          console.error('deleteScheduleBlock failed:', error.message);
          setState((s) => ({ ...s, scheduleBlocks: { ...s.scheduleBlocks, [date]: previous } }));
        }
      },

      async addPlannerItem(date, item) {
        const list = state.plannerItems[date] ?? [];
        const id = uid();
        const order = list.length + 1;
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
        });
        if (error) console.error('addPlannerItem failed:', error.message);
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
        if (error) console.error('updatePlannerItem failed:', error.message);
      },

      async deletePlannerItem(date, id) {
        const previous = state.plannerItems[date] ?? [];
        setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: previous.filter((i) => i.id !== id) } }));
        const { error } = await supabase.from('sb_planner_items').delete().eq('id', id);
        if (error) {
          console.error('deletePlannerItem failed:', error.message);
          setState((s) => ({ ...s, plannerItems: { ...s.plannerItems, [date]: previous } }));
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
        if (updateError) console.error('carryOverPlannerItem (update) failed:', updateError.message);

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
        });
        if (insertError) console.error('carryOverPlannerItem (insert) failed:', insertError.message);
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
        if (error) console.error('addStudyLog failed:', error.message);
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
        if (error) console.error('addStudyMaterial failed:', error.message);
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
        if (error) console.error('updateStudyMaterial failed:', error.message);
      },

      async deleteStudyMaterial(id) {
        const previous = state.studyMaterials;
        setState((s) => ({ ...s, studyMaterials: s.studyMaterials.filter((m) => m.id !== id) }));
        const { error } = await supabase.from('sb_study_materials').delete().eq('id', id);
        if (error) {
          console.error('deleteStudyMaterial failed:', error.message);
          setState((s) => ({ ...s, studyMaterials: previous }));
        }
      },

      async applyTomorrowRecommendation(date, items) {
        const existing = state.plannerItems[date] ?? [];
        const newItems: PlannerItem[] = items.map((it, idx) => ({
          id: uid(),
          date,
          order: existing.length + idx + 1,
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
          }))
        );
        if (error) console.error('applyTomorrowRecommendation failed:', error.message);
      },
    }),
    [userId, state]
  );

  return <AppStateContext.Provider value={{ state, actions }}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
