'use client';

import { useEffect, use } from 'react';

export default function PrintQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  useEffect(() => {
    window.location.replace(`/api/v1/quotes/${id}/print`);
  }, [id]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-900 text-neutral-300">
      <div className="text-sm font-medium animate-pulse">Abriendo documento de impresión PDF...</div>
    </div>
  );
}
