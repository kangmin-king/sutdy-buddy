# Context — 소셜 로그인 + 이메일 인증

**Last Updated**: 2026-08-21

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `src/lib/supabase.ts` | 클라이언트 생성. `detectSessionInUrl` 여기 있음 |
| `src/screens/AuthScreen.tsx` | 로그인·회원가입·비밀번호찾기 3개 모드를 한 화면에서 전환 |
| `src/state/AuthContext.tsx` | 세션 구독, `PASSWORD_RECOVERY` 이벤트 감지 |
| `src/App.tsx` | `Gate`가 loading → passwordRecovery → session 순으로 분기 |
| `src/screens/Onboarding.tsx` | 프로필 최초 생성. `user_metadata.role`을 읽음 (없으면 student) |
| `android/app/src/main/AndroidManifest.xml` | 딥링크 intent-filter 추가 위치 |

## 외부 설정 상태 (2026-08-21 확인)

- Supabase 프로젝트: `emzpjxcaydrzbwwjnuee`
- 활성 provider: `email`, `google` — **카카오는 아직 없음**
- 구글 OAuth 클라이언트: 프로젝트 번호 `744615546034` (푸시용 Firebase `731629733192`와 **다른**
  구글 클라우드 프로젝트. 브라우저 방식이라 무관하지만, 나중에 네이티브 구글 SDK로 바꾸려면
  Firebase 쪽에 안드로이드 클라이언트를 새로 만들어야 함)
- `mailer_autoconfirm: true` — 아직 이메일 인증이 꺼져 있는 상태
- SMTP: Gmail(`lkm040505@gmail.com`, 465). 자세한 건 `docs/email-delivery.md`

## 확인 명령

```bash
# provider 활성 상태
curl -s -H "apikey: $ANON" "$URL/auth/v1/settings" | python -c "import sys,json;print(json.load(sys.stdin)['external'])"

# 구글 로그인 진입점이 살아있는지 (302 + accounts.google.com 이면 정상)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$URL/auth/v1/authorize?provider=google"
```

## 의사결정 로그

- **implicit 플로우 유지** — PKCE는 앱에서 요청하고 브라우저에서 여는 비밀번호 재설정을
  깨뜨린다 (code_verifier 저장소 불일치)
- **네이티브 구글 SDK 안 씀** — 시스템 브라우저 + 딥링크로 구글·카카오를 한 경로로 처리
- **역할 선택은 온보딩으로 이동** — 소셜 로그인엔 가입/로그인 구분이 없어서 버튼 단계에서
  역할을 물을 수 없다
- **이메일 인증 소급 적용 안 함** — 기존 계정이 잠기면 안 됨
