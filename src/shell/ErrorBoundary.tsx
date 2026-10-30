import { Component, type ReactNode } from 'react';

interface Props {
  appTitle: string;
  onCrash: (message: string) => void;
  onClose: () => void;
  children: ReactNode;
}

/** Contains an application's failure to its own window; the desktop keeps running. */
export class AppErrorBoundary extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    this.props.onCrash(error.message.slice(0, 500));
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="w95-crash" role="alert">
        <p>
          <b>{this.props.appTitle}</b> ran into a problem and has to close. Other programs are not affected.
        </p>
        <div className="w95-dialog-buttons">
          <button type="button" className="w95-button w95-default" onClick={this.props.onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    );
  }
}
