# 상단바 퀵컨트롤 알림 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 딴짓 멈춰 상단바 알림의 시간 버튼을 `+5분` `+10분` `+30분` 순서로 고정하고, 본문 오른쪽에 기능 on/off를 뒤집는 `ON`/`OFF` 알약을 둔다.

**Architecture:** `NotificationCompat.DecoratedCustomViewStyle`로 상단 헤더는 안드로이드에 맡기고 본문만 `RemoteViews`로 교체한다. 알약 탭은 기존 `QuickActionReceiver`에 액션을 하나 더해 `setFeatureEnabled`를 부른다. 알림 코드는 `Context`가 필요해 단위 테스트 대상이 아니므로, 검증은 실기기가 유일한 관문이다.

**Tech Stack:** Kotlin, `NotificationCompat`, `RemoteViews`, 안드로이드 레이아웃·drawable XML

**Spec:** `docs/superpowers/specs/2026-08-31-quick-control-notification-redesign-design.md`

## Global Constraints

- UI 문구는 한국어, 코드·커밋 메시지는 영어. 이 저장소의 주석은 한국어와 영어가 섞여 있다 — **수정하는 파일의 주변 주석 언어를 따른다.**
- 새 의존성 추가 금지. `ConstraintLayout`은 `RemoteViews`에서 쓸 수 없다 — `LinearLayout`, `TextView`, `ImageView`, `Button`만 쓴다.
- **글자색은 `values`/`values-night` 한 쌍으로 직접 정의한다.** (최종 리뷰에서 정정 — 원안은 테마 속성 참조였다.) 알림 `RemoteViews`는 알림창의 테마를 물려받지 못해 `?android:attr/textColorPrimary`가 다크모드에서 검정으로 해석된다. 리소스 한정자는 night 설정을 따르므로 `values-night/colors.xml`로 덮는다. 알약 배경색만 고정값을 쓴다.
- 알림 채널 이름(`쉬는 시간 컨트롤`)은 건드리지 않는다. 안드로이드는 채널 이름을 생성 시점에 고정하므로 코드만 바꾸면 기존 설치와 신규 설치가 서로 달라진다.
- 앱 primary 색은 `#366095`이다(`tailwind.config.ts:32`). `res/values/colors.xml`이 아직 없으므로 새로 만든다.
- **기존 단위 테스트 59개는 이 변경으로 줄지 않아야 한다.** 줄었다면 손대지 않아야 할 것을 건드린 것이다. (최종 리뷰에서 브릿지 숫자 회귀 가드 1개가 추가되어 60개로 끝났다.)

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

- gradle은 **JDK 21**로 돌린다. 기본 `JAVA_HOME`은 JDK 17이라 `invalid source release: 21`로 실패하고, Android Studio 내장 JBR은 JDK 25라 Gradle 8.14.3이 settings 스크립트를 컴파일할 때 `Unsupported class file major version 69`로 죽는다. 테스트 결과는 `android/app/build/test-results/testDebugUnitTest/*.xml`의 `failures`/`errors`로 확인한다.
- APK는 **release 서명**으로 빌드해야 폰의 기존 앱에 덮어쓸 수 있다. debug 서명은 서명 불일치로 설치가 거부된다.
- **다른 작업 흐름이 이 브랜치에 가끔 커밋한다.** 각 태스크의 `git add`에 적힌 파일만 스테이징한다. `git add -A` / `git add .` 금지.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `android/app/src/main/res/values/colors.xml` | 알약 배경색 두 개 | **신규** |
| `android/app/src/main/res/drawable/pill_on.xml` | 켜짐 알약 배경 | **신규** |
| `android/app/src/main/res/drawable/pill_off.xml` | 꺼짐 알약 배경 | **신규** |
| `android/app/src/main/res/layout/notification_quick_control.xml` | 알림 본문 한 줄 | **신규** |
| `android/.../notification/QuickActionReceiver.kt` | 알약 탭 처리 | 수정 |
| `android/app/src/main/AndroidManifest.xml` | 새 액션 등록 | 수정 |
| `android/.../notification/QuickControlNotificationManager.kt` | 커스텀 본문 + 액션 3개 고정 | 수정 |

---

### Task 1: 알약 배경과 색 리소스

레이아웃보다 먼저 만든다 — 레이아웃이 이 drawable을 참조하므로 없으면 컴파일되지 않는다.

**Files:**
- Create: `android/app/src/main/res/values/colors.xml`
- Create: `android/app/src/main/res/drawable/pill_on.xml`
- Create: `android/app/src/main/res/drawable/pill_off.xml`

**Interfaces:**
- Produces: `@drawable/pill_on`, `@drawable/pill_off`, `@color/pill_on_background`, `@color/pill_off_background`, `@color/pill_on_text`, `@color/pill_off_text`

- [ ] **Step 1: `colors.xml`을 만든다**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- 알림 알약. 글자색은 시스템 테마를 따를 수 없다 — 알약 배경이 고정색이라
         다크모드에서 textColorPrimary를 쓰면 대비가 무너진다. 배경과 글자를 짝으로 고정한다.
         본문 글자색도 같은 이유로 직접 정의하고 values-night에서 덮는다. -->
    <color name="pill_on_background">#366095</color>
    <color name="pill_on_text">#FFFFFF</color>
    <color name="pill_off_background">#9E9E9E</color>
    <color name="pill_off_text">#FFFFFF</color>
</resources>
```

`#366095`는 앱의 primary 색이다(`tailwind.config.ts:32`). 꺼짐은 중간 회색이라 라이트·다크 양쪽에서 흰 글자가 읽힌다.

- [ ] **Step 2: `pill_on.xml`을 만든다**

```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="16dp" />
    <solid android:color="@color/pill_on_background" />
</shape>
```

- [ ] **Step 3: `pill_off.xml`을 만든다**

```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="16dp" />
    <solid android:color="@color/pill_off_background" />
</shape>
```

- [ ] **Step 4: 리소스가 컴파일되는지 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:assembleDebug --console=plain
```

Expected: `BUILD SUCCESSFUL`. 리소스 XML 오타는 여기서 잡힌다.

- [ ] **Step 5: 커밋**

```bash
git add android/app/src/main/res/values/colors.xml android/app/src/main/res/drawable/pill_on.xml android/app/src/main/res/drawable/pill_off.xml
git commit -m "feat: add the on/off pill backgrounds for the quick-control notification"
```

---

### Task 2: 알림 본문 레이아웃

**Files:**
- Create: `android/app/src/main/res/layout/notification_quick_control.xml`

**Interfaces:**
- Consumes: Task 1의 `@drawable/pill_on`, `@color/pill_on_text`
- Produces: 레이아웃 `R.layout.notification_quick_control`과 세 개의 id — `@+id/quick_control_title`, `@+id/quick_control_status`, `@+id/quick_control_pill`

- [ ] **Step 1: 레이아웃을 만든다**

`RemoteViews`는 지원 뷰가 제한적이다. `ConstraintLayout`은 쓸 수 없고, `LinearLayout` 중첩으로 만든다.

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- 알림 본문. DecoratedCustomViewStyle이 상단 헤더(앱 아이콘·이름·시간)를 그려주므로
     여기서는 본문 한 줄만 채운다. 글자색은 시스템 테마를 참조해 다크모드를 따라간다 —
     하드코딩하면 한쪽 모드에서 글자가 안 보인다. -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center_vertical"
    android:paddingStart="4dp"
    android:paddingEnd="4dp">

    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:orientation="vertical">

        <TextView
            android:id="@+id/quick_control_title"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="@string/quick_control_title"
            android:textColor="@color/notification_body_primary"
            android:textSize="14sp"
            android:textStyle="bold"
            android:maxLines="1"
            android:ellipsize="end" />

        <TextView
            android:id="@+id/quick_control_status"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textColor="@color/notification_body_secondary"
            android:textSize="13sp"
            android:maxLines="2"
            android:ellipsize="end" />
    </LinearLayout>

    <TextView
        android:id="@+id/quick_control_pill"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:minWidth="56dp"
        android:minHeight="32dp"
        android:layout_marginStart="12dp"
        android:paddingStart="14dp"
        android:paddingEnd="14dp"
        android:gravity="center"
        android:background="@drawable/pill_on"
        android:textColor="@color/pill_on_text"
        android:textSize="12sp"
        android:textStyle="bold" />
</LinearLayout>
```

왼쪽 열이 `layout_width="0dp"` + `layout_weight="1"`이라 남는 폭을 전부 차지하고, 알약은 `wrap_content`로 자기 폭만 쓴다. 그래서 **상태 문구가 길어져도 알약을 밀어내지 않는다.**

`minHeight`를 32dp로 둔 이유: 알림 본문 높이가 제한적이라 48dp를 주면 안드로이드가 본문을 잘라낼 수 있다. 터치 대상은 권장치보다 작지만, 알림 액션 버튼도 실제로 이 정도다.

- [ ] **Step 2: 제목 문자열을 `strings.xml`에 넣는다**

기존 `android/app/src/main/res/values/strings.xml`에 추가한다. 레이아웃에서 문자열을 직접 쓰지 않고 리소스로 두는 것이 안드로이드 관례다.

```xml
    <string name="quick_control_title">딴짓 멈춰</string>
```

제목에 `On`/`Off`를 붙이지 않는다 — 켜짐 여부는 알약만 말한다. 지금 코드는 `딴짓 멈춰 On`/`딴짓 멈춰 Off`로 상태를 제목에도 담고 있는데, 알약이 같은 정보를 보여주면 한 알림에 상태가 두 번 나오고 둘이 어긋나면 어느 쪽을 믿을지 알 수 없다.

**같은 파일의 `accessibility_service_description`도 함께 고친다.** 지금 문구는 "이 기능은 인스타그램, 유튜브, 틱톡이 화면 최상단에 떴는지만 확인하며"라고 적혀 있는데, 허용 목록 전환으로 그 세 앱 모델은 사라졌다. 이것은 학생이 접근성 권한을 켤 때 시스템 화면에서 읽는 문구이므로 사실과 달라서는 안 된다. 아래로 교체한다.

```xml
    <string name="accessibility_service_description">딴짓 멈춰는 스크린타임 제한 목적으로만 접근성 서비스를 사용합니다. 이 기능은 지금 화면 맨 앞에 있는 앱이 무엇인지만 확인하며, 화면 내용을 읽거나 저장하지 않습니다.</string>
```

원래 범위 밖이지만, 같은 파일을 열고 있고 학생에게 보이는 잘못된 설명이라 남겨둘 이유가 없다.

- [ ] **Step 3: 레이아웃이 컴파일되는지 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:assembleDebug --console=plain
```

Expected: `BUILD SUCCESSFUL`. 잘못된 속성이나 없는 리소스 참조는 여기서 잡힌다.

- [ ] **Step 4: 커밋**

```bash
git add android/app/src/main/res/layout/notification_quick_control.xml android/app/src/main/res/values/strings.xml
git commit -m "feat: add the quick-control notification body layout"
```

---

### Task 3: 알약 탭으로 기능을 뒤집는다

**Files:**
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickActionReceiver.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: `TimerStateStore.setFeatureEnabled(enabled: Boolean)`, `TimerStateStore.observeState()` — 둘 다 이미 있다
- Produces: `QuickActionReceiver.ACTION_TOGGLE_FEATURE = "com.studybuddy.app.distraction.ACTION_TOGGLE_FEATURE"`

- [ ] **Step 1: 리시버에 액션을 더한다**

`onReceive`의 `when (intent.action)` 블록에 분기를 추가한다. 기존 두 분기(`ACTION_QUICK_SET`, `ACTION_END_SESSION`)는 그대로 둔다 — `ACTION_END_SESSION`은 Task 4에서 호출부가 사라지지만, 액션 자체를 지우는 것은 이 계획의 범위 밖이다.

```kotlin
                    ACTION_TOGGLE_FEATURE -> {
                        // 현재 값을 읽어 뒤집는다. 알약은 상태를 보여주므로 탭은 항상 반대로
                        // 가는 것이 맞다 — 켜라/꺼라를 인텐트에 담으면 알림이 낡았을 때
                        // 학생이 본 것과 반대로 동작한다.
                        val enabled = store.observeState().first().featureEnabled
                        store.setFeatureEnabled(!enabled)
                    }
```

`companion object`에 상수를 더한다.

```kotlin
        const val ACTION_TOGGLE_FEATURE = "com.studybuddy.app.distraction.ACTION_TOGGLE_FEATURE"
```

`kotlinx.coroutines.flow.first`는 이 파일에 이미 import되어 있다.

- [ ] **Step 2: 매니페스트에 액션을 등록한다**

`AndroidManifest.xml`의 `QuickActionReceiver` `intent-filter`에 한 줄 더한다.

```xml
                <action android:name="com.studybuddy.app.distraction.ACTION_TOGGLE_FEATURE" />
```

**이 단계를 빼면 알약을 눌러도 리시버가 호출되지 않는다.** `ACTION_END_SESSION`을 추가할 때 같은 실수를 이미 한 번 겪었으므로 반드시 확인한다.

- [ ] **Step 3: 컴파일과 기존 테스트를 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: `BUILD SUCCESSFUL`. 개수를 확인한다.

```bash
cd android && grep -o 'tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml
```

Expected: 합계 59개, `failures="0" errors="0"`. 리시버는 `Context`가 필요해 단위 테스트를 추가하지 않는다 — 동작 확인은 Task 5의 실기기 항목 5·6·7이다.

- [ ] **Step 4: 커밋**

```bash
git add android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickActionReceiver.kt android/app/src/main/AndroidManifest.xml
git commit -m "feat: toggle the distraction-stop feature from the notification"
```

---

### Task 4: 알림을 커스텀 본문으로 바꾼다

**Files:**
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickControlNotificationManager.kt`

**Interfaces:**
- Consumes: Task 2의 `R.layout.notification_quick_control`과 세 id, Task 1의 두 drawable과 색, Task 3의 `ACTION_TOGGLE_FEATURE`
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: `show`를 커스텀 본문으로 교체한다**

`show` 메서드 전체를 아래로 바꾼다. 상태 문구를 만드는 `when` 블록은 그대로 유지한다 — 스펙이 문구를 범위 밖으로 두었다.

```kotlin
    fun show(context: Context, state: TimerState) {
        ensureChannel(context)

        val now = System.currentTimeMillis()
        val studying = state.isSessionActive(now)
        val remainingMinutes = state.endTimeMillis
            ?.let { endTime -> ((endTime - now).coerceAtLeast(0) + 59_999L) / 60_000L }

        val content = when {
            state.isBreakActive(now) && remainingMinutes != null ->
                "쉬는 시간 ${remainingMinutes}분 남음 — 이 동안은 공부 시간이 쌓이지 않아요"
            studying -> "공부 중 — 허용앱 외에는 열리지 않아요"
            else -> "공부를 시작하면 허용앱 외에는 열리지 않아요"
        }

        // 본문만 커스텀으로 그린다. DecoratedCustomViewStyle이 상단 헤더(앱 아이콘·이름·
        // 시간·펼치기)를 계속 그려주므로 시스템 테마와 덜 어긋나고 깨질 지점이 적다.
        // 표준 템플릿으로는 본문 오른쪽에 컨트롤을 놓을 자리가 없어 이 방식을 택했다.
        val body = RemoteViews(context.packageName, R.layout.notification_quick_control).apply {
            setTextViewText(R.id.quick_control_status, content)
            if (state.featureEnabled) {
                setTextViewText(R.id.quick_control_pill, "ON")
                setInt(R.id.quick_control_pill, "setBackgroundResource", R.drawable.pill_on)
                setTextColor(R.id.quick_control_pill, ContextCompat.getColor(context, R.color.pill_on_text))
            } else {
                setTextViewText(R.id.quick_control_pill, "OFF")
                setInt(R.id.quick_control_pill, "setBackgroundResource", R.drawable.pill_off)
                setTextColor(R.id.quick_control_pill, ContextCompat.getColor(context, R.color.pill_off_text))
            }
            setOnClickPendingIntent(R.id.quick_control_pill, toggleFeaturePendingIntent(context))
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            // 커스텀 본문을 쓰더라도 접근성 서비스와 알림 목록이 읽을 텍스트는 남겨둔다.
            .setContentTitle(context.getString(R.string.quick_control_title))
            .setContentText(content)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(body)
            .setCustomBigContentView(body)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openAppPendingIntent(context))

        // 시간 버튼은 순서 그대로 셋. 예전에는 세 번째 자리가 공부 중일 때 '공부 끝내기'로
        // 바뀌었는데, 이제 알약이 항상 눌러지므로 그 탈출구 역할을 알약이 대신한다.
        builder.addAction(0, "+5분", quickSetPendingIntent(context, 5 * 60_000L))
        builder.addAction(0, "+10분", quickSetPendingIntent(context, 10 * 60_000L))
        builder.addAction(0, "+30분", quickSetPendingIntent(context, 30 * 60_000L))

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, builder.build())
    }
```

`studying` 변수는 `content`를 만드는 데 계속 쓰이므로 남긴다.

- [ ] **Step 2: 토글 `PendingIntent`를 추가하고 죽은 것을 지운다**

`endSessionPendingIntent` 메서드 전체를 삭제하고 그 자리에 아래를 넣는다. 호출부가 Step 1에서 사라졌다.

```kotlin
    private fun toggleFeaturePendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, QuickActionReceiver::class.java).apply {
            action = QuickActionReceiver.ACTION_TOGGLE_FEATURE
        }
        return PendingIntent.getBroadcast(
            context,
            TOGGLE_FEATURE_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
```

`companion object`에서 `END_SESSION_REQUEST_CODE`를 지우고 새 요청 코드를 넣는다. `quickSetPendingIntent`가 `extraMillis.toInt()`(양수)를 쓰고 `openAppPendingIntent`가 `-2`를 쓰므로 겹치지 않는 값을 고른다.

```kotlin
        private const val TOGGLE_FEATURE_REQUEST_CODE = -4
```

- [ ] **Step 3: import를 맞춘다**

파일 상단에 아래 두 개를 추가한다.

```kotlin
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import com.studybuddy.app.R
```

`R` import가 필요한 이유: 이 파일은 `com.studybuddy.app.distraction.notification` 패키지에 있어서 `R`이 자동으로 보이지 않는다.

- [ ] **Step 4: 컴파일과 기존 테스트를 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: `BUILD SUCCESSFUL`, 합계 59개, 실패 0. 이 태스크는 `Context`가 필요한 알림 코드라 단위 테스트를 추가하지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickControlNotificationManager.kt
git commit -m "feat: draw the quick-control notification body with an on/off pill"
```

---

### Task 5: APK 빌드와 실기기 확인

**Files:**
- Modify: `dev/active/distraction-stop/distraction-stop-context.md`

실기기 확인(Step 3)은 폰이 필요하므로 사람이 수행한다. 구현자는 Step 1·2·4·5만 한다.

- [ ] **Step 1: 웹 자산을 빌드하고 동기화한다**

```bash
npx vite build && npx cap sync android
```

`cap sync`가 `android/` 아래 추적되는 생성 파일을 바꾸면 커밋하지 말고 어떤 파일이 바뀌었는지 보고한다.

- [ ] **Step 2: release APK를 빌드한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:assembleRelease --console=plain
```

산출물: `android/app/build/outputs/apk/release/app-release.apk`. 절대경로와 MB 단위 크기를 보고한다.

**debug가 아니라 release여야 한다** — 폰에 깔린 앱이 release 서명이라 debug APK는 서명 불일치로 설치가 거부된다. 키스토어는 `android/app/study-buddy-release.jks`, 설정은 `android/app/keystore.properties`에 이미 있다.

빌드가 실패하면 덮지 말고 `BLOCKED`으로 실제 gradle 오류를 보고한다.

- [ ] **Step 3: (사람이 수행) 실기기 확인**

구현자는 건너뛴다. 아래는 사람이 확인할 목록이다. **1번과 8번이 이 변경의 최대 위험이다** — 삼성 One UI는 알림을 크게 재스타일링하므로 커스텀 본문이 순정과 다르게 보일 수 있고, 그것은 코드로 예측할 수 없다.

1. 라이트 모드와 다크 모드 각각에서 레이아웃이 깨지지 않고 제목·상태·알약이 모두 읽히는지
2. 알림을 접었을 때와 펼쳤을 때 모두 정상인지
3. 액션이 `+5분` `+10분` `+30분` 순서로 보이는지
4. `+5분` → `+10분`을 연달아 눌러 `15분 남음`으로 누적되는지
5. `ON` 탭 → 알약이 `OFF`로 바뀌고, 공부 중이었다면 차단이 풀리는지
6. 다시 탭 → `ON`으로 돌아오고 차단이 복구되는지
7. 앱을 강제 종료한 뒤 알약을 탭 → 여전히 동작하는지(리시버는 프로세스와 별개)
8. 상태 문구가 가장 긴 경우(쉬는 시간 문구)에 두 줄로 잘리며 알약을 밀어내지 않는지

1번이나 8번이 보기 흉하면 후퇴한다 — 알약을 자물쇠 아이콘 토글로 바꾸거나, 커스텀 본문을 버리고 표준 템플릿에 `+5 +10 끄기` 세 버튼으로 돌아간다.

- [ ] **Step 4: dev docs를 갱신한다**

`dev/active/distraction-stop/distraction-stop-context.md`의 `**Last Updated**`를 `2026-08-31`로 바꾸고 `## 의사결정 로그` 맨 아래에 추가한다.

```markdown
- **알림 커스텀 본문(2026-08-31)**: 상단바 알림의 시간 버튼을 `+5 +10 +30`으로 고정하고 본문 오른쪽에 기능 on/off `ON`/`OFF` 알약을 넣었다. 표준 템플릿은 본문 오른쪽에 컨트롤을 놓을 자리가 없고 액션도 세 개까지만 보여주므로, `DecoratedCustomViewStyle`로 본문만 `RemoteViews`로 바꿨다 — **이식 당시 "커스텀 RemoteViews를 피한다"는 결정을 되돌린 것**이며, 전면 커스텀보다 위험이 작은 중간 지점을 택했다. 제목에서 `On`/`Off`를 떼어 상태를 말하는 곳을 알약 하나로 줄였다. `공부 끝내기` 액션은 제거했고 알약이 그 탈출구를 대신한다 — 차단 해제가 언제나 한 탭이 되므로 강도가 낮아지지만, 소유자가 그 성질을 알고 택했고 기능이 꺼진 사실은 딴짓 멈춰 화면 배너가 알린다. One UI 재스타일링 위험이 있어 실기기 확인이 필수이며, 보기 흉하면 아이콘 토글이나 표준 3버튼으로 후퇴한다. 스펙: `docs/superpowers/specs/2026-08-31-quick-control-notification-redesign-design.md`
```

- [ ] **Step 5: 커밋**

```bash
git add dev/active/distraction-stop/distraction-stop-context.md
git commit -m "docs: record the notification custom body decision"
```
