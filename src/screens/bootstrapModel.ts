// 프로필이 확정되기 전에 어떤 화면을 보여줄지 정한다.
//
// 이 함수가 따로 있는 이유는 **"로드 실패"와 "아직 온보딩을 안 함"을 반드시 구별해야 하기
// 때문이다.** 둘 다 `profile === null`이라서 예전에는 구별되지 않았고, 프로필 조회가
// 네트워크·RLS·5xx로 잠깐 실패한 기존 사용자에게 온보딩 화면이 떴다. 거기서 온보딩을 끝내면
// saveProfile의 upsert가 이런 것들을 덮어썼다:
//   - 학생: 초대코드 재발급(crypto.randomUUID), 과목 색 전부 초기화(subjectColors: {})
//   - 소셜 로그인 계정: RolePicker에서 "학생"을 누르면 역할이 바뀌어 담당 학생 목록이 사라짐
//
// 판정을 순수 함수로 빼서 테스트로 고정한다 — 이 앱에는 컴포넌트 렌더 테스트가 없다.
export type BootstrapView = 'loading' | 'load-failed' | 'onboarding';

export function bootstrapViewOf(state: { loading: boolean; loadFailed: boolean }): BootstrapView {
  // 로딩이 우선이다. 재시도 중에는 loadFailed가 false로 되돌아가지만, 되돌리기 전에
  // 이 함수가 불릴 수 있으므로 두 값이 동시에 true인 순간에도 "불러오는 중"으로 보이는 게 맞다.
  if (state.loading) return 'loading';
  if (state.loadFailed) return 'load-failed';
  return 'onboarding';
}
