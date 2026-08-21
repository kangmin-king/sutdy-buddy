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
  { icon: '🚫', title: '딴짓 멈춰', body: '쉬는 시간 외엔 인스타·유튜브·틱톡을 자동으로 차단해서 집중을 지켜줘요. (안드로이드 전용)' },
];

const MORE_FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: '📅', title: '캘린더 & 완료율', body: '날짜별 완료율이 색깔 링으로 보여요.' },
  { icon: '📝', title: '스터디 플래너', body: '스스로 하고 싶은 공부도 자유롭게 추가.' },
  { icon: '📊', title: '과외쌤 대시보드', body: '학생별 숙제·진도를 한 계정에서.' },
  { icon: '🔔', title: '실시간 푸시 알림', body: '숙제 변경·학습 완료를 바로 알림.' },
  { icon: '📚', title: '학교 시간표', body: '과외쌤도 함께 보는 학교 시간표.' },
  { icon: '⏱️', title: '모의고사 타이머', body: '과목별 실제 시험시간 카운트다운.' },
];

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
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

function Hero() {
  return (
    <section className="grain relative overflow-hidden bg-navy text-white">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 70% -10%, rgba(255,107,53,0.18), transparent)' }}
      />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-navy-light/70 blur-sm" />
      <div className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-navy-light/70 blur-sm" />
      <div className="relative max-w-5xl mx-auto px-5 pt-20 pb-28 flex flex-col md:flex-row items-center gap-10">
        <div className="flex-1 text-center md:text-left">
          <img
            src={mascotBunny}
            alt="스터디 벅스 마스코트"
            className="w-14 mb-4 mx-auto md:mx-0"
            style={{ filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.35))' }}
          />
          <p className="text-carrot font-bold tracking-[0.2em] text-xs mb-4">STUDY BUKS</p>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.08] tracking-tight mb-5 break-keep text-balance">
            학생과 과외쌤을 잇는
            <br />
            AI 학습 코치
          </h1>
          <p className="text-ice/90 text-base md:text-lg mb-9 max-w-md mx-auto md:mx-0 leading-relaxed break-keep">
            숙제 배정부터 실시간 진도 확인, 집중을 방해하는 SNS 차단까지 —
            학습 습관을 만드는 하나의 루프예요.
          </p>
          <div className="flex flex-wrap gap-3 justify-center md:justify-start">
            <a
              href={APP_URL}
              className="bg-carrot font-bold px-6 py-3.5 rounded-full transition-all hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0"
              style={{ boxShadow: '0 10px 30px -8px rgba(255,107,53,0.55)' }}
            >
              웹으로 시작하기
            </a>
            <a
              href="#download"
              className="bg-white/10 border border-white/25 font-bold px-6 py-3.5 rounded-full transition-all hover:bg-white/20 hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0"
            >
              다운로드 & 이용 안내
            </a>
          </div>
        </div>
        <div className="relative w-60 md:w-72 shrink-0 h-[26rem] md:h-[30rem] mt-6 md:mt-0">
          <PhoneFrame src={appCalendar} alt="캘린더 화면" className="absolute left-0 top-0 w-32 md:w-36 -rotate-[7deg]" />
          <PhoneFrame src={appHome} alt="홈 화면" className="absolute right-0 top-10 w-36 md:w-44 rotate-[5deg] z-10" />
        </div>
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
      <Features />
      <Download />
      <Footer />
    </div>
  );
}
