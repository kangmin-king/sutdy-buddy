# Design: 관리자(과외쌤·학부모) 앱 재설계 — 홈/캘린더/진도관리

## Context

투트랙 개편(2026-08-04) 1차 구현에서 만든 관리자 앱(`ManagerStudentList` → 학생 선택 → 숙제 등록 폼 + 캘린더 탭)은 사용자가 실제로 보니 "체계화되어 있지 않다"는 평가를 받았다. 사용자는 이번 개편 전 원래 앱(현재 `LegacyStudentAppShell`로 남아있는, 5탭·컨디션·AI추천·체크리스트가 있던 버전)의 구조가 오히려 관리자용으로 더 적합하다고 판단했고 — 이는 애초 2026-08-04 설계 문서에도 "현재 디자인은 학생보다 과외쌤/학부모가 관리하기 좋은 구조였다"고 명시되어 있던 관찰과 일치한다.

이 문서는 관리자 앱을 원래 앱의 일부 개념(주로 캘린더)을 반영하되 현재 디자인 시스템은 그대로 유지하면서, 완전히 새로운 구조로 재설계한다. 방금 구현한 `ManagerHomeworkForm`/기존 탭 스위처는 이 설계로 대체된다.

## 계정/데이터 모델 변경

### 신규 테이블

**`sb_exam_records`** — 학생별 시험/평가 항목. 메인 시험 1개 + 수행평가·모의고사 등 추가 가능.
- `id`, `student_id`, `created_by`(관리자 uid), `title`, `exam_date`, `is_main boolean`, `created_at`

**`sb_exam_subjects`** — 시험 안의 과목별 목표.
- `id`, `exam_id`, `subject_id`, `target_grade`, `target_score`, `target_rank`, `created_at`

**`sb_exam_subject_ranges`** — 과목에 등록한 교재/범위 이력(진도관리 탭에 카드로 표시).
- `id`, `exam_subject_id`, `material`, `range_label`(예: "10~50페이지"), `assigned_dates text[]`(실제 배정된 날짜들), `created_at`

**`sb_tutoring_schedules`** — 학생별 과외 요일 패턴. 관리자당 1개, 거의 수정 안 됨.
- `id`, `student_id`, `manager_id`, `weekdays smallint[]`(0=일 ~ 6=토), `updated_at`
- unique (student_id, manager_id)

**`sb_tutoring_schedule_exceptions`** — 특정 날짜 예외(취소/변경).
- `id`, `student_id`, `manager_id`, `original_date date`, `new_date date`(null = 취소), `note text`, `created_at`

### 기존 테이블 변경

**`sb_student_manager_links`**: `label text` 컬럼 추가 — 관리자가 자신의 화면에서만 보이는 학생 별칭을 지정(연필 아이콘으로 수정). 학생 본인 프로필이나 다른 관리자에게는 영향 없음. `Profile`에 이름 필드는 추가하지 않는다.

### RLS

- 신규 테이블 4종: 링크된 관리자만 자기 학생 것에 대해 select/insert/update 가능. 기존 `sb_homework_assignments`/`sb_study_sessions`의 "linked manager" 정책 패턴을 그대로 따른다(`exists (select 1 from sb_student_manager_links l where l.student_id = ... and l.manager_id = auth.uid())`).
- `sb_planner_items`: 새 정책 추가 — 링크된 관리자가 자기 학생의 `user_id`로 항목을 insert할 수 있어야 한다(현재는 `auth.uid() = user_id`만 허용되어 있어 관리자가 학생 대신 숙제 항목을 만들 수 없다).
  ```sql
  create policy "linked manager creates homework items" on sb_planner_items for insert with check (
    source = 'homework' and exists (
      select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid()
    )
  );
  create policy "linked manager reads planner items" on sb_planner_items for select using (
    exists (select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid())
  );
  ```
  관리자가 등록 후 개별 항목(날짜별 페이지 범위)을 수정할 수도 있어야 하므로, 같은 조건(`source = 'homework'` + 링크 존재)의 update 정책도 함께 추가한다.

## 관리자 앱 화면 구조

### 최상단: 학생 선택
가로 스크롤 chip 목록. 각 chip은 `sb_student_manager_links.label`(없으면 "학생 1" 같은 기본값) 표시 + 오른쪽 작은 연필 아이콘으로 이름 수정. 연결된 학생이 없으면 기존 `ManagerStudentList`(초대코드 입력 화면) 그대로 표시.

### 하단 3탭 (순서: 캘린더 / 홈 / 진도관리 — 홈이 가운데)

**캘린더**
- 기존 캘린더 컴포넌트(디자인 그대로) 재사용, 선택된 학생 기준으로 날짜별 완료/미완료 플래너 항목을 체크 표시로 렌더링(홈 탭과 동일한 체크 패턴).
- 과외 요일 자동 표시: `getTutoringDaysInRange` 순수 함수로 그 달 범위 안의 실제 과외 날짜를 계산해서 표시(요일 패턴 + 예외 오버레이). DB에 미래 날짜 행을 미리 만들지 않는다.
- 특정 날짜를 탭하면 그 날의 과외 취소/다른 날로 변경(예외 등록) 가능.
- 화면 한쪽에 작은 "과외 요일 설정" 버튼 — 요일 패턴 자체를 바꾸는 곳(자주 안 쓸 기능이라 눈에 띄지 않게 작게 배치).

**홈**
- 선택된 학생의 오늘 **숙제**(`source: 'homework'`) 목록 — 항목별 오른쪽에 체크 표시(학생이 완료 처리하면 자동 반영, 관리자는 읽기 전용).
- 선택된 학생의 오늘 **할 일**(`source: 'self'`) 목록 — 같은 체크 표시 패턴.

**진도관리**
- 시험 목록(카드): 메인 시험 1개 + 수행평가/모의고사 등 추가 가능.
- 시험 선택 → 과목 추가 → 과목별 목표 등급/점수/등수 입력(`sb_exam_subjects`).
- 과목 안에서 "교재 등록": 교재명 + 시작~끝 페이지 입력 → 미니 캘린더가 뜸(과외 요일 표시) → 공부시킬 날짜를 하나씩 탭으로 선택 → 저장 시 선택된 날짜 순서대로 총 분량을 균등 분배(`splitPagesAcrossDates`)해서 `sb_planner_items`(source: 'homework')를 **즉시 일괄 생성**(지연 생성 없음). `sb_exam_subject_ranges`에 이력 한 줄 기록.
- 등록 이력은 카드 리스트로 표시(교재명 + 범위 + 배정된 날짜들).

기존에 구현했던 `ManagerHomeworkForm.tsx`(과목+교재+하루분량 텍스트 직접 입력, 시작일~종료일)는 이 흐름으로 완전히 대체되어 삭제된다. `sb_homework_assignments` 테이블과 그 지연 생성 로직(`shouldGenerateHomeworkItem`, Task 3/6)은 이번 관리자 흐름에서는 사용하지 않지만, 코드/테이블 자체는 제거하지 않는다(다른 용도로 재사용 가능성을 남겨둠, 관련 없는 삭제는 범위 밖).

## 핵심 로직 (순수 함수, 유닛 테스트)

**`splitPagesAcrossDates(startPage: number, endPage: number, selectedDates: string[]): { date: string; pageRange: string }[]`**
선택된 날짜 수만큼 총 페이지(`endPage - startPage + 1`)를 균등 분배하고 나머지는 마지막 날짜에 몰아준다. 날짜는 오름차순 정렬 후 순서대로 배정. 경계: 날짜 1개만 선택된 경우 전체 범위를 그 하루에 배정.

**`getTutoringDaysInRange(weekdays: number[], exceptions: { originalDate: string; newDate: string | null }[], startDate: string, endDate: string): string[]`**
요일 패턴으로 기간 안의 날짜를 계산한 뒤, 예외 목록을 적용(취소된 날은 빼고, 변경된 날은 새 날짜를 추가). 경계: 예외의 `newDate`가 이미 과외 요일인 날과 겹치는 경우 중복 없이 한 번만 포함.

두 함수 모두 `src/lib.ts`에 추가하고 `src/lib.test.ts`에 경계값 테스트를 작성한다(기존 `shouldGenerateHomeworkItem`/`sessionsToTimelineBlocks`와 같은 패턴).

## 테스트 방향

- 위 두 순수 함수의 유닛 테스트.
- 기존 `StudyTimeline` 컴포넌트를 학생 지정 가능하도록 확장하는 부분은 통합 테스트 없이(현재 프로젝트에 화면 단위 테스트가 없음) 수동 검증.
- RLS 정책은 이 환경에서 실행 검증 불가(기존 마이그레이션과 동일한 제약) — SQL 신중 작성 + 사용자가 실제 DB에 적용 후 수동 검증.

## 보류 (이번 설계 범위 밖)

- 학생 쪽에서 자기 시험/진도관리 정보를 보는 화면 — 이번엔 관리자 전용, 학생 노출은 다음 과제.
- 과외 일정 변경/취소에 대한 학생 알림(푸시 등) — 범위 밖.
- 관리자가 여러 학생에게 동시에 같은 숙제를 일괄 등록하는 기능 — 범위 밖, 학생별로 개별 등록.
