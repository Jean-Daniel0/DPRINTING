import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './components/ui';

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[dprinting] erreur interface', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="font-display text-3xl uppercase tracking-tight">Une erreur est survenue</p>
        <p className="text-sm leading-relaxed text-ink-500">
          L’interface a rencontré un problème inattendu. Vos fichiers déjà enregistrés ne sont pas perdus.
        </p>
        <pre className="max-h-32 w-full overflow-auto rounded-xl bg-ink-950 p-3 text-left text-[11px] text-ink-300">{this.state.error.message}</pre>
        <Button onClick={() => window.location.assign('/')}>Revenir à l’accueil</Button>
      </div>
    );
  }
}
