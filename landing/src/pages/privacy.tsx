import { useEffect } from 'react';
import { AlertTriangleIcon, ArrowLeftIcon, MessageCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SiteFooter } from '@/sections/site-footer';
import { SiteHeader } from '@/sections/site-header';
import { track } from '@/analytics';
import { APP_URL, CONTACT_OPENCHAT_URL, POLICY, POLICY_INCOMPLETE } from '@/lib/site';

// 아직 안 채운 값은 눈에 띄게 보여준다. 조용히 빈칸으로 두면 그대로 제출될 수 있다.
function Fill({ value, hint }: { value: string; hint: string }) {
  if (value.trim()) return <>{value}</>;
  return (
    <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-semibold text-destructive">[{hint} 입력 필요]</span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 text-xl font-bold tracking-tight md:text-2xl">{title}</h2>
      <div className="flex flex-col gap-4 break-keep leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            {head.map((h) => (
              <th key={h} className="py-2.5 pr-4 font-semibold text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-b-0 align-top">
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 pr-4 leading-relaxed">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrivacyPage() {
  // 본문이 자바스크립트로 그려지므로, 브라우저가 주소의 #앵커를 찾을 때는 아직 그 요소가
  // 없다. 그래서 /privacy#delete-account로 들어오면 맨 위에 떨어진다. 플레이 콘솔에
  // 계정 삭제 URL로 제출하는 주소가 바로 그것이라, 렌더 후에 한 번 직접 맞춰준다.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          스터디 벅스 홈으로
        </a>

        <h1 className="text-balance break-keep text-3xl font-extrabold tracking-tight md:text-4xl">
          개인정보처리방침
        </h1>
        <p className="mt-4 break-keep leading-relaxed text-muted-foreground">
          스터디 벅스가 어떤 정보를 받고, 어디에 쓰고, 누구에게 보이는지 적었습니다. 읽는 데 오래 걸리지 않게, 실제로
          수집하는 것만 적었습니다.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          시행일 <Fill value={POLICY.effectiveDate} hint="시행일" />
        </p>

        {POLICY_INCOMPLETE && (
          <Card className="mt-8 border-destructive/40 bg-destructive/5 p-5">
            <div className="flex gap-3">
              <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="text-sm leading-relaxed">
                <p className="font-bold text-destructive">아직 작성 중인 문서입니다</p>
                <p className="mt-1.5 text-muted-foreground">
                  붉게 표시된 항목이 비어 있습니다. <code className="text-xs">src/lib/site.ts</code>의{' '}
                  <code className="text-xs">POLICY</code> 값을 채우면 이 안내는 사라집니다. 채우기 전에는 스토어에
                  제출하지 마세요.
                </p>
              </div>
            </div>
          </Card>
        )}

        <Separator className="my-10" />

        <div className="flex flex-col gap-12">
          <Section id="intro" title="1. 총칙">
            <p>
              <Fill value={POLICY.operator} hint="운영 주체" />
              (이하 &ldquo;운영자&rdquo;)는 학습 관리 서비스 <b className="text-foreground">스터디 벅스</b>(웹{' '}
              <a href={APP_URL} className="underline underline-offset-4">
                app.studybuks.store
              </a>
              , 안드로이드 앱)를 제공하면서 이용자의 개인정보를 아래와 같이 처리합니다.
            </p>
            <p>
              스터디 벅스는 학생과 관리자(과외 선생님 · 학부모)가 <b className="text-foreground">같은 숙제를 서로 다른
              화면으로 보는</b> 구조입니다. 그래서 학생이 남긴 학습 기록의 일부가 연결된 관리자에게 보입니다. 이
              방침은 그 범위를 분명히 하는 데 목적이 있습니다.
            </p>
          </Section>

          <Section id="collect" title="2. 수집하는 항목과 목적">
            <h3 className="font-semibold text-foreground">2.1 계정</h3>
            <Table
              head={['항목', '목적']}
              rows={[
                ['이메일 주소', '로그인 식별, 비밀번호 재설정'],
                ['비밀번호', '인증. 해시로만 보관되며 운영자도 원문을 볼 수 없습니다'],
                ['역할 구분 (학생 / 과외쌤·학부모)', '역할에 맞는 화면 제공'],
              ]}
            />

            <h3 className="mt-4 font-semibold text-foreground">2.2 프로필 (학생)</h3>
            <Table
              head={['항목', '목적']}
              rows={[
                ['학년 (중1 ~ 고3)', '학년에 맞는 기본값 제공'],
                ['주요 과목, 학습 목표, 시험 예정일, 사용 교재', '숙제·계획 구성'],
              ]}
            />

            <h3 className="mt-4 font-semibold text-foreground">2.3 학습 데이터</h3>
            <Table
              head={['항목', '목적']}
              rows={[
                ['숙제 배정 · 제안 · 수락/거절 · 완료 여부', '서비스 핵심 기능'],
                ['스스로 세운 계획(플래너) 항목', '서비스 핵심 기능'],
                ['학습 세션 기록 (시작·종료 시각, 공부한 시간)', '실제 학습 시간 기록 및 관리자 확인'],
                ['학습 기록 · 학습 자료 · 캘린더 일정', '진도 관리'],
                ['모의고사 기록, 과목, 시험 범위', '시험 준비 기능'],
                ['학교 시간표, 과외 일정 및 예외', '일정 표시'],
                ['학생 ↔ 관리자 연결 관계', '누가 누구의 기록을 볼 수 있는지 결정'],
              ]}
            />

            <h3 className="mt-4 font-semibold text-foreground">2.4 알림</h3>
            <Table
              head={['항목', '목적']}
              rows={[
                ['FCM 기기 토큰', '푸시 알림 발송'],
                ['숙제 알림 설정값, 발송 로그', '알림 시각 설정 및 중복 발송 방지'],
              ]}
            />

            <h3 className="mt-4 font-semibold text-foreground">2.5 &ldquo;딴짓 멈춰&rdquo; (안드로이드 앱 전용)</h3>
            <p>
              이 기능은 안드로이드 접근성 서비스와 &ldquo;다른 앱 위에 표시&rdquo; 권한을 사용합니다. 이용자가 직접
              켜야 동작하고, 언제든 끌 수 있습니다.
            </p>
            <Table
              head={['처리 내용', '어디까지 나가는지']}
              rows={[
                [
                  '지금 화면에 떠 있는 앱',
                  <b key="a" className="text-foreground">
                    기기 안에서만 판단에 쓰이고 서버로 전송되지 않습니다
                  </b>,
                ],
                [
                  '기기에 설치된 앱 목록',
                  '허용할 앱을 고르는 화면에만 쓰이며 서버로 전송되지 않습니다. 전체 앱 목록 조회 권한(QUERY_ALL_PACKAGES)은 사용하지 않습니다',
                ],
                [
                  '공부 중 허용앱을 쓴 시간 구간',
                  <>
                    시작·종료 시각만 서버에 저장되고 연결된 관리자가 볼 수 있습니다.{' '}
                    <b className="text-foreground">어떤 앱을 썼는지는 저장하지 않습니다.</b>
                  </>,
                ],
              ]}
            />

            <h3 className="mt-4 font-semibold text-foreground">2.6 서비스 이용 분석</h3>
            <p>운영자는 Amplitude를 사용해 서비스 개선을 위한 이용 행태를 분석합니다.</p>
            <Table
              head={['항목', '내용']}
              rows={[
                ['이벤트 로그', '화면 조회, 세션 시작·종료, 유입 경로, 주요 기능 사용'],
                ['이용자 식별자', '로그인 후 계정의 내부 식별자(UUID). 이름·이메일은 전송하지 않습니다'],
                ['이용자 속성', '학년, 역할, 연결된 사람 수, 누적 학습 세션 수 등'],
                [
                  '세션 리플레이',
                  <b key="s" className="text-foreground">
                    화면을 어떤 순서로 조작했는지 재생할 수 있는 형태의 기록
                  </b>,
                ],
              ]}
            />

            <h3 className="mt-4 font-semibold text-foreground">2.7 자동으로 생성되는 정보</h3>
            <p>
              접속 시각, IP 주소, 브라우저·기기 정보는 서비스 제공에 쓰이는 인프라에서 접속 기록 형태로 생성·보관됩니다.
            </p>
          </Section>

          <Section id="not-collected" title="3. 수집하지 않는 것">
            <p>오해를 막기 위해 명시합니다. 스터디 벅스는 다음을 수집하지 않습니다.</p>
            <ul className="ml-1 flex list-inside list-disc flex-col gap-1.5">
              <li>이름, 생년월일, 전화번호, 주소, 학교명</li>
              <li>사진, 연락처, 위치 정보, 마이크·카메라 접근</li>
              <li>결제 정보 (결제 기능 자체가 없습니다)</li>
              <li>어떤 앱을 사용했는지에 대한 기록 (사용 시간만 저장합니다)</li>
            </ul>
          </Section>

          <Section id="third-party" title="4. 제3자 제공과 연결된 관리자">
            <p>운영자는 이용자의 개인정보를 제3자에게 판매하거나 제공하지 않습니다.</p>
            <p>
              다만 서비스 구조상{' '}
              <b className="text-foreground">연결된 관리자(과외 선생님 · 학부모)는 학생의 학습 데이터를 볼 수
              있습니다.</b>{' '}
              이는 제3자 제공이 아니라 서비스의 기능이며, 학생이 연결을 수락한 범위에 한정됩니다. 볼 수 있는 것은
              숙제와 완료 여부, 학습 세션 기록, 플래너 항목과 캘린더 완료율, 공부 중 허용앱 사용 시간 구간(어떤
              앱인지는 제외), 학교 시간표, 모의고사 기록입니다.
            </p>
            <p>
              연결은 학생이 수락해야 성립하며, 데이터베이스 수준의 접근 제어로 연결되지 않은 사람은 조회할 수 없습니다.
            </p>
          </Section>

          <Section id="processors" title="5. 위탁 및 국외 이전">
            <p>서비스 운영을 위해 다음 사업자의 인프라를 이용하며, 이들의 서버는 국외에 있습니다.</p>
            <Table
              head={['수탁자', '위탁 업무', '이전 항목']}
              rows={[
                ['Supabase Inc.', '인증, 데이터베이스, 서버리스 함수', '2장의 계정·프로필·학습·알림 데이터'],
                ['Vercel Inc.', '웹 호스팅', '접속 기록'],
                ['Google LLC (Firebase)', '푸시 알림 발송', '기기 토큰, 알림 내용'],
                ['Amplitude, Inc.', '이용 행태 분석, 세션 리플레이', '2.6의 분석 데이터'],
              ]}
            />
          </Section>

          <Section id="retention" title="6. 보유 기간과 파기">
            <ul className="ml-1 flex list-inside list-disc flex-col gap-1.5">
              <li>계정 정보와 학습 데이터는 회원 탈퇴 시까지 보유합니다.</li>
              <li>
                탈퇴하면 계정에 연결된 숙제·학습 세션·플래너·시험 기록·기기 토큰이 함께 삭제됩니다.
              </li>
              <li>법령이 보존을 요구하는 기록이 있으면 해당 기간 동안 분리 보관 후 파기합니다.</li>
              <li>
                분석 도구에 축적된 데이터는 계정 삭제로 자동 삭제되지 않으므로, 요청하시면 별도로 삭제 처리합니다.
              </li>
            </ul>
          </Section>

          {/* 구글 플레이는 계정 생성이 가능한 앱에 "앱 밖에서도 삭제를 요청할 수 있는 URL"을 요구한다.
              스토어 등록 정보에는 이 절의 주소(https://studybuks.store/privacy#delete-account)를 낸다. */}
          <Section id="delete-account" title="7. 계정 및 데이터 삭제">
            <p>
              계정과 그에 딸린 학습 기록은 언제든 직접 지울 수 있고, 지우면 되돌릴 수 없습니다.
            </p>
            <Card className="bg-muted/40 p-5">
              <p className="text-sm font-bold text-foreground">앱 또는 웹에서 직접 삭제하기</p>
              <ol className="mt-3 flex list-inside list-decimal flex-col gap-1.5 text-sm">
                <li>학생은 하단 &ldquo;나&rdquo; 탭, 과외쌤·학부모는 상단 설정(톱니) 버튼을 엽니다.</li>
                <li>&ldquo;회원 탈퇴&rdquo;를 누릅니다.</li>
                <li>안내를 읽고 &ldquo;탈퇴&rdquo;를 입력한 뒤 탈퇴하기를 누릅니다.</li>
              </ol>
            </Card>
            <p>
              <b className="text-foreground">앱을 이미 삭제했거나 로그인할 수 없다면</b> 아래 창구로 요청해 주세요.
              가입에 사용한 이메일 주소를 알려주시면 확인 후 지워드립니다.
            </p>
            {CONTACT_OPENCHAT_URL ? (
              <div>
                <Button asChild variant="outline">
                  <a
                    href={CONTACT_OPENCHAT_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => track('Clicked Contact Openchat', { placement: 'privacy_delete' })}
                  >
                    <MessageCircleIcon />
                    카카오톡 1:1 문의로 삭제 요청
                  </a>
                </Button>
              </div>
            ) : (
              <p className="font-semibold text-destructive">[삭제 요청 창구 입력 필요]</p>
            )}
            <p className="text-sm">
              삭제되는 것: 계정과 로그인 정보, 숙제와 계획, 공부 시간 기록, 캘린더, 학교 시간표, 모의고사 기록, 기기
              토큰, 상대와의 연결. 법령상 보존 의무가 있는 기록은 그 기간 동안 분리 보관 후 파기합니다.
            </p>
          </Section>

          <Section id="rights" title="8. 이용자의 권리">
            <p>
              이용자(만 14세 미만인 경우 법정대리인)는 언제든 개인정보의 열람, 정정, 삭제, 처리 정지를 요구할 수
              있습니다. 프로필 수정, 관리자 연결 해제, 알림 설정 변경, &ldquo;딴짓 멈춰&rdquo; 권한 해제는 앱에서 바로
              하실 수 있고, 그 밖의 요구는 아래 연락처로 하시면 지체 없이 조치합니다.
            </p>
          </Section>

          <Section id="security" title="9. 안전성 확보 조치">
            <ul className="ml-1 flex list-inside list-disc flex-col gap-1.5">
              <li>모든 통신은 HTTPS로 암호화됩니다.</li>
              <li>비밀번호는 해시로만 보관되며 운영자도 원문을 알 수 없습니다.</li>
              <li>
                데이터베이스 테이블마다 행 수준 접근 제어를 적용해, 본인과 연결된 관리자만 해당 기록을 조회할 수
                있습니다.
              </li>
              <li>관리자 권한이 필요한 작업은 별도 운영자 계정으로 제한합니다.</li>
            </ul>
          </Section>

          <Section id="officer" title="10. 개인정보 보호책임자">
            <Table
              head={['구분', '내용']}
              rows={[
                ['개인정보 보호책임자', <Fill key="o" value={POLICY.officer} hint="책임자 이름" />],
                [
                  '연락처',
                  // 연락처가 오픈채팅이므로 글자만 두면 연락할 방법이 없다 — 눌러서 바로
                  // 들어갈 수 있게 링크로 만든다.
                  CONTACT_OPENCHAT_URL ? (
                    <a
                      key="c"
                      href={CONTACT_OPENCHAT_URL}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => track('Clicked Contact Openchat', { placement: 'privacy_officer' })}
                      className="font-semibold text-foreground underline underline-offset-4"
                    >
                      {POLICY.officerContact}
                    </a>
                  ) : (
                    <Fill key="c" value={POLICY.officerContact} hint="연락처" />
                  ),
                ],
              ]}
            />
            <p className="text-sm">
              개인정보 침해로 인한 상담·신고는 개인정보침해 신고센터(privacy.kisa.or.kr / 118), 개인정보
              분쟁조정위원회(kopico.go.kr / 1833-6972), 대검찰청 사이버수사과(1301), 경찰청 사이버범죄 신고시스템(182)에도
              하실 수 있습니다.
            </p>
          </Section>

          <Section id="changes" title="11. 방침의 변경">
            <p>
              이 방침의 내용이 추가·삭제·수정될 경우 시행 최소 7일 전에 서비스 내 공지 또는 이 페이지를 통해 알립니다.
            </p>
          </Section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
