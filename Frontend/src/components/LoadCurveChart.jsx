import { useEffect, useRef, useState } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { useSocket } from '../context/SocketContext.jsx';
import { fmtTime } from '../utils/format.js';

const MAX_POINTS = 60; // ~1 min of history at 1Hz tick rate

export default function LoadCurveChart() {
  const { latestTick } = useSocket();
  const [series, setSeries] = useState([]);
  const lastTsRef = useRef(null);

  useEffect(() => {
    if (!latestTick) return;
    const ts = new Date(latestTick.timestamp).getTime();
    if (ts === lastTsRef.current) return;
    lastTsRef.current = ts;
    setSeries((prev) => {
      const next = [...prev, { t: ts, kW: latestTick.totalLoadKW }];
      if (next.length > MAX_POINTS) next.shift();
      return next;
    });
  }, [latestTick]);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm text-slate-400">Total grid load (live)</div>
          <div className="text-xs text-slate-500">last {MAX_POINTS} samples</div>
        </div>
        <div className="text-2xl font-mono">
          {latestTick ? `${latestTick.totalLoadKW.toFixed(2)} kW` : '—'}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(t) => fmtTime(t)}
              stroke="#64748b"
              fontSize={11}
              minTickGap={40}
            />
            <YAxis stroke="#64748b" fontSize={11} width={45} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: '#0b1120', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
              labelFormatter={(t) => fmtTime(t)}
              formatter={(v) => [`${v.toFixed(2)} kW`, 'Load']}
            />
            <Area type="monotone" dataKey="kW" stroke="#22d3ee" strokeWidth={2} fill="url(#loadGrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
