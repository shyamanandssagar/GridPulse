import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import GoogleSignInButton from '../components/GoogleSignInButton.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const finish = () => nav(loc.state?.from || '/', { replace: true });

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      finish();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center grid-pattern px-4 py-10">
      <div className="card p-8 w-full max-w-md shadow-2xl shadow-accent/5">
        <div className="flex items-center gap-3 mb-7">
          <span className="text-3xl">⚡</span>
          <div>
            <div className="text-xl font-semibold tracking-tight">GridPulse</div>
            <div className="text-xs text-slate-400">Sign in to your account</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" type="email" value={email} onChange={setEmail} autoFocus required />
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-wider text-slate-400">Password</span>
              <Link to="/forgot-password" className="text-xs text-accent hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-bg/60 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
            />
          </div>

          {err && (
            <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-accent text-bg font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[10px] uppercase tracking-widest text-slate-500">or</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        <GoogleSignInButton
          onSuccess={finish}
          onError={(m) => setErr(m)}
        />

        <div className="text-xs text-slate-500 mt-7 text-center border-t border-white/5 pt-5 leading-relaxed">
          Accounts are created by your grid operator.
          <br />
          <strong className="text-slate-400">Operators:</strong> bootstrap the first admin with{' '}
          <code className="text-accent">npm run create-admin</code>.
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg/60 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
      />
    </label>
  );
}
