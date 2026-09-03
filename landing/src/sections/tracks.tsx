import { ArrowRightIcon, CheckIcon, GraduationCapIcon, UsersIcon, type LucideIcon } from 'lucide-react';

import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { track } from '@/analytics';
import { APP_URL } from '@/lib/site';

// 앱은 학생 계정과 관리자(과외쌤·학부모) 계정이 갈리는 two-track 구조인데, 그 얘기가 랜딩에
// 없으면 방문자가 "나는 어느 쪽으로 가입하나"를 못 정한다. 가입 화면의 역할 선택과 같은
// 이름을 쓴다 — 여기서 부르는 이름과 가입 화면의 칩 이름이 다르면 바로 헷갈린다.
const TRACKS: { icon: LucideIcon; role: string; lead: string; points: string[] }[] = [
  {
    icon: GraduationCapIcon,
    role: '학생',
    lead: '오늘 뭘 해야 하고, 얼마나 했는지.',
    points: [
      '오늘의 할 일과 스스로 세운 계획을 한 화면에서',
      '타이머로 실제 공부한 시간이 기록됨',
      '공부 중엔 미리 고른 앱만 열림 (안드로이드)',
    ],
  },
  {
    icon: UsersIcon,
    role: '과외쌤 · 학부모',
    lead: '말이 아니라 기록으로 확인.',
    points: [
      '학생별 숙제·진도를 한 계정에서 관리',
      '캘린더에서 바로 숙제 제안, 학생이 수락/거절',
      '숙제 변경·학습 완료를 푸시로 바로 알림',
    ],
  },
];

export function Tracks() {
  return (
    <section id="who" className="scroll-mt-16 border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <Reveal className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">누가 쓰나요</p>
          <h2 className="text-balance break-keep text-3xl font-extrabold tracking-tight md:text-4xl">
            보는 사람에 따라 화면이 다릅니다.
          </h2>
          <p className="mt-4 break-keep leading-relaxed text-muted-foreground">
            가입할 때 역할을 고르면 그에 맞는 화면으로 들어갑니다. 학생은 할 일을, 과외쌤과 학부모는 그 결과를
            봅니다.
          </p>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-2">
          {TRACKS.map((t, i) => (
            <Reveal key={t.role} delay={i * 80}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-muted/50">
                    <t.icon className="size-5 text-foreground" />
                  </div>
                  <CardTitle className="text-lg">{t.role}</CardTitle>
                  <CardDescription className="text-base">{t.lead}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2.5">
                    {t.points.map((p) => (
                      <li key={p} className="flex gap-2.5 break-keep text-sm text-muted-foreground">
                        <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8">
          <Button asChild variant="ghost" className="px-0 hover:bg-transparent hover:text-primary">
            <a href={APP_URL} onClick={() => track('Clicked Start App', { placement: 'tracks' })}>
              가입하면서 역할 고르기
              <ArrowRightIcon />
            </a>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
