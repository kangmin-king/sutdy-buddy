import { ArrowRightIcon, DownloadIcon } from 'lucide-react';

import mascotBunny from '@/assets/mascot-bunny-color.png';
import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { track, trackNavigation } from '@/analytics';
import { APK_URL, APP_URL } from '@/lib/site';

export function Cta() {
  return (
    <section className="dark grain relative isolate overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 70% 70% at 50% 120%, hsl(var(--primary) / 0.2), transparent)' }}
      />
      <Reveal className="mx-auto max-w-2xl px-5 py-24 text-center md:py-28">
        {/* 마스코트 PNG는 투명도가 없어서(색타입 2 = RGB) 흰 배경이 이미지에 구워져 있다.
            이 섹션은 다크라, 그냥 놓으면 남색 위에 흰 사각형이 떠서 이미지가 깨진 것처럼 보였다.
            다운로드 버튼을 누르기 직전에 보는 마지막 화면이라 그 인상이 특히 비싸다.
            흰 배경을 없애는 대신 **의도로 만든다** — 둥근 흰 상자에 담으면 스티커로 읽힌다.
            PNG를 투명하게 만드는 쪽은 마스코트 정체성을 정리할 때 함께 다룬다. */}
        <img src={mascotBunny} alt="" className="mx-auto mb-7 w-14 rounded-2xl bg-white object-contain" />
        <h2 className="text-balance break-keep text-3xl font-extrabold tracking-tight md:text-4xl">
          이번 주 숙제부터 기록으로 남겨보세요.
        </h2>
        <p className="mx-auto mt-5 max-w-md break-keep leading-relaxed text-muted-foreground">
          가입하고 학생을 연결하면 그날부터 캘린더가 채워집니다. 설치 없이 웹에서 먼저 봐도 됩니다.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <a href={APP_URL} onClick={(e) => trackNavigation(e, 'Clicked Start App', { placement: 'final_cta' })}>
              웹으로 시작하기
              <ArrowRightIcon />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a
              href={APK_URL}
              onClick={() => track('Clicked Download Apk', { placement: 'final_cta' })}
              download
            >
              <DownloadIcon />
              안드로이드 APK
            </a>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
