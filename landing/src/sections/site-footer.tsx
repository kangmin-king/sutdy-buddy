import mascotFace from '@/assets/mascot-face.png';
import { track } from '@/analytics';
import { APK_URL, APP_URL, CONTACT_OPENCHAT_URL, NAV_LINKS } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <img src={mascotFace} alt="" className="size-6 rounded-md" />
              <span className="text-sm font-bold tracking-tight">스터디 벅스</span>
            </div>
            <p className="mt-3 max-w-xs break-keep text-xs leading-relaxed text-muted-foreground">
              과외 숙제를 매일 했는지 그대로 남기는 학습 관리 앱.
            </p>
          </div>

          <div className="flex gap-14">
            <nav className="flex flex-col gap-2.5">
              <p className="text-xs font-bold text-foreground">둘러보기</p>
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <nav className="flex flex-col gap-2.5">
              <p className="text-xs font-bold text-foreground">시작하기</p>
              <a
                href={APP_URL}
                onClick={() => track('Clicked Start App', { placement: 'footer' })}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                웹앱 열기
              </a>
              <a
                href={APK_URL}
                onClick={() => track('Clicked Download Apk', { placement: 'footer' })}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                안드로이드 APK
              </a>
              {CONTACT_OPENCHAT_URL && (
                <a
                  href={CONTACT_OPENCHAT_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track('Clicked Contact Openchat', { placement: 'footer' })}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  카카오톡 1:1 문의
                </a>
              )}
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} 스터디 벅스 · Study Buks</p>
          <nav className="flex items-center gap-4">
            <a href="/privacy" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              개인정보처리방침
            </a>
            <a
              href="/privacy#delete-account"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              계정 삭제
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
