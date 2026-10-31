import { useEffect, useState } from 'react';
import { api, messageFrom } from '../api';
import type { Device, MatchPermission } from '../types';
import { useWriteState } from './WriteStatus';

export default function Devices({ gameId = null }: { gameId?: number | null }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [role, setRole] = useState<Device['role']>('operator');
  const [hours, setHours] = useState(24);
  const [permissions, setPermissions] = useState<MatchPermission[]>(['score','correct_last']);
  const permissionLabels: Record<MatchPermission,string> = { score:'Zapis wyniku i zatwierdzanie propozycji',correct_last:'Cofanie i korekta ostatniego zapisu',history:'Korekta wcześniejszej historii',pause:'Pauza i wznowienie',adjudicate:'Rozstrzygnięcia administracyjne',confirm:'Zatwierdzenie wyniku',reopen:'Ponowne otwarcie wyniku' };
  const [code, setCode] = useState('');
  const [deadline,setDeadline]=useState(0);const [clock,setClock]=useState(Date.now());const [history,setHistory]=useState(false);
  const [pairingSession]=useState(()=>{const key=`dart-lens.pairing-slot.${gameId??'all'}`;let id=sessionStorage.getItem(key);if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}return id;});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const writeState = useWriteState();
  const disabled = busy || writeState === 'pending' || writeState === 'unknown';
  useEffect(()=>{if(!open)return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[open]);
  const refresh = async () => setDevices((await api.devices()).devices);
  useEffect(() => {
    if (!open) return;
    let active = true;
    api.devices().then(result => { if (active) setDevices(result.devices); }).catch(e => { if (active) setError(messageFrom(e)); });
    return () => { active = false; };
  }, [open, gameId]);
  const run = async (operation: () => Promise<void>) => {
    if (disabled) return;
    setBusy(true); setError('');
    try { await operation(); } catch (e) { setError(messageFrom(e)); } finally { setBusy(false); }
  };
  return <section className="panel device-panel">
    <button type="button" className="button button-secondary" aria-expanded={open} onClick={() => setOpen(!open)}>Dołącz APK i zarządzaj urządzeniami</button>
    {open && <>
      <p>PIN ma 4 cyfry i jest ważny 5 minut. W APK wpisz go jako tekst, również z zerem na początku. Nowy PIN zastępuje poprzedni wystawiony w tej sesji. Cofnięty telefon może dołączyć ponownie; poprzedni token pozostaje nieważny.</p>
      <div className="form-grid">
        <label>Uprawnienia<select value={role} disabled={disabled} onChange={e => setRole(e.target.value as Device['role'])}>
          <option value="operator">Operator — zapis wyniku i kamera</option>
          {gameId !== null && <><option value="camera">Kamera — tylko propozycje w tym meczu</option><option value="viewer">Widz — tylko podgląd tego meczu</option></>}
        </select></label>
        <label>Dostęp przez<select value={hours} disabled={disabled} onChange={e => setHours(Number(e.target.value))}>
          {[1, 12, 24, 72, 168].map(h => <option key={h} value={h}>{h} godz.</option>)}
        </select></label>
      </div>
      {role === 'operator' && <details><summary>Jawne uprawnienia nowego dostępu</summary><p>Nie zmienia uprawnień wcześniej sparowanych urządzeń. Rozszerzenia przydzielasz wyłącznie dla nowego kodu.</p>{Object.entries(permissionLabels).map(([key,label]) => <label className="check-option" key={key}><input type="checkbox" disabled={disabled} checked={permissions.includes(key as MatchPermission)} onChange={e => setPermissions(current => e.target.checked ? [...current,key as MatchPermission] : current.filter(p => p !== key))} /> {label}</label>)}</details>}
      <p className="muted">{gameId ? `Dostęp przypisany do meczu #${gameId}.` : 'Operator może korzystać ze wspólnej listy graczy i tworzyć mecze.'} Tryb ekranu kamery nie nadaje uprawnień operatora.</p>
      <button className="button button-primary" type="button" disabled={disabled} onClick={() => run(async () => {
        const result = await api.pairCode(role, gameId, hours, role === 'operator' ? permissions : [],pairingSession); setCode(result.code);setClock(Date.now());setDeadline(Date.now()+Math.max(0,result.expires_at-result.server_time)*1000);
      })}>{code?'Wygeneruj nowy PIN':'Utwórz PIN dołączenia'}</button>
      {code && <div className="pair-code" aria-live="polite"><p>PIN: <strong>{code}</strong> · {clock<deadline?`pozostało ${Math.max(0,Math.ceil((deadline-clock)/1000))} s`:'wygasł'}</p><button className="button button-secondary" disabled={clock>=deadline} onClick={()=>navigator.clipboard.writeText(code).catch(()=>setError('Kopiowanie niedostępne. Przepisz widoczny PIN.'))}>Kopiuj PIN</button></div>}
      {error && <p role="alert">{error}</p>}
      <h3>Urządzenia</h3>
      <div className="secondary-controls"><button className="button button-secondary" aria-pressed={!history} onClick={()=>setHistory(false)}>Aktualnie uprawnione</button><button className="button button-secondary" aria-pressed={history} onClick={()=>setHistory(true)}>Historia cofniętych i wygasłych</button><button className="button button-ghost" onClick={()=>void refresh().catch(e=>setError(messageFrom(e)))}>Odśwież listę</button></div><p>Ważny dostęp nie potwierdza, że urządzenie jest teraz online.</p>
      {!devices.some(d=>history?(d.revoked||d.expires_at*1000<=clock):(!d.revoked&&d.expires_at*1000>clock))&&<p className="muted">Brak urządzeń w tym filtrze.</p>}
      {devices.filter(d=>history?(d.revoked||d.expires_at*1000<=clock):(!d.revoked&&d.expires_at*1000>clock)).map(device => <div className="device-row" key={device.id}>
        <span><strong>{device.name}</strong> · {({operator:'operator',camera:'kamera',viewer:'widz'})[device.role]} · {device.permissions.map(p => permissionLabels[p]).join(', ')} · {device.revoked ? 'cofnięty dostęp' : device.expires_at*1000<=clock?'wygasły dostęp':`ważny do ${new Date(device.expires_at * 1000).toLocaleString('pl-PL')}`}</span>
        {!device.revoked && device.expires_at*1000>clock && <button className="button button-danger-ghost" type="button" disabled={disabled} onClick={() => {
          if (window.confirm(`Cofnąć dostęp urządzenia „${device.name}”?`)) run(async () => { await api.revoke(device.id); await refresh(); });
        }}>Cofnij dostęp</button>}
      </div>)}
    </>}
  </section>;
}
