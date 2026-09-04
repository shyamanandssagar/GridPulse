export default function StatCard({ label, value, suffix, accent, hint }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <div
          className={`text-2xl md:text-3xl font-semibold ${
            accent === 'good' ? 'text-emerald-400'
            : accent === 'warn' ? 'text-amber-300'
            : accent === 'bad' ? 'text-rose-400'
            : 'text-white'
          }`}
        >
          {value ?? '—'}
        </div>
        {suffix && <div className="text-sm text-slate-400">{suffix}</div>}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
