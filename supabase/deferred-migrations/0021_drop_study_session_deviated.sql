-- 이탈 감지가 허용 목록 전환으로 사라진 뒤 이 컬럼에 true를 쓰는 코드가 없다.
-- 구버전 앱이 세션 종료 시 이 컬럼에 쓰므로, 새 앱이 배포된 뒤에 적용할 것.
alter table sb_study_sessions drop column deviated;
