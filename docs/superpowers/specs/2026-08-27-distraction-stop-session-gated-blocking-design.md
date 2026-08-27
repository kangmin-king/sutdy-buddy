# 딴짓 멈춰 — 차단 조건을 학습 세션 기반으로 전환

## 배경

학생이 "딴짓 멈춰가 실행이 안 된다"고 신고했다. 조사 결과 두 개의 별개 문제가 나왔다.

**(1) 타이머 연장 버그 — 이 스펙과 별개로 이미 수정됨.** 쉬는 시간이 끝나도 `endTimeMillis`가 과거 타임스탬프로 남고, `extendTimer`가 그 과거 값을 기준으로 시간을 더해서 결과가 여전히 과거였다. 화면은 계속 `종료됨`이라 `+5분`을 눌러도 아무 반응이 없는 것처럼 보였다. 연장 기준점을 `max(endTime, now)`로 고쳐 해결했다(`TimerState.extendedEndTime`).

**(2) 차단이 거의 걸리지 않는 설계 — 이 스펙의 주제.** 현재 차단 조건은 다음과 같다.

```
featureEnabled && 앱선택됨 && !isBreakActive(now) && isWithinLockout(now)
```

`isWithinLockout`은 `endTimeMillis`가 없으면 항상 `false`다. 즉 **쉬는 시간 타이머를 한 번 돌린 직후(+ lockout 기간)를 제외하면 차단이 아예 작동하지 않는다.** 학생이 토글을 켜고 인스타/유튜브/틱톡을 골라도, 쉬는 시간을 시작하지 않으면 아무 일도 일어나지 않는다.

이것은 버그가 아니라 **이식된 설계**다. 이 기능은 reels-stop에서 포팅했고(`dev/active/distraction-stop/`), 원본의 `soloExitAction`은 동일한 조건을 쓴다. reels-stop에서는 자연스러웠다 — "릴스 볼 시간을 정해두고, 그 시간이 끝나면 강제로 차단"이라 쉬는 시간이 사용의 출발점이었다. 스터디 벅스로 옮겨오면서 그 출발점이 사라졌고, 학생의 멘탈모델("켰으니 막히겠지")과 어긋나게 됐다.

## 결정: 공부 중 차단 + 쉬는 시간은 예외

차단의 기준점을 **학습 세션**으로 옮긴다. 학생이 학습 타이머를 시작하면 차단이 켜지고, 쉬는 시간을 쓰는 동안만 열린다.

이 선택이 가능한 이유는 "공부 중" 신호가 **이미 네이티브까지 배선되어 있기** 때문이다. `StudentHome.handleStart`가 `setSessionActive({ active: true })`를 보내고, `TimerState.sessionActive`에 저장된다. 지금은 이 값을 허용앱 밖 이탈 감지에만 쓰고 있어서, 차단 조건으로 재사용하는 것은 조건식 한 줄 수준의 변경이다.

**대안으로 검토했다가 버린 것:**
- *켜두면 항상 차단* — PRD §1에 "제약을 거는 기능보다 자기주도 도구가 학생 수용성이 높다"는 운영 피드백이 기록되어 있다. 하루 종일 차단은 그 방향에 역행한다.
- *공부 중이면 무조건 차단(쉬는 시간 개념 삭제)* — 쉬는 시간 UI·알림 퀵컨트롤을 통째로 제거해야 하고, 학생에게 숨 쉴 구멍이 없어진다.
- *로직 유지, 안내만 개선* — 가장 작지만 학생 기대와의 어긋남이 그대로 남는다.

## 범위

- 차단 조건을 `sessionActive` 기반으로 교체, lockout 개념 제거
- 쉬는 시간 시작/연장 시 학습 세션 자동 정지 (쉬는 동안 학습 시간이 쌓이지 않게)
- `sessionActive` 고착 방지 안전장치 (자동 만료 + 알림에서 해제)
- 딴짓 멈춰 화면의 상태 배너 및 라벨 문구 정리

**범위 밖:**
- 학습 타이머의 백그라운드 유지(포그라운드 서비스) — 별개 요청으로 따로 다룬다. 이 스펙은 앱이 살아있는 동안의 동작만 정의한다.
- 쉬는 시간 사용량에 한도를 두는 것 — 한도 대신 "쉬는 동안 학습 시간이 안 쌓인다"는 자연스러운 손실로 해결한다(아래 참고).
- 허용앱을 패키지명 직접 입력(`com.android.calculator2`)으로 받는 UX 문제 — 별도 트랙.

## 설계

### 1. 차단 조건

```
변경 전: featureEnabled && 앱선택됨 && !isBreakActive(now) && isWithinLockout(now)
변경 후: featureEnabled && 앱선택됨 && isSessionActive(now)
```

`isSessionActive`는 `sessionActive` 필드를 그대로 읽는 것이 아니라 자동 만료를 함께 적용한다(3절 참고).

`TimerState`에 순수 함수로 넣는다.

```kotlin
fun shouldBlock(app: BlockedApp, nowMillis: Long): Boolean
```

`isWithinLockout`과 `lockoutDurationMillis` 필드, `setLockoutDurationMillis` 플러그인 메서드, `재차단 유예 시간` 설정 UI를 모두 삭제한다. 차단을 무장시키는 역할이 `sessionActive`로 넘어가므로, "쉬는 시간 종료 후 잠깐 열리는 창"이라는 개념 자체가 필요 없어진다.

`isBreakActive`는 조건식에서 빠지지만 남은 시간 표시에 계속 쓰이므로 삭제하지 않는다. 쉬는 시간 중에는 아래 2번에 의해 `sessionActive`가 이미 false이므로 조건식에 중복으로 넣지 않는다 — 불변식을 두 곳에서 표현하면 나중에 한쪽만 바뀐다.

### 2. 쉬는 시간 = 학습 일시정지

`TimerStateStore.startTimer`와 `extendTimer`가 `sessionActive`를 함께 `false`로 내린다. 결과:

- **차단 해제** — 조건식의 `sessionActive`가 꺼지므로 자동으로 따라온다.
- **학습 시간이 쌓이지 않는다** — 새로운 회계 로직 없이, 기존 일시정지 경로를 그대로 탄다. 학생이 쉬는 시간 30분을 반복해서 눌러 차단을 무력화할 수는 있지만, 그 시간만큼 학습 기록이 비고 그것이 매니저 홈의 오늘 타임라인·플래너 진행률에 그대로 드러난다. 제약이 아니라 "안 하면 티가 난다"로 처리하는 쪽이 제품 철학(손실회피)에 맞다.
- **앱 밖에서도 동일하게 동작한다** — 알림 퀵컨트롤의 `+5/+10/+30분`도 같은 store 메서드를 타므로, 앱을 나가 있어도 쉬는 시간을 시작하면 학습이 정지된다.

**정지 사유 구분이 필요하다.** `StudentHome`의 `sessionActive` 하강 감지는 지금 이 전환을 무조건 이탈(`endStudySession(..., deviated: true)`)로 기록한다. 쉬는 시간으로 인한 정지는 이탈이 아니므로 `deviated: false`여야 한다. `stateChanged` 이벤트에 `endTimeMillis`가 함께 오므로, "하강과 동시에 쉬는 시간이 활성화됐는가"로 판별한다. 이 판별을 `distractionStopModel.ts`의 순수 함수로 넣는다.

```ts
type SessionStopCause = 'break' | 'deviation' | 'self';
function classifySessionStop(prev: DistractionState, next: DistractionState, selfInitiated: boolean): SessionStopCause
```

`selfInitiated`(학생이 직접 정지/완료를 누른 경우)는 기존 `selfInitiatedStop` ref를 그대로 넘긴다.

### 3. `sessionActive` 고착 방지

새 조건의 유일한 위험: 학생이 공부 중 앱을 강제 종료하면 `sessionActive = true`가 SharedPreferences에 영구히 남고, 네이티브는 세션이 죽은 걸 알 방법이 없어 **인스타가 영원히 차단**된다. 두 겹으로 막는다.

**(a) 자동 만료.** `sessionActive`를 켤 때 시작 시각(`sessionStartedAtMillis`)을 함께 저장하고, **3시간**이 지나면 꺼진 것으로 취급한다. 한 항목을 3시간 연속 공부하는 경우는 사실상 없고, 있더라도 학생이 화면에서 다시 시작을 누르면 갱신된다. 순수 함수로 넣어 테스트한다.

```kotlin
fun isSessionActive(nowMillis: Long): Boolean =
    sessionActive && sessionStartedAtMillis != null &&
    nowMillis - sessionStartedAtMillis < SESSION_MAX_MILLIS  // 3시간
```

`shouldBlock`은 `sessionActive` 필드가 아니라 이 함수를 본다.

**(b) 알림에서 해제.** 퀵컨트롤 알림에 `공부 끝내기` 액션을 추가한다. 앱을 열 수 없는 상황에서도 학생이 항상 차단을 끌 수 있어야 한다. 안드로이드 알림은 액션 버튼을 보통 3개까지 보여주므로, 자리를 만들기 위해 `+5/+10/+30분` 중 `+10분`을 뺀다 — 남는 조합은 `+5분 / +30분 / 공부 끝내기`.

구현은 `QuickActionReceiver`에 새 액션 `ACTION_END_SESSION`을 추가하고 `store.setSessionActive(false)`를 호출한다. 기존 `ACTION_QUICK_SET`은 시간 연장 전용으로 남긴다 — 하나의 액션에 부호로 의미를 섞으면(현재 `extraMillis <= 0` 분기처럼) 읽기 어려워진다.

이 해제는 네이티브의 `sessionActive`만 내린다. 앱이 살아 있으면 웹이 `stateChanged`로 관측해 학습 세션을 정지하고, 앱이 죽어 있으면 DB의 세션은 열린 채 남는다 — 이는 이 스펙의 범위 밖인 기존 백로그 항목(브라우저를 닫으면 세션이 안 끝나는 문제)과 같은 성질의 것으로, 여기서 새로 만드는 문제가 아니다.

### 4. 화면 문구

지금 화면은 왜 차단이 걸리지 않는지 알려주지 않는다. 토글 카드 아래에 상태 배너를 넣는다.

| 상태 | 문구 |
|---|---|
| 기능 꺼짐 | 딴짓 멈춰가 꺼져 있어요 |
| 공부 안 함 | 차단 대기 중 — 공부를 시작하면 인스타·유튜브·틱톡이 막혀요 |
| 공부 중 | 차단 중 — 지금 인스타·유튜브·틱톡을 열면 막혀요 |
| 쉬는 시간 | 쉬는 시간 N분 남음 — 이 동안은 공부 시간이 쌓이지 않아요 |

문구 선택도 `distractionStopModel.ts`의 순수 함수로 분리한다.

라벨 변경:
- 토글 부제: `쉬는 시간이 끝나면 선택한 앱을 자동으로 차단해요` → `공부하는 동안 선택한 앱을 차단해요`
- exitMode 섹션 제목: `쉬는 시간이 끝나면` → `공부 중 차단 앱을 열면`. 즉시 차단 / 확인 후 종료 / 유예시간 후 종료 세 동작은 그대로 유효하며, 발동 시점만 명확해진다.
- `쉬는 시간` 섹션은 그대로. 쉬는 시간이 끝나는 순간에는 이제 아무 강제도 없다 — 학생이 공부를 재개하지 않으면 학습 시간이 쌓이지 않는 것으로 충분하다.

### 5. 데이터 마이그레이션

`TimerStateStore.fromJson`은 이미 알 수 없는 키를 무시하고 누락된 키에 기본값을 쓴다(`json.optBoolean` 패턴). 기존 기기에 저장된 `lockoutDurationMillis`는 읽지 않으면 그대로 방치되고, 새로 추가되는 `sessionStartedAtMillis`는 없으면 `null`이다. `sessionStartedAtMillis`가 `null`이면 `isSessionActive`가 `false`이므로, 업데이트 직후 예전 `sessionActive = true`가 남아 있어도 안전하게 꺼진 상태로 시작한다. 별도 마이그레이션 코드가 필요 없다.

## 테스트

**JVM 단위 테스트** (`TimerStateTest`, Robolectric 없이 순수 함수만):
- `shouldBlock`: 공부 중 + 선택된 앱 → 차단 / 공부 안 함 → 차단 안 함 / 기능 꺼짐 → 차단 안 함 / 선택 안 된 앱 → 차단 안 함
- `isSessionActive`: 3시간 이내 → 활성 / 3시간 경과 → 만료 / 시작 시각 없음 → 비활성
- 회귀: 쉬는 시간이 없어도(`endTimeMillis == null`) 공부 중이면 차단된다 — 이번 문제의 본질

**vitest** (`distractionStopModel.test.ts`):
- `classifySessionStop`: 쉬는 시간 시작과 동시 하강 → `break` / 그냥 하강 → `deviation` / 자기 정지 → `self`
- 상태 배너 문구 선택: 네 가지 상태 각각

**실기기 검증** (APK 빌드 후 사용자가 수행):
1. 접근성·오버레이 권한 허용
2. 학습 타이머 시작 → 인스타 열기 → 차단 화면이 뜬다
3. 쉬는 시간 `+5분` → 인스타가 열린다 + 학습 타이머가 정지되어 있다
4. 알림의 `공부 끝내기` → 인스타가 열린다
5. 공부 중 앱 강제 종료 → 3시간 후 차단이 풀린다 (또는 시각을 조정해 확인)

## 배포 주의

네이티브 변경이므로 **학생이 새 APK를 설치해야 적용된다.** 웹만 배포하면 화면 문구는 바뀌지만 차단 조건은 그대로다. 이 환경의 `JAVA_HOME`은 JDK 17이라 `./gradlew`가 `invalid source release: 21`로 실패한다 — Android Studio 내장 JDK를 지정해야 한다.

```
JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew :app:testDebugUnitTest
```
