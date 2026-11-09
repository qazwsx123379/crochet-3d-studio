import { signIn, useAuth } from '../store/store';

/** Sign-in page, following the 登入 artboard on the design canvas. */
export default function Login() {
  const auth = useAuth();
  const error = auth.status === 'signedOut' ? auth.error : undefined;
  return (
    <div className="login">
      <div className="login-art" aria-hidden="true">
        <svg viewBox="0 0 400 420" width="100%" style={{ maxWidth: 420 }}>
          <defs><pattern id="stL" width="10" height="9" patternUnits="userSpaceOnUse"><path d="M1 1 L5 7 L9 1" fill="none" stroke="#000" strokeOpacity=".16" strokeWidth="1.4" /></pattern></defs>
          <ellipse cx="200" cy="402" rx="130" ry="12" fill="#000" fillOpacity=".07" />
          <ellipse cx="200" cy="290" rx="150" ry="112" fill="#E8833A" /><ellipse cx="200" cy="290" rx="94" ry="112" fill="#F09550" /><ellipse cx="200" cy="290" rx="38" ry="112" fill="#E8833A" /><ellipse cx="200" cy="290" rx="150" ry="112" fill="url(#stL)" />
          <circle cx="152" cy="282" r="12" fill="#2B2B2B" /><circle cx="248" cy="282" r="12" fill="#2B2B2B" />
          <path d="M160 332 q40 24 80 0" stroke="#2B2B2B" strokeWidth="3.5" fill="none" strokeDasharray="7 5" />
          <ellipse cx="200" cy="190" rx="118" ry="20" fill="#5A3F86" /><path d="M126 186 L210 30 L274 186 Z" fill="#6B4E9B" /><path d="M126 186 L210 30 L274 186 Z" fill="url(#stL)" />
        </svg>
      </div>
      <div className="login-panel">
        <h1>鉤織 3D 工作室</h1>
        <p className="muted">寫下每一圈，馬上看到 3D 成品。零件可以組裝，圖解一鍵匯出。</p>
        <button className="btn login-btn" onClick={() => signIn()} disabled={auth.status === 'loading'}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.4 2.2-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z" /></svg>
          {auth.status === 'loading' ? '載入中…' : '用 Google 帳號登入'}
        </button>
        {error && <p role="alert" style={{ color: 'var(--warn)', margin: 0, fontSize: 13 }}>登入沒有成功：{error}。請再試一次；如果一直失敗，請確認 Firebase 已開啟 Google 登入，並把這個網址加入授權網域。</p>}
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>登入後作品存在雲端，電腦、手機、平板都看得到。看過的作品，沒有網路時也能打開瀏覽。</p>
      </div>
    </div>
  );
}
