import { ArrowRightIcon, DownloadIcon } from 'lucide-react';

import mascotBunny from '@/assets/mascot-bunny-color.png';
import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { track } from '@/analytics';
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
        <img src={mascotBunny} alt="" className="mx-auto mb-7 w-14 object-contain" />
        <h2 className="text-balance break-keep text-3xl font-extrabold tracking-tight md:text-4xl">
          이번 주 숙제부터 기록으로 남겨보세요.
        </h2>
        <p className="mx-auto mt-5 max-w-md break-keep leading-relaxed text-muted-foreground">
          가입하고 학생을 연결하면 그날부터 캘린더가 채워집니다. 설치 없이 웹에서 먼저 봐도 됩니다.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <a href={APP_URL} onClick={() => track('Clicked Start App', { placement: 'final_cta' })}>
              웹으로 시작하기
              <ArrowRightIcon />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a
              href={APK_URL}
              onClick={() => track('Clicked Download Apk', { placement: 'final_cta' })}
              target="_blank"
              rel="noreferrer"
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
