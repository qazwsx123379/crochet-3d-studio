import { useEffect, useRef, useState } from 'react';
import { CLOUD, signOutAccount, useAuth } from '../store/store';

export default function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!CLOUD || auth.status !== 'signedIn') return null;
  const a = auth.account;
  const initial = (a.name || a.email || '?').slice(0, 1).toUpperCase();
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn icon" aria-haspopup="menu" aria-expanded={open} aria-label="帳號" onClick={() => setOpen((v) => !v)} style={{ borderRadius: '50%', overflow: 'hidden', padding: 0 }}>
        {a.photo ? <img src={a.photo} alt="" width={34} height={34} referrerPolicy="no-referrer" /> : <b>{initial}</b>}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div style={{ padding: '6px 10px' }}><b>{a.name || '已登入'}</b><div className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>{a.email}</div></div>
          <button role="menuitem" onClick={() => { setOpen(false); signOutAccount(); }}>登出</button>
        </div>
      )}
    </div>
  );
}
