import { AppleIcon, ArrowRightIcon, DownloadIcon, SmartphoneIcon } from 'lucide-react';

import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { track } from '@/analytics';
import { APK_URL, APP_URL } from '@/lib/site';

export function Download() {
  return (
    <section id="download" className="scroll-mt-16 border-b bg-muted/30">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <Reveal className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">Get started</p>
          <h2 className="text-balance break-keep text-3xl font-extrabold tracking-tight md:text-4xl">
            다운로드 & 이용 안내
          </h2>
          <p className="mt-4 break-keep leading-relaxed text-muted-foreground">
            웹은 설치 없이 바로 씁니다. 앱 잠금처럼 기기 기능이 필요한 건 안드로이드 앱으로만 됩니다.
          </p>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-2">
          <Reveal>
            <Card className="flex h-full flex-col bg-background transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="mb-3 flex size-11 items-center justify-center rounded-lg border bg-muted/50">
                  <SmartphoneIcon className="size-5" strokeWidth={1.75} />
                </div>
                <CardTitle className="text-lg">안드로이드</CardTitle>
                <CardDescription className="break-keep leading-relaxed">
                  APK 파일을 다운로드해서 설치하세요. 설치 중 "출처를 알 수 없는 앱" 허용이 필요할 수 있어요.
                  '딴짓 멈춰'는 이쪽에서만 됩니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild>
                  <a
                    href={APK_URL}
                    onClick={() => track('Clicked Download Apk', { placement: 'android_guide' })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <DownloadIcon />
                    APK 다운로드
                  </a>
                </Button>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={80}>
            <Card className="flex h-full flex-col bg-background transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="mb-3 flex size-11 items-center justify-center rounded-lg border bg-muted/50">
                  <AppleIcon className="size-5" strokeWidth={1.75} />
                </div>
                <CardTitle className="text-lg">아이폰 (iOS)</CardTitle>
                <CardDescription className="break-keep leading-relaxed">
                  사파리로 웹앱에 접속한 뒤, 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 아이콘으로 써요.
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild variant="outline">
                  <a href={APP_URL} onClick={() => track('Clicked Start App', { placement: 'ios_guide' })}>
                    사파리로 웹앱 열기
                    <ArrowRightIcon />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
