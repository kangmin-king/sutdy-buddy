import {
  BellIcon,
  CalendarDaysIcon,
  HandshakeIcon,
  HourglassIcon,
  LayoutDashboardIcon,
  NotebookPenIcon,
  SchoolIcon,
  ShieldBanIcon,
  TimerIcon,
  type LucideIcon,
} from 'lucide-react';

export const APP_URL = 'https://app.studybuks.store';
export const APK_URL = 'https://drive.google.com/file/d/1SxxChy7Qudom_dSSgFPicGawKxOH29hd/view?usp=sharing';

// 문의 창구는 카카오톡 **1:1** 오픈채팅. 그룹방으로 만들면 안 된다 — 문의 내용이 학생 이름·
// 성적·숙제 이행 여부라서, 한 방에 모으면 학부모끼리 서로의 사정을 그대로 보게 된다.
// 메일로 받으려면 studybuks.store에 MX 레코드가 필요한데 2026-09-03 조회 기준 하나도
// 없어서(DNS는 카페24) 도메인 메일은 전부 반송된다.
//
// 1:1 오픈채팅을 만들고 "링크 복사"로 나오는 https://open.kakao.com/... 주소를 여기 넣으면
// 푸터와 FAQ에 문의 링크가 나타난다. null인 동안에는 아무 링크도 렌더링하지 않는다 —
// 죽은 링크는 없는 것보다 나쁘다.
export const CONTACT_OPENCHAT_URL: string | null = 'https://open.kakao.com/o/sq4hxSLi';

// 앵커를 "/#who"처럼 절대경로로 둔다. /privacy 같은 다른 페이지에서도 같은 헤더가 동작해야
// 하기 때문이다. 랜딩(/)에서 누르면 경로가 같으므로 새로고침 없이 스크롤만 된다.
export const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/#who', label: '누가 쓰나요' },
  { href: '/#how', label: '작동 방식' },
  { href: '/#features', label: '기능' },
  { href: '/#faq', label: '자주 묻는 질문' },
];

/**
 * 개인정보처리방침에 들어가야 하는, 코드에서 알아낼 수 없는 값들.
 * 빈 문자열인 항목이 하나라도 있으면 /privacy 상단에 미완성 안내가 뜬다 —
 * 채우면 그 안내는 저절로 사라진다. **전부 채우기 전에는 플레이 콘솔에 제출하지 말 것.**
 */
export const POLICY = {
  operator: '', // 운영 주체 표기 (개인 개발자면 이름, 사업자라면 상호·대표자·사업자등록번호)
  officer: '', // 개인정보 보호책임자 이름
  officerContact: '', // 연락 가능한 수단 (이메일 권장)
  effectiveDate: '', // 시행일 (예: 2026-09-10)
} as const;

export const POLICY_INCOMPLETE = Object.values(POLICY).some((v) => v.trim() === '');

type Feature = { icon: LucideIcon; title: string; body: string };

// 가장 차별화되는 3개는 크게, 나머지는 목록으로 — "4칸 균등 카드" 패턴을 피한다.
export const HIGHLIGHT_FEATURES: Feature[] = [
  {
    icon: TimerIcon,
    title: '오늘의 할 일 · 실시간 타이머',
    body: '숙제와 스스로 세운 계획을 한 화면에서 관리하고, 시작/일시정지로 실제 공부 시간을 기록해요.',
  },
  {
    icon: HandshakeIcon,
    title: '숙제 제안하기',
    body: '과외쌤이 캘린더에서 바로 숙제를 제안하면, 학생은 체크·X로 즉시 수락하거나 거절해요.',
  },
  // 차단목록(인스타·유튜브·틱톡)에서 허용목록으로 모델이 바뀐 지 오래다. 지금은 고른 앱 외에
  // 전부 막는 정반대 구조라, 예전 문구를 그대로 두면 사실과 다르다.
  {
    icon: ShieldBanIcon,
    title: '딴짓 멈춰',
    body: '공부 중엔 미리 고른 앱만 열려요. 쉬는 시간을 쓰면 잠시 풀리고, 끝나면 알아서 돌아와요. (안드로이드 전용)',
  },
];

export const MORE_FEATURES: Feature[] = [
  { icon: CalendarDaysIcon, title: '캘린더 & 완료율', body: '날짜별 완료율이 색깔 링으로 보여요.' },
  { icon: NotebookPenIcon, title: '스터디 플래너', body: '스스로 하고 싶은 공부도 자유롭게 추가.' },
  { icon: LayoutDashboardIcon, title: '과외쌤 대시보드', body: '학생별 숙제·진도를 한 계정에서.' },
  { icon: BellIcon, title: '실시간 푸시 알림', body: '숙제 변경·학습 완료를 바로 알림.' },
  { icon: SchoolIcon, title: '학교 시간표', body: '과외쌤도 함께 보는 학교 시간표.' },
  { icon: HourglassIcon, title: '모의고사 타이머', body: '과목별 실제 시험시간 카운트다운.' },
];

export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    // "결제 기능이 없다"는 2026-09-03 기준 저장소 전체를 확인한 사실이다(결제 SDK·구독
    // 테이블·paywall 코드 0건). 나중에 결제를 붙이는 순간 이 문구부터 고쳐야 한다.
    q: '정말 무료인가요?',
    a: '네, 지금은 전부 무료입니다. 파일럿 단계라 결제 기능 자체가 들어 있지 않습니다. 유료로 바뀌는 계획이 생기면 미리 안내드립니다.',
  },
  {
    q: '아이폰에서도 쓸 수 있나요?',
    a: '쓸 수 있습니다. 사파리로 웹앱에 접속한 뒤 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 아이콘으로 씁니다. 다만 다른 앱을 잠그는 "딴짓 멈춰"는 안드로이드 전용입니다 — iOS는 시스템이 앱 잠금을 허용하지 않습니다.',
  },
  {
    q: '학생 휴대폰에 뭘 설치해야 하나요?',
    a: '숙제 관리와 타이머만 쓸 거라면 설치 없이 브라우저로 충분합니다. "딴짓 멈춰"처럼 기기 기능을 쓰는 기능은 안드로이드 앱(APK) 설치가 필요합니다.',
  },
  {
    q: '과외쌤 한 계정으로 학생 여러 명을 볼 수 있나요?',
    a: '네. 대시보드에서 학생별로 숙제와 진도를 따로 봅니다. 학생마다 계정을 새로 만들 필요가 없습니다.',
  },
  {
    q: '학부모도 볼 수 있나요?',
    a: '가입할 때 "과외쌤 · 학부모"를 선택하면 과외쌤과 같은 관리자 화면을 씁니다. 학생 계정과는 보이는 화면이 다릅니다.',
  },
  {
    q: '학생이 숙제를 안 하고 넘어가면 어떻게 되나요?',
    a: '못 한 분량은 남은 날짜에 자동으로 다시 나눠 담습니다. 그래도 못 한 날의 ×는 캘린더에 그대로 남습니다 — 따라잡을 길은 열어주되 기록을 지워주지는 않습니다.',
  },
];
