import { useRef, useState } from 'react';
import type { Preferences } from '../../core/contracts/types';
import { assetUrl, WALLPAPERS } from '../../shell/icons';
import { PropertySheet } from '../../shell/PropertySheet';
import { desktopStyle, PATTERNS, SCHEMES } from '../../shell/theme';
import { useHostState, type AppProps } from '../types';
import { usePreferenceDraft } from './usePreferenceDraft';

const wallpaperName = (id: string) => id.replace('wallpaper.', '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function ListPicker<T extends string | null>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      <span>{label}</span>
      <select className="w95-sunken-panel" size={6} style={{ font: 'inherit', border: 0, padding: 2 }} value={value ?? ''} onChange={(e) => onChange((e.target.value === '' ? null : e.target.value) as T)}>
        {options.map((o) => (
          <option key={o.id ?? 'none'} value={o.id ?? ''}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Preview({ prefs }: { prefs: Preferences }) {
  const theme = desktopStyle(prefs);
  return (
    <div className={`w95 ${theme.className}`} aria-hidden="true" style={{ width: 150, height: 96, margin: '0 auto 6px', boxShadow: 'var(--w95-sunken)', ...theme.style }}>
      <div className="w95-window" data-active="true" style={{ left: 22, top: 18, width: 104, height: 52 }}>
        <div className="w95-titlebar">
          <span className="w95-title">Active Window</span>
        </div>
        <div className="w95-window-body" style={{ background: 'var(--w95-window)' }} />
      </div>
    </div>
  );
}

export function DisplayProperties({ host }: AppProps) {
  const { draft, setDraft, dirty, apply } = usePreferenceDraft(host);
  const set = (desktop: Partial<Preferences['desktop']>) => setDraft({ ...draft, desktop: { ...draft.desktop, ...desktop } });
  return (
    <PropertySheet
      dirty={dirty}
      onApply={apply}
      onClose={() => host.close()}
      tabs={[
        {
          id: 'background',
          label: 'Background',
          content: (
            <>
              <Preview prefs={draft} />
              <div style={{ display: 'flex', gap: 8 }}>
                <ListPicker label="Pattern" value={draft.desktop.pattern} options={PATTERNS} onChange={(pattern) => set({ pattern })} />
                <ListPicker
                  label="Wallpaper"
                  value={draft.desktop.wallpaper}
                  options={[{ id: null, label: '(None)' }, ...WALLPAPERS.filter((w) => assetUrl(w)).map((w) => ({ id: w, label: wallpaperName(w) }))]}
                  onChange={(wallpaper) => set({ wallpaper })}
                />
              </div>
            </>
          ),
        },
        {
          id: 'appearance',
          label: 'Appearance',
          content: (
            <>
              <Preview prefs={draft} />
              <ListPicker label="Scheme" value={draft.desktop.colorScheme} options={SCHEMES} onChange={(colorScheme) => set({ colorScheme })} />
            </>
          ),
        },
        {
          id: 'settings',
          label: 'Settings',
          content: (
            <fieldset className="w95-groupbox">
              <legend>Desktop scale</legend>
              {([1, 1.25, 1.5, 2] as const).map((scale) => (
                <label key={scale} className="w95-radio">
                  <input type="radio" name={`${host.windowId}-scale`} checked={draft.desktop.scale === scale} onChange={() => set({ scale })} />
                  <span>{scale * 100}%</span>
                </label>
              ))}
              <p style={{ margin: '6px 0 0', color: 'var(--w95-gray-text)' }}>The desktop area (800×600 or 640×480) is chosen in the bar above the computer.</p>
            </fieldset>
          ),
        },
      ]}
    />
  );
}

export function SoundProperties({ host }: AppProps) {
  const { draft, setDraft, dirty, apply } = usePreferenceDraft(host);
  return (
    <PropertySheet
      dirty={dirty}
      onApply={apply}
      onClose={() => host.close()}
      tabs={[
        {
          id: 'sounds',
          label: 'Sounds',
          content: (
            <>
              <label className="w95-check">
                <input type="checkbox" checked={draft.sound.enabled} onChange={(e) => setDraft({ ...draft, sound: { ...draft.sound, enabled: e.target.checked } })} data-autofocus="" />
                <span>Play sounds</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Volume:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(draft.sound.volume * 100)}
                  disabled={!draft.sound.enabled}
                  aria-valuetext={`${Math.round(draft.sound.volume * 100)} percent`}
                  onChange={(e) => setDraft({ ...draft, sound: { ...draft.sound, volume: Number(e.target.value) / 100 } })}
                />
                <span>{Math.round(draft.sound.volume * 100)}%</span>
              </label>
              <p style={{ margin: 0, color: 'var(--w95-gray-text)' }}>Sounds play only after you start something yourself, and every sound has an on-screen status too.</p>
            </>
          ),
        },
      ]}
    />
  );
}

export function ModemProperties({ host }: AppProps) {
  const { draft, setDraft, dirty, apply } = usePreferenceDraft(host);
  const set = (speed: 'normal' | 'fast') => setDraft({ ...draft, connection: { speed } });
  return (
    <PropertySheet
      dirty={dirty}
      onApply={apply}
      onClose={() => host.close()}
      tabs={[
        {
          id: 'general',
          label: 'General',
          content: (
            <fieldset className="w95-groupbox">
              <legend>Maximum speed</legend>
              <label className="w95-radio">
                <input type="radio" name={`${host.windowId}-speed`} checked={draft.connection.speed === 'normal'} onChange={() => set('normal')} data-autofocus="" />
                <span>28,800 bps (as in 1995)</span>
              </label>
              <label className="w95-radio">
                <input type="radio" name={`${host.windowId}-speed`} checked={draft.connection.speed === 'fast'} onChange={() => set('fast')} />
                <span>Fast (about 4 times quicker)</span>
              </label>
              <p style={{ margin: '6px 0 0', color: 'var(--w95-gray-text)' }}>Downloads in progress switch speed right away; the dial-up sequence uses the new speed next time you connect.</p>
            </fieldset>
          ),
        },
      ]}
    />
  );
}

export function DateTimeProperties({ host }: AppProps) {
  const { draft, setDraft, dirty, apply } = usePreferenceDraft(host);
  const set = (format: '12h' | '24h') => setDraft({ ...draft, clock: { format } });
  return (
    <PropertySheet
      dirty={dirty}
      onApply={apply}
      onClose={() => host.close()}
      tabs={[
        {
          id: 'datetime',
          label: 'Date & Time',
          content: (
            <>
              <p style={{ margin: 0 }}>The clock shows your real local time. Dates inside the online world are part of the story (December 1995).</p>
              <fieldset className="w95-groupbox">
                <legend>Clock format</legend>
                <label className="w95-radio">
                  <input type="radio" name={`${host.windowId}-fmt`} checked={draft.clock.format === '12h'} onChange={() => set('12h')} data-autofocus="" />
                  <span>12-hour (3:45 PM)</span>
                </label>
                <label className="w95-radio">
                  <input type="radio" name={`${host.windowId}-fmt`} checked={draft.clock.format === '24h'} onChange={() => set('24h')} />
                  <span>24-hour (15:45)</span>
                </label>
              </fieldset>
            </>
          ),
        },
      ]}
    />
  );
}

export function AccessibilityProperties({ host }: AppProps) {
  const { draft, setDraft, dirty, apply } = usePreferenceDraft(host);
  const set = (k: keyof Preferences['accessibility'], v: boolean) => setDraft({ ...draft, accessibility: { ...draft.accessibility, [k]: v } });
  return (
    <PropertySheet
      dirty={dirty}
      onApply={apply}
      onClose={() => host.close()}
      tabs={[
        {
          id: 'display',
          label: 'Display',
          content: (
            <>
              <label className="w95-check">
                <input type="checkbox" checked={draft.accessibility.highContrast} onChange={(e) => set('highContrast', e.target.checked)} data-autofocus="" />
                <span>Use High Contrast</span>
              </label>
              <label className="w95-check">
                <input type="checkbox" checked={draft.accessibility.largerText} onChange={(e) => set('largerText', e.target.checked)} />
                <span>Use larger text</span>
              </label>
              <label className="w95-check">
                <input type="checkbox" checked={draft.accessibility.reducedMotion} onChange={(e) => set('reducedMotion', e.target.checked)} />
                <span>Reduce motion (shorter startup and animations)</span>
              </label>
            </>
          ),
        },
      ]}
    />
  );
}

const NAME_ERRORS: Record<string, string> = {
  'too-short': 'Use at least 3 letters or numbers.',
  'too-long': 'Use at most 16 characters.',
  'too-long-input': 'Use at most 16 characters.',
  'invalid-characters': 'Use only letters (A-Z), numbers and spaces.',
};

export function UserProperties({ host }: AppProps) {
  useHostState(host);
  const settings = host.settings!;
  const [name, setName] = useState(settings.screenName());
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== settings.screenName();
  const apply = () => {
    const r = settings.rename(name);
    if (!r.ok) {
      setError(NAME_ERRORS[r.error] ?? 'That name cannot be used.');
      return false;
    }
    setError(null);
    setName(settings.screenName());
    return true;
  };
  return (
    <PropertySheet
      dirty={dirty}
      onApply={apply}
      onClose={() => host.close()}
      tabs={[
        {
          id: 'name',
          label: 'Screen Name',
          content: (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Screen name:</span>
                <input className="w95-field" style={{ flex: 1 }} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-autofocus="" aria-invalid={error !== null} spellCheck={false} />
              </label>
              {error ? (
                <p role="alert" style={{ margin: 0, color: '#800000' }}>
                  {error}
                </p>
              ) : null}
              <p style={{ margin: 0, color: 'var(--w95-gray-text)' }}>Changing your name keeps all your files, settings and scores. Names are not checked and may be shared with other visitors.</p>
            </>
          ),
        },
      ]}
    />
  );
}

const MODE_TEXT = { persistent: 'Saved in this browser', temporary: 'Temporary: not saved after this tab closes', 'read-only': 'Read-only: another tab is saving' } as const;

export function StorageProperties({ host }: AppProps) {
  useHostState(host);
  const settings = host.settings!;
  const info = settings.storage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const exportSave = () => {
    const save = settings.exportSave();
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-machine-${save.profile.screenName.replace(/ /g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Your progress was exported.');
  };

  const importFile = async (file: File) => {
    if (file.size > 1024 * 1024) {
      await host.messageBox!({ title: 'Import', text: 'The file is larger than 1 MB.', icon: 'error' });
      return;
    }
    const choice = await host.messageBox!({ title: 'Import', text: 'Importing replaces all of your current progress in this browser. Continue?', icon: 'warning', buttons: ['yes', 'no'] });
    if (choice !== 'yes') return;
    const result = await settings.importSave(await file.text());
    if (!result.ok) {
      await host.messageBox!({ title: 'Import', text: result.error, icon: 'error' });
      return;
    }
    setStatus(result.warnings.length ? `Imported, with notes: ${result.warnings.join(' ')}` : 'Your progress was imported.');
  };

  const reset = async () => {
    const first = await host.messageBox!({ title: 'Reset', text: 'This deletes your screen name, files, settings, saved games and scores from this browser. It cannot be undone. Continue?', icon: 'warning', buttons: ['yes', 'no'] });
    if (first !== 'yes') return;
    const second = await host.messageBox!({ title: 'Reset', text: 'Are you sure? Consider exporting your progress first.', icon: 'question', buttons: ['yes', 'no'] });
    if (second !== 'yes') return;
    await settings.reset();
  };

  return (
    <PropertySheet
      dirty={false}
      onApply={() => undefined}
      onClose={() => host.close()}
      tabs={[
        {
          id: 'storage',
          label: 'Storage',
          content: (
            <>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', margin: 0 }}>
                <dt>Status:</dt>
                <dd style={{ margin: 0 }}>{MODE_TEXT[info.mode]}</dd>
                <dt>Saved data:</dt>
                <dd style={{ margin: 0 }}>{Math.max(1, Math.ceil(info.bytes / 1024))} KB</dd>
              </dl>
              <p style={{ margin: 0 }}>Everything stays in this browser. If browser data is cleared, it is gone; there is no account to recover it. Export a copy to keep it safe or move it.</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="w95-button" onClick={exportSave} data-autofocus="">
                  Export...
                </button>
                <button type="button" className="w95-button" onClick={() => fileRef.current?.click()}>
                  Import...
                </button>
                <button type="button" className="w95-button" onClick={() => void reset()}>
                  Reset...
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                aria-label="Choose a save file to import"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void importFile(file);
                }}
              />
              {status ? (
                <p role="status" style={{ margin: 0 }}>
                  {status}
                </p>
              ) : null}
            </>
          ),
        },
      ]}
    />
  );
}
