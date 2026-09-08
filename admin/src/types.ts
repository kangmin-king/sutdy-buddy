export type AdminRole = 'admin' | 'operator';

export interface AdminUserRow {
  id: string;
  role: AdminRole;
  created_at: string;
}

export interface BannerRow {
  id: string;
  title: string;
  image_url: string | null;
  link_url: string | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  // 0025에서 on delete set null이 되었다 — 배너를 만든 운영자 계정이 지워지면 이 값만 비고
  // 배너 자체는 남는다.
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
