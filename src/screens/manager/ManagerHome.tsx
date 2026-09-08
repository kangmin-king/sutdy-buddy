import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { Icon, useConfirm } from '../../primitives';
import { getSubject } from '../../constants';
import PlannerItemRow from './PlannerItemRow';
import ChecklistTimeline from '../shared/ChecklistTimeline';
import { totalUsageSeconds } from '../shared/allowedAppUsageModel';
import { track } from '../../lib/analytics';

export default function ManagerHomeScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const { confirm, confirmDialog } = useConfirm();
  const today = todayKey();
  const [timelineOpen, setTimelineOpen] = React.useState(false);

  React.useEffect(() => {
    actions.loadStudentPlannerItems(studentId);
    actions.loadSentHomeworkProposals(studentId);
    // 탭을 열 때마다 한 번 찍힌다(탭을 바꾸면 이 화면이 언마운트되므로 마운트 = 탭 조회).
    // 세 탭(홈/캘린더/학습설계)에 같은 형태로 넣어 두면, 관리자가 "확인하러" 오는지
    // "설계하러" 오는지 비율로 알 수 있다 — 정보구조를 바꿀지 판단하는 근거가 된다.
    track('Viewed Student Home', { managed_student_count: state.managedStudents.length });
    // studentId 바뀔 때만 다시 불러온다 — actions는 매 렌더 재생성되므로 deps에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const items = (state.studentPlannerItems[studentId]?.[today] ?? []).slice().sort((a, b) => a.order - b.order);
  // 허용앱 시간과 나란히 놓아야 비율이 읽힌다. 아직 안 끝난 세션은 durationSeconds가 없으므로
  // 합계에서 빠진다 — 끝난 시간만 세는 쪽이 "지금까지 얼마나 했나"에 맞다.
  const totalStudySeconds = items.reduce(
    (sum, item) =>
      sum + (state.studySessions[item.id] ?? []).reduce((s2, sess) => s2 + (sess.durationSeconds ?? 0), 0),
    0
  );
  const allowedSeconds = totalUsageSeconds(state.allowedAppIntervals[studentId] ?? []);
  const studentProfile = state.managedStudents.find((s) => s.id === studentId);
  const completedCount = items.filter((it) => it.status === 'completed').length;
  const sentProposals = state.sentHomeworkProposals[studentId] ?? [];
  const statusLabel = { pending: '대기중', accepted: '수락됨', rejected: '거절됨' } as const;
  const statusColor = { pending: 'text-tertiary', accepted: 'text-secondary', rejected: 'text-error' } as const;

  return (
    <div className="px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      {/* 오늘 한눈 요약. 예전엔 이 자리에 타임라인이 있었는데, 타임라인은 관찰용이고 그 아래
          숙제 행이 고칠 수 있는 것이라 행동할 것이 관찰할 것보다 아래에 있었다. 뒤집었다. */}
      <section className="mt-2 rounded-2xl bg-primary px-5 py-4 text-on-primary shadow-card dark:bg-surface-container-lowest dark:text-on-surface">
        <p className="text-xs font-semibold text-on-primary/70 dark:text-on-surface-variant">오늘</p>
        <p className="mt-1 text-xl font-extrabold tracking-tight">
          {items.length === 0 ? '오늘 등록된 항목이 없어요' : `숙제 ${completedCount}/${items.length} 완료`}
        </p>
        <div className="mt-3 flex gap-5">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.1em] text-on-primary/60 dark:text-on-surface-variant">학습 시간</p>
            <p className="mt-0.5 font-mono text-base font-bold tabular-nums">{Math.round(totalStudySeconds / 60)}분</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.1em] text-on-primary/60 dark:text-on-surface-variant">허용앱</p>
            <p className="mt-0.5 font-mono text-base font-bold tabular-nums">{Math.round(allowedSeconds / 60)}분</p>
          </div>
        </div>
      </section>

      {/* 예전엔 "오늘 숙제"(내가 낸 것)와 "오늘 할 일"(학생이 넣은 것)이 따로 있고 그 사이에
          제안 목록이 끼어 있었다. 같은 날짜의 항목이 출처별로 흩어져 있어서 "오늘 뭐가 있나"를
          한 번에 볼 수 없었다. 학생 쪽과 같은 원칙으로 한 목록에 합치고 배지로만 구분한다. */}
      <h2 className="mb-2 mt-6 text-base font-bold">오늘 할 일</h2>
      {items.length === 0 && <p className="py-6 text-center text-sm text-on-surface-variant">오늘 등록된 항목이 없어요.</p>}
      {items.map((item) => (
        <PlannerItemRow
          key={item.id}
          item={item}
          // 학생이 스스로 넣은 계획은 관리자가 대신 고치지 않는다 — 숙제에만 수정·삭제를 준다.
          onSaveAmount={
            item.source === 'homework'
              ? (value) => actions.updateHomeworkAmountForDate(studentId, item.id, today, item.examSubjectRangeId, value)
              : undefined
          }
          onDelete={
            item.source === 'homework'
              ? async () => {
                  if (await confirm('이 숙제를 삭제할까요?')) actions.deleteStudentHomeworkItem(studentId, today, item.id);
                }
              : undefined
          }
        />
      ))}

      {sentProposals.length > 0 && (
        <>
          <h2 className="text-base font-bold mt-6 mb-2">내가 제안한 숙제</h2>
          <div className="space-y-2">
            {sentProposals.map((p) => (
              <div key={p.id} className="rounded-xl bg-surface-container-high px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {getSubject(p.subjectId).label} · {p.material || p.pageRange || '할 일'}
                  </p>
                  <p className="text-xs text-on-surface-variant">{p.date}</p>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${statusColor[p.status]}`}>{statusLabel[p.status]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 타임라인은 관찰용이라 접어서 아래에 둔다 — 필요할 때만 편다. */}
      {items.length > 0 && (
        <section className="mt-6">
          <button
            onClick={() => setTimelineOpen((open) => !open)}
            aria-expanded={timelineOpen}
            className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-surface-container-low text-sm font-semibold text-on-surface-variant transition active:scale-[0.99]"
          >
            오늘 타임라인 {timelineOpen ? '접기' : '보기'}
            <Icon name={timelineOpen ? 'expand_less' : 'expand_more'} className="!text-[18px]" />
          </button>
          {timelineOpen && (
            <div className="mt-3">
              <ChecklistTimeline
                items={items}
                studySessions={state.studySessions}
                customColors={studentProfile?.subjectColors}
                allowedAppIntervals={state.allowedAppIntervals[studentId] ?? []}
              />
            </div>
          )}
        </section>
      )}
      {confirmDialog}
    </div>
  );
}
