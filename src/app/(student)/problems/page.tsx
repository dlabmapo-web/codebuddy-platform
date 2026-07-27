import { Suspense } from 'react';
import ProblemsPageInner from './ProblemsPageInner';

export default function ProblemsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20" style={{ color: 'var(--color-sub)', fontSize: '14px' }}>
          불러오는 중...
        </div>
      }
    >
      <ProblemsPageInner />
    </Suspense>
  );
}
