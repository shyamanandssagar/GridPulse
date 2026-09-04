import { useEffect, useMemo, useState } from 'react';
import Loader from '../components/Loader.jsx';
import { users as usersApi, meters as metersApi } from '../services/api.js';
import { fmtDate } from '../utils/format.js';

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [meters, setMeters] = useState(null);
  const [editing, setEditing] = useState(null); // user being edited in the modal
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null); // {kind, text}

  const load = () =>
    Promise.all([usersApi.list(), metersApi.list()])
      .then(([u, m]) => { setUsers(u); setMeters(m); })
      .catch((e) => setErr(e.message));

  useEffect(() => { load(); }, []);

  // Auto-dismiss toasts after 5s
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!users || !meters) return <Loader />;

  const onCreated = (saved) => {
    setCreating(false);
    load();
    // Backend returns emailSent boolean alongside the user fields
    if (saved?.emailSent === true) {
      setToast({ kind: 'ok', text: `Account created. Credentials have been emailed to ${saved.email}.` });
    } else if (saved?.emailSent === false) {
      setToast({
        kind: 'warn',
        text: `Account created, but the credentials email could not be sent. Share the password manually with ${saved.email}.`,
      });
    } else {
      setToast({ kind: 'ok', text: 'Account created.' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-slate-400 text-sm">
            {users.length} accounts · creating a user emails them their sign-in credentials automatically.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-accent text-bg font-semibold rounded-lg hover:opacity-90"
        >
          + Add User
        </button>
      </div>

      {toast && (
        <div
          className={`text-sm rounded-lg px-3 py-2 border ${
            toast.kind === 'ok'
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
              : 'text-amber-300 bg-amber-500/10 border-amber-500/30'
          }`}
        >
          {toast.text}
        </div>
      )}
      {err && (
        <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      <div className="card overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/5">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Assigned meters</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${
                    u.role === 'admin'
                      ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                  }`}>{u.role}</span>
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {u.assignedMeters?.length || 0}
                  {u.assignedMeters?.length > 0 && (
                    <span className="text-slate-500 text-xs ml-2">
                      ({u.assignedMeters.slice(0, 2).map((m) => m.serial).join(', ')}{u.assignedMeters.length > 2 ? '…' : ''})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setEditing(u)} className="text-xs text-accent hover:underline">
                    Manage
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <UserFormModal
          meters={meters}
          onClose={() => setCreating(false)}
          onSaved={onCreated}
        />
      )}
      {editing && (
        <UserFormModal
          user={editing}
          meters={meters}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, meters, onClose, onSaved }) {
  const isEdit = !!user;
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user?.role || 'user');
  const [assignedIds, setAssignedIds] = useState(
    new Set((user?.assignedMeters || []).map((m) => String(m._id || m)))
  );
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return meters.filter((m) =>
      !q ||
      m.serial.toLowerCase().includes(q) ||
      (m.customerName || '').toLowerCase().includes(q) ||
      (m.feeder?.name || '').toLowerCase().includes(q)
    ).slice(0, 80);
  }, [meters, search]);

  const toggle = (id) => {
    const next = new Set(assignedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setAssignedIds(next);
  };

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body = { name, role, assignedMeters: [...assignedIds] };
      if (isEdit) {
        await usersApi.update(user._id, body);
        if (password) await usersApi.resetPassword(user._id, password);
        onSaved();
      } else {
        if (!email || !password) throw new Error('email and password are required');
        const created = await usersApi.create({ ...body, email, password });
        onSaved(created);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      await usersApi.remove(user._id);
      onSaved();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">{isEdit ? `Edit ${user.email}` : 'Add user'}</h2>
            <p className="text-sm text-slate-400">
              {isEdit
                ? 'Update profile and meter assignments'
                : 'New accounts receive their credentials by email automatically.'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Full name" value={name} onChange={setName} required />
            <Field label="Email" type="email" value={email} onChange={setEmail} required disabled={isEdit} />
            <Field
              label={isEdit ? 'New password (leave blank to keep)' : 'Temporary password'}
              type="password"
              value={password}
              onChange={setPassword}
              required={!isEdit}
            />
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-bg/60 border border-white/10 rounded-lg px-3 py-2"
              >
                <option value="user">User (customer)</option>
                <option value="admin">Admin (operator)</option>
              </select>
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-slate-400">
                Assigned meters · {assignedIds.size} selected
              </span>
              <input
                placeholder="filter by serial / name / feeder…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs bg-bg/60 border border-white/10 rounded px-2 py-1 w-64"
              />
            </div>
            <div className="border border-white/5 rounded-lg max-h-64 overflow-y-auto scrollbar-thin">
              {filtered.map((m) => {
                const id = String(m._id);
                const checked = assignedIds.has(id);
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5 border-b border-white/5 last:border-0 ${checked ? 'bg-accent/10' : ''}`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(id)} className="accent-accent" />
                    <span className="font-mono text-xs text-accent w-24">{m.serial}</span>
                    <span className="flex-1 text-sm">{m.customerName || <span className="text-slate-500 italic">unnamed</span>}</span>
                    <span className="text-xs text-slate-500">{m.feeder?.name}</span>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-sm text-slate-500 italic p-4 text-center">No meters match.</div>
              )}
            </div>
          </div>

          {err && (
            <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {isEdit ? (
              <button type="button" onClick={remove} className="text-sm text-rose-400 hover:underline">
                Delete user
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5">Cancel</button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-accent text-bg font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Saving…' : (isEdit ? 'Save changes' : 'Create user & email credentials')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg/60 border border-white/10 rounded-lg px-3 py-2 disabled:opacity-50"
      />
    </label>
  );
}
