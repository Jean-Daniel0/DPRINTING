import { useEffect } from 'react';
import { Footer, Header, Page } from './components/Layout';
import { matchPath, navigate, useLocation } from './lib/router';
import { Home } from './pages/Home';
import { Product } from './pages/Product';
import { Studio } from './pages/Studio';
import { Checkout } from './pages/Checkout';
import { Track } from './pages/Track';
import { Admin } from './pages/Admin';
import { NotFound } from './pages/NotFound';

function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}

function Router() {
  const location = useLocation();
  const path = location.path;

  if (path === '/') return <Home />;
  const product = matchPath('/produit/:id', path);
  if (product) return <Product id={product.id} />;
  const studio = matchPath('/studio/:id', path);
  if (studio) return <Studio id={studio.id} />;
  if (path === '/commande') return <Checkout />;
  const tracking = matchPath('/suivi/:id', path);
  if (tracking) return <Track id={tracking.id} access={location.search.get('access') ?? ''} />;
  if (path === '/suivi') return <Track />;
  if (path === '/admin') return <Admin />;
  if (path === '/studio') return <Redirect to="/studio/tshirt" />;
  if (path === '/produit') return <Redirect to="/produit/tshirt" />;
  if (path === '/boutique') return <Redirect to="/produit/tshirt" />;
  return <NotFound />;
}

export function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-paper">
        Aller au contenu
      </a>
      <Header />
      <Page className="flex-1">
        <div id="contenu"><Router /></div>
      </Page>
      <Footer />
    </div>
  );
}
