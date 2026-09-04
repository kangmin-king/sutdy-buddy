import React from 'react';
import { BottomSheet, Button, Icon } from '../../primitives';
import { DistractionStop } from '../../native/distractionStop';

/**
 * 접근성 · 오버레이 권한을 요청하기 **직전에** 뜨는 설명 화면.
 *
 * 구글 플레이는 이런 민감 권한에 "명시적 공개(prominent disclosure)"를 요구한다. 요건은
 * 넷이다 — (1) 개인정보처리방침이 아니라 앱 안에서, (2) 권한 요청 **전에**, (3) 어떤 정보에
 * 접근해 무엇에 쓰는지 밝히고, (4) 사용자가 명시적으로 동의를 눌러야 진행된다.
 * 그래서 "이해했어요" 버튼을 누르지 않으면 설정 화면으로 넘어가지 않는다.
 *
 * 예전에는 "권한 설정이 필요해요" 한 줄과 설정으로 보내는 버튼만 있었다. 그 형태가 정확히
 * 플레이가 반려하는 패턴이다.
 *
 * 접근성 서비스는 원래 화면 내용까지 읽을 수 있는 권한이라, **읽지 않는다는 사실**을 같이
 * 적는 게 중요하다. 사용자가 가장 걱정하는 지점이고, 실제로 이 앱은 창이 바뀔 때
 * 패키지명만 본다(ForegroundAppAccessibilityService).
 */

type Kind = 'accessibility' | 'overlay';

const COPY: Record<
  Kind,
  { icon: string; title: string; lead: string; accesses: string[]; nots: string[]; settingsLabel: string }
> = {
  accessibility: {
    icon: 'accessibility_new',
    title: '접근성 권한이 필요한 이유',
    lead: '공부 중에 허용하지 않은 앱이 열리면 막기 위해, 지금 화면에 어떤 앱이 떠 있는지 확인합니다.',
    accesses: [
      '화면에 올라온 앱의 이름(패키지명)만 확인해요',
      '확인한 값은 기기 안에서만 쓰이고 서버로 보내지 않아요',
      '선생님에게 전달되는 건 "허용앱을 얼마나 썼는지"뿐이고, 어떤 앱이었는지는 저장하지 않아요',
    ],
    nots: [
      '화면에 뜬 글자나 내용은 읽지 않아요',
      '비밀번호나 입력한 내용을 보지 않아요',
      '공부 중이 아닐 때는 아무것도 확인하지 않아요',
    ],
    settingsLabel: '이해했어요, 접근성 설정 열기',
  },
  overlay: {
    icon: 'layers',
    title: '다른 앱 위에 표시 권한이 필요한 이유',
    lead: '허용하지 않은 앱이 열렸을 때, 그 앱 위에 차단 화면을 띄우기 위해 필요합니다.',
    accesses: ['공부 중 차단이 필요한 순간에만 화면을 덮어요'],
    nots: ['다른 앱의 내용을 읽거나 가져오지 않아요', '광고를 띄우지 않아요'],
    settingsLabel: '이해했어요, 설정 열기',
  },
};

function Line({ icon, text, tone }: { icon: string; text: string; tone: 'info' | 'no' }) {
  return (
    <li className="flex gap-2.5">
      <Icon
        name={icon}
        className={`!text-[18px] mt-0.5 shrink-0 ${tone === 'no' ? 'text-secondary' : 'text-primary'}`}
      />
      <span className="text-[13px] leading-relaxed text-on-surface-variant">{text}</span>
    </li>
  );
}

export function usePermissionDisclosure() {
  const [kind, setKind] = React.useState<Kind | null>(null);

  const close = () => setKind(null);

  const proceed = () => {
    // 설정 화면을 여는 것까지가 이 컴포넌트의 일이다. 실제 허용 여부는 사용자가 설정에서
    // 정하고, 돌아오면 화면이 다시 권한 상태를 조회한다.
    if (kind === 'accessibility') void DistractionStop.openAccessibilitySettings();
    if (kind === 'overlay') void DistractionStop.openOverlaySettings();
    setKind(null);
  };

  const copy = kind ? COPY[kind] : null;

  const disclosureDialog = (
    <BottomSheet open={kind !== null} onClose={close} title={copy?.title}>
      {copy && (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl bg-surface-container-low p-3.5">
            <Icon name={copy.icon} className="!text-[22px] shrink-0 text-primary" />
            <p className="text-[13px] leading-relaxed text-on-surface">{copy.lead}</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-on-surface">이 권한으로 하는 일</p>
            <ul className="space-y-2">
              {copy.accesses.map((t) => (
                <Line key={t} icon="check_circle" text={t} tone="info" />
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-on-surface">하지 않는 일</p>
            <ul className="space-y-2">
              {copy.nots.map((t) => (
                <Line key={t} icon="block" text={t} tone="no" />
              ))}
            </ul>
          </div>

          <p className="text-[11px] leading-relaxed text-on-surface-variant">
            이 권한은 언제든 설정에서 다시 끌 수 있어요. 끄면 "딴짓 멈춰"만 동작하지 않고 나머지 기능은 그대로예요.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={close}>
              나중에
            </Button>
            <Button className="flex-1" onClick={proceed}>
              {copy.settingsLabel}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );

  return {
    requestAccessibility: () => setKind('accessibility'),
    requestOverlay: () => setKind('overlay'),
    disclosureDialog,
  };
}
