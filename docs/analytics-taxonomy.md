# 스터디 벅스 Amplitude 택소노미

이벤트를 추가할 때 이 문서를 먼저 고친다. 이름은 **Title Case + 과거형**, 속성은 **snake_case**.
화면 코드에서 `@amplitude/unified`를 직접 import하지 않는다 — 본앱은 `src/lib/analytics.ts`,
랜딩은 `landing/src/analytics.ts`의 `track` / `setUserProperties`만 쓴다.

## 구현 현황

Phase 1(가입~학습 세션 핵심 퍼널 + 랜딩 유입)과 Phase 2(숙제·시험·딴짓멈춰·선생님 화면)
모두 코드에 반영돼 있다.

## 오토캡처

본앱·랜딩 모두 5가지만 켠다. `formInteractions`·`fileDownloads`는 SDK 기본값이 `true`라서
명시적으로 꺼야 안 들어온다.

| 켬 | 끔 |
|---|---|
| `pageViews` (Page viewed) | `formInteractions` |
| `sessions` (Start/End session) | `fileDownloads` |
| `attribution` (Marketing attribution + utm/referrer user property) | `elementInteractions`, `frustrationInteractions`, `networkTracking`, `webVitals` |

> 네이티브 앱(Capacitor)은 페이지 이동이 없어 Page viewed가 거의 안 잡힌다. 웹/앱 구분은
> 모든 이벤트에 붙는 `app_platform`으로 한다.

## 공통 event property

모든 이벤트에 자동으로 붙는다 (`src/lib/analytics.ts`의 `track`).

| property | 값 | 비고 |
|---|---|---|
| `app_platform` | `web` \| `android` \| `ios` \| `landing` | Capacitor 플랫폼 |
| `role` | `student` \| `manager` | 프로필 로드 후부터. 로그인 전 이벤트에는 없음 |
| `is_onboarded` | boolean | 프로필 로드 후부터 |

값이 `undefined`인 속성은 `track`이 알아서 빼고 보낸다. 호출부에서 조건부로 붙이는 속성을
`undefined`로 넘겨도 Amplitude 차트에 빈 버킷이 생기지 않는다.

## Events

### Phase 1 — 가입 · 계획 · 학습

| Event | 발생 지점 | Event properties |
|---|---|---|
| `App Opened` | `src/main.tsx` — 앱 부팅 | `prompt_version` |
| `Signed Up` (이메일) | `AuthScreen.tsx` 가입 성공 | `method='email'`, `role`, `email_confirmation_required` |
| `Signed Up` (소셜) | `AuthContext.tsx` — 콜백 후 계정이 60초 내 생성됐으면 | `method` (`kakao`\|`google`) |
| `Signed In` | `AuthContext.tsx` — 새 세션이 설 때 | `method` |
| `Signed Out` | `AuthContext.tsx` — 세션이 끊길 때 | — |
| `Completed Onboarding` | `Onboarding.tsx` 학생/관리자 제출 | 학생: `role`, `grade`, `main_subjects`, `main_subject_count`, `has_goal`, `has_exam_date`, `has_workbooks` · 관리자: `role`, `entered_invite_code` |
| `Linked Account` | `AppStateContext.linkByInviteCode` | `result` (`success`\|`code_not_found`\|`lookup_failed`\|`link_failed`), `managed_student_count` |
| `Created Planner Item` | `AppStateContext.addPlannerItem` | `subject_id`, `source` (`self`\|`homework`), `is_must_do`, `has_page_range`, `day_offset` |
| `Completed Planner Item` | `AppStateContext.updatePlannerItem` (status→completed) | `subject_id`, `source`, `is_must_do`, `actual_minutes`, `understanding`, `day_offset` |
| `Carried Over Planner Item` | `AppStateContext.carryOverPlannerItem` | `subject_id`, `source`, `day_offset` |
| `Started Study Session` | `AppStateContext.startStudySession` | `subject_id`, `source`, `is_must_do` |
| `Ended Study Session` | `AppStateContext.endStudySession` | `subject_id`, `source`, `duration_seconds`, `ended_reason` (`manual`\|`auto`) |
| `Clicked Start App` | 랜딩 CTA | `placement` (`nav`\|`hero`\|`ios_guide`) |
| `Clicked Download Apk` | 랜딩 APK 버튼 | `placement='android_guide'` |

**해석 노트**

- `day_offset` = 오늘 기준 며칠 뒤 날짜에 대한 작업인지(오늘=0). "계획을 얼마나 앞서 세우는가",
  "밀린 걸 뒤늦게 채우는가"를 본다.
- `source='self'`(학생이 직접 세운 계획) vs `'homework'`(선생님이 배정)의 완료율 차이가
  이 제품의 핵심 지표다.
- `ended_reason='auto'`는 화면을 벗어나 자동 종료된 세션 — "타이머 켜두고 딴짓" 패턴.

### Phase 2 — 숙제 · 시험 · 딴짓멈춰 · 선생님 화면

| Event | 발생 지점 | Event properties |
|---|---|---|
| `Created Homework Assignment` | `AppStateContext.createHomeworkAssignment` | `subject_id`, `amount_per_day`, `span_days`, `starts_in_days` |
| `Registered Homework Range` | `AppStateContext.registerHomeworkRange` | `subject_id`, `mode` (`pages`\|`custom`), `date_count`, `page_count`(페이지 모드에서만) |
| `Sent Homework Proposal` | `AppStateContext.createHomeworkProposal` | `subject_id`, `has_page_range`, `day_offset` |
| `Responded To Homework Proposal` | `AppStateContext.respondToHomeworkProposal` | `response` (`accepted`\|`rejected`), `subject_id`, `hours_to_respond` |
| `Created Exam Record` | `AppStateContext.createExamRecord` | `is_main`, `days_until_exam` |
| `Started Mock Exam Timer` | `MockExamTimer.tsx` 시작 | `preset_id`, `planned_minutes` |
| `Ended Mock Exam Timer` | `MockExamTimer.tsx` 종료·시간만료 | `preset_id`, `planned_minutes`, `elapsed_seconds`, `ended_reason` (`manual`\|`time_up`) |
| `Opened Distraction Stop` | `App.tsx` StudentAppShell | `entry_point` (`fab`\|`notification`) |
| `Updated Allowed Apps` | `AllowedAppsScreen.tsx` 화면 닫을 때 | `allowed_app_count`, `added_count`, `removed_count`, `installed_app_count` |
| `Viewed Student Progress` | `ManagerProgress.tsx` 마운트·학생 변경 | `managed_student_count` |

**해석 노트**

- `preset_id`는 모의고사 타이머의 시험지 단위(`korean`/`math`/`english`/`history`/`inquiry`/
  `foreign`/`custom`)라서 플래너의 `subject_id`와 값 집합이 다르다. 같은 속성명을 쓰면 두 열거형이
  한 칸에 섞여 못 쓰게 되므로 일부러 이름을 나눴다.
- `Updated Allowed Apps`는 토글마다가 아니라 **화면을 닫을 때 한 번**, 실제로 변한 게 있을 때만
  보낸다. 앱 목록을 훑으며 열댓 번 누르는 화면이라 토글 단위로 남기면 노이즈만 된다.
- `hours_to_respond`가 낮으면 푸시 알림이 실제로 먹히고 있다는 뜻이다.
- `Opened Distraction Stop`의 `entry_point`는 이 기능의 재방문 경로를 가른다 — 설정을 끝낸
  학생이 알림(`notification`)으로 돌아오는지, 매번 화면 버튼(`fab`)을 찾는지.

## User properties

| property | 갱신 방식 | 세팅 위치 |
|---|---|---|
| `signup_method` | `setOnce` | `AuthScreen` / `AuthContext` |
| `signed_up_at` | `setOnce` | `AuthScreen` / `AuthContext` |
| `role` | `set` | `AppStateContext.syncUserProperties` |
| `is_onboarded`, `onboarded_at` | `set` | 〃 |
| `grade`, `main_subjects`, `main_subject_count` | `set` | 〃 |
| `has_goal`, `has_workbooks`, `main_exam_date` | `set` | 〃 |
| `linked_manager_count` (학생) | `set` | 〃 |
| `managed_student_count` (선생님·학부모) | `set` | 〃 |
| `app_platform` | `set` | 〃 |
| `push_enabled` | `set` | `registerDeviceToken` |
| `distraction_stop_enabled` | `set` | `DistractionStop.tsx` 기능 토글 |
| `last_study_session_at` | `set` | `endStudySession` |
| `planner_items_created` | `add` | `addPlannerItem` |
| `homework_completed_count` | `add` | `updatePlannerItem` (source=homework) |
| `total_study_sessions` | `add` | `endStudySession` |
| `total_study_minutes` | `add` | `endStudySession` |

`syncUserProperties`는 프로필·연결 관계가 바뀔 때마다 통째로 다시 쓴다. 이벤트마다 같은 값을
실어 보내지 않는 이유가 이것이다 — 값이 한 곳에서만 정해진다.

## 신원(identity)

- 로그인/세션 복구 시 `amplitude.setUserId(user.id)`. Supabase user id를 그대로 쓴다.
- 로그아웃 시 `amplitude.reset()` — userId와 deviceId를 함께 끊어 다음 사용자와 섞이지 않게 한다.
- 새로고침으로 세션이 복구되는 건 `Signed In`으로 세지 않는다(`AuthContext`의 `signedInUserId` ref).

## 키 설정

- 본앱: `VITE_AMPLITUDE_API_KEY` (`.env` / Vercel 환경변수). 없으면 콘솔 경고 후 분석만 비활성.
- 랜딩: `landing/src/analytics.ts`에 하드코딩. 랜딩엔 env 체계가 없고 ingestion key는 어차피
  번들에 실려 공개된다 — 랜딩에 환경변수를 도입하면 그때 옮긴다.
