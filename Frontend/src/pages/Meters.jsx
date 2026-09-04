import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Loader from '../components/Loader.jsx';
import { meters as metersApi } from '../services/api.js';
import { fmtKW, fmtKWh } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

// Meters page — polished for both admins (table view, ~120 rows) and customers
// (card view, usually 1–3 meters). Admins get inline rename and rich filters;
// customers get a friendlier per-meter card with a clear "view live →" CTA.

export default function Meters() {
  const { isAdmin } = useAuth();
  const [meters, setMeters] = useState(null);
  const [err, setErr] = useState(null);

  const reload = () => metersApi.list().then(setMeters).catch((e) => setErr(e.message));
  useEffect(() => { reload(); }, []);

  if (!meters) return <Loader />;

  return isAdmin
    ? <AdminMeters meters={meters} reload={reload} err={err} setErr={setErr} />
    : <CustomerMeters meters={meters} />;
}

// ============================================================
// Customer view — a few meters, each as a friendly card
// ============================================================
function CustomerMeters({ meters }) {
  if (meters.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Meters</h1>
          <p className="text-slate-400 text-sm">Meters on your account.</p>
        </div>
        <div className="card p-10 text-center">
          <div className="text-5xl mb-4">🔌</div>
          <div className="font-medium text-slate-100 text-lg">No meters yet</div>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
            Your grid operator will assign your electricity meters to this account. Once they do,
            you&rsquo;ll see live consumption, current bill estimates, and downloadable invoices here.
          </p>
        </div>
      </div>
    );
  }

  const onlineCount = meters.filter((m) => m.status === 'online').length;
  const allOnline = onlineCount === meters.length;
  const totalUsed = meters.reduce((s, m) => s + (m.cumulativeKWh || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Meters</h1>
        <p className="text-slate-400 text-sm">
          You have {meters.length} meter{meters.length === 1 ? '' : 's'} on your account.
          {' '}
          {allOnline ? (
            <span className="text-emerald-300">All reporting normally.</span>
          ) : (
            <span className="text-amber-300">
              {meters.length - onlineCount} {meters.length - onlineCount === 1 ? 'is' : 'are'} offline.
            </span>
          )}
        </p>
      </div>

      {/* Small KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat label="Meters" value={meters.length} hint={`${onlineCount} online`} />
        <MiniStat label="Used this cycle" value={fmtKWh(totalUsed)} hint="across all your meters" />
        <MiniStat
          label="Status"
          value={allOnline ? 'Healthy' : 'Attention'}
          tone={allOnline ? 'good' : 'warn'}
          hint={allOnline ? 'all meters reporting' : 'some meters offline'}
        />
      </div>

      {/* One card per meter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {meters.map((m) => <CustomerMeterCard key={m._id} meter={m} />)}
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">
        Tap any meter to see real-time power consumption and download your printable bill.
      </div>
    </div>
  );
}

function CustomerMeterCard({ meter }) {
  const online = meter.status === 'online';
  const profile = PROFILE_INFO[meter.loadProfile] || PROFILE_INFO.residential;

  return (
    <Link
      to={`/meters/${meter._id}`}
      className="card p-5 hover:border-accent/30 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-accent text-lg">{meter.serial}</div>
          <div className="text-sm text-slate-300 mt-0.5">
            {meter.customerName || <em className="text-slate-500">unnamed</em>}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${
          online
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
        }`}>
          {online ? '● online' : '○ offline'}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-base">{profile.icon}</span>
        <span className="text-xs text-slate-400">
          {profile.label} · {meter.phases === 3 ? 'three-phase' : 'single-phase'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-lg bg-bg/40 border border-white/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Used this cycle</div>
          <div className="font-mono text-lg text-slate-100 mt-0.5">{fmtKWh(meter.cumulativeKWh)}</div>
        </div>
        <div className="rounded-lg bg-bg/40 border border-white/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Max capacity</div>
          <div className="font-mono text-lg text-slate-100 mt-0.5">{fmtKW(meter.peakLoadKW)}</div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
        <span className="text-slate-500">Connected to {meter.feeder?.name || 'feeder'}</span>
        <span className="text-accent group-hover:underline">Live view →</span>
      </div>
    </Link>
  );
}

// ============================================================
// Admin view — table with filters, inline rename, bulk scanning
// ============================================================
function AdminMeters({ meters, reload, err, setErr }) {
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState('all');
  const [status, setStatus] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    return meters.filter((m) => {
      if (profile !== 'all' && m.loadProfile !== profile) return false;
      if (status !== 'all' && m.status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !m.serial.toLowerCase().includes(q) &&
          !(m.customerName || '').toLowerCase().includes(q) &&
          !(m.feeder?.name || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [meters, search, profile, status]);

  // Quick summary across the whole fleet
  const stats = useMemo(() => {
    const online = meters.filter((m) => m.status === 'online').length;
    const byProfile = meters.reduce((acc, m) => {
      acc[m.loadProfile] = (acc[m.loadProfile] || 0) + 1;
      return acc;
    }, {});
    return { online, offline: meters.length - online, byProfile };
  }, [meters]);

  const startEdit = (m) => {
    setEditingId(m._id);
    setEditValue(m.customerName || '');
    setErr(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };
  const saveEdit = async (id) => {
    setSaving(true);
    setErr(null);
    try {
      await metersApi.update(id, { customerName: editValue.trim() });
      cancelEdit();
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setProfile('all');
    setStatus('all');
  };
  const hasFilters = search || profile !== 'all' || status !== 'all';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meters</h1>
        <p className="text-slate-400 text-sm">
          Every meter installed on the grid. Click a customer name to rename it; click a serial to
          open the live view.
        </p>
      </div>

      {err && (
        <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {/* Fleet summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total meters" value={meters.length} />
        <MiniStat
          label="Online"
          value={stats.online}
          tone={stats.offline === 0 ? 'good' : 'warn'}
          hint={stats.offline === 0 ? 'all reporting' : `${stats.offline} offline`}
        />
        <MiniStat
          label="Residential"
          value={stats.byProfile.residential || 0}
          hint={`${pct(stats.byProfile.residential, meters.length)}% of fleet`}
        />
        <MiniStat
          label="Industrial"
          value={stats.byProfile.industrial || 0}
          hint={`${pct(stats.byProfile.industrial, meters.length)}% of fleet`}
        />
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by serial, customer, or feeder…"
          className="bg-bg/60 border border-white/10 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] focus:outline-none focus:border-accent/60"
        />
        <select
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          className="bg-bg/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All profiles</option>
          <option value="residential">🏠 Residential</option>
          <option value="commercial">🏪 Commercial</option>
          <option value="industrial">🏭 Industrial</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-bg/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">Any status</option>
          <option value="online">● Online</option>
          <option value="offline">○ Offline</option>
        </select>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-slate-500 ml-auto">
          Showing {filtered.length} of {meters.length}
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/5">
            <tr>
              <th className="px-4 py-3">Serial</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Connection</th>
              <th className="px-4 py-3">Feeder</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3">Used this cycle</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const profile = PROFILE_INFO[m.loadProfile] || PROFILE_INFO.residential;
              const online = m.status === 'online';
              return (
                <tr key={m._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/meters/${m._id}`} className="text-accent hover:underline font-mono">
                      {m.serial}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === m._id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(m._id);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="flex-1 bg-bg/60 border border-accent/50 rounded px-2 py-1 text-sm focus:outline-none min-w-[140px]"
                        />
                        <button
                          onClick={() => saveEdit(m._id)}
                          disabled={saving}
                          className="text-xs px-2 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50"
                          title="Save (Enter)"
                        >
                          {saving ? '…' : '✓'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs px-2 py-1 rounded text-slate-400 hover:text-white"
                          title="Cancel (Esc)"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(m)}
                        className="text-left hover:text-accent transition-colors"
                        title="Click to rename"
                      >
                        {m.customerName || (
                          <span className="text-slate-500 italic">unnamed — click to set</span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${profile.textClass}`}>
                      <span>{profile.icon}</span>
                      <span>{profile.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {m.phases === 3 ? '3-phase' : 'single-phase'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{m.feeder?.name || '—'}</td>
                  <td className="px-4 py-3 font-mono">{fmtKW(m.peakLoadKW)}</td>
                  <td className="px-4 py-3 font-mono">{fmtKWh(m.cumulativeKWh)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${
                      online
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}>
                      {online ? '● online' : '○ offline'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <div className="text-2xl mb-2">🔍</div>
                  <div className="text-sm text-slate-300">No meters match your filters</div>
                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-accent hover:underline mt-2"
                    >
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">
        <strong className="text-slate-400">Tips:</strong> press <kbd className="px-1 py-0.5 bg-bg/60 border border-white/10 rounded text-[10px]">Enter</kbd> while editing a customer name to save, <kbd className="px-1 py-0.5 bg-bg/60 border border-white/10 rounded text-[10px]">Esc</kbd> to cancel. Capacity is the meter&rsquo;s maximum rated load — sustained current above this can damage the meter.
      </div>
    </div>
  );
}

// ---------- Components & helpers ----------

function MiniStat({ label, value, hint, tone }) {
  const valueClass =
    tone === 'good' ? 'text-emerald-300'
    : tone === 'warn' ? 'text-amber-300'
    : tone === 'bad' ? 'text-rose-300'
    : 'text-slate-100';
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-2xl mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

const PROFILE_INFO = {
  residential: {
    icon: '🏠',
    label: 'Residential',
    textClass: 'text-sky-300',
  },
  commercial: {
    icon: '🏪',
    label: 'Commercial',
    textClass: 'text-purple-300',
  },
  industrial: {
    icon: '🏭',
    label: 'Industrial',
    textClass: 'text-amber-300',
  },
};

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}
