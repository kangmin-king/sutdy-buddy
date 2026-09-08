import { Cta } from '@/sections/cta';
import { Download } from '@/sections/download';
import { Faq } from '@/sections/faq';
import { Features } from '@/sections/features';
import { Hero } from '@/sections/hero';
import { Proof } from '@/sections/proof';
import { SiteFooter } from '@/sections/site-footer';
import { SiteHeader } from '@/sections/site-header';
import { Tracks } from '@/sections/tracks';

// 섹션 순서가 곧 서사다: 공감(Hero) → 누구를 위한 앱인지(Tracks) → 증거(Proof) →
// 기능(Features) → 남은 의심 해소(Faq) → 설치 방법(Download) → 마지막 권유(Cta).
export default function App() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <Tracks />
        <Proof />
        <Features />
        <Faq />
        <Download />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
