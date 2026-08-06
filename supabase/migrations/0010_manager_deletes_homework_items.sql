-- 0007에서 링크된 관리자가 숙제 항목(source='homework')을 만들고(insert), 읽고(select), 고칠(update)
-- 수 있는 정책은 추가했지만 delete는 빠뜨렸다. RLS상 정책이 없는 delete는 에러 없이 "0 rows affected"로
-- 조용히 실패하기 때문에, 진도관리에서 교재/과목/시험을 지워도 실제 sb_planner_items 행은 남아있다가
-- 캘린더/홈 화면이 다시 불러올 때 되살아나 보였다.
create policy "linked manager deletes homework items" on sb_planner_items for delete using (
  source = 'homework' and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid()
  )
);
