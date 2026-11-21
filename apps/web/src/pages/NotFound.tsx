import { Link } from '../lib/router';
import { Button } from '../components/ui';
import { Container } from '../components/Layout';
import { useTitle } from '../lib/useTitle';

export function NotFound() {
  useTitle('Page introuvable');
  return (
    <Container className="flex min-h-[65vh] flex-col items-center justify-center gap-5 py-20 text-center">
      <p className="font-display text-[22vw] leading-none text-ink-100 sm:text-[160px]">404</p>
      <h1 className="font-display text-2xl uppercase tracking-tight">Cette page n’existe pas</h1>
      <p className="max-w-md text-sm text-ink-500">Le lien est peut-être obsolète, ou le produit a été retiré du catalogue.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/"><Button>Retour à l’accueil</Button></Link>
        <Link to="/studio/tshirt"><Button variant="secondary">Ouvrir le studio</Button></Link>
      </div>
    </Container>
  );
}
