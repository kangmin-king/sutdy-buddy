import * as React from 'react';

import { cn } from '@/lib/utils';

// Radix의 Separator는 이 페이지에서 장식용으로만 쓰이므로(의미 있는 구분이 아님) 별도
// 패키지를 더 얹지 않고 role="none"인 div로 둔다.
function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      data-slot="separator"
      role="none"
      className={cn(
        'bg-border shrink-0',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
