/**
 * 달력 한 칸의 스크린리더용 이름.
 *
 * 칸 안의 시각 표시(과외 막대·오늘 테두리·시험 네모·숙제 점·이행률 링)는 전부 장식이라
 * `aria-hidden`이 붙어 있다. 그래서 버튼에 이름을 주지 않으면 스크린리더에는 숫자 하나만
 * 읽히고, 눈으로 보는 사람만 그날의 상태를 알 수 있다. 여기서 같은 정보를 말로 옮긴다.
 *
 * 선생님 캘린더는 "숙제/이행률", 학생 캘린더는 "계획/완료율"로 같은 것을 다르게 부른다 —
 * 화면에 쓰인 말과 읽히는 말이 달라지면 안 되므로 단어를 밖에서 받는다.
 */
export function calendarDayLabel(
  dateKey: string,
  o: {
    isToday: boolean;
    isTutoringDay: boolean;
    isRedDay: boolean;
    hasExam: boolean;
    hasPlan: boolean;
    percent: number | null;
    planWord: string;
    progressWord: string;
  }
): string {
  const [, month, day] = dateKey.split('-');
  return [
    `${Number(month)}월 ${Number(day)}일`,
    o.isToday && '오늘',
    o.isRedDay && '휴일',
    o.isTutoringDay && '과외 날',
    o.hasExam && '시험',
    o.hasPlan && `${o.planWord} 있음`,
    o.percent != null && `${o.progressWord} ${o.percent}%`,
  ]
    .filter(Boolean)
    .join(', ');
}
