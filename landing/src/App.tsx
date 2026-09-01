import { useEffect, useRef, useState } from 'react';
import mascotBunny from './assets/mascot-bunny-color.png';
import mascotFace from './assets/mascot-face.png';
import appHome from './assets/app_home.png';
import appCalendar from './assets/app_calendar.png';

const APP_URL = 'https://app.studybuks.store';
const APK_URL = 'https://drive.google.com/file/d/1SxxChy7Qudom_dSSgFPicGawKxOH29hd/view?usp=sharing';

// 가장 차별화되는 3개는 크게, 나머지는 목록으로 — "4칸 균등 카드" 패턴을 피한다.
const HIGHLIGHT_FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: '✅', title: '오늘의 할 일 · 실시간 타이머', body: '숙제와 스스로 세운 계획을 한 화면에서 관리하고, 시작/일시정지로 실제 공부 시간을 기록해요.' },
  { icon: '🤝', title: '숙제 제안하기', body: '과외쌤이 캘린더에서 바로 숙제를 제안하면, 학생은 체크·X로 즉시 수락하거나 거절해요.' },
  // 차단목록(인스타·유튜브·틱톡)에서 허용목록으로 모델이 바뀐 지 오래다. 지금은 고른 앱 외에
  // 전부 막는 정반대 구조라, 예전 문구를 그대로 두면 사실과 다르다.
  { icon: '🚫', title: '딴짓 멈춰', body: '공부 중엔 미리 고른 앱만 열려요. 쉬는 시간을 쓰면 잠시 풀리고, 끝나면 알아서 돌아와요. (안드로이드 전용)' },
];

const MORE_FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: '📅', title: '캘린더 & 완료율', body: '날짜별 완료율이 색깔 링으로 보여요.' },
  { icon: '📝', title: '스터디 플래너', body: '스스로 하고 싶은 공부도 자유롭게 추가.' },
  { icon: '📊', title: '과외쌤 대시보드', body: '학생별 숙제·진도를 한 계정에서.' },
  { icon: '🔔', title: '실시간 푸시 알림', body: '숙제 변경·학습 완료를 바로 알림.' },
  { icon: '📚', title: '학교 시간표', body: '과외쌤도 함께 보는 학교 시간표.' },
  { icon: '⏱️', title: '모의고사 타이머', body: '과목별 실제 시험시간 카운트다운.' },
];

// 화면에 들어올 때 한 번만 살짝 떠오른다. 이름값을 못 하던 껍데기였던 걸 실제로 구현했다.
// 초기 상태가 opacity-0이므로, 관찰이 불가능한 환경(IntersectionObserver 미지원)에서는
// 반드시 처음부터 보이게 해야 한다 — 안 그러면 내용이 통째로 안 보인다.
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={`${className} transition-all duration-700 ease-out ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      {children}
    </div>
  );
}

// 열품타 랜딩페이지처럼 실제 앱 화면 스크린샷을 폰 베젤 안에 넣어서 보여준다.
function PhoneFrame({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={`relative rounded-[2.3rem] bg-[#0a0a0a] p-2.5 ${className}`}
      style={{ boxShadow: '0 30px 60px -18px rgba(0,0,0,0.55)' }}
    >
      <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-16 h-4 bg-[#0a0a0a] rounded-full z-10" />
      <img src={src} alt={alt} className="rounded-[1.7rem] w-full h-auto block" />
    </div>
  );
}

function NavBar() {
  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-white/80 border-b border-slate-100">
      <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={mascotFace} alt="스터디 벅스" className="w-8 h-8 rounded-lg" />
          <span className="font-extrabold text-navy text-lg">스터디 벅스</span>
        </div>
        <a
          href={APP_URL}
          className="text-sm font-semibold text-white bg-navy px-4 py-2 rounded-full transition-all hover:bg-navy-light hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0"
        >
          웹으로 시작하기
        </a>
      </div>
    </header>
  );
}

// 앱을 만들게 된 그 장면으로 문을 연다. 과외쌤이라면 설명 없이 걸리는 대화라서,
// 기능 나열보다 이게 먼저 온다.
function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="relative max-w-5xl mx-auto px-5 pt-16 pb-20 flex flex-col md:flex-row items-center gap-12">
        <div className="flex-1 w-full">
          <img
            src={mascotBunny}
            alt="스터디 벅스 마스코트"
            className="w-12 mb-5"
            style={{ filter: 'drop-shadow(0 8px 14px rgba(30,39,97,0.22))' }}
          />
          <p className="text-carrot font-bold tracking-[0.2em] text-xs mb-6">과외쌤이라면 아는 그 장면</p>

          <div className="flex flex-col gap-3 mb-8 max-w-md">
            <p className="w-fit bg-slate-100 text-navy text-2xl md:text-4xl font-extrabold tracking-tight leading-tight px-5 py-3 rounded-3xl rounded-bl-md">
              숙제 다 했어?
            </p>
            <p className="w-fit self-end bg-navy text-white text-2xl md:text-4xl font-extrabold tracking-tight leading-tight px-5 py-3 rounded-3xl rounded-br-md">
              네, 다 했어요.
            </p>
          </div>

          <h1 className="text-xl md:text-3xl font-extrabold text-carrot tracking-tight mb-5 break-keep text-balance">
            그 대답, 확인할 방법이 없었습니다.
          </h1>
          <p className="text-slate-500 text-base mb-9 max-w-md leading-relaxed break-keep">
            스터디 벅스는 매일 얼마나 했는지가 그대로 남습니다.
            몰아서 한 날도, 아예 안 한 날도 캘린더에 그대로 보입니다.
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href={APP_URL}
              className="bg-carrot text-white font-bold px-6 py-3.5 rounded-full transition-all hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0"
              style={{ boxShadow: '0 10px 30px -8px rgba(255,107,53,0.55)' }}
            >
              웹으로 시작하기
            </a>
            <a
              href="#proof"
              className="bg-slate-100 text-navy font-bold px-6 py-3.5 rounded-full transition-all hover:bg-slate-200 hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0"
            >
              어떻게 보이는지 먼저 보기
            </a>
          </div>
        </div>

        <div className="relative w-60 md:w-72 shrink-0 h-[26rem] md:h-[30rem]">
          <PhoneFrame src={appCalendar} alt="캘린더 화면" className="absolute left-0 top-0 w-32 md:w-36 -rotate-[7deg]" />
          <PhoneFrame src={appHome} alt="홈 화면" className="absolute right-0 top-10 w-36 md:w-44 rotate-[5deg] z-10" />
        </div>
      </div>
    </section>
  );
}

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

const CAL_CELL: Record<string, string> = {
  idle: 'bg-white/5 text-white/40',
  done: 'bg-ice/20 text-white',
  miss: 'bg-carrot/15 text-carrot border border-carrot/45',
  redist: 'bg-white/10 text-ice border border-dashed border-ice/50',
};

function Proof() {
  return (
    <section id="proof" className="grain relative overflow-hidden bg-[#151C48] text-white scroll-mt-16">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 75% -10%, rgba(255,107,53,0.16), transparent)' }}
      />
      <div className="relative max-w-5xl mx-auto px-5 py-24 grid grid-cols-1 md:grid-cols-[1fr_300px] gap-12 md:gap-16 items-center">
        <Reveal>
          <p className="text-ice/70 font-bold tracking-[0.2em] text-xs mb-4">밀린 숙제를 다루는 방식</p>
          <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-[1.32] break-keep text-balance">
            따라잡을 길은 열어주되,
            <br />
            <span className="text-carrot">안 한 날은 지워주지 않습니다.</span>
          </h2>
          <p className="text-ice/90 text-base mt-6 max-w-md leading-relaxed break-keep">
            놓친 분량은 남은 날짜에 알아서 다시 나눠 담습니다.
            그런데 못 한 날의 ×는 그대로 남습니다. 채근하지 않아도,
            안 했다는 사실이 사라지지 않습니다.
          </p>
        </Reveal>

        <Reveal>
          <div className="rounded-2xl border border-white/15 bg-white/[0.055] p-5">
            <div className="flex justify-between items-baseline text-xs text-ice/70 mb-3">
              <span>9월</span>
              <span>수학 · 쎈 78p</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {CAL_DAYS.map(({ d, state }) => (
                <div
                  key={d}
                  className={`aspect-square rounded-lg grid place-items-center text-[11px] font-medium ${CAL_CELL[state]}`}
                >
                  {state === 'miss' ? <span className="text-[15px] font-bold leading-none">×</span> : d}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col gap-2 text-[11.5px] text-ice">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded shrink-0 bg-carrot/20 border border-carrot/55" />
                못 한 날 — 기록으로 남음
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded shrink-0 bg-white/10 border border-dashed border-ice/55" />
                남은 분량 자동 재분배
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="max-w-5xl mx-auto px-5 py-24">
      <Reveal className="mb-14">
        <p className="text-carrot font-bold tracking-[0.2em] text-xs mb-2 text-center">FEATURES</p>
        <h2 className="text-3xl md:text-4xl font-extrabold text-navy text-center tracking-tight">핵심 기능 한눈에 보기</h2>
      </Reveal>

      <div className="flex flex-col gap-4 mb-6">
        {HIGHLIGHT_FEATURES.map((f, i) => (
          <Reveal key={f.title}>
            <div
              className={`flex flex-col md:flex-row items-center gap-6 rounded-3xl bg-slate-50 p-8 md:p-10 transition-transform hover:-translate-y-1 ${
                i % 2 === 1 ? 'md:flex-row-reverse' : ''
              }`}
            >
              <div className="w-20 h-20 shrink-0 rounded-2xl bg-navy text-4xl flex items-center justify-center">{f.icon}</div>
              <div className="text-center md:text-left">
                <h3 className="font-extrabold text-navy text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto md:mx-0">{f.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <p className="text-xs font-bold text-slate-400 tracking-widest mb-4 mt-10">그 외에도</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {MORE_FEATURES.map((f) => (
            <div key={f.title} className="flex items-center gap-4 py-2">
              <span className="text-2xl shrink-0">{f.icon}</span>
              <div className="min-w-0">
                <p className="font-bold text-navy text-sm">{f.title}</p>
                <p className="text-xs text-slate-500">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Download() {
  return (
    <section id="download" className="bg-slate-50 py-24">
      <div className="max-w-5xl mx-auto px-5">
        <Reveal className="mb-14">
          <p className="text-carrot font-bold tracking-[0.2em] text-xs mb-2 text-center">GET STARTED</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-navy text-center tracking-tight">다운로드 & 이용 안내</h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Reveal>
            <div
              className="h-full bg-white rounded-3xl p-8 transition-transform hover:-translate-y-1"
              style={{ boxShadow: '0 12px 32px -12px rgba(30,39,97,0.18)' }}
            >
              <div className="w-14 h-14 rounded-2xl bg-navy/5 text-3xl flex items-center justify-center mb-4">🤖</div>
              <h3 className="font-extrabold text-navy text-lg mb-2">안드로이드</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                APK 파일을 다운로드해서 설치하세요. 설치 중 "출처를 알 수 없는 앱" 허용이 필요할 수 있어요.
              </p>
              <a
                href={APK_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-navy text-white font-bold px-6 py-3 rounded-full transition-all hover:bg-navy-light hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0"
              >
                APK 다운로드
              </a>
            </div>
          </Reveal>
          <Reveal>
            <div
              className="h-full bg-white rounded-3xl p-8 transition-transform hover:-translate-y-1"
              style={{ boxShadow: '0 12px 32px -12px rgba(30,39,97,0.18)' }}
            >
              <div className="w-14 h-14 rounded-2xl bg-navy/5 text-3xl flex items-center justify-center mb-4">🍎</div>
              <h3 className="font-extrabold text-navy text-lg mb-2">아이폰 (iOS)</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                사파리로 웹앱에 접속한 뒤, 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 아이콘으로 써요.
              </p>
              <a
                href={APP_URL}
                className="inline-block bg-navy text-white font-bold px-6 py-3 rounded-full transition-all hover:bg-navy-light hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0"
              >
                사파리로 웹앱 열기
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-100 py-10">
      <div className="max-w-5xl mx-auto px-5 flex items-center justify-center gap-2">
        <img src={mascotFace} alt="" className="w-5 h-5 rounded" />
        <p className="text-xs text-slate-400">스터디 벅스 · Study Buks</p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <NavBar />
      <Hero />
      <Proof />
      <Features />
      <Download />
      <Footer />
    </div>
  );
}
