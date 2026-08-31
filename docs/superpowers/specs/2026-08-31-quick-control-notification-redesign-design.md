# 상단바 퀵컨트롤 알림 재구성

## 배경

딴짓 멈춰의 상단바 알림은 지금 표준 `NotificationCompat` 템플릿에 액션 버튼 세 개를 붙인 형태다. 버튼 구성은 `+5분`, `+30분`, 그리고 세 번째 자리가 상황에 따라 바뀐다 — 공부 중이면 `공부 끝내기`, 아니면 `+10분`.

앱 소유자가 두 가지를 요청했다.

1. 시간 버튼을 `+5분` `+10분` `+30분` 순서로 정렬한다. 지금은 `+5 +30 +10`으로 보여 순서가 어긋난다.
2. 딴짓 멈춰 기능 자체의 on/off 스위치를 알림 오른쪽 위에 작게 둔다.

표준 템플릿으로는 2번이 불가능하다. 템플릿은 제목·본문·하단 액션 행만 제공하고 본문 오른쪽에 컨트롤을 놓을 자리가 없다. 액션은 보통 세 개까지만 표시되므로, 시간 버튼 셋을 고정하면 네 번째 자리도 없다.

## 결정

**본문 영역만 커스텀 레이아웃으로 바꾼다.** `NotificationCompat.DecoratedCustomViewStyle`을 쓰면 안드로이드가 상단 헤더(앱 아이콘·이름·시간·펼치기 화살표)를 계속 그려주고, 본문 영역만 `RemoteViews`로 채운다. 알림 전체를 직접 그리는 것보다 시스템 테마와 덜 어긋나고 깨질 지점이 적다.

본문은 한 줄이다. 왼쪽에 제목과 상태 문구, 오른쪽에 `ON`/`OFF` 알약. 액션 행은 `+5분` `+10분` `+30분`으로 고정한다.

**이것은 되돌리는 결정이다.** 이 기능을 reels-stop에서 이식할 때 `dev/active/distraction-stop/distraction-stop-context.md`의 의사결정 로그에 이렇게 적었다: "커스텀 RemoteViews 알림 대신 표준 NotificationCompat + addAction — 동일 기능, 레이아웃 XML 없음, 빌드 리스크 감소". 그 판단은 당시 맞았고 지금도 대체로 맞지만, 요청된 배치가 표준 템플릿으로 표현 불가능하므로 예외를 둔다. `DecoratedCustomViewStyle`은 원본이 쓰던 전면 `RemoteViews`보다 위험이 작은 중간 지점이다.

**대안으로 검토했다가 버린 것:**

- *액션 네 개* — `+5 +10 +30 끄기`. 커스텀 레이아웃이 전혀 필요 없어 가장 싸지만, 표준 템플릿은 네 번째를 표시하지 않을 가능성이 높고 "오른쪽 위에 작게"라는 요청과도 다르다. 실기기로 확인하자고 제안했으나 소유자가 알약 안을 택했다.
- *아이콘 토글* — 자물쇠 아이콘이 켜짐/꺼짐으로 바뀌는 형태. 가장 작고 깔끔하지만 처음 보는 학생이 무슨 버튼인지 모른다. 상태를 글자로 읽히는 쪽을 택했다.
- *세 번째 액션을 `끄기`로 교체* — `+5 +10 끄기`. 커스텀 없이 끄기를 넣을 수 있지만 `+30분`을 잃는다.

## 범위

- 본문 커스텀 레이아웃(접힘/펼침 양쪽)과 `ON`/`OFF` 알약
- 알약 탭으로 `featureEnabled`를 뒤집는 리시버 액션
- 액션 행을 `+5분` `+10분` `+30분`으로 고정
- `공부 끝내기` 액션 제거

**범위 밖:**

- **상태 문구 세 가지** — 지금 것을 그대로 쓴다(쉬는 시간 남음 / 공부 중 / 공부를 시작하면). 표시 위치만 본문 왼쪽으로 옮긴다.
- **앱 화면의 딴짓 멈춰 토글** — 이미 있고 건드리지 않는다.
- **차단 로직** — `shouldBlock`은 손대지 않는다. 알약은 기존 `setFeatureEnabled` 경로를 부를 뿐이다.
- **경고 알림**(`WarningNotificationManager`) — 다른 알림이고 이 스펙과 무관하다.

## 설계

### 1. 본문 레이아웃

`res/layout/notification_quick_control.xml`. `RemoteViews`는 지원 뷰가 제한적이므로 `LinearLayout`, `TextView`, `ImageView`, `Button`만 쓴다. `ConstraintLayout`은 쓸 수 없다.

가로 `LinearLayout` 하나에 두 자식을 둔다.

- 왼쪽: 세로 `LinearLayout`, `layout_weight="1"`. 위에 제목 `TextView`, 아래에 상태 `TextView`. 상태 문구는 길어서 `maxLines="2"`, `ellipsize="end"`
- 오른쪽: 알약 `TextView`. `layout_width="wrap_content"`, 좌우 패딩으로 알약 폭을 만들고 배경에 둥근 drawable. 터치 대상이 작아지지 않도록 `minWidth`/`minHeight`를 48dp로 둔다

**색은 하드코딩하지 않는다.** 다크모드에서 글자가 안 보이는 사고를 막기 위해 `?android:attr/textColorPrimary`와 `?android:attr/textColorSecondary`를 참조한다. 알약 배경만 상태별 색을 쓴다.

접힘용과 펼침용을 따로 두지 않고 같은 레이아웃을 `setCustomContentView`와 `setCustomBigContentView` 양쪽에 넘긴다. 한 줄이라 펼쳐도 더 보여줄 것이 없다.

**제목에서 On/Off를 뗀다.** 지금 제목은 `딴짓 멈춰 On` / `딴짓 멈춰 Off`로 켜짐 여부를 이미 담고 있다. 알약이 같은 정보를 보여주게 되므로 그대로 두면 한 알림에 상태가 두 번 나오고, 둘이 어긋나면(한쪽만 갱신되는 버그가 생기면) 어느 쪽을 믿어야 할지 알 수 없다. 제목은 `딴짓 멈춰`로 고정하고 켜짐 여부는 알약만 말한다 — 상태를 말하는 곳을 하나로 줄이는 것이 이 변경의 부수 이득이다.

### 2. 알약

`res/drawable/pill_on.xml`과 `pill_off.xml`. 각각 `<shape android:shape="rectangle">`에 `<corners android:radius="16dp">`와 `<solid>` 하나. 켜짐은 앱의 primary 계열, 꺼짐은 회색.

글자는 `ON`/`OFF`. 대문자 두세 글자라 어느 폰에서도 폭이 예측 가능하고, 번역이 필요 없다.

**상태 표시와 동작이 같은 방향이어야 한다.** 알약은 *현재 상태*를 보여주고, 탭하면 반대로 바뀐다. 즉 `ON`이 보이면 지금 켜져 있다는 뜻이고 탭하면 꺼진다. "탭하면 켜진다"는 해석과 헷갈릴 수 있으나, 시스템 토글의 관례가 현재 상태 표시이므로 그쪽을 따른다.

### 3. 토글 리시버

`QuickActionReceiver`에 액션을 하나 더한다.

```
ACTION_TOGGLE_FEATURE = "com.studybuddy.app.distraction.ACTION_TOGGLE_FEATURE"
```

처리는 현재 값을 읽어 뒤집는 것이다.

```kotlin
ACTION_TOGGLE_FEATURE -> {
    val enabled = store.observeState().first().featureEnabled
    store.setFeatureEnabled(!enabled)
}
```

`AndroidManifest.xml`의 `QuickActionReceiver` `intent-filter`에 이 액션을 등록한다. **이 단계를 빼면 알약을 눌러도 아무 일도 일어나지 않는다** — 같은 실수를 `ACTION_END_SESSION`을 추가할 때 이미 한 번 겪었다.

`PendingIntent` 요청 코드는 기존 것들과 겹치지 않아야 한다. `openAppPendingIntent`가 `-2`, `endSessionPendingIntent`가 `-3`을 쓰므로 `-4`를 쓴다.

리시버는 앱 프로세스와 독립적으로 동작하므로, **앱이 강제 종료된 뒤에도 알약이 작동한다.** 이것이 알약을 탈출구로 쓸 수 있는 근거다.

### 4. 액션 행

```kotlin
builder.addAction(0, "+5분", quickSetPendingIntent(context, 5 * 60_000L))
builder.addAction(0, "+10분", quickSetPendingIntent(context, 10 * 60_000L))
builder.addAction(0, "+30분", quickSetPendingIntent(context, 30 * 60_000L))
```

조건 분기가 없어진다. `endSessionPendingIntent`와 `ACTION_END_SESSION`은 호출부가 사라지므로 함께 삭제한다.

### 5. 탈출구가 약해지는 것에 대하여

허용 목록 스펙의 최종 리뷰는 알림의 `공부 끝내기`를 "폰이 대부분 잠긴 상태에서의 탈출구"로 지목했다. 그 버튼을 없애는 대신 알약이 그 역할을 한다 — 기능을 끄면 `shouldBlock`이 거짓이 되어 차단이 풀린다.

**차단 해제가 쉬워진다.** 전에는 공부 중일 때만 알림에 탈출구가 있었고, 그마저도 학습 모드만 끄는 것이었다. 이제는 언제나 한 탭으로 기능 자체를 끌 수 있다. 소유자가 이 성질을 알고 "항상 눌러지게"를 택했다.

제품 철학과 어긋나지는 않는다. 허용 목록 스펙이 이미 "완전한 잠금은 애초에 불가능하고 목표도 아니다 — 마음먹은 학생은 앱을 지우면 된다"고 적었고, 설정 앱을 통과시키는 결정도 같은 근거였다. 다만 **기능이 꺼진 사실이 학생 화면에 드러나야** 의미가 유지된다. 딴짓 멈춰 화면의 상태 배너는 이미 `딴짓 멈춰가 꺼져 있어요`를 표시하므로 그 조건은 충족된다.

매니저에게 "기능이 꺼져 있다"를 알리는 것은 이 스펙의 범위 밖이다. 필요해지면 별도로 다룬다.

### 6. 다크모드와 제조사 스킨

`?android:attr/textColorPrimary`를 쓰면 시스템이 모드에 맞는 색을 준다. 알약 배경색만 고정이므로 두 모드에서 대비를 눈으로 확인한다.

**삼성 One UI는 알림을 크게 재스타일링한다.** 커스텀 본문이 순정과 다르게 보일 수 있고 이것은 코드로 예측할 수 없다. 구현 직후 갤럭시 S25에서 확인하고, 보기 흉하면 아이콘 토글이나 표준 3버튼으로 후퇴한다 — 후퇴 경로를 남겨두는 것이 이 결정의 조건이다.

## 테스트

알림 코드는 안드로이드 `Context`가 필요해 이 프로젝트의 원칙상 단위 테스트하지 않는다(Robolectric 미도입). 토글이 뒤집는 값은 `!featureEnabled` 한 줄이라 순수 함수로 뺄 것이 없다. **따라서 검증은 전부 실기기다.**

1. 라이트 모드와 다크 모드에서 각각 레이아웃이 깨지지 않고 글자가 읽히는지
2. 알림을 접었을 때와 펼쳤을 때 모두 정상인지
3. 액션이 `+5분` `+10분` `+30분` 순서로 보이는지
4. `+5분` → `+10분`을 연달아 눌러 `15분 남음`으로 누적되는지
5. `ON` 탭 → 알약이 `OFF`로 바뀌고, 공부 중이었다면 차단이 풀리는지
6. 다시 탭 → `ON`으로 돌아오고 차단이 복구되는지
7. 앱을 강제 종료한 뒤 알약을 탭 → 여전히 동작하는지
8. 상태 문구가 긴 경우(쉬는 시간 문구) 두 줄로 잘리며 알약을 밀어내지 않는지

기존 단위 테스트(현재 59개)는 이 변경으로 줄거나 늘지 않아야 한다. 줄었다면 손대지 않아야 할 것을 건드린 것이다.

## 배포 주의

네이티브 변경이므로 학생은 새 APK를 설치해야 한다. **release 서명으로 빌드해야 기존 앱에 덮어쓸 수 있다** — debug 서명은 서명 불일치로 설치가 거부된다. 키스토어는 `android/app/study-buddy-release.jks`, 설정은 `android/app/keystore.properties`에 있다.

```
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:assembleRelease
```

gradle은 JDK 21로 돌린다. 기본 `JAVA_HOME`은 JDK 17이라 `invalid source release: 21`로 실패하고, Android Studio 내장 JBR은 JDK 25라 Gradle 8.14.3이 settings 스크립트를 컴파일할 때 죽는다.
