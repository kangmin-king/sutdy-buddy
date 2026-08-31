// 타임라인(toMinutesOfDay)은 UTC로 저장된 세션 시각을 "로컬" 시각으로 보여준다.
// 그래서 그 테스트 기대값은 실행 머신의 타임존에 따라 달라진다 — CI/개발 PC 어디서든 같은
// 결과가 나오도록 이 앱의 대상 시장인 KST로 고정한다.
// (Node는 process.env.TZ를 런타임에 바꿔도 Date에 반영된다.)
process.env.TZ = 'Asia/Seoul';
