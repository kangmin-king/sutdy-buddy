import React from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { isNativePlatform } from '../../native/distractionStop';
import { useAppState } from '../../state/AppStateContext';
import { findExpiredOpenSessions } from './studySessionModel';

// 학생이 멈춤을 누르지 않아 3시간이 지난 학습 세션을 닫는다. StudentAppShell에서 부르기
// 때문에 딴짓멈춰 오버레이가 떠서 학생 홈이 언마운트돼도 계속 동작한다.
//
// 트리거는 셋이다: 마운트(앱을 켰을 때 밀린 것 정리), 앱 복귀(학생이 돌아오는 순간),
// 그리고 앱을 열어둔 채 3시간을 넘기는 경우. 마지막 것을 위해 새 타이머를 만들지 않고
// 분 단위 시각을 상태로 들고 1분에 한 번만 스캔한다 — 1초 렌더 틱에 쓰기를 걸면
// 재진입이 생긴다.
export function useExpiredSessionClose(): void {
  const { state, actions } = useAppState();
  const [minuteTick, setMinuteTick] = React.useState(() => Math.floor(Date.now() / 60_000));
  const closing = React.useRef(false);
  // 이 Set이 막는 것은 "정산이 끝난 세션을 또 보내는 것"이다 — 재시도 폭주 방지가 전부다.
  // 쓰기가 실패하면(서버 에러) id를 넣지 않으므로 다음 스캔에서 다시 시도된다. 동시 배치
  // 자체는 이미 closing.current가 막는다.
  const sentSessionIds = React.useRef<Set<string>>(new Set());

  // useAllowedAppUsageFlush와 같은 이유로 actions와 studySessions를 ref로 든다: 이 훅이
  // 부르는 액션이 AppState를 바꾸고, AppState가 바뀌면 actions가 새 객체가 된다. 둘을
  // 의존성에 두면 이펙트가 자기 자신의 갱신에 다시 걸린다.
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;
  const studySessionsRef = React.useRef(state.studySessions);
  studySessionsRef.current = state.studySessions;

  React.useEffect(() => {
    const id = setInterval(() => setMinuteTick(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(id);
  }, []);

  // 앱 복귀. 학생이 돌아오는 바로 그 순간에 한 번 더 돌리기 위해 분 tick을 앞당긴다.
  React.useEffect(() => {
    if (!isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('resume', () =>
      setMinuteTick(Math.floor(Date.now() / 60_000)),
    );
    return () => {
      void listenerPromise.then((handle) => handle.remove());
    };
  }, []);

  React.useEffect(() => {
    if (state.loading) return;
    if (closing.current) return;

    const expired = findExpiredOpenSessions(studySessionsRef.current, Date.now()).filter(
      (session) => !sentSessionIds.current.has(session.sessionId),
    );
    if (expired.length === 0) return;

    closing.current = true;

    void (async () => {
      try {
        for (const { itemId, sessionId, endedAt, durationSeconds } of expired) {
          try {
            // settled === true는 "쓰기 성공" 또는 "가드가 0건으로 거부"(학생이 먼저 멈춤을
            // 눌러 이미 정직한 값이 들어간 경우) 둘 다를 뜻한다 — 둘 다 재시도할 게 없다.
            // false는 서버 에러뿐이고, 그때만 id를 표시하지 않아 다음 스캔에서 다시 시도된다.
            const settled = await actionsRef.current.autoCloseStudySession(
              itemId,
              sessionId,
              endedAt,
              durationSeconds,
            );
            if (settled) sentSessionIds.current.add(sessionId);
          } catch (err) {
            // autoCloseStudySession 자체가 reject하는 경우(네트워크 예외 등, PostgREST가
            // { error }로 돌려주는 정상 실패 경로와 다르다) 여기서 잡아 로그만 남긴다.
            // id를 표시하지 않으므로 다음 스캔에서 다시 시도된다 — 삼키지 않되, 사용자에게
            // 보이는 에러 배너는 액션 내부의 실패 경로에서 이미 담당하므로 여기서 또
            // 세우지는 않는다.
            console.error('autoCloseStudySession threw unexpectedly:', err);
          }
        }
      } finally {
        closing.current = false;
      }
    })();
  }, [minuteTick, state.loading]);
}
