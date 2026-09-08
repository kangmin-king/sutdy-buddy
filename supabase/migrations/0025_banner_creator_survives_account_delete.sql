-- sb_banners.created_by가 auth.users를 on delete 규칙 없이(기본 NO ACTION) 참조하면서
-- not null이다. 그래서 배너를 한 번이라도 만든 계정을 지우려 하면 이 FK에 막혀 삭제가 실패한다.
-- delete-admin-user(운영자 계정 삭제)가 실제로 이 지점에서 깨진다.
--
-- 배너는 만든 사람이 떠난 뒤에도 학생 앱에 계속 떠 있어야 하는 콘텐츠다. 그래서 계정과 함께
-- 지우는 cascade가 아니라, 작성자 표시만 비우는 set null이 맞다. set null을 걸려면 not null을
-- 먼저 풀어야 한다.
--
-- 적용해도 구버전 APK가 깨지지 않는다(0021·0022와 다른 점): 학생 앱은 배너를 select만 하고
-- created_by를 쓰지 않으며, 컬럼을 nullable로 바꾸는 것은 기존 행의 값을 건드리지 않는다.

alter table sb_banners alter column created_by drop not null;

-- 0016에서 제약 이름을 지정하지 않았으므로 기본 규칙에 따라 sb_banners_created_by_fkey가
-- 붙었을 것이다. 다만 이름을 가정하고 지우면, 실제 이름이 다를 때 drop이 조용히 넘어가고
-- 아래 add가 성공해 버려서 **막는 FK가 그대로 남은 채 두 개가 공존**한다. 그 조용한 실패가
-- 제일 위험하므로 카탈로그에서 실제 이름을 찾아 지운다.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = con.conkey[1]
  where con.conrelid = 'sb_banners'::regclass
    and con.contype = 'f'
    and array_length(con.conkey, 1) = 1
    and att.attname = 'created_by';

  if constraint_name is null then
    raise exception 'sb_banners.created_by를 참조하는 외래키를 찾지 못했습니다 — 수동 확인 필요';
  end if;

  execute format('alter table sb_banners drop constraint %I', constraint_name);
end $$;

alter table sb_banners
  add constraint sb_banners_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
