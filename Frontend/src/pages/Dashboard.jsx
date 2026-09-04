import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../components/StatCard.jsx';
import LoadCurveChart from '../components/LoadCurveChart.jsx';
import Loader from '../components/Loader.jsx';
import { analytics, meters as metersApi } from '../services/api.js';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtKWh, fmtTime } from '../utils/format.js';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  if (isAdmin) return <AdminDashboard userName={user?.name} />;
  return <CustomerDashboard userName={user?.name} />;
}

// ============================================================
// Customer view — focus on their own meters and projected bills
// ============================================================
function CustomerDashboard({ userName }) {
  const [meters, setMeters] = useState(null);
  const [details, setDetails] = useState({}); // meterId -> { lastReading, bill }

  useEffect(() => {
    let alive = true;
    metersApi.list().then(async (ms) => {
      if (!alive) return;
      setMeters(ms);
      const entries = await Promise.all(
        ms.slice(0, 10).map((m) => metersApi.get(m._id).then((d) => [m._id, d]).catch(() => [m._id, null]))
      );
      if (!alive) return;
      setDetails(Object.fromEntries(entries.filter(([, v]) => v)));
    });
    return () => { alive = false; };
  }, []);

  if (!meters) return <Loader />;

  if (meters.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName(userName)} 👋</h1>
          <p className="text-slate-400 text-sm">Your account isn't linked to any meters yet.</p>
        </div>
        <div className="card p-10 text-center">
          <div className="text-5xl mb-4">🔌</div>
          <div className="font-medium text-slate-100 text-lg">No meters assigned</div>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
            Your operator will assign your electricity meters to this account. Once they do, you'll
            be able to see live consumption, your current bill, and download printable invoices.
          </p>
          <p className="text-xs text-slate-500 mt-4">
            If you've been waiting a while, get in touch with your grid operator.
          </p>
        </div>
      </div>
    );
  }

  const totalCumulative = meters.reduce((s, m) => s + (m.cumulativeKWh || 0), 0);
  const totalProjected = Object.values(details).reduce(
    (s, d) => s + (d?.bill?.projectedTotal || 0), 0
  );
  const onlineCount = meters.filter((m) => m.status === 'online').length;
  const allHealthy = onlineCount === meters.length;

  return (
    <div className="space-y-6">
      {/* Warm welcome */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi {firstName(userName)} 👋
        </h1>
        <p className="text-slate-400 text-sm">
          You have {meters.length} meter{meters.length === 1 ? '' : 's'} on your account.
          {' '}
          {allHealthy ? (
            <span className="text-emerald-300">Everything is running normally.</span>
          ) : (
            <span className="text-amber-300">
              {meters.length - onlineCount} {meters.length - onlineCount === 1 ? 'meter is' : 'meters are'} currently offline.
            </span>
          )}
        </p>
      </div>

      {/* Three friendly cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FriendlyCard
          label="Meters online"
          value={`${onlineCount} of ${meters.length}`}
          tone={allHealthy ? 'good' : 'warn'}
          icon="🔌"
          hint={allHealthy ? 'All your meters are reporting' : 'Some meters are offline'}
        />
        <FriendlyCard
          label="Used this cycle"
          value={fmtKWh(totalCumulative)}
          icon="⚡"
          hint="Since your billing cycle started"
        />
        <FriendlyCard
          label="Projected bill"
          value={`₹ ${totalProjected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          tone="warn"
          icon="🧾"
          hint="If usage continues at the current rate"
        />
      </div>

      {/* Per-meter table */}
      <div className="card overflow-x-auto scrollbar-thin">
        <div className="px-4 py-3 border-b border-white/5">
          <div className="text-sm text-slate-100 font-medium">Your meters</div>
          <div className="text-xs text-slate-500">
            Click any serial number to see live readings and download your bill.
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/5">
            <tr>
              <th className="px-4 py-3">Meter</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Used so far</th>
              <th className="px-4 py-3">Projected total</th>
              <th className="px-4 py-3">Projected bill</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {meters.map((m) => {
              const d = details[m._id];
              return (
                <tr key={m._id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="font-mono text-accent">{m.serial}</div>
                    <div className="text-xs text-slate-500">{m.customerName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      m.status === 'online'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}>{m.status === 'online' ? '● online' : '○ offline'}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">{fmtKWh(m.cumulativeKWh)}</td>
                  <td className="px-4 py-3 font-mono">{d?.bill ? `${d.bill.projected.total} kWh` : '…'}</td>
                  <td className="px-4 py-3 font-mono text-emerald-300">{d?.bill ? `₹ ${d.bill.projectedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '…'}</td>
                  <td className="px-4 py-3">
                    <Link to={`/meters/${m._id}`} className="text-xs text-accent hover:underline whitespace-nowrap">
                      Live view →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">
        Billing cycles run for one calendar month. Your projected bill assumes you'll use
        electricity at the same average rate until the end of the cycle — it's an estimate, not
        your final bill.
      </div>
    </div>
  );
}

// ============================================================
// Admin view — operator console with plain-English KPIs
// ============================================================
function AdminDashboard({ userName }) {
  const [summary, setSummary] = useState(null);
  const [reliability, setReliability] = useState(null);
  const { recentAnomalies, latestTick } = useSocket();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [s, r] = await Promise.all([analytics.summary(), analytics.reliability(30)]);
        if (!alive) return;
        setSummary(s);
        setReliability(r);
      } catch (err) {
        console.error(err);
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!summary) return <Loader label="Loading dashboard…" />;

  const currentLoad = latestTick ? latestTick.totalLoadKW : summary.totalLoadKW;
  const onlinePct = summary.totalMeters > 0
    ? (summary.onlineMeters / summary.totalMeters) * 100
    : 100;
  const hasOutages = summary.faultedFeeders > 0;
  const overall = adminOverall(summary, reliability);

  return (
    <div className="space-y-6">
      {/* Warm header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Good {timeGreeting()}, {firstName(userName)} 👋
        </h1>
        <p className="text-slate-400 text-sm">
          Here&rsquo;s how the grid is doing right now —{' '}
          {summary.totalMeters} meters across {summary.feeders} network nodes.
        </p>
      </div>

      {/* One-glance health banner */}
      <div className={`card p-4 border ${overall.borderClass}`}>
        <div className="flex items-start gap-3">
          <div className="text-2xl">{overall.icon}</div>
          <div>
            <div className={`text-sm font-semibold ${overall.titleClass}`}>{overall.title}</div>
            <div className="text-xs text-slate-400 mt-0.5">{overall.subtitle}</div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Live grid load"
          value={Number(currentLoad).toFixed(1)}
          suffix="kW"
          hint="Total power drawn right now"
        />
        <StatCard
          label="Meters online"
          value={`${summary.onlineMeters}/${summary.totalMeters}`}
          accent={summary.offlineMeters === 0 ? 'good' : 'warn'}
          hint={summary.offlineMeters > 0
            ? `${summary.offlineMeters} offline · ${onlinePct.toFixed(1)}% healthy`
            : 'All meters reporting'}
        />
        <StatCard
          label="Active outages"
          value={summary.faultedFeeders}
          accent={hasOutages ? 'bad' : 'good'}
          hint={hasOutages
            ? 'Feeders are faulted — see Network'
            : 'No faults right now'}
        />
        <StatCard
          label="Energy this cycle"
          value={fmtKWh(summary.totalCumulativeKWh)}
          hint="Across all customers"
        />
      </div>

      {/* Live load curve */}
      <LoadCurveChart />

      {/* Two panels: reliability summary + anomaly feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-slate-100 font-medium">Reliability — last 30 days</div>
              <div className="text-xs text-slate-500">A quick summary in plain language.</div>
            </div>
            <Link to="/reliability" className="text-xs text-accent hover:underline">
              Full report →
            </Link>
          </div>
          {reliability ? (
            <ReliabilityPlainSummary r={reliability} />
          ) : (
            <Loader />
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-slate-100 font-medium">Recent power-quality events</div>
              <div className="text-xs text-slate-500">Live feed of anomalies as they happen.</div>
            </div>
            <Link to="/anomalies" className="text-xs text-accent hover:underline">
              See all →
            </Link>
          </div>
          {recentAnomalies.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🌤️</div>
              <div className="text-sm text-slate-300">All clear</div>
              <div className="text-xs text-slate-500 mt-1">
                No anomalies received yet. Power quality is normal.
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-thin">
              {recentAnomalies.slice(0, 10).map((a) => (
                <AnomalyChip key={a._id} a={a} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <div className="text-sm text-slate-100 font-medium mb-3">Common tasks</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <ActionLink to="/network" icon="🌳" title="View network" desc="See the grid topology and simulate faults" />
          <ActionLink to="/anomalies" icon="⚠️" title="Review alerts" desc="Power-quality events that need attention" />
          <ActionLink to="/losses" icon="🔍" title="Check for theft" desc="Find feeders with suspicious energy losses" />
          <ActionLink to="/admin/users" icon="👥" title="Manage users" desc="Add customer accounts and assign meters" />
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function FriendlyCard({ label, value, tone, icon, hint }) {
  const valueClass =
    tone === 'good' ? 'text-emerald-300'
    : tone === 'warn' ? 'text-amber-300'
    : tone === 'bad' ? 'text-rose-300'
    : 'text-slate-100';
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className={`font-mono text-3xl mt-2 ${valueClass}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function ReliabilityPlainSummary({ r }) {
  if (r.eventsConsidered === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-300 leading-relaxed">
          <span className="text-emerald-300">No outages recorded</span> in the last 30 days. Every
          customer had uninterrupted power across the whole period.
        </p>
        <Mini label="Service availability" value={`${r.asaiPercent.toFixed(2)}%`} tone="good" />
      </div>
    );
  }
  const avgOutages = r.saifi.toFixed(2);
  const avgDuration = formatHours(r.saidi);
  const verdict = r.asaiPercent >= 99.97 ? 'good' : r.asaiPercent >= 99.9 ? 'warn' : 'bad';
  const verdictText =
    verdict === 'good' ? 'Grid is performing well.' :
    verdict === 'warn' ? 'Acceptable, with room to improve.' :
    'Reliability needs attention.';
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300 leading-relaxed">
        Across {r.eventsConsidered} outage event{r.eventsConsidered === 1 ? '' : 's'}, the average
        customer experienced <strong className="text-slate-100">{avgOutages}</strong> interruption
        {Number(avgOutages) === 1 ? '' : 's'} totaling <strong className="text-slate-100">{avgDuration}</strong>{' '}
        of downtime.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Mini label="Service availability" value={`${r.asaiPercent.toFixed(2)}%`} tone={verdict} />
        <Mini label="Energy not delivered" value={`${r.ens.toFixed(0)} kWh`} />
      </div>
      <div className="text-xs text-slate-400 italic">{verdictText}</div>
    </div>
  );
}

function Mini({ label, value, tone }) {
  const cls =
    tone === 'good' ? 'text-emerald-300'
    : tone === 'warn' ? 'text-amber-300'
    : tone === 'bad' ? 'text-rose-300'
    : 'text-slate-100';
  return (
    <div className="rounded-lg border border-white/5 bg-bg/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-base mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function AnomalyChip({ a }) {
  const icon = ANOMALY_ICON[a.type] || '⚡';
  const sevCls =
    a.severity === 'critical' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
    : a.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    : 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${sevCls}`}>
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium capitalize">
          {(a.type || '').replace('_', ' ')}
        </div>
        <div className="text-xs text-slate-300 truncate">{a.message}</div>
      </div>
      <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtTime(a.timestamp)}</span>
    </div>
  );
}

function ActionLink({ to, icon, title, desc }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-white/5 bg-bg/40 p-4 hover:bg-white/5 hover:border-accent/30 transition-colors"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm font-medium text-slate-100">{title}</div>
      <div className="text-xs text-slate-500 mt-1">{desc}</div>
    </Link>
  );
}

// ---------- Helpers ----------

const ANOMALY_ICON = {
  overvoltage: '⚡',
  undervoltage: '🪫',
  current_spike: '🔥',
  phase_imbalance: '⚖️',
  outage: '🌑',
};

function firstName(name) {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0];
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return 'evening';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function formatHours(h) {
  if (!h || h <= 0) return '0 minutes';
  if (h < 1) return `${Math.round(h * 60)} minutes`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 0) return `${whole} hour${whole === 1 ? '' : 's'}`;
  return `${whole} hr ${mins} min`;
}

function adminOverall(summary, reliability) {
  if (summary.faultedFeeders > 0) {
    return {
      icon: '🚨',
      title: 'Active outages in progress',
      subtitle: `${summary.faultedFeeders} feeder${summary.faultedFeeders === 1 ? '' : 's'} faulted · ${summary.offlineMeters} meter${summary.offlineMeters === 1 ? '' : 's'} offline`,
      titleClass: 'text-rose-300',
      borderClass: 'border-rose-500/30',
    };
  }
  if (summary.offlineMeters > 0) {
    return {
      icon: '⚠️',
      title: 'Some meters offline',
      subtitle: `${summary.offlineMeters} of ${summary.totalMeters} meters aren't reporting — could be communication issues`,
      titleClass: 'text-amber-200',
      borderClass: 'border-amber-500/30',
    };
  }
  if (reliability && reliability.asaiPercent < 99.9) {
    return {
      icon: '📉',
      title: 'Reliability is below target',
      subtitle: `Service availability over last 30 days is ${reliability.asaiPercent.toFixed(2)}% — typical target is > 99.9%`,
      titleClass: 'text-amber-200',
      borderClass: 'border-amber-500/30',
    };
  }
  return {
    icon: '✅',
    title: 'Grid is healthy',
    subtitle: 'All meters reporting · no active faults · reliability looks good',
    titleClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/30',
  };
}
