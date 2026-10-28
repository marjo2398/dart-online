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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const writeState = useWriteState();
  const disabled = busy || writeState === 'pending' || writeState === 'unknown';
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
      <p>Kod jednorazowy jest ważny 10 minut. W APK wybierz ten sam adres panelu i wpisz kod.</p>
      <div className="form-grid">
        <label>Uprawnienia<select value={role} disabled={disabled} onChange={e => setRole(e.target.value as Device['role'])}>
          <option value="operator">Operator — zapis wyniku i kamera</option>
          {gameId !== null && <><option value="camera">Kamera — tylko propozycje w tym meczu</option><option value="viewer">Widz — tylko podgląd tego meczu</option></>}
        </select></label>
        <label>Dostęp przez<select value={hours} disabled={disabled} onChange={e => setHours(Number(e.target.value))}>
          {[1, 12, 24, 72, 168].map(h => <option key={h} value={h}>{h} godz.</option>)}
        </select></label>
      </div>
      {role === 'operator' && <details><summary>Jawne uprawnienia nowego dostępu</summary><p>Nie zmienia uprawnień wcześniej sparowanych urządzeń. Rozszerzenia przydzielasz wyłącznie dla nowego kodu.</p>{Object.entries(permissionLabels).map(([key,label]) => <label key={key}><input type="checkbox" disabled={disabled} checked={permissions.includes(key as MatchPermission)} onChange={e => setPermissions(current => e.target.checked ? [...current,key as MatchPermission] : current.filter(p => p !== key))} /> {label}</label>)}</details>}
      <p className="muted">{gameId ? `Dostęp przypisany do meczu #${gameId}.` : 'Operator może korzystać ze wspólnej listy graczy i tworzyć mecze.'} Tryb ekranu kamery nie nadaje uprawnień operatora.</p>
      <button className="button button-primary" type="button" disabled={disabled} onClick={() => run(async () => {
        const result = await api.pairCode(role, gameId, hours, role === 'operator' ? permissions : []); setCode(result.code);
      })}>Utwórz kod dołączenia</button>
      {code && <p className="pair-code">Kod: <strong>{code}</strong></p>}
      {error && <p role="alert">{error}</p>}
      <h3>Urządzenia</h3>
      {devices.length === 0 && <p className="muted">Brak sparowanych urządzeń.</p>}
      {devices.map(device => <div className="device-row" key={device.id}>
        <span><strong>{device.name}</strong> · {device.role} · {device.permissions.map(p => permissionLabels[p]).join(', ')} · {device.revoked ? 'cofnięty dostęp' : `do ${new Date(device.expires_at * 1000).toLocaleString('pl-PL')}`}</span>
        {!device.revoked && <button className="button button-danger-ghost" type="button" disabled={disabled} onClick={() => {
          if (window.confirm(`Cofnąć dostęp urządzenia „${device.name}”?`)) run(async () => { await api.revoke(device.id); await refresh(); });
        }}>Cofnij dostęp</button>}
      </div>)}
    </>}
  </section>;
}
