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

        {/* 스토어 배포 시점에는 개인정보처리방침·이용약관 링크가 여기 들어가야 한다.
            아직 문서 자체가 없어서 404를 만들지 않도록 링크를 걸지 않았다. */}
        <p className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} 스터디 벅스 · Study Buks
        </p>
      </div>
    </footer>
  );
}
