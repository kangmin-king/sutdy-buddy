-- 프로토타입 시절 화면(Home/Calendar/PlannerCreate/PlannerItemDetail/ExecutionCheck/
-- ConditionInput/StudyLog/StudyMaterials/TomorrowRecommendation)이 도달 불가능한 dead code라
-- 삭제되면서, 이 네 테이블을 읽고 쓰는 코드가 웹에서 완전히 사라졌다.
--
-- 그래도 지금 적용하면 안 된다 — 0021과 같은 이유다. capacitor.config.ts가 webDir: 'dist'이고
-- server.url이 없어서 JS 번들이 APK 안에 구워져 있다. 구버전 APK를 쓰는 학생의 앱은 계속
-- 구버전 코드로 돌고, 그 코드는 로그인할 때(loadAll) 이 테이블들을 select한다.
-- 테이블이 없으면 그 select가 실패하면서 로그인 직후 로드가 통째로 깨진다.
--
-- 전제 조건: 모든 학생이 이 정리 커밋 이후 빌드된 APK를 설치했을 것.
--
-- sb_schedule_blocks는 sb_planner_items(핵심 테이블)와 이름이 비슷하니 지울 때 반드시 구분할 것.
drop table if exists sb_daily_conditions;
drop table if exists sb_schedule_blocks;
drop table if exists sb_study_logs;
drop table if exists sb_study_materials;
