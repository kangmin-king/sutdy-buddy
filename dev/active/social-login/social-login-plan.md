# Plan — 소셜 로그인(구글·카카오) + 이메일 인증

## 배경

학생이 가입할 때 아무 이메일 주소나 지어내면 비밀번호를 잊었을 때 복구할 방법이 없다.
매니저가 대신 재설정해주는 안은 **개인정보 문제로 기각**됐다(선생님이 학생 계정 자격증명을
다루게 되는 구조). 그래서 소셜 로그인을 기본 경로로 만들어 비밀번호 자체를 없애고, 이메일
가입은 남기되 인증을 거치게 한다.

## 목표

1. 구글·카카오 로그인을 기본 경로로 (버튼 순서: 카카오 → 구글 → 이메일)
2. 이메일 가입은 유지하되 **이메일 인증 필수** (기존 가입자는 소급 적용 안 함)
3. 웹과 안드로이드 앱 양쪽에서 동작

## 착수 전 발견한 문제 두 개

### A. `detectSessionInUrl: false` — 비밀번호 재설정이 마지막 단계에서 깨져 있다

`lib/supabase.ts`가 URL 파싱을 꺼두고 있다. 재설정 메일의 링크를 누르면
`app.studybuks.store#access_token=...&type=recovery` 로 도착하는데, 이 옵션이 꺼져 있으면
supabase-js가 그 토큰을 **읽지 않는다**. 세션도 안 생기고 `PASSWORD_RECOVERY` 이벤트도 안
떠서, `Gate`의 `passwordRecovery` 분기가 영영 실행되지 않는다. 즉 메일은 도착해도 링크를
눌렀을 때 그냥 로그인 화면만 뜬다.

→ `detectSessionInUrl: true`로 바꾼다. OAuth 콜백 처리에도 어차피 필요하다.

### B. 소셜 로그인에는 역할(학생/과외쌤) 선택 지점이 없다

지금은 이메일 회원가입 폼에서 역할을 골라 `signUp`의 `options.data.role`로 넘기고,
`Onboarding.tsx`가 `session.user.user_metadata.role`을 읽는다. 없으면 **`'student'`로
기본 처리**한다. 소셜 로그인은 그 메타데이터가 없으므로, 구글로 가입한 과외쌤이 조용히
학생 계정이 되어버린다.

→ 온보딩 첫 단계에 역할 선택을 넣는다. `user_metadata.role`이 있으면(=이메일 가입) 건너뛰고,
없으면(=소셜 가입) 물어본다.

## 인증 플로우 방식 결정: implicit 유지 (PKCE 안 씀)

PKCE는 `code_verifier`를 요청을 **시작한 쪽 저장소**에 두고, 교환할 때 그게 있어야 한다.
비밀번호 재설정은 앱(웹뷰)에서 요청하고 링크는 **폰 기본 브라우저**에서 열리므로 저장소가
달라 PKCE로는 교환이 실패한다. implicit은 링크 자체에 토큰이 담겨 오므로 브라우저가 달라도
동작한다.

- 웹 OAuth: implicit → 해시로 토큰 반환 → `detectSessionInUrl`이 처리
- 네이티브 OAuth: 시스템 브라우저에서 로그인 → `com.studybuddy.app://` 딥링크로 복귀 →
  해시에서 토큰 뽑아 `setSession()` 직접 호출
- 구글과 카카오가 완전히 같은 코드 경로를 탄다. 네이티브 구글 SDK 안 씀(플러그인·SHA-1·
  Firebase 프로젝트 정합성 문제를 전부 회피)

## 작업 순서

1. `lib/supabase.ts` — `detectSessionInUrl: true`
2. `AuthScreen.tsx` — 소셜 버튼, 순서 재배치, 이메일은 부차 경로로
3. 이메일 인증 UX — 가입 후 "메일 확인" 화면, 재발송 버튼, 미인증 로그인 시 안내
4. `Onboarding.tsx` — 역할 선택 단계 (소셜 가입자만)
5. 딥링크 — `AndroidManifest.xml` intent-filter, `App.tsx`에 `appUrlOpen` 리스너
6. 검증 — 웹에서 구글 로그인 실제 통과, 앱 빌드 후 실기기 확인

## 범위 밖

- 카카오는 코드로는 준비하되, 개발자센터 앱 등록 전까지 버튼 비활성 (`KAKAO_ENABLED`)
- Supabase 대시보드의 이메일 자동승인 끄기 — 계정 소유자만 가능
- 기존 이메일 가입자에게 인증 소급 적용 — 하지 않음
