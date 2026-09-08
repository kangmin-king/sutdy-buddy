import { cn } from '@/lib/utils';

// 실제 앱 화면 스크린샷을 폰 베젤 안에 넣어서 보여준다.
// 베젤은 토큰이 아니라 실제 기기 색이라 하드코딩한다 — 어두운 밴드 안에서도 같아야 한다.
export function PhoneFrame({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={cn(
        'relative rounded-[2rem] bg-slate-950 p-2 ring-1 ring-inset ring-white/10 shadow-2xl shadow-slate-950/25',
        className,
      )}
    >
      <div className="absolute left-1/2 top-2 z-10 h-3.5 w-14 -translate-x-1/2 rounded-full bg-slate-950" />
      <img src={src} alt={alt} className="block h-auto w-full rounded-[1.5rem]" loading="lazy" />
    </div>
  );
}
