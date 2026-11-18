import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

interface State { error: Error | null }

/** Contains a crash to the current page so the rest of the app keeps working. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('YUKTIDOOT page error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertOctagon className="mx-auto size-10 text-bad" />
        <h2 className="mt-3 text-lg font-semibold">This page hit an unexpected error</h2>
        <p className="mt-1 text-sm text-ink-500">Your data is safe. Try again, or reset the demo data if the problem continues.</p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-beige-100 p-3 text-left font-mono text-xs text-ink-500">{this.state.error.message}</pre>
        <Button className="mt-4" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
