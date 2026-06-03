import { useState } from 'react';
import { useConfig, type Config } from '../lib/config';

type Props = {
  // Called after a pasted configuration is applied successfully.
  onImported: () => void;
  // Called when the user opts to configure everything manually.
  onStartFromScratch: () => void;
};

export function IntroDialog({ onImported, onStartFromScratch }: Props) {
  const { replace } = useConfig();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const importJson = () => {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object');
      }
      replace(parsed as Partial<Config>);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  return (
    <div className="taco-modal-backdrop">
      <div
        className="taco-modal-panel"
        role="dialog"
        aria-label="Welcome to Taco"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="taco-modal-header">
          <h2 className="taco-modal-title">Welcome to Taco</h2>
        </header>

        <div className="taco-modal-body">
          <p className="taco-settings-help">
            Paste a configuration to get set up instantly, or start from scratch to configure
            everything yourself.
          </p>

          <label className="taco-modal-label" htmlFor="taco-intro-json">
            Configuration JSON
          </label>
          <textarea
            id="taco-intro-json"
            className="taco-input taco-jql-textarea"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            rows={10}
            spellCheck={false}
            placeholder={'{\n  "projectKey": "CSP",\n  "favoriteProductDomains": [ … ]\n}'}
          />
          {error && (
            <div className="taco-cell-error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="taco-button primary"
              disabled={draft.trim().length === 0}
              onClick={importJson}
            >
              Import configuration
            </button>
          </div>
        </div>

        <footer className="taco-modal-footer" style={{ justifyContent: 'center' }}>
          <button type="button" className="taco-button" onClick={onStartFromScratch}>
            Start from scratch
          </button>
        </footer>
      </div>
    </div>
  );
}
