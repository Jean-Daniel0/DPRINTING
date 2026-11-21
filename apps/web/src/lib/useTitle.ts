import { useEffect } from 'react';

export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — DPRINTING` : 'DPRINTING — Studio de personnalisation 3D';
  }, [title]);
}
