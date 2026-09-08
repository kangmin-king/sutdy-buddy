import { Reveal } from '@/components/reveal';
import { Card } from '@/components/ui/card';
import { HIGHLIGHT_FEATURES, MORE_FEATURES } from '@/lib/site';

export function Features() {
  return (
    <section id="features" className="scroll-mt-16 border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <Reveal className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">Features</p>
          <h2 className="text-balance break-keep text-3xl font-extrabold tracking-tight md:text-4xl">
            핵심 기능 한눈에 보기
          </h2>
        </Reveal>

        {/* 가장 차별화되는 3개는 넓은 줄로, 나머지는 목록으로 — "4칸 균등 카드" 패턴을 피한다.
            좌우 교차 배치를 쓰면 아이콘이 카드 반대쪽 끝으로 튀어 빈 공간이 커지므로,
            아이콘은 항상 왼쪽에 두고 번호로 순서를 읽히게 한다. */}
        <div className="flex flex-col gap-4">
          {HIGHLIGHT_FEATURES.map((f, i) => (
            <Reveal key={f.title}>
              <Card className="flex flex-col items-start gap-6 p-8 transition-shadow hover:shadow-md md:flex-row md:items-center md:gap-8 md:p-10">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-muted/50">
                  <f.icon className="size-6 text-foreground" strokeWidth={1.75} />
                </div>
                <div className="md:flex-1">
                  <h3 className="text-lg font-bold tracking-tight">{f.title}</h3>
                  <p className="mt-2 max-w-xl break-keep text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
                <span className="hidden shrink-0 text-3xl font-extrabold tabular-nums text-muted-foreground/25 md:block">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-14">
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">그 외에도</p>
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {MORE_FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <f.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 break-keep text-xs leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
