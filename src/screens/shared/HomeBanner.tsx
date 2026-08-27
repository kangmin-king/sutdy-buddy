import React from 'react';
import { supabase } from '../../lib/supabase';
import { todayKey } from '../../lib';
import { Icon } from '../../primitives';
import type { SbBannerRow } from '../../types/db';

// 어드민에서 등록한 공지/이벤트 배너 중 오늘 날짜에 활성인 것 하나를 보여준다. 닫기는 이번 세션
// 동안만 기억한다(서버에 저장 안 함) — 앱을 다시 열면 다시 보인다.
export default function HomeBanner() {
  const [banner, setBanner] = React.useState<SbBannerRow | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const today = todayKey();
    supabase
      .from('sb_banners')
      .select('*')
      .eq('active', true)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setBanner(data));
  }, []);

  if (!banner || dismissed) return null;

  const content = (
    <div className="flex items-center gap-3 rounded-xl bg-primary-container/30 border border-primary-container p-3">
      {banner.image_url && <img src={banner.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
      <p className="flex-1 min-w-0 text-sm font-semibold text-on-surface truncate">{banner.title}</p>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDismissed(true);
        }}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition hover:bg-surface-container"
        aria-label="배너 닫기"
      >
        <Icon name="close" className="!text-[18px]" />
      </button>
    </div>
  );

  return (
    <div className="mt-3">
      {banner.link_url ? (
        <a href={banner.link_url} target="_blank" rel="noreferrer" className="block">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}
