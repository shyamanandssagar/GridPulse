import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import Loader from '../components/Loader.jsx';
import { meters as metersApi, readings as readingsApi, downloadBillPdf } from '../services/api.js';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtKWh, fmtTime } from '../utils/format.js';

// MeterDetail rebuilt for both customers and admins.
// Customers see a friendly live view of their consumption + a clearly explained
// bill. Admins see the same plus extra technical readings (voltage, current,
// frequency, power factor, phase imbalance) and the raw last-reading dump.

const MAX = 80; // points kept on the live chart

export default function MeterDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [meter, setMeter] = useState(null);
  const [err, setErr] = useState(null);
  const [series, setSeries] = useState([]);
  const { socket } = useSocket();
  const lastTsRef = useRef(null);

  // Initial load: meter + recent history
  useEffect(() => {
    let alive = true;
    Promise.all([metersApi.get(id), readingsApi.recent(id, MAX)])
      .then(([m, rs]) => {
        if (!alive) return;
        setMeter(m);
        setSeries(rs.map((r) => ({
          t: new Date(r.timestamp).getTime(),
          powerKW: r.powerKW,
          voltage: r.voltage,
          current: r.current,
        })));
      })
      .catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [id]);

  // Subscribe to live readings for this meter
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('meter:subscribe', { meterId: id });

    const onReading = (r) => {
      const ts = new Date(r.timestamp).getTime();
      if (ts === lastTsRef.current) return;
      lastTsRef.current = ts;
      setSeries((prev) => {
        const next = [...prev, { t: ts, powerKW: r.powerKW, voltage: r.voltage, current: r.current }];
        if (next.length > MAX) next.shift();
        return next;
      });
    };
    socket.on('reading', onReading);
    return () => {
      socket.emit('meter:unsubscribe', { meterId: id });
      socket.off('reading', onReading);
    };
  }, [socket, id]);

  if (err) return (
    <div className="card p-6 border border-rose-500/30 bg-rose-500/5 text-rose-200">
      {err}
    </div>
  );
  if (!meter) return <Loader />;

  const latest = series[series.length - 1];
  const online = meter.status === 'online';

  // Friendly "right now" status: compare current power to base/peak load
  const usageNow = computeUsageState(latest?.powerKW, meter.baseLoadKW, meter.peakLoadKW, online);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/meters" className="text-xs text-accent hover:underline">← back to meters</Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{meter.serial}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {meter.customerName || <em className="text-slate-500">unnamed customer</em>}
            <span className="mx-2 text-slate-600">·</span>
            <span className="capitalize">{meter.loadProfile}</span>
            <span className="mx-2 text-slate-600">·</span>
            {meter.phases === 3 ? 'three-phase' : 'single-phase'}
            {meter.feeder?.name && (
              <>
                <span className="mx-2 text-slate-600">·</span>
                connected to <span className="text-slate-300">{meter.feeder.name}</span>
              </>
            )}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs border whitespace-nowrap ${
          online
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
        }`}>
          {online ? '● online' : '○ offline'}
        </span>
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="card p-4 border border-rose-500/30 bg-rose-500/5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🌑</span>
            <div>
              <div className="text-sm font-semibold text-rose-200">No power to this meter right now</div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                The meter is offline, usually because the upstream feeder ({meter.feeder?.name}) is faulted.
                Live values will show zero until power is restored. The most recent readings while the meter
                was online are still shown below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Right-now strip — plain English first */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <RightNowCard
          label="Right now"
          big={latest && online ? `${latest.powerKW.toFixed(2)} kW` : '—'}
          tone={usageNow.tone}
          subtitle={usageNow.label}
          hint={usageNow.hint}
        />
        <FriendlyCard
          label="Used this cycle"
          big={fmtKWh(meter.cumulativeKWh)}
          subtitle={meter.bill ? `${meter.bill.daysElapsed} of ${meter.bill.daysInCycle} days` : ''}
        />
        <FriendlyCard
          label="Current bill so far"
          big={meter.bill ? formatINR(meter.bill.total) : '—'}
          subtitle="includes duty + fixed charge"
          accent="text-emerald-300"
        />
        <FriendlyCard
          label="Projected total"
          big={meter.bill ? formatINR(meter.bill.projectedTotal) : '—'}
          subtitle="if usage stays the same"
          accent="text-amber-300"
        />
      </div>

      {/* Live consumption chart */}
      <LiveChart series={series} online={online} />

      {/* Admin-only technical readings */}
      {isAdmin && latest && online && (
        <TechnicalPanel latest={latest} meter={meter} />
      )}

      {/* Bill panel */}
      {meter.bill && <BillPanel bill={meter.bill} meter={meter} />}
    </div>
  );
}

// ============================================================
// Live chart
// ============================================================
function LiveChart({ series, online }) {
  if (series.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-3xl mb-3">⏳</div>
        <div className="text-sm text-slate-300 font-medium">Waiting for readings…</div>
        <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
          {online
            ? 'The meter is online but hasn\'t reported any readings yet. New samples arrive every second.'
            : 'No readings available — the meter has been offline. Once power is restored, live data will appear here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-sm text-slate-100 font-medium">Power consumption — last {series.length} samples</div>
          <div className="text-xs text-slate-500">
            One sample per second. The graph slides as new readings arrive.
          </div>
        </div>
        {online && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            live
          </div>
        )}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id="liveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={fmtTime}
              stroke="#64748b"
              fontSize={11}
              minTickGap={40}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              width={50}
              tickFormatter={(v) => `${v.toFixed(1)} kW`}
            />
            <Tooltip
              contentStyle={{ background: '#0b1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
              labelFormatter={fmtTime}
              formatter={(v) => [`${Number(v).toFixed(2)} kW`, 'Power']}
            />
            <Area
              type="monotone"
              dataKey="powerKW"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#liveGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================
// Admin-only technical readings
// ============================================================
function TechnicalPanel({ latest, meter }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs uppercase tracking-wider text-slate-400">Admin view — technical readings</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
          operator only
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Tile label="Voltage" value={`${latest.voltage.toFixed(1)} V`} hint="nominal 230 V" />
        <Tile label="Current" value={`${latest.current.toFixed(2)} A`} hint="instantaneous draw" />
        <Tile label="Real power" value={`${latest.powerKW.toFixed(2)} kW`} hint="P = V·I·pf" />
        <Tile
          label="Power factor"
          value={meter.lastReading?.powerFactor?.toFixed(2) || '—'}
          hint="1.0 = perfectly efficient"
        />
        <Tile
          label="Frequency"
          value={meter.lastReading?.frequency ? `${meter.lastReading.frequency.toFixed(2)} Hz` : '—'}
          hint="grid sync (~50 Hz)"
        />
      </div>
      {meter.phases === 3 && meter.lastReading?.phaseImbalance != null && (
        <div className="mt-3 text-xs text-slate-400">
          Phase imbalance:{' '}
          <span className={`font-mono ${meter.lastReading.phaseImbalance > 5 ? 'text-amber-300' : 'text-slate-200'}`}>
            {meter.lastReading.phaseImbalance.toFixed(2)}%
          </span>
          {meter.lastReading.phaseImbalance > 5 && (
            <span className="ml-2 text-amber-300">⚠️ above 5% threshold</span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Bill panel
// ============================================================
function BillPanel({ bill, meter }) {
  const [downloading, setDownloading] = useState(false);
  const [showHowItsCalculated, setShowHowItsCalculated] = useState(false);

  const dl = async () => {
    setDownloading(true);
    try {
      await downloadBillPdf(meter._id, `bill_${meter.serial}.pdf`);
    } finally { setDownloading(false); }
  };

  // Suggest savings: how much could the customer save by shifting peak usage to off-peak?
  const peakKWh = bill.consumed.peak || 0;
  const couldSave = peakKWh > 0 ? peakKWh * bill.effectiveRate * (1.5 - 0.7) : 0;

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm text-slate-100 font-medium">Your bill — current cycle</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {bill.daysElapsed} of {bill.daysInCycle} days · average rate ₹{bill.effectiveRate}/kWh
          </div>
        </div>
        <button
          onClick={dl}
          disabled={downloading}
          className="px-3 py-1.5 text-sm rounded-lg bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50"
        >
          {downloading ? 'Generating PDF…' : '⬇ Download bill PDF'}
        </button>
      </div>

      {/* The story, in plain English */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="text-sm text-slate-200 leading-relaxed">
          You&rsquo;ve used <strong className="text-slate-100">{bill.consumed.total} kWh</strong> of
          electricity over the last {bill.daysElapsed} days. So far, that comes to{' '}
          <strong className="text-emerald-300">{formatINR(bill.total)}</strong>.
          {' '}If your usage continues at the same pace, your final bill should be around{' '}
          <strong className="text-amber-300">{formatINR(bill.projectedTotal)}</strong>{' '}
          for {bill.projected.total} kWh total.
        </div>
      </div>

      {/* Time-of-Use consumption */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-slate-500">Time-of-Use breakdown</div>
          <div className="text-[10px] text-slate-500">when you used electricity matters</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TouTile
            label="Off-peak"
            timeRange="11 PM–6 AM"
            multiplier="30% cheaper"
            kWh={bill.consumed.offpeak}
            tone="emerald"
            tip="Best time to run washing machines, geysers, EVs"
          />
          <TouTile
            label="Normal"
            timeRange="6 AM–6 PM"
            multiplier="standard rate"
            kWh={bill.consumed.normal}
            tone="slate"
            tip="Most daytime use sits here"
          />
          <TouTile
            label="Peak"
            timeRange="6 PM–10 PM"
            multiplier="50% extra"
            kWh={bill.consumed.peak}
            tone="rose"
            tip="Cooking, AC, and TV all run at peak hours"
          />
        </div>
      </div>

      {/* Savings tip */}
      {couldSave > 5 && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
          <div className="flex items-start gap-2">
            <span className="text-lg">💡</span>
            <div className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-sky-200">Savings tip:</strong> You used{' '}
              <strong>{peakKWh.toFixed(1)} kWh</strong> during peak hours (6 PM–10 PM) — that
              electricity costs 50% more than normal. Shifting it to off-peak hours (11 PM–6 AM)
              could save you roughly{' '}
              <strong className="text-emerald-300">{formatINR(couldSave)}</strong>{' '}
              over a full cycle.
            </div>
          </div>
        </div>
      )}

      {/* How it's calculated */}
      <div>
        <button
          onClick={() => setShowHowItsCalculated((v) => !v)}
          className="text-xs text-slate-400 hover:text-accent transition-colors flex items-center gap-1"
        >
          <span className="inline-block w-3">{showHowItsCalculated ? '−' : '+'}</span>
          {showHowItsCalculated ? 'Hide bill breakdown' : 'How is this bill calculated?'}
        </button>
        {showHowItsCalculated && (
          <div className="mt-3 space-y-4">
            {/* Slab breakdown */}
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Slab pricing — the more you use, the higher the rate per kWh
              </div>
              <div className="overflow-x-auto scrollbar-thin rounded-lg border border-white/5">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500 bg-bg/40">
                    <tr>
                      <th className="py-2 px-3">Usage band</th>
                      <th className="py-2 px-3">Your usage</th>
                      <th className="py-2 px-3">Rate</th>
                      <th className="py-2 px-3 text-right">Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.slabBreakdown.map((s, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-1.5 px-3 font-mono text-xs">{s.from}–{s.to} kWh</td>
                        <td className="py-1.5 px-3 font-mono">{s.kWh.toFixed(2)} kWh</td>
                        <td className="py-1.5 px-3 font-mono">₹{s.rate.toFixed(2)}/kWh</td>
                        <td className="py-1.5 px-3 font-mono text-right">{formatINR(s.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1.5 text-sm">
              <Line2 label="Energy charges (slab pricing)" value={formatINR(bill.slabBreakdown.reduce((s, x) => s + x.amount, 0))} />
              <Line2 label="Peak-hour surcharge" value={`+ ${formatINR(bill.peakSurcharge)}`} hint="50% extra on peak-time usage" />
              <Line2 label="Off-peak discount" value={`− ${formatINR(bill.offpeakDiscount)}`} hint="30% off on late-night usage" tone="good" />
              <Line2 label="Fixed service charge" value={formatINR(bill.fixedCharge)} hint="monthly base fee" />
              <div className="h-px bg-white/10 my-2" />
              <Line2 label="Subtotal" value={formatINR(bill.subtotal)} bold />
              <Line2 label={`Electricity duty (${bill.dutyPct}%)`} value={formatINR(bill.duty)} hint="state government tax" />
              <div className="h-px bg-white/10 my-2" />
              <Line2 label="Total so far" value={formatINR(bill.total)} bold big />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TouTile({ label, timeRange, multiplier, kWh, tone, tip }) {
  const tones = {
    emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-300' },
    rose: { border: 'border-rose-500/30', bg: 'bg-rose-500/5', text: 'text-rose-300' },
    slate: { border: 'border-white/10', bg: 'bg-bg/40', text: 'text-slate-100' },
  }[tone];
  return (
    <div className={`rounded-lg border ${tones.border} ${tones.bg} p-3`}>
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-300">{label}</div>
        <div className="text-[10px] text-slate-500">{timeRange}</div>
      </div>
      <div className={`font-mono text-xl mt-1 ${tones.text}`}>
        {kWh.toFixed(1)} <span className="text-xs text-slate-500">kWh</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{multiplier}</div>
      <div className="text-xs text-slate-400 mt-2 leading-relaxed">{tip}</div>
    </div>
  );
}

function Line2({ label, value, hint, bold, big, tone }) {
  const valueClass =
    tone === 'good' ? 'text-emerald-300'
    : '';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="text-slate-300">
        {bold ? <strong className="text-slate-100">{label}</strong> : label}
        {hint && <span className="text-xs text-slate-500 ml-2">· {hint}</span>}
      </div>
      <div className={`font-mono ${big ? 'text-xl' : ''} ${bold ? 'text-slate-100' : 'text-slate-200'} ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

// ---------- Smaller components & helpers ----------

function RightNowCard({ label, big, subtitle, hint, tone }) {
  const bigClass =
    tone === 'good' ? 'text-emerald-300'
    : tone === 'warn' ? 'text-amber-300'
    : tone === 'bad' ? 'text-rose-300'
    : 'text-slate-100';
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-2xl mt-1 ${bigClass}`}>{big}</div>
      {subtitle && <div className="text-xs text-slate-300 mt-1">{subtitle}</div>}
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function FriendlyCard({ label, big, subtitle, accent }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-2xl mt-1 ${accent || 'text-slate-100'}`}>{big}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-white/5 bg-bg/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-slate-200 mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function computeUsageState(powerKW, base, peak, online) {
  if (!online || powerKW == null) {
    return { tone: 'bad', label: 'No power', hint: 'meter is offline' };
  }
  if (powerKW < base * 0.5) {
    return { tone: 'good', label: 'Very low', hint: 'only minimal appliances running' };
  }
  if (powerKW < base * 1.2) {
    return { tone: 'good', label: 'Normal use', hint: 'around the usual draw for this connection' };
  }
  if (powerKW < peak * 0.8) {
    return { tone: 'warn', label: 'Heavy use', hint: 'a lot of appliances running' };
  }
  return { tone: 'bad', label: 'Near capacity', hint: 'close to this meter\'s peak rating' };
}

function formatINR(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `₹ ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
