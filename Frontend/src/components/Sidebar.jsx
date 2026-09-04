import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const userLinks = [
  { to: '/', label: 'Dashboard', icon: '⚡' },
  { to: '/meters', label: 'My Meters', icon: '🔌' },
];

const adminExtras = [
  { to: '/network', label: 'Network', icon: '🌳' },
  { to: '/anomalies', label: 'Anomalies', icon: '⚠️' },
  { to: '/reliability', label: 'Reliability', icon: '📊' },
  { to: '/losses', label: 'Loss Analysis', icon: '🔍' },
  { to: '/admin/users', label: 'Users', icon: '👥' },
];

export default function Sidebar({ open, onClose }) {
  const { user, isAdmin } = useAuth();
  const links = isAdmin
    ? [
        { to: '/', label: 'Dashboard', icon: '⚡' },
        { to: '/meters', label: 'Meters', icon: '🔌' },
        ...adminExtras,
      ]
    : userLinks;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-bg-surface/90 backdrop-blur border-r border-white/5 flex flex-col transform transition-transform lg:transform-none ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-6 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <div>
              <div className="font-semibold tracking-tight">GridPulse</div>
              <div className="text-xs text-slate-400">
                {isAdmin ? 'Operator console' : 'Customer portal'}
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span aria-hidden>{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="p-4 border-t border-white/5 text-xs">
            <div className="text-slate-200 font-medium truncate">{user.name}</div>
            <div className="text-slate-500 truncate">{user.email}</div>
          </div>
        )}
      </aside>
    </>
  );
}
