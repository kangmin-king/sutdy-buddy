import { Reveal } from '@/components/reveal';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { track } from '@/analytics';
import { CONTACT_OPENCHAT_URL, FAQ_ITEMS } from '@/lib/site';

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 border-b">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:py-24 lg:grid-cols-[20rem_1fr] lg:gap-20">
        <Reveal className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">FAQ</p>
          <h2 className="text-balance break-keep text-3xl font-extrabold tracking-tight md:text-4xl">
            자주 묻는 질문
          </h2>
          <p className="mt-4 break-keep text-sm leading-relaxed text-muted-foreground">
            {CONTACT_OPENCHAT_URL ? (
              <>
                여기에 없는 게 궁금하면{' '}
                <a
                  href={CONTACT_OPENCHAT_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track('Clicked Contact Openchat', { placement: 'faq' })}
                  className="font-semibold text-foreground underline underline-offset-4"
                >
                  카카오톡 1:1 문의
                </a>
                로 물어보세요. 다른 사람에게는 보이지 않습니다.
              </>
            ) : (
              '설치부터 사용법까지, 처음 쓸 때 가장 많이 물어보는 것들을 모았습니다.'
            )}
          </p>
        </Reveal>

        <Reveal>
          <Accordion type="single" collapsible className="w-full border-y">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={item.q} value={`item-${i}`}>
                <AccordionTrigger className="break-keep">{item.q}</AccordionTrigger>
                <AccordionContent className="max-w-2xl break-keep">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
