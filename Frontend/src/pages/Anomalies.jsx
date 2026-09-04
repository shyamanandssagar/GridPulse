import { useEffect, useMemo, useState, useCallback } from 'react';
import Loader from '../components/Loader.jsx';
import { anomalies as anomaliesApi } from '../services/api.js';
import { useSocket } from '../context/SocketContext.jsx';
import { fmtDate } from '../utils/format.js';

// Anomalies page rebuilt for non-engineer operators.
// Each anomaly type gets a plain-English explanation, a probable cause, and a
// recommended action. The filter row shows triage counts (X critical, Y warning,
// Z info) so admins can prioritise at a glance. A reference panel at the bottom
// explains what every anomaly type actually means.

export default function Anomalies() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState({ acknowledged: 'false', severity: 'all', type: 'all' });
  const [showGlossary, setShowGlossary] = useState(false);
  const { socket } = useSocket();

  const load = useCallback(async () => {
    const params = {};
    if (filter.acknowledged !== 'all') params.acknowledged = filter.acknowledged;
    if (filter.severity !== 'all') params.severity = filter.severity;
    if (filter.type !== 'all') params.type = filter.type;
    params.limit = 200;
    const data = await anomaliesApi.list(params);
    setItems(data);
  }, [filter]);

  useEffect(() => { load().catch(console.error); }, [load]);

  // Live append from socket
  useEffect(() => {
    if (!socket) return;
    const onNew = () => load();
    socket.on('anomaly:new', onNew);
    return () => socket.off('anomaly:new', onNew);
  }, [socket, load]);

  const ack = async (id) => {
    await anomaliesApi.ack(id);
    await load();
  };

  // Triage counts across current filter set
  const counts = useMemo(() => {
    if (!items) return { critical: 0, warning: 0, info: 0 };
    return items.reduce(
      (acc, a) => {
        acc[a.severity] = (acc[a.severity] || 0) + 1;
        return acc;
      },
      { critical: 0, warning: 0, info: 0 }
    );
  }, [items]);

  if (!items) return <Loader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Anomalies</h1>
        <p className="text-slate-400 text-sm max-w-2xl">
          Power-quality events detected on customer meters in real time. Critical events usually
          mean something is unsafe or broken; warnings often resolve themselves but are worth
          tracking; info events are mostly noise.
        </p>
      </div>

      {/* Triage strip */}
      <div className="grid grid-cols-3 gap-3">
        <TriageCard
          severity="critical"
          count={counts.critical}
          label="Critical"
          hint="Could damage equipment or signal a real fault"
          active={filter.severity === 'critical'}
          onClick={() => setFilter((f) => ({ ...f, severity: f.severity === 'critical' ? 'all' : 'critical' }))}
        />
        <TriageCard
          severity="warning"
          count={counts.warning}
          label="Warning"
          hint="Outside normal range but not immediately dangerous"
          active={filter.severity === 'warning'}
          onClick={() => setFilter((f) => ({ ...f, severity: f.severity === 'warning' ? 'all' : 'warning' }))}
        />
        <TriageCard
          severity="info"
          count={counts.info}
          label="Info"
          hint="Low-priority observations"
          active={filter.severity === 'info'}
          onClick={() => setFilter((f) => ({ ...f, severity: f.severity === 'info' ? 'all' : 'info' }))}
        />
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <span className="text-xs uppercase tracking-wider text-slate-400">Show</span>
        <select
          value={filter.acknowledged}
          onChange={(e) => setFilter((f) => ({ ...f, acknowledged: e.target.value }))}
          className="bg-bg/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="false">Not yet reviewed</option>
          <option value="true">Already reviewed</option>
          <option value="all">All events</option>
        </select>
        <select
          value={filter.type}
          onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
          className="bg-bg/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">Any type</option>
          <option value="overvoltage">Overvoltage</option>
          <option value="undervoltage">Undervoltage</option>
          <option value="current_spike">Current spike</option>
          <option value="phase_imbalance">Phase imbalance</option>
          <option value="outage">Outage</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">
          {items.length} event{items.length === 1 ? '' : 's'} matching
        </span>
      </div>

      {/* Event cards */}
      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🌤️</div>
          <div className="text-slate-200 font-medium">All clear</div>
          <p className="text-sm text-slate-400 mt-1">
            No anomalies match the current filters. Reduce filters above to see older or already-reviewed events.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <AnomalyCard key={a._id} anomaly={a} onAck={() => ack(a._id)} />
          ))}
        </div>
      )}

      {/* Glossary */}
      <div className="card p-5 border border-sky-500/20 bg-sky-500/5">
        <button
          onClick={() => setShowGlossary((v) => !v)}
          className="flex items-center gap-2 text-sm text-sky-200 font-medium hover:text-sky-100"
        >
          <span className="text-lg">📖</span>
          <span>What do these anomaly types mean?</span>
          <span className="text-xs text-slate-400 ml-1">{showGlossary ? '(hide)' : '(show)'}</span>
        </button>
        {showGlossary && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(ANOMALY_INFO).map(([key, info]) => (
              <div key={key} className="rounded-lg border border-white/5 bg-bg/40 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{info.icon}</span>
                  <span className="font-medium text-slate-100">{info.title}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{info.explanation}</p>
                <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs">
                  <Field label="Usually caused by" value={info.causes} />
                  <Field label="Why it matters" value={info.matters} />
                  <Field label="What to do" value={info.action} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Components ----------

function TriageCard({ severity, count, label, hint, active, onClick }) {
  const styles = {
    critical: {
      base: 'border-rose-500/20',
      activeBase: 'border-rose-500/50 bg-rose-500/10',
      icon: '🚨',
      iconClass: 'text-rose-300',
      countClass: count > 0 ? 'text-rose-300' : 'text-slate-500',
    },
    warning: {
      base: 'border-amber-500/20',
      activeBase: 'border-amber-500/50 bg-amber-500/10',
      icon: '⚠️',
      iconClass: 'text-amber-300',
      countClass: count > 0 ? 'text-amber-300' : 'text-slate-500',
    },
    info: {
      base: 'border-sky-500/20',
      activeBase: 'border-sky-500/50 bg-sky-500/10',
      icon: 'ℹ️',
      iconClass: 'text-sky-300',
      countClass: 'text-slate-300',
    },
  }[severity];

  return (
    <button
      onClick={onClick}
      className={`card p-4 border text-left transition-colors ${active ? styles.activeBase : styles.base} hover:bg-white/[0.02]`}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{styles.icon}</span>
          <span className="text-sm font-medium text-slate-100">{label}</span>
        </div>
        <span className={`font-mono text-2xl ${styles.countClass}`}>{count}</span>
      </div>
      <div className="text-xs text-slate-500 mt-1.5">{hint}</div>
      {active && (
        <div className="text-[10px] uppercase tracking-wider text-accent mt-2">
          Filtering by {label.toLowerCase()} · click to clear
        </div>
      )}
    </button>
  );
}

function AnomalyCard({ anomaly, onAck }) {
  const info = ANOMALY_INFO[anomaly.type] || { icon: '⚡', title: anomaly.type, action: '' };
  const sev = SEVERITY_STYLES[anomaly.severity] || SEVERITY_STYLES.warning;
  const reading = anomaly.value != null ? formatReading(anomaly.type, anomaly.value) : null;
  const threshold = anomaly.threshold != null ? formatReading(anomaly.type, anomaly.threshold) : null;

  return (
    <div className={`card p-4 border ${sev.border}`}>
      <div className="flex items-start gap-4">
        <div className={`text-2xl ${sev.iconClass}`}>{info.icon}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <span className="font-medium text-slate-100">{info.title}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ml-2 ${sev.badge}`}>
                {sev.label}
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono whitespace-nowrap">
              {fmtDate(anomaly.timestamp)}
            </div>
          </div>

          <div className="text-sm text-slate-300 mt-2 leading-relaxed">
            {plainEnglishMessage(anomaly, info)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-xs">
            <Tile label="Where" value={
              <>
                <div className="font-mono text-slate-200">{anomaly.meter?.serial || '—'}</div>
                <div className="text-slate-500">
                  {anomaly.meter?.customerName || ''}
                  {anomaly.feeder?.name && <> · feeder {anomaly.feeder.name}</>}
                </div>
              </>
            } />
            {reading && (
              <Tile label="Measured" value={<div className="font-mono text-slate-200">{reading}</div>} />
            )}
            {threshold && (
              <Tile label="Safe limit" value={<div className="font-mono text-slate-200">{threshold}</div>} />
            )}
          </div>

          {info.action && (
            <div className="mt-3 text-xs text-slate-400 leading-relaxed">
              <span className="text-slate-500 uppercase tracking-wider mr-1.5">Recommended:</span>
              {info.action}
            </div>
          )}

          {!anomaly.acknowledged && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-slate-500">Click below once you&rsquo;ve reviewed this event.</span>
              <button
                onClick={onAck}
                className="text-xs px-3 py-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25"
              >
                ✓ Mark as reviewed
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-white/5 bg-bg/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="flex gap-2 leading-snug">
      <span className="text-slate-500 whitespace-nowrap">{label}:</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}

// ---------- Plain-English content for each anomaly type ----------

const ANOMALY_INFO = {
  overvoltage: {
    icon: '⚡',
    title: 'Overvoltage',
    explanation:
      'The voltage at this meter rose above the safe upper limit. The Indian standard is 230 V; anything above about 253 V (10% high) is flagged.',
    causes:
      'Sudden drop in load, faulty transformer tap settings, or a neutral wire problem.',
    matters:
      'High voltage stresses appliances. Sustained overvoltage shortens the life of motors, LEDs, and electronics.',
    action:
      'If many meters on one feeder show this together, check the transformer tap setting. If isolated to one meter, the issue is probably local wiring.',
  },
  undervoltage: {
    icon: '🪫',
    title: 'Undervoltage (voltage sag)',
    explanation:
      'The voltage at this meter dropped below the safe lower limit. Anything below about 207 V (10% low) is flagged.',
    causes:
      'A very heavy appliance starting up nearby, an overloaded feeder, or a poor connection somewhere upstream.',
    matters:
      'Motors and pumps run hot at low voltage, drawing extra current. Computers and refrigerators may brown out or restart unexpectedly.',
    action:
      'Brief dips (a few seconds) usually self-correct as the heavy load stabilises. Sustained sags need a field check of the feeder load and connections.',
  },
  current_spike: {
    icon: '🔥',
    title: 'Current spike',
    explanation:
      'The current drawn by this meter jumped well above what the connection is rated for — more than 2.5× the meter\'s peak design load.',
    causes:
      'A short circuit somewhere on the customer\'s side, a failing appliance, or someone connecting a load the meter wasn\'t sized for.',
    matters:
      'Spikes can trip breakers, melt wiring, or start fires. Critical-severity spikes almost always indicate equipment failure.',
    action:
      'Treat as urgent. The customer should unplug recent additions; field crew should inspect the meter and main panel.',
  },
  phase_imbalance: {
    icon: '⚖️',
    title: 'Phase imbalance',
    explanation:
      'On three-phase connections, the three phases should carry roughly equal voltage. When they drift apart by more than 5%, the meter flags it.',
    causes:
      'Uneven loading across the three phases (most common), a partially-failed transformer winding, or a single-phase fault feeding into a three-phase system.',
    matters:
      'Three-phase motors are particularly sensitive. Imbalance heats up the windings and shortens motor life dramatically — a 5% imbalance can reduce motor life by half.',
    action:
      'Rebalance loads across phases by moving circuits. If rebalancing doesn\'t help, the transformer needs inspection.',
  },
  outage: {
    icon: '🌑',
    title: 'Outage',
    explanation:
      'The meter has stopped reporting because its upstream feeder is faulted. All meters downstream of a failed feeder will lose power.',
    causes:
      'Equipment failure, a tripped protection device, scheduled maintenance, or in this demo, a manually triggered fault.',
    matters:
      'No electricity is being delivered. Every minute the outage continues adds to your SAIDI and ENS reliability indices.',
    action:
      'Restore the feeder from the Network page, or wait for the simulator/field crew. Check the Reliability page after restoration to see the impact.',
  },
};

const SEVERITY_STYLES = {
  critical: {
    label: 'Critical',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    border: 'border-rose-500/30',
    iconClass: 'drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]',
  },
  warning: {
    label: 'Warning',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    border: 'border-amber-500/25',
    iconClass: '',
  },
  info: {
    label: 'Info',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
    border: 'border-white/5',
    iconClass: '',
  },
};

// Format the raw `value`/`threshold` numbers with their proper unit.
function formatReading(type, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  switch (type) {
    case 'overvoltage':
    case 'undervoltage':
      return `${v.toFixed(1)} V`;
    case 'current_spike':
      return `${v.toFixed(1)} A`;
    case 'phase_imbalance':
      return `${v.toFixed(1)}%`;
    default:
      return v.toFixed(2);
  }
}

// Turn the raw `message` into a friendlier sentence with context.
function plainEnglishMessage(a, info) {
  const where = a.meter?.serial ? `Meter ${a.meter.serial}` : 'A meter';
  const customer = a.meter?.customerName ? ` (${a.meter.customerName})` : '';

  switch (a.type) {
    case 'overvoltage':
      return `${where}${customer} recorded ${Number(a.value).toFixed(1)} V — higher than the ${Number(a.threshold).toFixed(0)} V safe limit. ${info.matters}`;
    case 'undervoltage':
      return `${where}${customer} recorded only ${Number(a.value).toFixed(1)} V — below the ${Number(a.threshold).toFixed(0)} V safe minimum. ${info.matters}`;
    case 'current_spike':
      return `${where}${customer} drew ${Number(a.value).toFixed(1)} A — well over its rated ${Number(a.threshold).toFixed(0)} A. ${info.matters}`;
    case 'phase_imbalance':
      return `${where}${customer} shows ${Number(a.value).toFixed(1)}% imbalance between the three phases. ${info.matters}`;
    case 'outage':
      return `${where}${customer} stopped reporting because its upstream feeder went down.`;
    default:
      return a.message || 'Event detected.';
  }
}
