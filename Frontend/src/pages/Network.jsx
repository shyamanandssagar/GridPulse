import { useEffect, useState, useCallback } from 'react';
import NetworkGraph from '../components/NetworkGraph.jsx';
import Loader from '../components/Loader.jsx';
import { feeders as feedersApi } from '../services/api.js';
import { useSocket } from '../context/SocketContext.jsx';
import { fmtKW } from '../utils/format.js';

// Network page rebuilt for non-engineer operators.
// The page is reframed as a "what-if" sandbox: a tool for understanding which
// customers a feeder failure would affect, not a live emergency control panel.
// The destructive nature of clicking a node is made very explicit, and the
// underlying concept of radial distribution is explained up front.

export default function Network() {
  const [topology, setTopology] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPrimer, setShowPrimer] = useState(false);
  const { socket } = useSocket();

  const load = useCallback(async () => {
    try {
      const data = await feedersApi.topology();
      setTopology(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh topology when faults occur elsewhere
  useEffect(() => {
    if (!socket) return;
    const refresh = () => load();
    socket.on('feeder:fault', refresh);
    socket.on('feeder:restored', refresh);
    return () => {
      socket.off('feeder:fault', refresh);
      socket.off('feeder:restored', refresh);
    };
  }, [socket, load]);

  const onNodeClick = async (node) => {
    if (busy) return;
    if (node.type === 'substation') {
      setMessage('The substation is the root of the grid — faulting it would take everything down. Try a feeder or lateral instead.');
      return;
    }
    const isFault = node.status !== 'faulted';
    const action = isFault ? 'fault' : 'restore';

    const lines = isFault
      ? [
          `Simulate a fault on ${node.name}?`,
          '',
          `${node.downstreamMeters} customer meter${node.downstreamMeters === 1 ? '' : 's'} will lose power for the duration of the outage.`,
          `${fmtKW(node.downstreamLoadKW)} of load will be interrupted.`,
          '',
          'This will create an outage event that contributes to your reliability indices. You can restore power anytime by clicking the same node again.',
        ]
      : [
          `Restore power on ${node.name}?`,
          '',
          'This will mark the outage event as resolved and bring all downstream meters back online.',
        ];

    if (!window.confirm(lines.join('\n'))) return;

    setBusy(true);
    setMessage(null);
    try {
      if (isFault) await feedersApi.fault(node._id);
      else await feedersApi.restore(node._id);
      await load();
      setMessage(
        isFault
          ? `${node.name} is now faulted — ${node.downstreamMeters} meter(s) are offline. Check the Reliability page to see the outage being recorded.`
          : `${node.name} has been restored. Downstream meters will start reporting again within a few seconds.`
      );
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!topology) return <Loader />;

  const faulted = topology.filter((f) => f.status === 'faulted');
  const totalMeters = topology.find((f) => f.type === 'substation')?.downstreamMeters || 0;
  const offlineMeters = faulted.reduce((s, f) => s + (f.downstreamMeters || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Distribution Network</h1>
        <p className="text-slate-400 text-sm max-w-3xl">
          Your grid laid out as a tree, from the substation at the top down to the lateral branches
          serving customers. Use this page to see what would happen if a piece of the grid failed —
          and to practice restoring service.
        </p>
      </div>

      {/* Primer: how the grid is structured */}
      <div className="card p-5 border border-sky-500/20 bg-sky-500/5">
        <button
          onClick={() => setShowPrimer((v) => !v)}
          className="flex items-center gap-2 text-sm text-sky-200 font-medium hover:text-sky-100"
        >
          <span className="text-lg">🌳</span>
          <span>How does this network work?</span>
          <span className="text-xs text-slate-400 ml-1">{showPrimer ? '(hide)' : '(show)'}</span>
        </button>
        {showPrimer && (
          <div className="mt-4 space-y-4 text-sm text-slate-300 leading-relaxed">
            <p>
              This is a <strong className="text-slate-100">radial</strong> distribution network —
              power flows from one source (the substation) outward, like branches on a tree. There
              are no loops, so every customer has exactly one path back to the substation.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <LayerCard
                color="#22d3ee"
                title="Substation"
                desc="The root. Steps down voltage from the high-voltage grid (11 kV) and supplies all the feeders below it."
              />
              <LayerCard
                color="#a78bfa"
                title="Feeder"
                desc="A main distribution line running out from the substation. Carries power to a whole neighborhood or industrial area."
              />
              <LayerCard
                color="#34d399"
                title="Lateral"
                desc="A smaller branch off a feeder. Steps voltage down again (to 230 V) and feeds individual customer meters."
              />
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-amber-100">
              <div className="text-xs uppercase tracking-wider text-amber-300 mb-1">Why this matters</div>
              <p className="text-xs leading-relaxed">
                Because the network is radial, if any node fails,{' '}
                <strong>everything downstream of it loses power.</strong> A fault on a main feeder
                takes out every lateral and meter beneath it. A fault on a lateral only affects its
                own customers. Knowing the tree lets you predict — and contain — outages.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Current state banner */}
      {faulted.length === 0 ? (
        <div className="card p-4 border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <div className="text-sm font-semibold text-emerald-300">All systems normal</div>
              <div className="text-xs text-slate-400 mt-0.5">
                All {totalMeters} customer meters are receiving power. No outages in progress.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-4 border border-rose-500/40 bg-rose-500/5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🚨</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-rose-300">
                Active outage{faulted.length === 1 ? '' : 's'} in progress
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                {offlineMeters} of {totalMeters} customer meters are currently without power.
                Every minute these outages continue counts against your reliability indices.
              </div>
              <ul className="text-sm space-y-2 mt-3">
                {faulted.map((f) => (
                  <li key={f._id} className="flex items-center justify-between gap-3 rounded-lg bg-bg/40 px-3 py-2 border border-rose-500/20">
                    <div>
                      <div className="font-mono text-rose-200">{f.name}</div>
                      <div className="text-xs text-slate-400">
                        {f.downstreamMeters} meter{f.downstreamMeters === 1 ? '' : 's'} affected · {fmtKW(f.downstreamLoadKW)} interrupted
                      </div>
                    </div>
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 whitespace-nowrap"
                      disabled={busy}
                      onClick={() => onNodeClick(f)}
                    >
                      ✓ Restore power
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Status / action message */}
      {message && (
        <div className="card px-4 py-3 text-sm text-slate-200 border-accent/30">
          {message}
        </div>
      )}

      {/* The graph itself */}
      <div>
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <div>
            <div className="text-sm text-slate-200 font-medium">Network map</div>
            <div className="text-xs text-slate-500">
              Click any feeder or lateral to simulate a fault (or restore one that&rsquo;s already faulted).
              The substation can&rsquo;t be faulted from here.
            </div>
          </div>
          {busy && <div className="text-xs text-slate-400 animate-pulse">Updating network…</div>}
        </div>
        <NetworkGraph feeders={topology} onNodeClick={onNodeClick} />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Total nodes" value={topology.length} hint="substation + feeders + laterals" />
        <Stat label="Total meters" value={totalMeters} hint="across the whole network" />
        <Stat
          label="Online meters"
          value={`${totalMeters - offlineMeters} / ${totalMeters}`}
          tone={offlineMeters > 0 ? 'warn' : 'good'}
        />
        <Stat
          label="Active faults"
          value={faulted.length}
          tone={faulted.length > 0 ? 'bad' : 'good'}
          hint={faulted.length > 0 ? 'see banner above' : 'grid is healthy'}
        />
      </div>

      {/* What to do when you fault something */}
      <div className="card p-5">
        <div className="text-sm text-slate-200 font-medium mb-3">💡 What this page is useful for</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-300">
          <UseCase
            title="Understand impact"
            body="Hover or imagine a fault on any feeder to see how many customers it serves. Bigger upstream nodes affect more people when they fail."
          />
          <UseCase
            title="Practice restoration"
            body="Click a feeder to fault it, then click it again to restore. The Reliability page will show the outage being recorded and resolved in real time."
          />
          <UseCase
            title="Teach new operators"
            body="The tree structure makes it visually obvious why a fault on one part of the network can knock out many customers. Useful for onboarding."
          />
          <UseCase
            title="Demo loss & outage workflows"
            body="Fault a feeder, then switch to the Loss Analysis or Reliability pages to see how the system responds end-to-end."
          />
        </div>
      </div>
    </div>
  );
}

function LayerCard({ color, title, desc }) {
  return (
    <div className="rounded-lg border border-white/10 bg-bg/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
        <span className="font-medium text-slate-100">{title}</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function Stat({ label, value, hint, tone }) {
  const tones = {
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-rose-300',
  };
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-2xl mt-1 ${tones[tone] || 'text-slate-100'}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function UseCase({ title, body }) {
  return (
    <div className="rounded-lg border border-white/5 bg-bg/40 p-3">
      <div className="text-sm font-medium text-slate-100 mb-1">{title}</div>
      <div className="text-xs text-slate-400 leading-relaxed">{body}</div>
    </div>
  );
}
