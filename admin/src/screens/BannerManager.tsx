import React from 'react';
import { supabase } from '../lib/supabase';
import type { BannerRow } from '../types';

const EMPTY_FORM = { title: '', image_url: '', link_url: '', start_date: '', end_date: '', active: true };

export default function BannerManager({ userId }: { userId: string }) {
  const [banners, setBanners] = React.useState<BannerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [showForm, setShowForm] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('sb_banners').select('*').order('start_date', { ascending: false });
    setBanners((data as BannerRow[] | null) ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (b: BannerRow) => {
    setEditingId(b.id);
    setForm({
      title: b.title,
      image_url: b.image_url ?? '',
      link_url: b.link_url ?? '',
      start_date: b.start_date,
      end_date: b.end_date ?? '',
      active: b.active,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.start_date) return;
    const payload = {
      title: form.title.trim(),
      image_url: form.image_url.trim() || null,
      link_url: form.link_url.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      active: form.active,
    };
    if (editingId) {
      await supabase.from('sb_banners').update(payload).eq('id', editingId);
    } else {
      await supabase.from('sb_banners').insert({ ...payload, created_by: userId });
    }
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 배너를 삭제할까요?')) return;
    await supabase.from('sb_banners').delete().eq('id', id);
    load();
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold">배너 목록</h2>
        <button onClick={startCreate} className="text-sm font-semibold bg-gray-900 text-white rounded-lg px-4 py-2">
          + 새 배너
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">제목</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">이미지 URL (선택)</label>
            <input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">링크 URL (선택, 탭하면 이동)</label>
            <input
              value={form.link_url}
              onChange={(e) => setForm({ ...form, link_url: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">시작일</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">종료일 (비우면 무기한)</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            활성화
          </label>
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 rounded-lg bg-gray-900 text-white font-semibold py-2 text-sm">
              저장
            </button>
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-gray-300 font-semibold py-2 text-sm">
              취소
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">불러오는 중...</p>}
      <div className="space-y-2">
        {banners.map((b) => (
          <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold flex items-center gap-2">
                {b.title}
                {!b.active && <span className="text-[10px] font-semibold text-gray-400 border border-gray-300 rounded px-1.5 py-0.5">비활성</span>}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {b.start_date} ~ {b.end_date || '무기한'}
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <button onClick={() => startEdit(b)} className="text-sm text-gray-600 underline">
                수정
              </button>
              <button onClick={() => handleDelete(b.id)} className="text-sm text-red-600 underline">
                삭제
              </button>
            </div>
          </div>
        ))}
        {!loading && banners.length === 0 && <p className="text-sm text-gray-400 text-center py-10">등록된 배너가 없어요.</p>}
      </div>
    </div>
  );
}
