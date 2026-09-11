아래 소스만 기준으로 리뷰했습니다. 랜딩이라 날짜·RLS·서버 배치 쪽은 판단할 코드가 없었습니다. 그 영역은 문제를 못 찾은 것이 아니라, 확인할 파일이 없습니다.

- **[보통] 외부 이동/다운로드 클릭 이벤트가 유실될 수 있음**
- **위치**: `landing/src/sections/*`, `track(...)`를 붙인 `<a>`들 전반
- **왜 문제인가**: `웹으로 시작하기`는 `https://app.studybuks.store`로 즉시 이동하고, APK 링크는 다운로드를 바로 시작합니다. `amplitude.track(...)`는 비동기 전송이라 브라우저가 페이지를 떠나거나 다운로드 처리를 시작하면 클릭 이벤트가 전송되기 전에 끊길 수 있습니다. 랜딩에서 제일 중요한 전환 이벤트가 조용히 빠질 수 있습니다.
- **어떻게 고치는가**: 외부 이동/다운로드 CTA에 공통 핸들러를 두고 `flush()` 후 이동시키는 방식이 안전합니다.

```ts
// landing/src/analytics.ts
export async function trackAndFlush(
  event: string,
  properties?: Record<string, unknown>,
  timeoutMs = 300,
): Promise<void> {
  if (!AMPLITUDE_API_KEY) return;

  amplitude.track(event, { app_platform: 'landing', ...properties });

  await Promise.race([
    amplitude.flush().promise,
    new Promise((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}
```

```tsx
// 예: 외부 이동 CTA
import { trackAndFlush } from '@/analytics';

<a
  href={APP_URL}
  onClick={(e) => {
    e.preventDefault();
    void trackAndFlush('Clicked Start App', { placement: 'hero' }).finally(() => {
      window.location.href = APP_URL;
    });
  }}
>
  웹으로 시작하기
</a>
```

다운로드는 새로 만든 버튼 핸들러에서 `window.location.href = APK_URL` 또는 임시 `<a download>` 클릭으로 이어가면 됩니다.

- **확신도**: 확실

---

- **[낮음] 개인정보 페이지 헤더 로고가 홈으로 가지 않음**
- **위치**: `landing/src/sections/site-header.tsx`, `SiteHeader`
- **왜 문제인가**: `SiteHeader`는 `/privacy`에서도 쓰이는데 로고 링크가 `href="#top"`입니다. 랜딩 홈에서는 맞지만, 개인정보 페이지에는 `id="top"`이 없습니다. 사용자가 개인정보 페이지에서 로고를 누르면 홈으로 돌아갈 것처럼 보이지만 `/privacy#top`만 붙고 사실상 이동하지 않습니다.
- **어떻게 고치는가**: 헤더 로고는 다른 내비게이션처럼 절대 경로로 둡니다.

```tsx
<a href="/#top" className="flex items-center gap-2.5">
  <img src={mascotFace} alt="" className="size-8 rounded-md" />
  <span className="text-lg font-bold tracking-tight">스터디 벅스</span>
</a>
```

- **확신도**: 확실

---

- **[낮음] 세션 리플레이 플러그인 등록 순서가 불안정할 수 있음**
- **위치**: `landing/src/analytics.ts`, `initAnalytics`
- **왜 문제인가**: 현재는 `amplitude.init(...)` 호출 뒤에 `amplitude.add(sessionReplayPlugin(...))`를 호출합니다. Amplitude 플러그인은 보통 초기화 전에 등록하는 예제가 많아서, SDK 버전에 따라 세션 시작 이벤트나 초기 페이지뷰 일부가 리플레이와 연결되지 않을 수 있습니다.
- **어떻게 고치는가**: 플러그인을 먼저 추가하고 init을 호출합니다.

```ts
export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;

  if (!AMPLITUDE_API_KEY) {
    console.warn('Amplitude API key missing — analytics disabled');
    return;
  }

  void amplitude.add(sessionReplayPlugin({ sampleRate: 1 }));

  void amplitude.init(AMPLITUDE_API_KEY, {
    autocapture: {
      pageViews: true,
      sessions: true,
      attribution: true,
      formInteractions: false,
      fileDownloads: false,
      elementInteractions: false,
      frustrationInteractions: false,
      networkTracking: false,
      webVitals: false,
    },
  });
}
```

- **확신도**: 추정 — 사용 중인 `@amplitude/analytics-browser`와 `@amplitude/plugin-session-replay-browser` 버전의 플러그인 등록 보장 동작을 확인해야 합니다.

---

이 소스 안에서는 날짜·시간 경계, RLS·권한, 데이터 삭제/어긋남 경로는 검토할 대상 코드가 없습니다. 확인하려면 본앱의 날짜 유틸, Supabase RLS 정책/마이그레이션, 엣지 함수, 숙제·타이머·재분배 로직 파일이 필요합니다.
