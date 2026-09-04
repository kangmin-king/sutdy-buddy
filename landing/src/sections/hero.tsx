import { ArrowRightIcon, CheckIcon } from 'lucide-react';

import appCalendar from '@/assets/app_calendar.png';
import appHome from '@/assets/app_home.png';
import mascotBunny from '@/assets/mascot-bunny-color.png';
import { PhoneFrame } from '@/components/phone-frame';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { track } from '@/analytics';
import { APP_URL } from '@/lib/site';

const TRUST = ['설치 없이 웹에서 바로', '안드로이드 앱 제공', '과외쌤·학생 계정 분리'];

// 앱을 만들게 된 그 장면으로 문을 연다. 과외쌤이라면 설명 없이 걸리는 대화라서,
// 기능 나열보다 이게 먼저 온다.
export function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden border-b">
      <div aria-hidden className="grid-bg absolute inset-0 -z-10" />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 lg:grid-cols-[1fr_auto] lg:gap-20 lg:py-24">
        <div className="max-w-xl">
          <Badge variant="secondary" className="mb-7 gap-2.5 rounded-lg py-2 pl-2 pr-4 text-base">
            <img src={mascotBunny} alt="" className="size-7 shrink-0 object-contain" />
            과외쌤이라면 아는 그 장면
          </Badge>

          {/* 시각적 제목 역할은 h1이 하고, 이 말풍선은 그 앞에 놓인 장면이다.
              이 페이지를 읽는 사람이 과외쌤이므로, 과외쌤의 말을 자기 말처럼 오른쪽에 두고
              학생의 대답을 왼쪽에 둔다. 모서리 꼬리도 각자 앉은 쪽으로 맞춘다.
              색은 바꾸지 않았다 — 바로 아래 h1이 "그 대답"이라고 받는 대상이 학생의 대답이라,
              강조(진한 말풍선)는 그쪽에 남아 있어야 문장이 이어진다. */}
          <div className="mb-8 flex max-w-[19rem] flex-col gap-2.5">
            <p className="w-fit self-end rounded-2xl rounded-br-sm bg-muted px-4 py-2.5 text-base font-semibold text-foreground md:text-lg">
              숙제 다 했어?
            </p>
            <p className="w-fit self-start rounded-2xl rounded-bl-sm bg-foreground px-4 py-2.5 text-base font-semibold text-background md:text-lg">
              네, 다 했어요.
            </p>
          </div>

          <h1 className="text-balance break-keep text-4xl font-extrabold leading-[1.15] tracking-tight md:text-5xl lg:text-[3.5rem]">
            그 대답,{' '}
            <span className="relative inline-block whitespace-nowrap">
              {/* 형광펜 자리. 한글은 글자가 em 박스 아래쪽에 붙어서, 라틴 기준으로 잡으면
                  취소선처럼 글자를 가로지른다. 글자 밑단에 걸치도록 낮게 깐다. */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0.5 -z-10 h-2.5 rounded-sm bg-primary/35 md:bottom-1 md:h-3"
              />
              확인할 방법이
            </span>{' '}
            없었습니다.
          </h1>

          <p className="mt-6 max-w-md break-keep text-base leading-relaxed text-muted-foreground md:text-lg">
            스터디 벅스는 매일 얼마나 했는지가 그대로 남습니다. 몰아서 한 날도, 아예 안 한 날도 캘린더에 그대로
            보입니다.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={APP_URL} onClick={() => track('Clicked Start App', { placement: 'hero' })}>
                웹으로 시작하기
                <ArrowRightIcon />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">어떻게 보이는지 먼저 보기</a>
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckIcon className="size-3.5 text-primary" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto h-[24rem] w-[17rem] shrink-0 sm:h-[28rem] sm:w-[20rem] lg:h-[32rem] lg:w-[22rem]">
          <PhoneFrame
            src={appCalendar}
            alt="스터디 벅스 캘린더 화면 — 날짜별 완료율이 링으로 보인다"
            className="absolute left-0 top-4 w-[8.5rem] -rotate-[6deg] sm:w-40 lg:w-44"
          />
          <PhoneFrame
            src={appHome}
            alt="스터디 벅스 홈 화면 — 오늘의 할 일과 타이머"
            className="absolute right-0 top-14 z-10 w-[10rem] rotate-[5deg] sm:w-48 lg:w-52"
          />
        </div>
      </div>
    </section>
  );
}
