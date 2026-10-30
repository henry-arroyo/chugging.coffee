import { useState } from 'react';
import type { Preferences } from '../../core/contracts/types';
import type { AppHost } from '../types';

/**
 * Edits a copy of the preferences. Apply writes it; Cancel simply closes, so only applied changes
 * take effect.
 */
export function usePreferenceDraft(host: AppHost) {
  const settings = host.settings!;
  const [draft, setDraft] = useState<Preferences>(() => settings.preferences());
  const [applied, setApplied] = useState<Preferences>(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const apply = () => {
    settings.setPreferences({ ...settings.preferences(), ...draft });
    setApplied(draft);
  };
  return { draft, setDraft, dirty, apply };
}
