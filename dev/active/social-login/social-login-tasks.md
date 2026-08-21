# Tasks — 소셜 로그인 + 이메일 인증

- [x] Task 1: `lib/supabase.ts` — `detectSessionInUrl: true` (재설정 링크가 실제로 동작하게)
- [x] Task 2: `AuthScreen.tsx` — 소셜 로그인 버튼 (카카오 → 구글 → 이메일 순), 이메일은 접어두기
- [x] Task 3: 이메일 인증 UX — 가입 후 안내 화면, 재발송, 미인증 로그인 에러 처리
- [x] Task 4: `Onboarding.tsx` — 역할 선택 단계 (소셜 가입자만)
- [x] Task 5: 딥링크 — AndroidManifest intent-filter + `AuthContext`에 appUrlOpen 핸들러
- [~] Task 6: 검증
  - [x] tsc 통과, 테스트 92개 통과
  - [x] 로그인 화면에 카카오·구글 버튼 노출 확인 (카카오는 대시보드에서 켜자마자 자동 등장 —
        provider 목록을 실행 시점에 조회하므로 재배포 불필요했음)
  - [x] 구글 버튼 → 실제 구글 계정 선택 화면 도달 ("studybuks(으)로 이동")
  - [x] 카카오 인가 엔드포인트가 `accounts.kakao.com/login`까지 정상 도달 (KOE006 없음 —
        이 콘솔 버전에선 Web 플랫폼 등록이 불필요했다)
  - [ ] 로그인 왕복 완주 (아래 "발견: Site URL 오타" 해결 후)
  - [ ] 프로덕션 웹 배포 — **대기 중**: 다른 세션이 같은 워크트리에서 StudentHome 리디자인 작업 중
  - [ ] APK 빌드 → 실기기에서 구글·카카오 로그인
- [ ] Task 7: 코드 리뷰

## 발견: Supabase Site URL 오타 (로그인·비밀번호 재설정 둘 다 막고 있었음)

구글 로그인이 토큰까지 정상 발급됐는데 `https://studybuks.sotre/#access_token=...`
(`store`가 `sotre`) 로 튕겨서 `ERR_NAME_NOT_RESOLVED`가 났다.

Supabase는 요청된 복귀 주소가 Redirect URL 허용목록에 없으면 **Site URL로 대신 보낸다**.
그 Site URL에 오타가 있었고, 허용목록도 비어 있어서 모든 복귀가 존재하지 않는 도메인으로 갔다.
비밀번호 재설정 링크(`redirectTo: https://app.studybuks.store`)도 같은 이유로 깨져 있었을 것.

필요한 설정 (Authentication → URL Configuration):

```
Site URL:  https://app.studybuks.store

Redirect URLs:
  https://app.studybuks.store        ← 소셜 로그인은 경로 없는 origin으로 돌아온다
  https://app.studybuks.store/**
  http://localhost:5173
  http://localhost:5173/**
  com.studybuddy.app://auth-callback ← 앱 딥링크. 없으면 폰에서 소셜 로그인이 안 된다
```

## 사용자(계정 소유자)만 할 수 있는 것

- [x] 카카오 개발자센터 앱 등록 → Supabase Kakao provider 활성화
- [ ] Supabase URL Configuration 수정 (위 참조)
- [ ] 구글 OAuth 동의 화면을 **프로덕션으로 게시** — 테스트 모드면 등록된 테스트 사용자만
      로그인된다. 소유자 계정으로는 테스트 모드에서도 잘 되기 때문에 본인 테스트로는
      발견되지 않고, 학생에게 준 뒤에야 "액세스 차단됨"으로 터진다
- [ ] Supabase에서 이메일 자동승인 끄기 — **배포 후에** 해야 함 (안내 화면이 배포되기 전에
      끄면 가입자가 아무 설명 없이 막힌다)
