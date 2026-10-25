import { useEffect, useState } from 'react';
import { currentWriteState, messageFrom, retryPending, type WriteState } from '../api';

export function useWriteState(): WriteState {
  const read = () => { try { return currentWriteState(); } catch { return 'unknown' as const; } };
  const [state, setState] = useState<WriteState>(read);
  useEffect(() => {
    const update = () => setState(read());
    window.addEventListener('dart-write-state', update);
    return () => window.removeEventListener('dart-write-state', update);
  }, []);
  return state;
}

export default function WriteStatus({ onRecovered, onAuthError }: {
  onRecovered: () => Promise<void>;
  onAuthError?: (error: unknown) => void;
}) {
  const state = useWriteState();
  const [error, setError] = useState('');
  const [recoveredCode, setRecoveredCode] = useState('');
  if (state === 'idle' && !error) return null;
  const labels = { idle: '', pending: 'Operacja oczekuje na odpowiedź serwera.', saved: 'Operacja zapisana.', rejected: 'Operacja odrzucona — sprawdź aktualny stan przed nowym zapisem.', unknown: 'Wynik poprzedniego zapisu jest nieznany. Nowe zapisy są wstrzymane.' };
  const retry = async () => {
    setError('');
    try {
      const result = await retryPending() as { code?: string } | null;
      if (result?.code) setRecoveredCode(result.code);
      await onRecovered();
    } catch (caught) { setError(messageFrom(caught)); onAuthError?.(caught); }
  };
  return <section className="write-status" aria-live="polite">
    <p>{labels[state]}</p>
    {state === 'unknown' && <button type="button" className="button button-secondary" onClick={retry}>Ponów ten sam zapis</button>}
    {recoveredCode && <p>Odzyskany kod parowania (ważny 10 minut): <strong>{recoveredCode}</strong></p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
