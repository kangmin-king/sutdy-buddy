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
  created_by: string;
  created_at: string;
  updated_at: string;
}
