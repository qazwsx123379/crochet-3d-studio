import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../themes';
import { actions, useStore } from '../store/store';
import AccountMenu from './AccountMenu';

export default function ThemeMenu() {
  const theme = useStore((s) => s.prefs.theme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  return (
    <>
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="主題色">
        <span className="dot" style={{ width: 16, height: 16, borderRadius: '50%', background: current.accent, border: `3px solid ${current.bg}`, boxShadow: '0 0 0 1px var(--line)' }} />
        <span className="hide-phone">主題色</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <span className="label" style={{ padding: '4px 10px' }}>主題色（只改介面，不改線色）</span>
          {THEMES.map((t) => (
            <button key={t.id} role="menuitemradio" aria-checked={t.id === theme} onClick={() => { actions.setPrefs({ theme: t.id }); setOpen(false); }}>
              <span className="dot" style={{ background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)` }} />
              <span style={{ flex: 1 }}>{t.id} {t.name}{t.dark ? '（深色）' : ''}</span>
              {t.id === theme && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
    <AccountMenu />
    </>
  );
}
