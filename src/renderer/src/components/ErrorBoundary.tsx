import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import Button from '@mui/material/Button';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { capture } from '../reports/capture';
import { EmptyState } from './EmptyState';

/**
 * Keeps one broken page from taking the whole window down: shows what went wrong, with a way
 * back. `resetKey` changing (a new page) clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown; page?: string }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('page crashed', error, info.componentStack);
    capture(error, 'page', { page: this.props.page ?? 'unknown' });
  }

  override componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        icon={ReportProblemOutlined}
        title="This page ran into a problem"
        body="The rest of Tessera is fine. Try again, or go somewhere else from the rail."
        details={this.state.error.message}
        actions={
          <Button variant="contained" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        }
      />
    );
  }
}
