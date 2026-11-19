import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  notify();
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

export type RouteLocation = { path: string; search: URLSearchParams; hash: string };

function current(): RouteLocation {
  return {
    path: window.location.pathname.replace(/\/+$/, '') || '/',
    search: new URLSearchParams(window.location.search),
    hash: window.location.hash,
  };
}

export function useLocation(): RouteLocation {
  const [loc, setLoc] = useState(current);
  useEffect(() => {
    const update = () => setLoc(current());
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => { listeners.delete(update); window.removeEventListener('popstate', update); };
  }, []);
  return loc;
}

/** Motif simple : /produit/:id — retourne les paramètres ou null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (/^(https?:|mailto:|tel:)/.test(to)) return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest}>{children}</a>;
}

export const query = (search: URLSearchParams, key: string, fallback = ''): string => search.get(key) ?? fallback;
