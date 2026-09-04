import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtKW } from '../utils/format.js';

export default function Topbar({ onMenu }) {
  const { connected, latestTick } = useSocket();
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-bg/70 border-b border-white/5 px-4 md:px-6 lg:px-8 py-3 flex items-center gap-4">
      <button
        className="lg:hidden p-2 rounded hover:bg-white/5"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-400">Live grid</div>
        <div className="font-mono text-lg truncate">
          {latestTick ? `${fmtKW(latestTick.totalLoadKW)} · ${latestTick.online}/${latestTick.meters} online` : 'connecting…'}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            connected ? 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]' : 'bg-rose-500'
          }`}
          aria-hidden
        />
        <span className="text-xs text-slate-400 hidden sm:inline">
          {connected ? 'WebSocket live' : 'disconnected'}
        </span>
        {user && (
          <button
            onClick={logout}
            className="ml-2 text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300"
            title={`Sign out ${user.email}`}
          >
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
