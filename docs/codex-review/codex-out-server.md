아래는 붙여진 서버/마이그레이션만 보고 판단한 리뷰입니다. 보이지 않는 클라이언트 코드나 배포 설정은 추측하지 않았습니다.

- **[치명] 로그인한 아무나 임의 사용자에게 임의 푸시를 보낼 수 있음**
- **위치**: `supabase/functions/send-push-notification/index.ts`, handler 중 `authenticateRequest` 이후
- **왜 문제인가**: 이 함수는 로그인 여부만 확인하고, 요청 본문의 `userId`, `title`, `body`를 그대로 받아 서비스 롤로 대상 기기 토큰을 조회합니다. 학생 A가 매니저 B나 다른 학생 C의 UUID를 알면, B/C에게 임의 문구의 푸시를 보낼 수 있습니다. 서비스 롤을 쓰기 때문에 RLS도 막지 못합니다.
- **어떻게 고치는가**: 호출자와 수신자의 관계를 서버에서 확인해야 합니다. 예를 들어 “연결된 학생-매니저 사이”로 제한합니다.

```ts
let callerId: string;
try {
  const authed = await authenticateRequest(req);
  callerId = authed.userId;
} catch (err) {
  ...
}

...

const { userId, title, body }: RequestBody = await req.json();

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const { data: link, error: linkError } = await admin
  .from('sb_student_manager_links')
  .select('id')
  .or(
    `and(student_id.eq.${callerId},manager_id.eq.${userId}),and(student_id.eq.${userId},manager_id.eq.${callerId})`,
  )
  .maybeSingle();

if (linkError) throw linkError;
if (!link) {
  return new Response(JSON.stringify({ error: '연결된 사용자에게만 보낼 수 있어요' }), {
    status: 403,
    headers: corsHeaders,
  });
}
```

- **확신도**: 확실

---

- **[치명] 관리자 계정 삭제 함수가 일반 학생/매니저 계정까지 삭제할 수 있음**
- **위치**: `supabase/functions/delete-admin-user/index.ts`, `deleteUser(userId)`
- **왜 문제인가**: 호출자가 `admin`인지 확인하지만, 삭제 대상이 `sb_admin_users`의 운영자 계정인지 확인하지 않습니다. 관리자가 실수로 또는 악의적으로 일반 학생/매니저 UUID를 넣으면 `auth.users`가 삭제되고, `on delete cascade`로 학습 데이터까지 사라집니다.
- **어떻게 고치는가**: 삭제 대상이 반드시 `sb_admin_users.role = 'operator'`인지 확인한 뒤 삭제합니다. 관리자 계정 삭제도 막는 편이 안전합니다.

```ts
const { data: target, error: targetError } = await admin
  .from('sb_admin_users')
  .select('id, role')
  .eq('id', userId)
  .maybeSingle();

if (targetError) throw targetError;
if (!target) {
  return new Response(JSON.stringify({ error: '운영자 계정이 아니에요' }), {
    status: 404,
    headers: corsHeaders,
  });
}
if (target.role !== 'operator') {
  return new Response(JSON.stringify({ error: '운영자 계정만 삭제할 수 있어요' }), {
    status: 400,
    headers: corsHeaders,
  });
}

const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
```

- **확신도**: 확실

---

- **[높음] 학생-매니저 링크 생성이 초대코드 검증 없이 UUID만 알면 가능함**
- **위치**: `supabase/migrations/0004_two_track.sql`, policy `"manager creates link"`
- **왜 문제인가**: 현재 insert 정책은 `auth.uid() = manager_id`만 확인합니다. 즉 매니저가 어떤 학생 UUID를 알기만 하면 `sb_student_manager_links`에 직접 insert해서 담당 학생으로 만들 수 있습니다. `find_student_by_invite_code`가 정확 일치 RPC로 좁혀져 있어도, 실제 링크 테이블 insert 경로는 초대코드를 요구하지 않습니다.
- **어떻게 고치는가**: 클라이언트 직접 insert를 막고, 초대코드를 받는 `security definer` 함수 하나로 링크 생성을 제한합니다.

```sql
drop policy "manager creates link" on sb_student_manager_links;

create or replace function link_student_by_invite_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
begin
  select p.id into target_student_id
  from sb_profiles p
  where p.invite_code = upper(code)
    and p.role = 'student'
  limit 1;

  if target_student_id is null then
    raise exception '초대코드를 찾을 수 없습니다';
  end if;

  insert into sb_student_manager_links (student_id, manager_id)
  values (target_student_id, auth.uid())
  on conflict (student_id, manager_id) do nothing;

  return target_student_id;
end;
$$;

revoke execute on function link_student_by_invite_code(text) from public;
grant execute on function link_student_by_invite_code(text) to authenticated;
```

- **확신도**: 확실

---

- **[높음] 숙제 제안 응답 시 학생이 제안 내용과 소유 관계까지 바꿀 수 있음**
- **위치**: `supabase/migrations/0018_homework_proposals.sql`, policy `"student responds to own proposal"`
- **왜 문제인가**: 정책은 `auth.uid() = student_id`만 검사합니다. PostgREST update가 허용되면 학생은 `status`뿐 아니라 `date`, `subject_id`, `material`, `page_range`, `manager_id`도 바꿀 수 있습니다. 예를 들어 선생님이 “9/10 수학 10쪽”을 제안했는데 학생이 update로 “9/10 영어 1쪽”으로 바꾼 뒤 accepted 처리할 수 있습니다.
- **어떻게 고치는가**: 테이블 권한으로 업데이트 가능 컬럼을 제한하거나, 응답 전용 RPC로만 바꾸게 합니다. RLS만으로 “특정 컬럼만 변경”은 표현하기 어렵습니다.

```sql
revoke update on sb_homework_proposals from authenticated;
grant update (status, responded_at) on sb_homework_proposals to authenticated;

drop policy "student responds to own proposal" on sb_homework_proposals;
create policy "student responds to own proposal" on sb_homework_proposals
for update using (
  auth.uid() = student_id
  and status = 'pending'
) with check (
  auth.uid() = student_id
  and status in ('accepted', 'rejected')
  and responded_at is not null
);
```

더 안전한 방식은 RPC입니다.

```sql
create or replace function respond_homework_proposal(proposal_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if next_status not in ('accepted', 'rejected') then
    raise exception 'invalid status';
  end if;

  update sb_homework_proposals
  set status = next_status,
      responded_at = now()
  where id = proposal_id
    and student_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'proposal not found or already responded';
  end if;
end;
$$;
```

- **확신도**: 확실

---

- **[보통] 운영자 생성 실패 시 auth 계정만 남는 부분 실패가 생김**
- **위치**: `supabase/functions/create-admin-user/index.ts`, `createUser` 후 `sb_admin_users.insert`
- **왜 문제인가**: `auth.admin.createUser`는 성공했는데 `sb_admin_users.insert`가 실패하면, 운영자 테이블에는 없는 auth 계정이 남습니다. 함수는 500을 반환하므로 호출자는 실패로 보지만, 실제로는 로그인 가능한 계정이 생성된 상태일 수 있습니다. 이후 같은 이메일로 재시도하면 이미 가입된 사용자라 실패할 가능성도 있습니다.
- **어떻게 고치는가**: insert 실패 시 방금 만든 auth 사용자를 보상 삭제합니다.

```ts
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createError) throw createError;

const { error: insertError } = await admin
  .from('sb_admin_users')
  .insert({ id: created.user.id, role: 'operator' });

if (insertError) {
  await admin.auth.admin.deleteUser(created.user.id).catch((cleanupErr) => {
    console.error('created admin auth cleanup failed:', cleanupErr);
  });
  throw insertError;
}
```

- **확신도**: 확실

---

- **[보통] `partial`/`carried_over` 숙제가 “미시작”으로 알림될 수 있음**
- **위치**: `supabase/functions/homework-not-started-reminder/reminderTargets.ts`, `startedAny`
- **왜 문제인가**: 현재 세션이 없고 상태가 `completed`인 경우만 시작한 것으로 봅니다. 그런데 `sb_planner_items.status`에는 `partial`, `carried_over`도 있습니다. 구버전/오프라인/클라이언트 경로에서 세션 없이 `partial`이 저장되면, 실제로 일부 수행했는데 매니저에게 “아직 시작하지 않았다”는 푸시가 갑니다.
- **어떻게 고치는가**: “미시작” 판정이라면 `planned`만 미시작으로 보고 나머지는 시작한 것으로 보는 쪽이 안전합니다.

```ts
const startedAny = items.some(
  (i) => started.has(i.id) || i.status !== 'planned',
);
```

테스트도 추가합니다.

```ts
it('부분 완료된 항목은 세션 기록이 없어도 대상이 아니다', () => {
  const targets = select({
    now: '23:00',
    homeworkItems: [item({ id: 'h1', status: 'partial' })],
  });
  expect(targets).toEqual([]);
});
```

- **확신도**: 추정 — `partial`, `carried_over`의 정확한 제품 의미를 클라이언트 코드에서 확인해야 합니다. 다만 이름상 “시작 안 함”과는 구분되는 상태입니다.

---

- **[보통] `minutesSinceDayStart`가 잘못된 시간 문자열을 조용히 통과시켜 알림 판정을 망칠 수 있음**
- **위치**: `supabase/functions/_shared/day.ts`, `minutesSinceDayStart`
- **왜 문제인가**: `time.slice(0, 5).split(':').map(Number)`는 `''`, `'abc'`, `'9:0'`, `'25:99'` 같은 값을 명시적으로 거부하지 않습니다. 결과가 `NaN`이면 비교식 `NaN < number`가 false가 되어, 알림 시각 전인데도 대상에 포함될 수 있습니다.
- **어떻게 고치는가**: 시간 문자열을 검증하고 범위를 벗어나면 예외를 던집니다.

```ts
export function minutesSinceDayStart(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) throw new Error(`Invalid time: ${time}`);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time: ${time}`);
  }

  return (hour * 60 + minute - DAY_ROLLOVER_HOUR * 60 + 24 * 60) % (24 * 60);
}
```

- **확신도**: 확실

---

- **[낮음] 관리자 가입 통계의 “오늘”이 한국 날짜가 아니라 UTC 날짜 기준임**
- **위치**: `supabase/functions/admin-users-overview/index.ts`, `todayKey`, `signupsToday`
- **왜 문제인가**: 서버에서 `now.toISOString().slice(0, 10)`을 쓰면 UTC 날짜입니다. 한국 시간 2026-09-10 01:00은 UTC로 2026-09-09라서, 관리자 화면의 “오늘 가입” 수가 한국 사용자가 기대하는 날짜와 하루 어긋납니다. 이 앱은 날짜를 한국 로컬 기준으로 해석한다는 주석이 다른 함수에 이미 있습니다.
- **어떻게 고치는가**: KST 날짜 키를 명시적으로 계산합니다.

```ts
function dateKeyInSeoul(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const todayKey = dateKeyInSeoul();
```

- **확신도**: 확실

---

- **[낮음] POST가 아닌 요청이 500으로 떨어질 수 있음**
- **위치**: 모든 Edge Function, `handleCorsPreflight` 이후
- **왜 문제인가**: CORS는 `POST, OPTIONS`만 허용한다고 선언하지만, 실제 handler는 메서드를 검사하지 않습니다. `GET` 요청이 들어오면 인증이나 `req.json()`에서 실패해 401/500 등 엉뚱한 응답이 나올 수 있습니다.
- **어떻게 고치는가**: 공통 함수나 각 handler 초반에서 메서드를 제한합니다.

```ts
if (req.method !== 'POST') {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: corsHeaders,
  });
}
```

- **확신도**: 확실

---

**문제를 못 찾은 영역**

`homework-not-started-reminder`의 새벽 4시 하루 경계 자체는 주석, 구현, 테스트가 서로 잘 맞습니다. `nowInSeoul()`도 서버 UTC 환경에서 서울 날짜를 안정적으로 계산하려는 의도가 코드에 반영돼 있습니다.

`sb_homework_reminder_log`의 `upsert(... ignoreDuplicates)`로 하루 1회 발송을 원자적으로 막는 구조도 붙여진 범위에서는 타당해 보입니다.
