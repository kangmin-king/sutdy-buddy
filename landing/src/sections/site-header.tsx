import mascotFace from '@/assets/mascot-buddy-v3.webp';
import { Button } from '@/components/ui/button';
import { trackNavigation } from '@/analytics';
import { APP_URL, NAV_LINKS } from '@/lib/site';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* 높이를 바꾸면 각 섹션의 scroll-mt-* 도 같이 맞춰야 한다 — 안 그러면 메뉴로
          이동했을 때 섹션 제목이 이 헤더 뒤로 숨는다. 지금은 h-16 ↔ scroll-mt-16. */}
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        {/* 이 헤더는 /privacy에서도 쓴다. `#top`만 쓰면 그 페이지에는 id="top"이 없어서
            로고를 눌러도 `/privacy#top`이 붙을 뿐 홈으로 돌아가지 않는다 — 로고는 홈으로
            가는 것이 관례라 사용자는 눌러 보고 안 되면 길을 잃는다. 절대 경로로 둔다. */}
        <a href="/#top" className="flex items-center gap-2.5">
          <img src={mascotFace} alt="" className="size-8 rounded-md" />
          <span className="text-lg font-bold tracking-tight">스터디 벅스</span>
        </a>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3.5 py-2 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Button asChild>
            <a href={APP_URL} onClick={(e) => trackNavigation(e, 'Clicked Start App', { placement: 'nav' })}>
              웹으로 시작하기
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
