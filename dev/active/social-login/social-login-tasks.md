# Tasks — 소셜 로그인 + 이메일 인증

- [ ] Task 1: `lib/supabase.ts` — `detectSessionInUrl: true` (재설정 링크가 실제로 동작하게)
- [ ] Task 2: `AuthScreen.tsx` — 소셜 로그인 버튼 (카카오 → 구글 → 이메일 순), 이메일은 접어두기
- [ ] Task 3: 이메일 인증 UX — 가입 후 안내 화면, 재발송, 미인증 로그인 에러 처리
- [ ] Task 4: `Onboarding.tsx` — 역할 선택 단계 (소셜 가입자만)
- [ ] Task 5: 딥링크 — AndroidManifest intent-filter + `App.tsx` appUrlOpen 핸들러
- [ ] Task 6: 검증 — tsc/테스트, 웹에서 구글 로그인 실통과, 앱 빌드 후 실기기
- [ ] Task 7: 코드 리뷰

## 사용자(계정 소유자)만 할 수 있는 것

- [ ] 카카오 개발자센터 앱 등록 → Supabase Kakao provider 활성화
- [ ] Supabase에서 이메일 자동승인 끄기 (Task 3 배포 후에 켜야 함 — 순서 중요)
- [ ] 구글 OAuth 동의 화면을 **프로덕션으로 게시** (테스트 모드면 등록된 테스트 사용자만 로그인됨)

## 진행 메모

(작업하면서 갱신)
