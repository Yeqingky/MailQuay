import { useEffect } from 'react';
import { setPageTitle } from '@/lib/documentTitle';

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    setPageTitle(title);
  }, [title]);
}
