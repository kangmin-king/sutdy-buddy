# 클로드 작업 지시서 — 스터디 벅스 마스코트 최종 적용

## 목표

기존 당근 토끼 마스코트를 `mascot-buddy-v2-final.png` 기반의 새 마스코트로 교체한다.

마스코트의 최종 방향은:

> 체크카드를 든 귀여운 전신 토끼가 아니라, 스터디 벅스 안에 조용히 사는 작은 기록 도우미 토끼.

앱의 신뢰감이 캐릭터 귀여움보다 우선이다.

## 입력 파일

패키지 폴더:

```text
study-bugs-mascot-final-package
```

사용할 파일:

```text
mascot-buddy-v2-final.png
```

비교용이며 적용하면 안 되는 파일:

```text
reference-v1-not-final.png
```

## 작업 순서

1. `mascot-buddy-v2-final.png`를 앱의 `src/assets` 아래에 복사한다.
2. 기존 마스코트 파일을 바로 덮어쓰지 말고 새 파일명으로 추가한다.
3. 권장 파일명:

```text
src/assets/mascot-buddy-v2.png
src/assets/mascot-face-v2.png
```

4. `mascot-face-v2.png`는 `mascot-buddy-v2.png`에서 얼굴 중심으로 crop해서 만든다.
5. 기존 사용처를 새 자산으로 교체한다.
6. 모바일 480px 기준으로 히어로, CTA, 상단바, 빈 상태에서 크기와 잘림을 확인한다.

## 사용처별 적용

### 1. 상단바 36px

전신/상반신 원본을 그대로 쓰지 않는다. 얼굴 crop인 `mascot-face-v2.png`를 사용한다.

```tsx
<img
  src={mascotFaceV2}
  alt=""
  className="h-9 w-9 rounded-full object-cover ring-1 ring-outline/40"
/>
```

기존 `bg-primary`가 이미지에 가려 실제로 보이지 않는다면 제거한다. 필요하면 위처럼 `ring-outline/40`만 남긴다.

### 2. 랜딩 헤더/푸터 32px

얼굴 crop을 사용한다.

```tsx
<img
  src={mascotFaceV2}
  alt=""
  className="h-8 w-8 rounded-full object-cover"
/>
```

### 3. 랜딩 CTA 56px

얼굴 crop 또는 상반신 이미지를 사용한다. 56px에서는 얼굴 crop이 더 안정적이다.

```tsx
<img
  src={mascotFaceV2}
  alt=""
  className="h-14 w-14 rounded-full object-cover"
/>
```

### 4. 온보딩/빈 상태

상반신 원본을 작게 사용한다.

```tsx
<img
  src={mascotBuddyV2}
  alt=""
  className="mx-auto h-24 w-auto object-contain"
/>
```

이미지가 빈 상태의 주인공이 되면 안 된다. 주인공은 상태 문구와 다음 행동이다.

### 5. 랜딩 히어로

마스코트를 너무 크게 쓰지 않는다. 기존 v1 기준보다 더 작게 둔다.

```tsx
<img
  src={mascotBuddyV2}
  alt=""
  className="mx-auto h-auto max-h-56 w-full max-w-52 object-contain"
/>
```

히어로의 주인공은 앱의 가치와 실제 화면이어야 한다. 마스코트는 보조 브랜드 신호다.

## 금지

- 기존 파일을 무작정 덮어쓰기
- 전신 이미지를 상단바 36px에 그대로 넣기
- 마스코트 주변에 흰 배경 상자 추가
- 그림자, 글로우, 그라데이션 추가
- 새 hex를 앱 코드에 추가
- 마스코트를 화면 주인공으로 키우기
- 당근/주황/따뜻한 분홍/밝은 초록 계열 복원

## 검수 기준

적용 후 아래 질문에 답한다.

1. 36px에서 토끼 얼굴로 보이는가?
2. 32px에서 실루엣이 읽히는가?
3. 다크 모드에서 흰 사각형 없이 자연스럽게 얹히는가?
4. 기존 당근 토끼보다 앱의 블루/인디고 톤에 맞는가?
5. 과외쌤/학부모가 봐도 너무 유아적이지 않은가?
6. 마스코트보다 기록/할 일/CTA가 먼저 보이는가?

하나라도 아니면 크기, crop, 사용처를 조정한다.

## 최종 판단

`mascot-buddy-v2-final.png`는 v1보다 앱에 더 맞는 최종 후보다. 이 이미지를 기준으로 적용하되, 상단바와 32~56px 작은 사용처에는 반드시 얼굴 crop 파생 자산을 만든다.
