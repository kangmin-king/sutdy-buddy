# 딴짓 멈춰 — 이탈 감지와 차단 무장의 신호 분리

**스펙 A.** 후속으로 스펙 B(허용앱 선택 UI), 스펙 C(허용앱 사용을 매니저에게 노출)가 이어진다. 이 문서는 A만 다룬다.

## 배경

앞선 변경([2026-08-27-distraction-stop-session-gated-blocking-design.md](2026-08-27-distraction-stop-session-gated-blocking-design.md))은 차단 조건을 "쉬는 시간 종료 후 lockout 창"에서 "학습 세션이 도는 동안"으로 옮겼다. 코드는 계획대로 랜딩했고 단위 테스트도 통과했지만, 브랜치 전체 리뷰에서 **그 변경이 학생의 원래 신고를 고치지 못한다**는 것이 드러났다.

`accessibility_service_config.xml`에는 `android:packageNames` 제한이 없어 서비스가 모든 앱의 화면 전환을 받는다. 그리고 같은 서비스의 이탈 감지 분기가 "우리 앱이 아니고 허용앱도 아닌" 모든 패키지에 대해 `sessionActive`를 내린다 — **런처를 포함해서**. 허용앱 기본값은 빈 목록이다.

```
학생: 공부 시작        → sessionActive ON  (차단 무장)
학생: 홈 버튼          → 런처 이벤트 → 이탈 감지 → sessionActive OFF
학생: 인스타 열기      → shouldBlock false → 그냥 열림
```

인스타에 도달하려면 홈을 거쳐야 하므로, **차단은 발동 기회를 얻기 전에 스스로 꺼진다.** 근본 원인은 하나의 필드가 두 개의 서로 상충하는 역할을 겸한 것이다: 차단을 무장시키는 신호이면서, 동시에 이탈을 웹에 알리는 통신 수단이다. 이탈을 알리려면 그 값을 내려야 하고, 내리면 차단이 풀린다.

부수적으로 이 동작은 이번 변경 이전부터 있었다. 즉 **홈 버튼을 누르기만 해도 학습 세션이 "이탈"로 종료되고 있었을 가능성이 높다.**

같은 리뷰가 함께 찾은 것들:

- **C2** `withSessionStarted`가 `endTimeMillis`를 그대로 두므로 공부와 쉬는 시간이 동시에 활성될 수 있다. 배너는 `쉬는 시간`이라 말하는데 실제로는 차단되고, 그 상태의 진짜 이탈이 `deviated: false`로 기록된다.
- **C3** 3초 차단 쿨다운이 이탈 분기로 흘러내린다. 차단된 앱을 3초 안에 다시 열면 이탈로 처리되어 그 세션 내내 차단이 풀린다.
- **C4** `App.tsx`가 딴짓멈춰 오버레이를 띄울 때 `StudentHomeScreen`을 언마운트한다. `+5/+10/+30분` 칩이 바로 그 화면에 있으므로, 거기서 시작한 쉬는 시간은 `sessionActive` 하강을 관측할 컴포넌트가 없다 — 열린 `sb_study_sessions` 행이 닫히지 않는다.
- **I1** 차단 화면과 경고 알림 문구가 아직 `쉬는 시간이 끝났어요` / `5분 더 쉬기` / `쉬는 시간이 곧 끝나요`다. 이제 이 화면들은 **공부 중에** 뜬다. 기본 `exitMode`가 `GRACE_PERIOD`라 대부분의 학생이 이 틀린 문구를 본다.
- **I2** 이탈이 더 이상 차단을 풀지 않게 되면 갇힘 위험이 커지는데, 딴짓멈춰 화면에는 차단을 끄는 컨트롤이 없다. 앱을 열 수 있는 상황조차 탈출구가 알림뿐이다.

## 결정

**신호를 두 층으로 분리한다.**

| 층 | 뜻 | 누가 바꾸는가 |
|---|---|---|
| 공부 모드 (`sessionActive`) | 차단 무장 | 학생의 시작 / 정지 / 완료, 알림 `공부 끝내기`, 딴짓멈춰 화면의 `공부 끝내기`, 3시간 자동 만료 — **이것들만** |
| 학습 시간 집계 (`sb_study_sessions` 행) | 실제로 쌓이는 시간 | 위의 것들 + 이탈 + 쉬는 시간 |

이탈 감지는 `sessionActive`를 더 이상 건드리지 않는다. 대신 상태에 표식을 남기고, 웹이 그 표식을 보고 열린 학습 세션을 닫는다.

그리고 **쉬는 시간은 공부 모드를 끄지 않는다.** 쉬는 동안에는 차단만 풀리고(`shouldBlock`에 `!isBreakActive` 조건이 돌아온다) 집계만 멈춘다. 쉬는 시간이 끝나면 **차단이 자동으로 복귀한다** — 학생이 다시 시작을 누를 필요가 없다. 이는 원본 reels-stop의 "쉬는 시간이 끝나면 다시 막힌다"는 성질을 되살리면서, 제품 철학(손실회피)에도 맞는다.

**대안으로 검토했다가 버린 것:**

- *이탈 감지 기능을 제거* — 학습 타이머가 어떤 앱으로 나가든 계속 돈다. 가장 단순하지만 "공부 켜두고 딴짓" 방지가 차단 하나에만 의지하게 되고, 학습 기록의 정직성이 떨어진다.
- *제외 목록만 추가* — 런처·시스템UI를 이탈 판정에서 빼는 최소 수정. C1의 증상은 가라앉지만 두 역할이 한 필드를 공유하는 근본은 남아, 차단 대상 앱으로의 이탈에서 같은 충돌이 재발한다.

## 범위

- `sessionActive`의 단일 소유자화 + 이탈 표식(`pendingStop`) 도입
- 시스템 화면(런처·시스템UI·키보드) 자동 이탈 예외
- 쉬는 시간을 차단 해제 + 집계 정지로 재정의, `shouldBlock`에 `!isBreakActive` 복귀
- C3(쿨다운 흘러내림), C4(관측자 언마운트) 수정
- I1(문구), I2(딴짓멈춰 화면의 `공부 끝내기`)
- 앞선 리뷰가 남긴 소소한 정리

**범위 밖:**

- **허용앱 선택 UI** — 스펙 B. 이 스펙에서 허용앱은 여전히 패키지명 직접 입력이며, 목록은 기본값이 빈 상태다. 즉 A만 배포하면 음악 앱으로 나가도 집계가 멈춘다. A의 가치는 차단이 실제로 작동하고 홈 버튼이 기록을 깨지 않게 되는 것이다.
- **허용앱 사용을 매니저에게 노출** — 스펙 C. 기록 스키마와 실시간 배지가 필요하고, 실시간 구독은 이 앱에 아직 없는 기능이다.
- **학습 타이머의 백그라운드 유지(포그라운드 서비스)** — 별개 요청으로 남아 있다.
- **student-home-redesign** — 진행 중인 별개 작업. 아래 "충돌 관리" 참고.

## 설계

### 1. `TimerState` — 이탈 표식과 소유권

필드를 두 개 추가한다. 기존 파일이 평면 스칼라만 쓰므로 같은 형태를 따른다. 두 필드는 항상 함께 설정·해제되며, 그 불변식은 아래 전이 함수들만이 유지한다.

```kotlin
val pendingStopReason: StopReason? = null,   // DEVIATION | BREAK
val pendingStopAtMillis: Long? = null
```

전이 함수:

| 함수 | 하는 일 |
|---|---|
| `withSessionStarted(now)` | `sessionActive = true`, `sessionStartedAtMillis = now`, `endTimeMillis = null`(공부를 시작하면 쉬는 시간은 끝난다), 표식 해제 |
| `withSessionStopped()` | `sessionActive = false`, `sessionStartedAtMillis = null`, 표식 해제 |
| `withBreakUntil(end)` | `endTimeMillis = end`. `sessionActive`는 **그대로 둔다**. 공부 중이었다면 표식을 `(BREAK, now)`로 남긴다 |
| `withDeviation(now)` | 표식을 `(DEVIATION, now)`로 남긴다. `sessionActive`는 **건드리지 않는다** |
| `withPendingStopCleared()` | 표식만 해제 |

판단 함수:

```kotlin
fun isSessionActive(nowMillis: Long): Boolean   // 기존 그대로 (3시간 만료 포함)
fun isBreakActive(nowMillis: Long): Boolean     // 기존 그대로

fun shouldBlock(app: BlockedApp, nowMillis: Long): Boolean =
    featureEnabled && app in enabledApps && isSessionActive(nowMillis) && !isBreakActive(nowMillis)

fun hasPendingStop(): Boolean
```

`shouldBlock`에 `!isBreakActive`가 돌아온 이유는 앞선 스펙과 반대다. 앞선 스펙은 쉬는 시간이 `sessionActive`를 껐으므로 중복이었다. 이제는 쉬는 시간 중에도 공부 모드가 유지되므로 이 조건이 유일한 차단 해제 경로다.

### 2. 시스템 화면 자동 예외

이탈 판정에서 제외할 대상을 하드코딩하지 않고 시스템에 물어본다. 새 클래스 `SystemSurfaces`가 담당한다.

- **런처**: `PackageManager.resolveActivity(Intent(ACTION_MAIN).addCategory(CATEGORY_HOME), MATCH_DEFAULT_ONLY)`의 패키지. 제조사 런처도 정확히 잡힌다.
- **시스템 UI**: `com.android.systemui` (알림창·잠금화면·최근 앱)
- **키보드**: `Settings.Secure.getString(DEFAULT_INPUT_METHOD)`은 `패키지명/서비스명` 형식이므로 `/` 앞을 취한다
- **우리 앱**: 기존대로 `applicationContext.packageName`

런처와 키보드는 매 이벤트마다 조회하면 낭비이므로 결과를 캐시하되, 기본 런처나 키보드는 학생이 바꿀 수 있으므로 영구 캐시는 하지 않는다. 서비스가 살아 있는 동안 **60초 TTL**로 캐시한다.

`SystemSurfaces.packages()`가 돌려주는 집합에는 **우리 앱의 패키지도 포함한다.** 그러면 "이탈이 아닌 패키지"가 한 곳에 모여 판정 함수가 예외를 하나만 알면 된다.

이 조회는 `Context`가 필요해 단위 테스트할 수 없다. 그래서 `SystemSurfaces`는 조회만 담당하고, "이 패키지가 이탈인가"라는 판단은 `TimerState`의 순수 메서드로 분리한다 — 허용앱 목록이 상태에 있으므로 그쪽이 자연스럽다.

```kotlin
// systemPackages: SystemSurfaces.packages() — 런처, 시스템UI, 현재 키보드, 우리 앱
fun isDeviation(packageName: String, systemPackages: Set<String>): Boolean =
    packageName !in systemPackages && packageName !in allowedApps
```

시각 인자는 받지 않는다. 공부 중인지, 쉬는 시간인지, 이미 표식이 있는지는 호출부가 별도 함수로 판단한다(§3) — 한 함수가 여러 질문에 답하면 테스트가 흐려진다.

### 3. 서비스 흐름

```kotlin
val blockedApp = BlockedApp.fromPackageName(packageName)

if (blockedApp != null) {
    // 차단 대상 앱은 차단 경로의 소관이다. 쿨다운으로 이번 이벤트를 넘기더라도
    // 이탈 분기로 흘러내리지 않는다 — 흘러내리면 3초 안에 다시 열어 차단을 무력화할 수 있다(C3).
    val inCooldown = ...
    if (state.shouldBlock(blockedApp, now) && !inCooldown) {
        ...차단...
    }
    return@launch
}

// 이탈 감지: 공부 중이고, 쉬는 시간이 아니고, 시스템 화면도 허용앱도 아닐 때만.
// sessionActive는 건드리지 않는다 — 차단은 학생이 명시적으로 끝낼 때까지 유지된다.
if (state.isSessionActive(now) && !state.isBreakActive(now) && !state.hasPendingStop() &&
    state.isDeviation(packageName, systemSurfaces.packages())
) {
    store.markDeviation(now)
}
```

`hasPendingStop()` 검사는 아직 처리되지 않은 표식 위에 덮어쓰지 않기 위한 것이다. 첫 이탈 시각이 기록되어야 그 시점까지의 학습 시간이 정확히 저장된다.

차단 대상 앱으로의 이탈은 이제 이탈로 기록되지 않는다. 차단 화면이 떠서 학생을 되돌리므로 실제로 이탈한 것이 아니다.

### 4. 웹 — 표식 처리를 화면 밖으로

**문제(C4).** 표식을 관측하는 코드가 `StudentHome` 안에 있으면 딴짓멈춰 오버레이가 열릴 때 사라진다. 그리고 열린 세션 목록이 `StudentHome`의 지역 상태(`runningSessionId`)에 있어 프로세스 재시작도 못 넘긴다.

**해결.** 처리를 `StudentAppShell`(오버레이가 떠도 마운트를 유지한다) 레벨의 훅으로 올리고, 열린 세션은 `AppStateContext`의 `studySessions`에서 유도한다. 새 파일:

- `src/screens/student/pendingStopModel.ts` — 순수 함수
  - `findOpenStudySessions(studySessions): { itemId, sessionId, startedAt }[]` — `durationSeconds == null`인 행이 열린 세션이다
  - `secondsUntil(startedAt: string, atMillis: number): number` — 표식 시각까지의 초. 음수는 0으로 클램프한다
- `src/screens/student/usePendingStudyStop.ts` — 위 함수들과 `AppStateContext`를 엮는 훅

훅의 동작: 표식이 있으면 열린 세션 전부를 닫는다. `deviated`는 `reason === 'DEVIATION'`, 저장할 초는 `secondsUntil(startedAt, pendingStopAtMillis)`. 그런 다음 `clearPendingStop()`.

**표식 시각을 쓰는 것이 정확도 개선이다.** 지금은 `endStudySession`에 초를 넘기지 않아 서버가 쓰는 시점으로 계산한다. 웹이 늦게 알아차리면 그 지연이 학습 시간에 더해진다 — C4에서 쉬는 시간이 학습 시간에 포함되던 경로가 정확히 이것이다. 표식 시각을 쓰면 실제로 멈춘 순간까지만 저장된다.

처리 실패 시 표식은 남으므로 다음 기회에 다시 시도한다. 세션을 닫은 뒤 해제에 실패해도, 다음 실행은 열린 세션을 찾지 못해 표식만 해제한다 — 중복 종료가 생기지 않는다.

**`StudentHome.tsx`에서는 삭제만 한다.** `sessionActive` 하강 감지 `useEffect`, `prevNativeSessionActive` ref, `selfInitiatedStop` ref, `handleStart`/`handleStop`의 ref 조작을 지운다. `setSessionActive` 호출 자체는 남긴다(공부 모드의 소유자가 여기이므로). 사유가 표식에 명시되니 "자기 정지인지 이탈인지" 추측하던 장치가 전부 불필요해진다.

`classifySessionStop`과 그 테스트는 죽은 코드가 되므로 삭제한다.

### 5. 딴짓멈춰 화면 — 탈출구(I2)

상태가 `blocking`일 때 `공부 끝내기` 버튼을 노출하고 `setSessionActive({ active: false })`를 호출한다. 앱이 강제 종료된 뒤 다시 열었을 때, 배너는 `차단 중`이라 말하면서 끌 방법이 없던 상황을 없앤다.

### 6. 문구 정정(I1)

이 화면들은 이제 공부 중에 뜬다.

| 위치 | 현재 | 변경 |
|---|---|---|
| `activity_block_screen.xml` | 쉬는 시간이 끝났어요 | 지금은 열 수 없어요 |
| 확인 알림 제목 | 계속 쉴까요? | 공부 중이에요 |
| 확인 알림 버튼 | 5분 더 쉬기 / 그만 쉬기 | 5분 쉬기 / 공부 계속하기 |
| 유예 알림 | 쉬는 시간이 곧 끝나요 | 공부 중이에요 |
| 유예 알림 본문 | N초 후 자동으로 종료됩니다 | N초 후 자동으로 닫혀요 |

`5분 쉬기`는 `extendTimer`를 호출하므로 이제 쉬는 시간을 시작해 차단을 풀고 집계를 멈춘다 — 라벨과 동작이 일치한다.

### 7. 소소한 정리

- `TimerStateStore.startTimerUntil` 삭제 — 호출부가 없다
- `QuickControlNotificationManager`의 30초 티커 조건을 `isSessionActive(now)`로 통일. 지금은 원시 `sessionActive`를 읽어 3시간 만료 후에도 영원히 재렌더한다
- `statusMessage`의 쉬는 시간 분기에서 `formatRemaining`의 `null` 보간 방어
- `dev/active/distraction-stop/distraction-stop-context.md`의 `Last Updated` 갱신

### 8. 데이터 마이그레이션

`fromJson`은 새 키 두 개를 `has`/`isNull` 검사 후 읽는다. 기존 기기의 JSON에는 없으므로 표식 없는 상태로 시작한다. 예전 `sessionActive = true`가 남아 있어도 `sessionStartedAtMillis`가 없으면 `isSessionActive`가 false이므로 안전하다. 별도 마이그레이션 코드는 필요 없다.

`fromJson`이 `runCatching { }.getOrDefault(TimerState.DEFAULT)`로 감싸여 있어 예외 하나가 학생의 설정을 전부 날린다는 점을 유지 조건으로 못박는다 — 새 키는 반드시 방어적으로 읽는다.

## 충돌 관리

`student-home-redesign`이 `StudentHome.tsx`(미커밋 423줄)와 `studentHomeModel.ts`를 진행 중이다. 이 스펙을 먼저 넣고 리디자인을 그 위로 리베이스한다.

충돌 표면을 줄이기 위해:

- **새 로직은 전부 새 파일에 둔다** — `pendingStopModel.ts`, `usePendingStudyStop.ts`, Kotlin `SystemSurfaces.kt`. 새 파일은 리베이스에서 충돌하지 않는다.
- **`StudentHome.tsx`에서는 삭제만 한다.** 리디자인은 그 `useEffect`를 원형 그대로 유지했으므로, 삭제는 해소하기 쉬운 충돌이다.
- 리디자인이 만든 `deriveRunningSessionIds`/`findStaleRunningSessions`에 **의존하지 않는다** — 아직 커밋되지 않았다. 같은 유도를 `pendingStopModel.ts`에 독립적으로 둔다. 리디자인이 랜딩한 뒤 둘을 합치는 것은 후속 정리 대상이다.

## 테스트

**JVM 단위 테스트** (`TimerStateTest`, Robolectric 없음 — 순수 함수만):

- `shouldBlock`: 공부 중 → 차단 / 쉬는 시간 중 → 차단 안 함 / 쉬는 시간 종료 후 → 다시 차단 / 공부 아님 → 차단 안 함 / 만료 → 차단 안 함
- `withDeviation`이 `sessionActive`를 **유지**한다 — C1의 회귀 테스트
- `withBreakUntil`이 `sessionActive`를 유지하고 표식을 `BREAK`로 남긴다
- `withBreakUntil`이 공부 중이 아니면 표식을 남기지 않는다
- `withSessionStarted`가 쉬는 시간을 끝내고 표식을 해제한다
- `isDeviation`: 시스템 패키지 → 아님 / 허용앱 → 아님 / 우리 앱 → 아님 / 그 외 → 이탈

**vitest** (`pendingStopModel.test.ts`):

- `findOpenStudySessions`: `durationSeconds == null`만 고른다 / 여러 항목에 걸친 열린 세션 / 열린 세션 없음
- `secondsUntil`: 정상 계산 / 표식 시각이 시작보다 이르면 0으로 클램프

**vitest** (`distractionStopModel.test.ts`): 기존 유지. `classifySessionStop` 관련 테스트는 함수와 함께 삭제.

**실기기 검증** — 이번에는 앱 전환 경로를 명시한다. 앞선 검증표는 "인스타를 연다"만 적어 C1을 통과시켰다.

1. 접근성·오버레이 권한 허용
2. 학습 타이머 시작 → 배너 `차단 중`
3. **홈 버튼을 눌러 홈 화면으로 나간 뒤** 인스타그램 아이콘을 눌러 진입 → 차단 화면이 뜬다 (C1의 핵심)
4. 3번 직후 3초 안에 인스타그램을 다시 연다 → 또 차단된다 (C3)
5. 학생 홈으로 돌아가 학습 타이머가 여전히 돌고 있는지 확인 — 홈 버튼을 거쳤는데도 끊기지 않아야 한다
6. 카카오톡을 연다 → 학습 타이머는 멈추지만, 그 뒤 인스타그램은 여전히 차단된다
7. 딴짓멈춰에서 `+5분` → 인스타그램이 열린다 + 학습 타이머가 멈춰 있다 + 쉬는 동안 누적 시간이 늘지 않는다
8. 쉬는 시간이 끝나기를 기다린다 → 다시 시작을 누르지 않아도 인스타그램이 차단된다
9. 딴짓멈춰의 `공부 끝내기` → 인스타그램이 열린다
10. 공부 중 앱 강제 종료 → 인스타그램은 여전히 차단됨 → 앱을 다시 열어 딴짓멈춰의 `공부 끝내기`로 해제 가능

## 배포 주의

네이티브 변경이므로 학생이 새 APK를 설치해야 한다. 이 환경의 gradle은 JDK 21(`C:/Users/DELL/.jdks/jbr-21.0.11`)로 돌려야 한다 — 기본 `JAVA_HOME`은 JDK 17이고, Android Studio 내장 JBR은 JDK 25라 Gradle 8.14.3이 settings 스크립트를 컴파일할 때 죽는다.
