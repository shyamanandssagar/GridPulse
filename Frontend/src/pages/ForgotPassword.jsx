import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const r = await forgotPassword(email);
      setMsg(r.message || 'If an account exists for that email, a reset code has been sent.');
      // Take them to the reset screen with the email pre-filled.
      setTimeout(() => nav('/reset-password', { state: { email } }), 1200);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center grid-pattern px-4 py-10">
      <div className="card p-8 w-full max-w-md shadow-2xl shadow-accent/5">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">🔑</span>
          <div>
            <div className="text-xl font-semibold tracking-tight">Reset your password</div>
            <div className="text-xs text-slate-400">We&rsquo;ll email you a 6-digit code.</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Email</span>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bg/60 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
            />
          </label>

          {msg && (
            <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
              {msg}
            </div>
          )}
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
            {busy ? 'Sending code…' : 'Send reset code'}
          </button>
        </form>

        <div className="text-sm text-slate-400 mt-6 text-center">
          <Link to="/login" className="text-accent hover:underline">← Back to sign in</Link>
          <span className="mx-2 text-slate-600">·</span>
          <Link to="/reset-password" className="text-accent hover:underline">
            Already have a code?
          </Link>
        </div>
      </div>
    </div>
  );
}
