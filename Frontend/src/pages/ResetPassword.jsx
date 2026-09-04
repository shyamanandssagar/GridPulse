import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Two-step UX in a single page:
//   1) email + OTP → verify
//   2) new password → submit
// Verifying first means we can show a clean "code is valid, set your new password"
// screen rather than dumping every field at once.
export default function ResetPassword() {
  const { verifyOtp, resetPassword } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [email, setEmail] = useState(loc.state?.email || '');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState(1); // 1=verify, 2=new password
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const otpRefs = useRef([]);
  const otpString = otp.join('');

  useEffect(() => {
    // Focus first OTP box on mount
    otpRefs.current[0]?.focus();
  }, []);

  const setOtpDigit = (i, val) => {
    if (val && !/^\d$/.test(val)) return;
    setOtp((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const onOtpKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const onOtpPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
  };

  const verify = async (e) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!email) return setErr('Please enter your email');
    if (otpString.length !== 6) return setErr('Please enter the 6-digit code');
    setBusy(true);
    try {
      await verifyOtp(email, otpString);
      setMsg('Code verified. Choose a new password.');
      setStep(2);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitNew = async (e) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (password.length < 6) return setErr('Password must be at least 6 characters');
    if (password !== confirm) return setErr('Passwords do not match');
    setBusy(true);
    try {
      const r = await resetPassword(email, otpString, password);
      setMsg(r.message || 'Password reset. Redirecting to sign in…');
      setTimeout(() => nav('/login', { replace: true }), 1500);
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
          <span className="text-3xl">{step === 1 ? '✉️' : '🔒'}</span>
          <div>
            <div className="text-xl font-semibold tracking-tight">
              {step === 1 ? 'Enter your reset code' : 'Set a new password'}
            </div>
            <div className="text-xs text-slate-400">
              {step === 1 ? 'Check your email for a 6-digit code.' : 'At least 6 characters.'}
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          <Pill active={step === 1} done={step > 1} label="1 · Verify" />
          <div className={`flex-1 h-px ${step > 1 ? 'bg-accent/50' : 'bg-white/10'}`} />
          <Pill active={step === 2} label="2 · New password" />
        </div>

        {step === 1 ? (
          <form onSubmit={verify} className="space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-bg/60 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
              />
            </label>

            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 block mb-2">6-digit code</span>
              <div className="flex items-center justify-between gap-2" onPaste={onOtpPaste}>
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => setOtpDigit(i, e.target.value)}
                    onKeyDown={(e) => onOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-mono bg-bg/60 border border-white/10 rounded-lg focus:outline-none focus:border-accent/60"
                  />
                ))}
              </div>
            </div>

            {msg && <Banner kind="ok">{msg}</Banner>}
            {err && <Banner kind="bad">{err}</Banner>}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-accent text-bg font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitNew} className="space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">New password</span>
              <input
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg/60 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Confirm password</span>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-bg/60 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60"
              />
            </label>

            {msg && <Banner kind="ok">{msg}</Banner>}
            {err && <Banner kind="bad">{err}</Banner>}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-accent text-bg font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? 'Saving…' : 'Reset password'}
            </button>
          </form>
        )}

        <div className="text-sm text-slate-400 mt-6 text-center">
          <Link to="/login" className="text-accent hover:underline">← Back to sign in</Link>
          {step === 1 && (
            <>
              <span className="mx-2 text-slate-600">·</span>
              <Link to="/forgot-password" className="text-accent hover:underline">
                Request a new code
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ active, done, label }) {
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${
        done
          ? 'bg-accent/10 text-accent border-accent/40'
          : active
          ? 'bg-accent/15 text-accent border-accent/40'
          : 'bg-white/5 text-slate-500 border-white/10'
      }`}
    >
      {label}
    </span>
  );
}

function Banner({ kind, children }) {
  const cls =
    kind === 'ok'
      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
      : 'text-rose-300 bg-rose-500/10 border-rose-500/30';
  return <div className={`text-sm border rounded-lg px-3 py-2 ${cls}`}>{children}</div>;
}
