# 이메일 발송 설정 (Supabase Auth)

**적용일**: 2026-08-21 · **상태**: 동작 확인 완료 (비밀번호 재설정 메일 수신 확인)

## 왜 필요했나

Supabase **기본 내장 메일 서비스로는 실사용이 불가능**하다. 팀 멤버로 등록된 주소로만 발송되고 시간당 2통 제한이 있어서, 학생들에게 비밀번호 재설정 메일을 보낼 수 없다. 그래서 커스텀 SMTP를 붙였다.

## 현재 설정

Supabase 대시보드 → Authentication → Emails → SMTP Settings (Enable Custom SMTP: 켜짐)

| 항목 | 값 |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `465` (SSL) |
| Username / Sender email | `lkm040505@gmail.com` |
| Sender name | `스터디 벅스` |
| Password | Google 앱 비밀번호 — Supabase에만 저장, 저장소에는 없음 |

앱 비밀번호는 https://myaccount.google.com/apppasswords 에서 발급한다 (2단계 인증 필수).

## 제약 — 파일럿 이후엔 교체해야 함

- **하루 500통** (Gmail 한도). 파일럿 규모에선 충분하지만 확장하면 막힌다.
- **스팸 분류 위험**. 개인 Gmail 발신이라 학생 메일함에서 스팸으로 갈 수 있다. Supabase도 저장할 때 "personal rather than transactional" 경고를 띄운다.
- **발신자가 개인 주소**로 보인다. `noreply@studybuks.store`가 아니다.

교체 시엔 Resend 등으로 옮기고 `studybuks.store` DNS에 DKIM/SPF 레코드를 추가한다. **코드 변경은 필요 없다** — Supabase 설정만 바꾸면 된다.

## 진단 방법 (다음에 메일이 안 올 때)

증상이 "요청은 성공했다는데 메일이 안 온다"일 때, 원인이 세 군데로 갈린다. 순서대로 잘라내면 빠르다.

**1. 계정이 존재하는지부터 확인** — 가장 흔한 원인이다. 없는 주소로 재설정을 요청하면 Supabase는 계정 존재를 숨기려고 **성공 응답만 주고 아무것도 보내지 않는다**.

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -X POST \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"확인할주소","create_user":false}' \
  "$SUPABASE_URL/auth/v1/otp"
```

`422 otp_disabled` → **그 주소로 가입된 계정이 없다.** 200이면 계정이 있다.

**2. 응답 시간으로 실제 발송 여부 판별** — `/auth/v1/recover`는 계정 유무와 무관하게 200을 준다. 대신 시간을 본다: **0.1초대면 미발송**, **1~3초면 SMTP 왕복이 일어난 것**.

**3. SMTP 자격증명 자체 검증** — 위 둘이 정상인데도 안 오면 SMTP를 직접 찔러본다.

```python
import smtplib, ssl
with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context()) as s:
    s.login("lkm040505@gmail.com", "앱비밀번호")   # 로그인만 되면 자격증명은 정상
```

## 관련

- 재설정 링크의 도착지는 `https://app.studybuks.store` (`AuthScreen.tsx`의 `redirectTo`). Supabase의 Redirect URL 허용목록에 이 주소가 있어야 한다.
- `mailer_autoconfirm`이 켜져 있어서 **회원가입 확인 메일은 발송되지 않는다** (가입 즉시 사용 가능).
- ⚠️ `supabase config push`로 SMTP를 설정하지 말 것. Auth 설정 전체를 로컬 기본값으로 덮어써서 Site URL과 Redirect URL 허용목록까지 초기화된다 — 재설정 링크가 깨진다. 대시보드나 Management API 부분 수정을 쓴다.
