import type { AppDefinition, AppProps } from '../types';

/** Window shown for a program that is registered but scheduled for a later milestone. */
export function notBuilt(title: string, milestone: 'M2' | 'M3') {
  return function NotBuilt({ host }: AppProps) {
    return (
      <div className="w95-placeholder" role="note">
        <p>
          <b>{title}</b> is not built yet. It arrives in milestone {milestone}.
        </p>
        <div className="w95-dialog-buttons">
          <button type="button" className="w95-button w95-default" onClick={() => host.close()} data-autofocus="">
            OK
          </button>
        </div>
      </div>
    );
  } satisfies AppDefinition['component'];
}
