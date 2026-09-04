import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

// Renders Google's official "Sign in with Google" button using their
// Identity Services SDK. The component loads the SDK lazily, renders the
// button into a div ref, and on success hands the ID token to the backend
// via AuthContext.googleLogin().
//
// If VITE_GOOGLE_CLIENT_ID isn't set, we render a disabled placeholder so
// the page still works (you can fall back to email + password login).
export default function GoogleSignInButton({ onSuccess, onError }) {
  const { googleLogin } = useAuth();
  const containerRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;

    // Inject GSI script once
    const SCRIPT_ID = 'gsi-client';
    let script = document.getElementById(SCRIPT_ID);

    const init = () => {
      if (!window.google?.accounts?.id || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (!response?.credential) return;
          setBusy(true);
          try {
            const user = await googleLogin(response.credential);
            onSuccess?.(user);
          } catch (e) {
            onError?.(e.message || 'Google sign-in failed');
          } finally {
            setBusy(false);
          }
        },
        auto_select: false,
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 320,
      });
    };

    if (script) {
      init();
    } else {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = init;
      document.head.appendChild(script);
    }
  }, [clientId, googleLogin, onSuccess, onError]);

  if (!clientId) {
    return (
      <div className="w-full text-center text-xs text-slate-500 border border-dashed border-white/10 rounded-lg py-3">
        Google sign-in not configured
        <div className="text-[10px] text-slate-600 mt-0.5">
          set <code className="text-accent">VITE_GOOGLE_CLIENT_ID</code> to enable
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={containerRef} className={busy ? 'opacity-60 pointer-events-none' : ''} />
      {busy && <div className="text-xs text-slate-400">Signing you in…</div>}
    </div>
  );
}
