import { useMemo } from 'react';

// Renders the radial distribution network as an SVG tree. Nodes are clickable;
// the parent passes onNodeClick to handle fault/restore. Faulted upstream
// nodes propagate visually to all descendants in red.

export default function NetworkGraph({ feeders, onNodeClick }) {
  const layout = useMemo(() => buildLayout(feeders), [feeders]);

  if (!layout) return <div className="text-slate-500 p-8 text-center">No topology yet.</div>;

  const { nodes, links, width, height } = layout;

  return (
    <div className="card p-4 overflow-x-auto scrollbar-thin">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px] w-full">
        {links.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={l.faulted ? 'rgba(244,63,94,0.6)' : 'rgba(148,163,184,0.4)'}
            strokeWidth={l.faulted ? 2 : 1.5}
            strokeDasharray={l.faulted ? '6 4' : '0'}
          />
        ))}

        {nodes.map((n) => {
          const fill = n.effectiveFaulted ? '#ef4444' : n.type === 'substation' ? '#22d3ee' : n.type === 'feeder' ? '#a78bfa' : '#34d399';
          const stroke = n.effectiveFaulted ? '#fecaca' : 'rgba(255,255,255,0.2)';
          return (
            <g
              key={n._id}
              transform={`translate(${n.x},${n.y})`}
              className="cursor-pointer"
              onClick={() => onNodeClick?.(n)}
            >
              <circle r={n.type === 'substation' ? 18 : n.type === 'feeder' ? 14 : 11} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.9} />
              <text
                y={n.type === 'substation' ? 36 : 28}
                textAnchor="middle"
                fontSize={n.type === 'substation' ? 13 : 11}
                fill="#e2e8f0"
                fontFamily="Inter"
              >
                {n.name}
              </text>
              {n.type === 'lateral' && (
                <text y={-18} textAnchor="middle" fontSize={10} fill="#94a3b8">
                  {n.downstreamMeters} meters
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-slate-400 mt-3 px-2">
        <Legend color="#22d3ee" label="Substation" />
        <Legend color="#a78bfa" label="Feeder" />
        <Legend color="#34d399" label="Lateral" />
        <Legend color="#ef4444" label="Faulted" />
        <span className="ml-auto italic">Click a node to fault/restore</span>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function buildLayout(feeders) {
  if (!feeders?.length) return null;
  const byId = new Map(feeders.map((f) => [String(f._id), { ...f, children: [] }]));
  let root = null;
  for (const f of byId.values()) {
    if (f.parent) {
      const parent = byId.get(String(f.parent));
      if (parent) parent.children.push(f);
    } else {
      root = f;
    }
  }
  if (!root) return null;

  function markFaults(node, ancestorFaulted = false) {
    const isFaulted = node.status === 'faulted' || ancestorFaulted;
    node.effectiveFaulted = isFaulted;
    for (const c of node.children) markFaults(c, isFaulted);
  }
  markFaults(root);

  const LEVEL_HEIGHT = 110;
  const LEAF_SPACING = 130;
  let cursor = 0;
  function assign(node, depth) {
    if (!node.children.length) {
      node.x = cursor * LEAF_SPACING + LEAF_SPACING / 2;
      node.y = depth * LEVEL_HEIGHT + 40;
      cursor++;
      return;
    }
    for (const c of node.children) assign(c, depth + 1);
    const xs = node.children.map((c) => c.x);
    node.x = (Math.min(...xs) + Math.max(...xs)) / 2;
    node.y = depth * LEVEL_HEIGHT + 40;
  }
  assign(root, 0);

  const nodes = [];
  const links = [];
  function visit(node) {
    nodes.push(node);
    for (const c of node.children) {
      links.push({
        x1: node.x,
        y1: node.y,
        x2: c.x,
        y2: c.y,
        faulted: c.effectiveFaulted,
      });
      visit(c);
    }
  }
  visit(root);

  const width = Math.max(720, cursor * LEAF_SPACING);
  const maxDepth = Math.max(...nodes.map((n) => n.y));
  const height = maxDepth + 80;
  return { nodes, links, width, height };
}
