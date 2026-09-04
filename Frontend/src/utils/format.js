export const fmtKW = (n) => (n == null ? '—' : `${Number(n).toFixed(2)} kW`);
export const fmtKWh = (n) => (n == null ? '—' : `${Number(n).toFixed(2)} kWh`);
export const fmtV = (n) => (n == null ? '—' : `${Number(n).toFixed(1)} V`);
export const fmtA = (n) => (n == null ? '—' : `${Number(n).toFixed(2)} A`);
export const fmtPct = (n) => (n == null ? '—' : `${(Number(n) * 100).toFixed(2)}%`);

export const fmtTime = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString();
};

export const severityColor = (s) =>
  s === 'critical' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
  : s === 'warning' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  : 'bg-sky-500/20 text-sky-300 border-sky-500/40';
