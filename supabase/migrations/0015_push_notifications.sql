-- 학생/선생님 각자 기기에 보낼 FCM 푸시 토큰을 저장한다. 한 사용자가 여러 기기를 쓸 수 있으므로
-- (user_id, fcm_token) 조합으로 유니크만 두고, 재로그인 등으로 같은 토큰이 다시 등록되면 upsert로
-- 중복 행 없이 갱신되게 한다.
create table sb_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  platform text not null default 'android' check (platform in ('android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fcm_token)
);
alter table sb_device_tokens enable row level security;
create policy "select own device tokens" on sb_device_tokens for select using (auth.uid() = user_id);
create policy "insert own device tokens" on sb_device_tokens for insert with check (auth.uid() = user_id);
create policy "update own device tokens" on sb_device_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own device tokens" on sb_device_tokens for delete using (auth.uid() = user_id);
