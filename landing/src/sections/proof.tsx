import { Reveal } from '@/components/reveal';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// 히어로가 공감으로 잡았으면 여기서 증거를 보여준다. 이 앱에서 아무도 못 베끼는 부분이
// 정확히 이 재분배 규칙이라, 카피로 설명하지 않고 캘린더로 바로 보여준다.
const CAL_DAYS: { d: number; state: 'idle' | 'done' | 'miss' | 'redist' }[] = [
  { d: 1, state: 'idle' },
  { d: 2, state: 'done' },
  { d: 3, state: 'done' },
  { d: 4, state: 'miss' },
  { d: 5, state: 'miss' },
  { d: 6, state: 'done' },
  { d: 7, state: 'idle' },
  { d: 8, state: 'done' },
  { d: 9, state: 'miss' },
  { d: 10, state: 'done' },
  { d: 11, state: 'redist' },
  { d: 12, state: 'redist' },
  { d: 13, state: 'redist' },
  { d: 14, state: 'idle' },
];

// "못 한 날"은 CTA가 아니라 경고 상태다. primary(버튼 색)를 같이 쓰면, 강조색을 브랜드
// 사정으로 바꾸는 순간 ×가 경고로 안 읽히게 된다. 본앱이 --error를 따로 두는 것과 같은 이유로
// destructive를 쓴다.
const CAL_CELL: Record<string, string> = {
  idle: 'bg-foreground/[0.06] text-muted-foreground',
  done: 'bg-foreground/[0.16] text-foreground',
  miss: 'border border-destructive/50 bg-destructive/15 text-destructive',
  redist: 'border border-dashed border-foreground/35 bg-foreground/[0.06] text-foreground/80',
};

const STEPS = [
  { n: '01', t: '못 한 분량을 셉니다', b: '어제까지 남은 양이 얼마인지 매일 다시 계산합니다.' },
  { n: '02', t: '남은 날짜에 다시 나눕니다', b: '기한까지 남은 날에 알아서 얹습니다. 손으로 다시 짜지 않아도 됩니다.' },
  { n: '03', t: '못 한 날은 그대로 둡니다', b: '따라잡았다고 해서 안 했던 날의 ×가 사라지지는 않습니다.' },
];

export function Proof() {
  return (
    <section id="how" className="dark grain relative isolate scroll-mt-16 overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 75% -10%, hsl(var(--primary) / 0.18), transparent)' }}
      />

      <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 md:py-28 lg:grid-cols-[1fr_20rem] lg:gap-20">
        <Reveal>
          <Badge variant="secondary" className="mb-5">
            밀린 숙제를 다루는 방식
          </Badge>
          <h2 className="text-balance break-keep text-3xl font-extrabold leading-[1.28] tracking-tight md:text-4xl">
            따라잡을 길은 열어주되,
            <br />
            <span className="text-primary">안 한 날은 지워주지 않습니다.</span>
          </h2>
          <p className="mt-6 max-w-md break-keep leading-relaxed text-muted-foreground">
            놓친 분량은 남은 날짜에 알아서 다시 나눠 담습니다. 그런데 못 한 날의 ×는 그대로 남습니다. 채근하지 않아도,
            안 했다는 사실이 사라지지 않습니다.
          </p>

          <Separator className="my-9 max-w-2xl" />

          <ol className="grid max-w-2xl gap-6 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="text-xs font-bold tabular-nums text-primary">{s.n}</span>
                <p className="mt-1.5 break-keep text-sm font-semibold">{s.t}</p>
                <p className="mt-1 break-keep text-xs leading-relaxed text-muted-foreground">{s.b}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={100} className="lg:self-center">
          <Card className="mx-auto max-w-sm bg-card/60 p-5 backdrop-blur">
            <div className="mb-3 flex items-baseline justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">9월</span>
              <span>수학 · 쎈 78p</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {CAL_DAYS.map(({ d, state }) => (
                <div
                  key={d}
                  className={`grid aspect-square place-items-center rounded-md text-xs font-medium tabular-nums ${CAL_CELL[state]}`}
                >
                  {state === 'miss' ? <span className="text-base font-bold leading-none">×</span> : d}
                </div>
              ))}
            </div>
            <Separator className="my-4" />
            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="size-3.5 shrink-0 rounded border border-destructive/55 bg-destructive/20" />
                못 한 날 — 기록으로 남음
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3.5 shrink-0 rounded border border-dashed border-foreground/45 bg-foreground/10" />
                남은 분량 자동 재분배
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
