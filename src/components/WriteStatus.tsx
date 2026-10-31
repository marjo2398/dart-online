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

export default function WriteStatus({ onRecovered, onAuthError, compact = false }: {
  onRecovered: () => Promise<void>;
  onAuthError?: (error: unknown) => void;
  compact?: boolean;
}) {
  const state = useWriteState();
  const [error, setError] = useState('');
  const [recoveredCode, setRecoveredCode] = useState('');
  const [expires,setExpires]=useState(0);
  if ((state === 'idle' || (compact && state === 'saved' && !recoveredCode)) && !error) return null;
  const labels = { idle: '', pending: 'Operacja oczekuje na odpowiedź serwera.', saved: 'Operacja zapisana.', rejected: 'Operacja odrzucona — sprawdź aktualny stan przed nowym zapisem.', unknown: 'Wynik poprzedniego zapisu jest nieznany. Nowe zapisy są wstrzymane.' };
  const retry = async () => {
    setError('');
    try {
      const result = await retryPending() as { code?: string;expires_at?:number } | null;
      if (result?.code) {setRecoveredCode(result.code);setExpires(result.expires_at??0);}
      await onRecovered();
    } catch (caught) { setError(messageFrom(caught)); onAuthError?.(caught); }
  };
  return <section className="write-status" aria-live="polite">
    <p>{labels[state]}</p>
    {state === 'unknown' && <button type="button" className="button button-secondary" onClick={retry}>Ponów ten sam zapis</button>}
    {recoveredCode && <p>Odzyskany PIN: <strong>{recoveredCode}</strong> · ważny do {new Date(expires*1000).toLocaleTimeString('pl-PL')}; ponowienie nie przedłuża ważności.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
