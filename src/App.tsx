import { useEffect, useState } from 'react';
import Library, { WorkPage } from './ui/Library';
import Editor from './ui/Editor';
import { useAuth, useStore } from './store/store';
import Login from './ui/Login';
import { applyTheme } from './themes';

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const theme = useStore((s) => s.prefs.theme);
  useEffect(() => applyTheme(theme), [theme]);
  const hash = useHash();
  const auth = useAuth();
  if (auth.status === 'loading') return <div className="splash"><span className="brand">鉤織 3D 工作室</span><span className="muted">載入中…</span></div>;
  if (auth.status === 'signedOut') return <Login />;
  if (!auth.ready) return <div className="splash"><span className="brand">鉤織 3D 工作室</span><span className="muted">正在讀取你的作品…</span></div>;
  const part = hash.match(/^#\/part\/(.+)$/);
  if (part) return <Editor key={part[1]} partId={decodeURIComponent(part[1])} />;
  const work = hash.match(/^#\/work\/(.+)$/);
  if (work) return <WorkPage workId={decodeURIComponent(work[1])} />;
  return <Library />;
}
