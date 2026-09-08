-- 알림 함수를 15분마다 두드리는 스케줄.
--
-- **이 저장소에 서버 타이머가 들어오는 건 이번이 처음이다.** 밀린 숙제 재분배는 "누가 화면을
-- 열 때 계산"하는 방식으로 서버 없이 해결했지만(docs/superpowers/specs/2026-08-07-...),
-- "시작하지 않았다"는 그 방식으로 알 수 없다 — 학생이 앱을 열지 않아야 성립하는 조건이라
-- 누구도 트리거를 당겨주지 않는다.
--
-- 15분 간격인 이유: 알림 시각을 21:30처럼 30분 단위로 잡을 수 있어야 하고, "정해진 시각 직후"에
-- 도착하려면 그보다 촘촘해야 한다. 자주 돌아도 발송은 하루 한 번으로 막혀 있다
-- (0023의 sb_homework_reminder_log).
--
-- ⚠️ 적용 전 준비 두 가지 (이 마이그레이션만 밀어넣으면 cron은 등록되지만 매 실행이 실패한다):
--
--   1) 함수 배포
--        supabase functions deploy homework-not-started-reminder
--
--   2) Vault에 URL과 서비스 롤 키 저장 (대시보드 SQL Editor에서 한 번)
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<service_role_key>', 'service_role_key');
--
--      Vault를 쓰는 이유는 하나다 — 서비스 롤 키를 이 파일에 적으면 저장소에 평문으로 남는다.
--
-- 실행 결과는 `select * from cron.job_run_details order by start_time desc limit 20;`로 본다.
-- 스케줄을 끄려면 `select cron.unschedule('homework-not-started-reminder');`.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'homework-not-started-reminder',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/homework-not-started-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
