import { useEffect, useState, type ReactNode } from 'react';
import { Menu, X, ArrowUpRight, PackageCheck } from 'lucide-react';
import { Link, useLocation } from '../lib/router';
import { readDraft } from '../lib/draft';
import { cn } from './ui';

const NAV = [
  { to: '/produit/tshirt', label: 'Le T-shirt' },
  { to: '/studio/tshirt', label: 'Studio' },
  { to: '/suivi', label: 'Suivi de commande' },
];

function Brand() {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5" aria-label="DPRINTING — accueil">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-950 font-display text-xs tracking-tight text-gold transition group-hover:bg-cobalt group-hover:text-white">DP</span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg uppercase tracking-[-0.02em]">DPRINTING</span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-400">Print on demand</span>
      </span>
    </Link>
  );
}

export function Header() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const draft = readDraft();

  useEffect(() => { setOpen(false); }, [location.path]);

  const active = (to: string) => (to === '/produit/tshirt' ? location.path.startsWith('/produit') || location.path.startsWith('/studio') : location.path.startsWith(to));

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-paper/85 backdrop-blur-xl">
      <div className="hidden border-b border-ink-200/70 bg-ink-950 text-paper sm:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em]">
          <span>Studio 3D maison · fichier de production 300 DPI</span>
          <span className="text-ink-300">Fabrication à la demande · expédition depuis la France</span>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Brand />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
          {NAV.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition',
                active(item.to) ? 'bg-ink-950 text-paper' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-950',
              )}
            >
              {item.label}
            </Link>
          ))}
          <Link to="/admin" className="ml-1 rounded-full px-3 py-2 text-xs font-semibold text-ink-400 hover:text-ink-950">Admin</Link>
        </nav>
        <div className="flex items-center gap-2">
          {draft ? (
            <Link to="/commande" className="hidden items-center gap-1.5 rounded-full border border-gold/60 bg-gold/15 px-3.5 py-2 text-xs font-bold text-ink-900 sm:inline-flex">
              <PackageCheck size={15} /> Commande en cours
              <ArrowUpRight size={13} />
            </Link>
          ) : (
            <Link to="/studio/tshirt" className="hidden rounded-full bg-ink-950 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-paper transition hover:bg-cobalt sm:inline-flex">
              Créer mon design
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="grid h-11 w-11 place-items-center rounded-full border border-ink-200 text-ink-800 md:hidden"
            aria-expanded={open}
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="border-t border-ink-200 bg-paper px-4 pb-5 pt-2 md:hidden" aria-label="Navigation mobile">
          {NAV.map(item => (
            <Link key={item.to} to={item.to} className="block rounded-xl px-3 py-3 text-base font-semibold text-ink-800 hover:bg-ink-100">
              {item.label}
            </Link>
          ))}
          <Link to="/admin" className="block rounded-xl px-3 py-3 text-sm text-ink-500 hover:bg-ink-100">Administration</Link>
          <Link to="/studio/tshirt" className="mt-2 flex min-h-12 items-center justify-center rounded-full bg-ink-950 px-4 text-sm font-bold uppercase tracking-wider text-paper">
            Créer mon design
          </Link>
        </nav>
      ) : null}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-800 bg-ink-950 text-ink-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <Brand />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-400">
            Personnalisation textile outillée de bout en bout : éditeur millimétrique, aperçu 3D projeté et fichiers de production générés par le même moteur.
          </p>
        </div>
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">Le produit</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/produit/tshirt" className="hover:text-white">T-shirt unisexe</Link></li>
            <li><Link to="/studio/tshirt" className="hover:text-white">Studio de design</Link></li>
            <li><Link to="/suivi" className="hover:text-white">Suivre une commande</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">Transparence</p>
          <ul className="space-y-2 text-sm text-ink-400">
            <li>DTF, DTG et sublimation commandables</li>
            <li>Sérigraphie, vinyle, broderie : en développement</li>
            <li>Paiement en ligne non activé</li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">Production</p>
          <p className="text-sm leading-relaxed text-ink-400">
            Chaque commande est enregistrée avec ses quatre aperçus et ses PNG transparents aux dimensions réelles, contrôlés côté serveur avant fabrication.
          </p>
          <Link to="/admin" className="mt-4 inline-block text-xs font-semibold text-ink-500 hover:text-gold">Espace administration →</Link>
        </div>
      </div>
      <div className="border-t border-ink-800/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-5 text-[11px] text-ink-500 sm:px-6">
          <span>© {new Date().getFullYear()} DPRINTING — démonstration de production réelle, sans paiement encaissé.</span>
          <span>Fait avec React, Three.js et PostgreSQL.</span>
        </div>
      </div>
    </footer>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('min-h-[60vh]', className)}>{children}</main>;
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6', className)}>{children}</div>;
}
