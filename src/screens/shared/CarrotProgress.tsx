import carrotUrl from '../../assets/carrot.png';

// 과거 날짜의 완료율을 마스코트 손에 든 당근 모양으로 보여준다 — 12시 방향부터 시계 방향으로
// 당근이 채워진다. 당근 이미지를 CSS mask로 쓰고 그 안을 conic-gradient로 채우는 방식이라
// 완료율에 따라 실제로 당근이 "차오르는" 것처럼 보인다.
export function CarrotProgress({ percent, size = 16 }: { percent: number; size?: number }) {
  const mask = `url(${carrotUrl})`;
  return (
    <span
      className="inline-block shrink-0"
      style={{
        width: size,
        height: size,
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        background: `conic-gradient(#f4954a 0% ${percent}%, #d8dadc ${percent}% 100%)`,
      }}
    />
  );
}
