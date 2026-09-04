import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import StatCard from '../components/StatCard.jsx';
import Loader from '../components/Loader.jsx';
import { analytics } from '../services/api.js';
import { fmtDate } from '../utils/format.js';

// Reliability page rebuilt for non-engineer operators.
// Instead of just showing the five IEEE 1366 numbers, each index gets:
//   • a plain-English plate ("on average, each customer had X outages")
//   • a health badge (good / fair / poor) based on rough industry benchmarks
//   • a worked-example panel that shows how this number was computed for THIS data
//   • the formal formula for anyone who wants the math
//
// Benchmarks below are rough utility-industry rules of thumb — useful for a
// classroom/demo system. A real DISCOM would tune these to their regulator's bands.

export default function Reliability() {
  const [days, setDays] = useState(30);
  const [indices, setIndices] = useState(null);
  const [outages, setOutages] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([analytics.reliability(days), analytics.outages()]).then(([r, o]) => {
      if (!alive) return;
      setIndices(r);
      setOutages(o);
    });
    return () => { alive = false; };
  }, [days]);

  // Aggregated totals for the worked examples (derived from outages list)
  const totals = useMemo(() => {
    if (!outages || !indices) return null;
    const inWindow = outages.filter((o) => new Date(o.startedAt) >= new Date(indices.window.from));
    const totalCustomerHours = inWindow.reduce((s, o) => {
      const end = o.restoredAt ? new Date(o.restoredAt) : new Date();
      const h = Math.max(0, (end - new Date(o.startedAt)) / 3_600_000);
      return s + (o.affectedMeters || 0) * h;
    }, 0);
    const totalCustomerInterruptions = inWindow.reduce(
      (s, o) => s + (o.affectedMeters || 0), 0
    );
    const totalEns = inWindow.reduce((s, o) => {
      const end = o.restoredAt ? new Date(o.restoredAt) : new Date();
      const h = Math.max(0, (end - new Date(o.startedAt)) / 3_600_000);
      return s + (o.affectedLoadKW || 0) * h;
    }, 0);
    return { totalCustomerHours, totalCustomerInterruptions, totalEns };
  }, [outages, indices]);

  if (!indices || !outages) return <Loader />;

  const overall = overallVerdict(indices);

  const chartData = outages.slice(0, 20).reverse().map((o) => ({
    name: o.feederName?.slice(0, 12) || 'feeder',
    duration: Number(((o.restoredAt ? new Date(o.restoredAt) - new Date(o.startedAt) : Date.now() - new Date(o.startedAt)) / 3_600_000).toFixed(2)),
    affected: o.affectedMeters,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Reliability</h1>
          <p className="text-slate-400 text-sm">How well your grid kept the lights on over the last {days} days.</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ml-auto bg-bg/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Plain-English summary banner */}
      <div className={`card p-5 border ${overall.borderClass}`}>
        <div className="flex items-start gap-4">
          <div className={`text-3xl ${overall.iconClass}`}>{overall.icon}</div>
          <div className="flex-1">
            <div className={`text-sm font-semibold ${overall.titleClass}`}>{overall.title}</div>
            <p className="text-slate-300 text-sm mt-1 leading-relaxed">{overall.summary(indices)}</p>
            <div className="text-xs text-slate-500 mt-2">
              Based on {indices.eventsConsidered} outage event{indices.eventsConsidered === 1 ? '' : 's'} affecting {indices.totalCustomers} customers over {indices.window.hours.toFixed(0)} hours.
            </div>
          </div>
        </div>
      </div>

      {/* Five indices as explained cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IndexCard
          name="SAIFI"
          fullName="System Average Interruption Frequency Index"
          value={indices.saifi.toFixed(3)}
          unit="outages per customer"
          plainEnglish={`On average, each customer had ${indices.saifi.toFixed(2)} power interruption${indices.saifi === 1 ? '' : 's'} in this period.`}
          health={healthOf('saifi', indices.saifi, days)}
          example={totals && indices.totalCustomers > 0 ? {
            formula: 'Total customer-interruptions ÷ Total customers',
            numbers: `${totals.totalCustomerInterruptions} ÷ ${indices.totalCustomers} = ${(totals.totalCustomerInterruptions / indices.totalCustomers).toFixed(3)}`,
            explainer: `If 3 customers lost power in one outage and 5 in another, that's 8 "customer-interruptions". Divide by the total ${indices.totalCustomers} customers to get the per-customer average.`,
          } : null}
        />

        <IndexCard
          name="SAIDI"
          fullName="System Average Interruption Duration Index"
          value={indices.saidi.toFixed(3)}
          unit="hours per customer"
          plainEnglish={`On average, each customer was without power for ${formatHours(indices.saidi)} in this period.`}
          health={healthOf('saidi', indices.saidi, days)}
          example={totals && indices.totalCustomers > 0 ? {
            formula: 'Total customer-hours of outage ÷ Total customers',
            numbers: `${totals.totalCustomerHours.toFixed(2)} ÷ ${indices.totalCustomers} = ${(totals.totalCustomerHours / indices.totalCustomers).toFixed(3)}`,
            explainer: `An outage hitting 5 customers for 2 hours counts as 10 "customer-hours". Sum across every outage, then divide by total customers.`,
          } : null}
        />

        <IndexCard
          name="CAIDI"
          fullName="Customer Average Interruption Duration Index"
          value={indices.caidi.toFixed(3)}
          unit="hours per outage"
          plainEnglish={
            indices.saifi > 0
              ? `When an outage did happen, it lasted ${formatHours(indices.caidi)} on average before power came back.`
              : 'No outages this period, so there is no average duration to report.'
          }
          health={healthOf('caidi', indices.caidi, days)}
          example={indices.saifi > 0 ? {
            formula: 'SAIDI ÷ SAIFI',
            numbers: `${indices.saidi.toFixed(3)} ÷ ${indices.saifi.toFixed(3)} = ${indices.caidi.toFixed(3)}`,
            explainer: `SAIFI tells you how often outages happen; SAIDI tells you total outage time. Dividing one by the other gives you the typical length of a single outage.`,
          } : null}
        />

        <IndexCard
          name="ASAI"
          fullName="Average Service Availability Index"
          value={`${indices.asaiPercent.toFixed(4)}%`}
          unit="uptime"
          plainEnglish={`The grid was supplying power ${indices.asaiPercent.toFixed(2)}% of the time. Customers experienced power for roughly ${(indices.window.hours * indices.asaiPercent / 100).toFixed(1)} out of every ${indices.window.hours.toFixed(0)} hours.`}
          health={healthOf('asai', indices.asaiPercent, days)}
          example={{
            formula: '(Customer-hours possible − Customer-hours of outage) ÷ Customer-hours possible',
            numbers: `(${indices.totalCustomers} × ${indices.window.hours.toFixed(0)} − ${totals ? totals.totalCustomerHours.toFixed(2) : '0'}) ÷ (${indices.totalCustomers} × ${indices.window.hours.toFixed(0)}) = ${(indices.asai).toFixed(6)}`,
            explainer: `If your ${indices.totalCustomers} customers could each have received power for the full ${indices.window.hours.toFixed(0)} hours, that's ${(indices.totalCustomers * indices.window.hours).toFixed(0)} customer-hours possible. Subtract the customer-hours actually lost, divide by what was possible — that's your uptime fraction.`,
          }}
          accentGood={indices.asaiPercent >= 99.97}
        />

        <IndexCard
          name="ENS"
          fullName="Energy Not Supplied"
          value={indices.ens.toFixed(2)}
          unit="kWh of energy lost"
          plainEnglish={`Roughly ${indices.ens.toFixed(0)} kWh of electricity could not be delivered to customers due to outages. ${indices.ens > 0 ? `That's about ${(indices.ens * 7).toFixed(0)} rupees of unbilled energy at typical residential rates.` : ''}`}
          health={healthOf('ens', indices.ens, days)}
          example={{
            formula: 'Σ (load on affected section × outage duration)',
            numbers: `summed across ${indices.eventsConsidered} outage event${indices.eventsConsidered === 1 ? '' : 's'} = ${indices.ens.toFixed(2)} kWh`,
            explainer: `For each outage, multiply how much load was on the dead section by how long it stayed down. Add them all up. This is energy your customers couldn't use — and you couldn't bill for.`,
          }}
          full
        />
      </div>

      {/* Outage chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="text-sm text-slate-200 font-medium">Recent outage durations</div>
            <div className="text-xs text-slate-500">Each bar is one outage event. Taller bars are longer outages.</div>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} label={{ value: 'hours', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0b1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                formatter={(v, name) => [v, name === 'duration' ? 'Hours' : 'Meters affected']}
              />
              <Bar dataKey="duration" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Outage history */}
      <div className="card overflow-x-auto scrollbar-thin">
        <div className="px-4 py-3 border-b border-white/5">
          <div className="text-sm text-slate-200 font-medium">Outage history</div>
          <div className="text-xs text-slate-500">Every outage event in the system, newest first.</div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/5">
            <tr>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Restored</th>
              <th className="px-4 py-3">Feeder</th>
              <th className="px-4 py-3">Affected meters</th>
              <th className="px-4 py-3">Load (kW)</th>
              <th className="px-4 py-3">Duration</th>
            </tr>
          </thead>
          <tbody>
            {outages.map((o) => {
              const ended = o.restoredAt ? new Date(o.restoredAt) : null;
              const durationH = (ended ? ended - new Date(o.startedAt) : Date.now() - new Date(o.startedAt)) / 3_600_000;
              return (
                <tr key={o._id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs">{fmtDate(o.startedAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {ended ? fmtDate(ended) : <span className="text-rose-400">ongoing</span>}
                  </td>
                  <td className="px-4 py-3">{o.feederName}</td>
                  <td className="px-4 py-3">{o.affectedMeters}</td>
                  <td className="px-4 py-3 font-mono">{o.affectedLoadKW?.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono">{durationH.toFixed(2)} h</td>
                </tr>
              );
            })}
            {outages.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No outage events recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">
        Standard reference: IEEE Std 1366. Health bands shown are rough utility benchmarks for
        comparison — your local regulator may define different targets. Indices are computed over
        the selected window; ongoing outages count from start to now.
      </div>
    </div>
  );
}

// ---------- Components & helpers ----------

function IndexCard({ name, fullName, value, unit, plainEnglish, health, example, accentGood, full }) {
  const [showMath, setShowMath] = useState(false);
  return (
    <div className={`card p-5 space-y-3 ${full ? 'md:col-span-2' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg text-accent font-semibold">{name}</span>
            <HealthBadge level={health.level} />
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{fullName}</div>
        </div>
        <div className="text-right">
          <div className={`font-mono text-2xl ${accentGood ? 'text-emerald-300' : 'text-slate-100'}`}>{value}</div>
          <div className="text-xs text-slate-500">{unit}</div>
        </div>
      </div>

      <div className="text-sm text-slate-300 leading-relaxed">{plainEnglish}</div>

      <div className="flex items-center gap-2 text-xs">
        <span className={`px-2 py-0.5 rounded-full border ${health.classes}`}>
          {health.label}
        </span>
        <span className="text-slate-500">{health.reason}</span>
      </div>

      {example && (
        <div className="pt-2 border-t border-white/5">
          <button
            onClick={() => setShowMath((v) => !v)}
            className="text-xs text-slate-400 hover:text-accent transition-colors flex items-center gap-1"
          >
            <span className="inline-block w-3">{showMath ? '−' : '+'}</span>
            {showMath ? 'Hide the math' : 'How is this number calculated?'}
          </button>
          {showMath && (
            <div className="mt-2 bg-bg/40 rounded-lg p-3 space-y-2 text-xs">
              <div>
                <span className="text-slate-500 uppercase tracking-wider">Formula</span>
                <div className="font-mono text-slate-200 mt-0.5">{example.formula}</div>
              </div>
              <div>
                <span className="text-slate-500 uppercase tracking-wider">For your data</span>
                <div className="font-mono text-accent mt-0.5">{example.numbers}</div>
              </div>
              <div className="text-slate-400 leading-relaxed">{example.explainer}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthBadge({ level }) {
  const styles = {
    good:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    fair:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
    poor:  'bg-rose-500/15 text-rose-300 border-rose-500/30',
    none:  'bg-white/5 text-slate-400 border-white/10',
  };
  const dots = { good: '●', fair: '●', poor: '●', none: '○' };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${styles[level]} flex items-center gap-1`}>
      <span>{dots[level]}</span>
      <span className="uppercase tracking-wider">{level === 'none' ? 'n/a' : level}</span>
    </span>
  );
}

// ---------- Plain-English helpers ----------

// "0.42 hours" → "25 minutes"; "3.5 hours" → "3 hr 30 min"
function formatHours(h) {
  if (!h || h <= 0) return '0 minutes';
  if (h < 1) return `${Math.round(h * 60)} minute${Math.round(h * 60) === 1 ? '' : 's'}`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 0) return `${whole} hour${whole === 1 ? '' : 's'}`;
  return `${whole} hr ${mins} min`;
}

// Rough utility benchmarks. These are scaled to the analysis window so a
// 7-day SAIFI of 0.3 isn't compared against an annual benchmark.
// Sources: rough US/IEEE rules of thumb, scaled.
function healthOf(metric, value, days) {
  const yearlyScale = 365 / days; // multiply window value by this to estimate annual

  if (metric === 'saifi') {
    const annual = value * yearlyScale; // interruptions/customer/year
    if (annual <= 1.0) return { level: 'good', label: 'Good', classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', reason: `≈ ${annual.toFixed(2)} per customer per year` };
    if (annual <= 2.5) return { level: 'fair', label: 'Fair', classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30', reason: `≈ ${annual.toFixed(2)} per customer per year` };
    return { level: 'poor', label: 'Needs attention', classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30', reason: `≈ ${annual.toFixed(2)} per customer per year — typical target is < 1.5` };
  }
  if (metric === 'saidi') {
    const annualMin = value * yearlyScale * 60; // minutes/customer/year
    if (annualMin <= 90) return { level: 'good', label: 'Good', classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', reason: `≈ ${annualMin.toFixed(0)} minutes per customer per year` };
    if (annualMin <= 240) return { level: 'fair', label: 'Fair', classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30', reason: `≈ ${annualMin.toFixed(0)} minutes per customer per year` };
    return { level: 'poor', label: 'Needs attention', classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30', reason: `≈ ${annualMin.toFixed(0)} minutes per customer per year — typical target is < 180` };
  }
  if (metric === 'caidi') {
    if (value <= 0) return { level: 'none', label: 'No outages', classes: 'bg-white/5 text-slate-400 border-white/10', reason: 'no events in window' };
    if (value <= 1.5) return { level: 'good', label: 'Fast restoration', classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', reason: 'crews restore power quickly' };
    if (value <= 3) return { level: 'fair', label: 'Average restoration', classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30', reason: 'restoration time is typical' };
    return { level: 'poor', label: 'Slow restoration', classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30', reason: 'outages take a long time to fix' };
  }
  if (metric === 'asai') {
    if (value >= 99.97) return { level: 'good', label: '"Three-nines" reliability', classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', reason: 'industry-leading availability' };
    if (value >= 99.9) return { level: 'fair', label: 'Acceptable', classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30', reason: 'meets most utility targets' };
    return { level: 'poor', label: 'Below target', classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30', reason: 'most utilities aim for > 99.9%' };
  }
  if (metric === 'ens') {
    if (value === 0) return { level: 'good', label: 'No lost energy', classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', reason: 'every kWh was delivered' };
    if (value < 50) return { level: 'fair', label: 'Minor losses', classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30', reason: 'a handful of kWh lost' };
    return { level: 'poor', label: 'Significant losses', classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30', reason: 'meaningful energy was not delivered' };
  }
  return { level: 'none', label: '—', classes: '', reason: '' };
}

// One-line summary at the top
function overallVerdict(indices) {
  // Take ASAI as the single best summary metric — it captures both frequency and duration
  if (indices.eventsConsidered === 0) {
    return {
      icon: '✅', iconClass: 'text-emerald-400', title: 'Grid is healthy',
      titleClass: 'text-emerald-300', borderClass: 'border-emerald-500/30',
      summary: () => `No outage events recorded in this period. Your customers had uninterrupted power across all ${indices.totalCustomers} meters.`,
    };
  }
  if (indices.asaiPercent >= 99.97) {
    return {
      icon: '✅', iconClass: 'text-emerald-400', title: 'Grid is performing well',
      titleClass: 'text-emerald-300', borderClass: 'border-emerald-500/30',
      summary: (i) => `Power was available ${i.asaiPercent.toFixed(2)}% of the time. Outages were short or affected very few customers. Keep doing what you're doing.`,
    };
  }
  if (indices.asaiPercent >= 99.9) {
    return {
      icon: '⚠️', iconClass: 'text-amber-300', title: 'Grid is acceptable, with room to improve',
      titleClass: 'text-amber-200', borderClass: 'border-amber-500/30',
      summary: (i) => `Power was available ${i.asaiPercent.toFixed(2)}% of the time. This meets typical utility targets, but the ${i.eventsConsidered} outage event${i.eventsConsidered === 1 ? '' : 's'} are worth reviewing to see if any pattern explains them.`,
    };
  }
  return {
    icon: '🚨', iconClass: 'text-rose-400', title: 'Reliability needs attention',
    titleClass: 'text-rose-300', borderClass: 'border-rose-500/30',
    summary: (i) => `Power was only available ${i.asaiPercent.toFixed(2)}% of the time. Customers experienced an average of ${formatHours(i.saidi)} without power and ${i.saifi.toFixed(2)} outage${i.saifi === 1 ? '' : 's'} each. Investigate the ${i.eventsConsidered} event${i.eventsConsidered === 1 ? '' : 's'} below.`,
  };
}
