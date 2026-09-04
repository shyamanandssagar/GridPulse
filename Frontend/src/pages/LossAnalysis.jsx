import { useEffect, useState, useCallback } from 'react';
import Loader from '../components/Loader.jsx';
import StatCard from '../components/StatCard.jsx';
import { analytics } from '../services/api.js';

// Loss Analysis rebuilt for non-engineer operators.
// The page now leads with a one-paragraph explanation of what loss analysis is,
// follows with a plain-English overall verdict, then for each feeder leads with
// a friendly verdict ("looks normal" / "worth checking" / "likely theft") before
// the raw numbers. Suspect meters translate engineering terms ("tampering factor
// 0.65") into plain language ("reporting only 65% of actual usage").

export default function LossAnalysis() {
  const [data, setData] = useState(null);
  const [windowMinutes, setWindowMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const load = useCallback(() => {
    analytics.lossAnalysis(windowMinutes).then(setData).catch((e) => setMsg(e.message));
  }, [windowMinutes]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const inject = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await analytics.injectTheft(8);
      setMsg(`Tampering simulated on ${r.injected} random meter(s). Watch the suspect list below — they should appear within about 30 seconds as fresh readings arrive.`);
      setTimeout(load, 5000);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    if (!confirm('Reset every meter back to honest reporting? This clears all simulated tampering.')) return;
    setBusy(true); setMsg(null);
    try {
      const r = await analytics.clearTheft();
      setMsg(`Reset ${r.reset} meter(s) to honest reporting.`);
      setTimeout(load, 5000);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  if (!data) return <Loader />;

  const overall = overallVerdict(data.overall);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Energy Balance &amp; Loss Detection</h1>
          <p className="text-slate-400 text-sm max-w-2xl">
            Finds feeders where customers are using more electricity than they&rsquo;re reporting — a strong indicator of meter tampering or theft.
          </p>
        </div>
        <select
          value={windowMinutes}
          onChange={(e) => setWindowMinutes(Number(e.target.value))}
          className="bg-bg/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value={15}>Last 15 min</option>
          <option value={30}>Last 30 min</option>
          <option value={60}>Last 60 min</option>
          <option value={180}>Last 3 hours</option>
        </select>
      </div>

      {/* Explainer: what is this page? */}
      <div className="card p-5 border border-sky-500/20 bg-sky-500/5">
        <button
          onClick={() => setShowHowItWorks((v) => !v)}
          className="flex items-center gap-2 text-sm text-sky-200 font-medium hover:text-sky-100"
        >
          <span className="text-lg">💡</span>
          <span>How does this page work?</span>
          <span className="text-xs text-slate-400 ml-1">{showHowItWorks ? '(hide)' : '(show)'}</span>
        </button>
        {showHowItWorks && (
          <div className="mt-4 space-y-4 text-sm text-slate-300 leading-relaxed">
            <p>
              On every feeder we compare two things: the electricity we{' '}
              <strong className="text-slate-100">expect</strong> customers to be using right now
              (based on their installed load and time of day), and the electricity they&rsquo;re actually{' '}
              <strong className="text-slate-100">reporting</strong> through their meters.
            </p>
            <div className="grid grid-cols-3 gap-3 my-4">
              <Box title="Expected" hint="What customers should be using" value="based on installed load × time-of-day demand" tone="slate" />
              <Box title="Reported" hint="What meters are sending us" value="average power from recent readings" tone="slate" />
              <Box title="Loss" hint="The gap between them" value="Expected − Reported" tone="amber" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <Band label="< 8% loss" tone="emerald">
                <strong>Normal.</strong> Some loss is unavoidable — heat in wires and transformers always eats a small share. This is called <em>technical loss</em>.
              </Band>
              <Band label="8–15% loss" tone="amber">
                <strong>Worth checking.</strong> Either equipment is degrading, or a meter or two might be under-reporting. Investigate the suspects.
              </Band>
              <Band label="> 15% loss" tone="rose">
                <strong>Likely theft.</strong> Wires don&rsquo;t lose this much heat. The most common cause is meter tampering — bypass wires that let current flow without being counted.
              </Band>
            </div>
          </div>
        )}
      </div>

      {/* Plain-English overall verdict banner */}
      <div className={`card p-5 border ${overall.borderClass}`}>
        <div className="flex items-start gap-4">
          <div className={`text-3xl ${overall.iconClass}`}>{overall.icon}</div>
          <div className="flex-1">
            <div className={`text-sm font-semibold ${overall.titleClass}`}>{overall.title}</div>
            <p className="text-slate-300 text-sm mt-1 leading-relaxed">{overall.summary}</p>
            <div className="text-xs text-slate-500 mt-2">
              Analysis based on the last {data.window.minutes} minutes of meter readings.
              {data.overall.flaggedFeeders > 0 && ` ${data.overall.flaggedFeeders} of ${data.overall.totalFeeders} feeders need attention.`}
            </div>
          </div>
        </div>
      </div>

      {/* Demo controls — clearly labeled as safe/reversible */}
      <div className="card p-4 border-amber-500/20 bg-amber-500/5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[280px]">
            <div className="text-sm text-amber-200 font-medium flex items-center gap-2">
              <span>🧪</span> Demo controls
            </div>
            <div className="text-xs text-slate-400 mt-1 leading-relaxed">
              <strong>Inject simulated theft:</strong> randomly pick 8 honest meters and make them
              under-report their usage by 20–60%. About 30 seconds later they should appear in the
              suspect list below.{' '}
              <strong>Reset to honest:</strong> undo all simulated theft. Safe to run anytime —
              this only changes simulated meter behavior, not real billing.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={inject}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 whitespace-nowrap"
            >
              ⚡ Simulate theft
            </button>
            <button
              onClick={clear}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 disabled:opacity-50 whitespace-nowrap"
            >
              Reset to honest
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className="card px-4 py-2 text-sm text-slate-200 border-accent/30">{msg}</div>
      )}

      {/* Overall numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Expected (whole grid)" value={data.overall.expectedKW} suffix="kW" hint="what customers should be using" />
        <StatCard label="Reported (whole grid)" value={data.overall.reportedKW} suffix="kW" hint="what meters are reporting" />
        <StatCard
          label="Loss"
          value={`${data.overall.lossPct}%`}
          accent={data.overall.lossPct > 15 ? 'bad' : data.overall.lossPct > 8 ? 'warn' : 'good'}
          hint={`${data.overall.lossKW} kW unaccounted right now`}
        />
        <StatCard
          label="Feeders to check"
          value={`${data.overall.flaggedFeeders} of ${data.overall.totalFeeders}`}
          accent={data.overall.flaggedFeeders > 0 ? 'warn' : 'good'}
          hint={data.overall.flaggedFeeders > 0 ? 'see table below' : 'all looking healthy'}
        />
      </div>

      {/* Feeder breakdown */}
      <div className="card overflow-x-auto scrollbar-thin">
        <div className="px-4 py-3 border-b border-white/5">
          <div className="text-sm text-slate-200 font-medium">Feeders, sorted by loss</div>
          <div className="text-xs text-slate-500">
            Each row is one lateral feeder. Click <em>Show suspects</em> to see which specific meters are likely tampered.
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/5">
            <tr>
              <th className="px-4 py-3">Feeder</th>
              <th className="px-4 py-3">Meters</th>
              <th className="px-4 py-3">Loss</th>
              <th className="px-4 py-3">Verdict</th>
              <th className="px-4 py-3">Suspects</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.feeders.map((f) => (
              <FeederRow
                key={String(f.feederId)}
                feeder={f}
                expanded={expanded === String(f.feederId)}
                onToggle={() => setExpanded(expanded === String(f.feederId) ? null : String(f.feederId))}
              />
            ))}
            {data.feeders.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No data yet — wait for the simulator to publish a few ticks.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">
        <strong className="text-slate-400">Methodology:</strong> for every lateral feeder, expected
        load = Σ (each meter&rsquo;s base load × current time-of-day demand factor). Reported load =
        Σ (each meter&rsquo;s average reported power over the selected window). Loss % = max(0,
        expected − reported) ÷ expected. Meters reporting more than 20% below expected are flagged
        as suspects. These thresholds are tunable rules of thumb — a real DISCOM would calibrate
        them against historical baseline losses per area.
      </div>
    </div>
  );
}

function FeederRow({ feeder, expanded, onToggle }) {
  const v = feederVerdict(feeder);
  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/5">
        <td className="px-4 py-3">
          <div className="font-mono">{feeder.feederName}</div>
          <div className="text-xs text-slate-500">
            Expected {feeder.expectedKW} kW · reporting {feeder.reportedKW} kW
          </div>
        </td>
        <td className="px-4 py-3">{feeder.meterCount}</td>
        <td className="px-4 py-3 font-mono">
          <span className={feeder.lossPct > 15 ? 'text-rose-300' : feeder.lossPct > 8 ? 'text-amber-300' : 'text-emerald-300'}>
            {feeder.lossPct}%
          </span>
          <div className="text-xs text-slate-500">{feeder.lossKW} kW unaccounted</div>
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-1 rounded-full text-xs border ${v.classes} whitespace-nowrap`}>
            {v.icon} {v.label}
          </span>
          <div className="text-xs text-slate-500 mt-1 max-w-[280px]">{v.reason}</div>
        </td>
        <td className="px-4 py-3">
          <span className={feeder.suspectedMeters.length > 0 ? 'text-rose-300' : 'text-slate-500'}>
            {feeder.suspectedMeters.length}
          </span>
        </td>
        <td className="px-4 py-3">
          {feeder.suspectedMeters.length > 0 && (
            <button onClick={onToggle} className="text-xs text-accent hover:underline whitespace-nowrap">
              {expanded ? 'Hide' : 'Show'} suspects
            </button>
          )}
        </td>
      </tr>
      {expanded && feeder.suspectedMeters.length > 0 && (
        <tr className="bg-bg-card/40 border-b border-white/5">
          <td colSpan={6} className="px-4 py-4">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">
              Suspect meters on {feeder.feederName}
            </div>
            <div className="text-xs text-slate-400 mb-3 leading-relaxed">
              These meters are reporting much less power than expected. The most likely cause is meter tampering —
              for example, a bypass wire that lets some current flow without going through the meter. Field
              investigation is recommended for any meter under-reporting by more than 30%.
            </div>
            <div className="space-y-2">
              {feeder.suspectedMeters.map((m) => (
                <SuspectRow key={String(m.meterId)} meter={m} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SuspectRow({ meter }) {
  // Translate engineering terms into plain language
  const reportingPct = Math.round(meter.tamperingFactor * 100);
  const isCritical = meter.deviationPct > 30;

  return (
    <div
      className={`rounded-lg border p-3 ${isCritical ? 'bg-rose-500/5 border-rose-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="font-mono text-accent text-sm">{meter.serial}</div>
          <div className="text-sm text-slate-200">{meter.customerName || <em className="text-slate-500">unnamed customer</em>}</div>
        </div>
        <div className="text-right">
          <div className={`text-xs uppercase tracking-wider ${isCritical ? 'text-rose-300' : 'text-amber-300'}`}>
            Under-reporting by
          </div>
          <div className={`font-mono text-xl ${isCritical ? 'text-rose-200' : 'text-amber-200'}`}>
            {meter.deviationPct}%
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-300 leading-relaxed">
        Should be using <strong className="font-mono">{meter.expectedKW} kW</strong>, but only
        reporting <strong className="font-mono">{meter.reportedKW} kW</strong>.
        Meter is registering roughly <strong>{reportingPct}%</strong> of the actual electricity used.
        {isCritical && <span className="text-rose-300"> Recommend field inspection.</span>}
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function Box({ title, hint, value, tone }) {
  const tones = {
    slate: 'bg-bg/40 border-white/10',
    amber: 'bg-amber-500/10 border-amber-500/30',
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wider text-slate-400">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
      <div className="text-xs text-slate-200 mt-2 leading-snug">{value}</div>
    </div>
  );
}

function Band({ label, tone, children }) {
  const tones = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-100',
    rose: 'bg-rose-500/10 border-rose-500/30 text-rose-100',
  };
  return (
    <div className={`rounded-lg border p-3 leading-relaxed ${tones[tone]}`}>
      <div className="font-mono text-xs mb-1.5 opacity-80">{label}</div>
      <div className="text-slate-300">{children}</div>
    </div>
  );
}

function feederVerdict(feeder) {
  if (feeder.severity === 'critical') {
    return {
      icon: '🚨',
      label: 'Likely theft',
      classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      reason: `${feeder.suspectedMeters.length} meter${feeder.suspectedMeters.length === 1 ? '' : 's'} reporting far less than expected — field inspection recommended`,
    };
  }
  if (feeder.severity === 'elevated') {
    return {
      icon: '⚠️',
      label: 'Worth checking',
      classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      reason: feeder.suspectedMeters.length > 0
        ? `Loss above normal range; a few suspect meters to review`
        : `Loss above normal range, but no specific meters stand out — could be aging equipment`,
    };
  }
  return {
    icon: '✅',
    label: 'Looks normal',
    classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    reason: 'Loss within the expected technical range — no theft suspected',
  };
}

function overallVerdict(overall) {
  if (overall.totalFeeders === 0) {
    return {
      icon: '⏳', iconClass: 'text-slate-400', title: 'Gathering data',
      titleClass: 'text-slate-200', borderClass: 'border-white/10',
      summary: 'No feeder data yet. Wait a moment for the simulator to publish readings, then this page will populate.',
    };
  }
  if (overall.flaggedFeeders === 0) {
    return {
      icon: '✅', iconClass: 'text-emerald-400', title: 'No theft detected',
      titleClass: 'text-emerald-300', borderClass: 'border-emerald-500/30',
      summary: `Your whole grid is losing about ${overall.lossPct}% of electricity right now — well within the normal range for technical losses (heat in wires and transformers). Nothing suggests tampering.`,
    };
  }
  if (overall.lossPct > 15) {
    return {
      icon: '🚨', iconClass: 'text-rose-400', title: 'Significant theft likely',
      titleClass: 'text-rose-300', borderClass: 'border-rose-500/30',
      summary: `Your grid is losing about ${overall.lossPct}% of its electricity right now — that&rsquo;s well above the 5–8% expected from normal wire and transformer losses. The most common explanation is meter tampering. ${overall.flaggedFeeders} feeder${overall.flaggedFeeders === 1 ? '' : 's'} need investigation.`,
    };
  }
  return {
    icon: '⚠️', iconClass: 'text-amber-300', title: 'Some feeders worth investigating',
    titleClass: 'text-amber-200', borderClass: 'border-amber-500/30',
    summary: `Overall losses are ${overall.lossPct}% — at the high end of normal. ${overall.flaggedFeeders} feeder${overall.flaggedFeeders === 1 ? '' : 's'} stand out and could either be aging equipment or a small amount of tampering. Worth a closer look.`,
  };
}
