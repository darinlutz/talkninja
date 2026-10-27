'use client';

import { useMemo, useState } from 'react';
import AdminStatusMessage from '@/components/AdminStatusMessage';
import { ROLE_VALUES, type Role } from '@/lib/roles';
import type { AdminUser } from '@/lib/users';

// The Admin page's User Roles section: every account with its role, filtered by a search, and a role box on each
// row (PUT /api/admin/users/role). The signed-in Admin can't change their own role, and the last Admin can't be
// demoted; the route refuses both.

const PAGE_SIZE = 50;

const inputClass =
  'px-3 py-2 bg-white border border-slate-300 rounded-lg text-dark-blue text-sm focus:outline-none focus:border-powder-600 focus:ring-1 focus:ring-powder-500 transition-colors disabled:opacity-60';

export default function UserRoleManager({ users: initialUsers, currentUserId }: { users: AdminUser[]; currentUserId: number }) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? users.filter((u) => u.userName.toLowerCase().includes(needle) || u.emailAddress.toLowerCase().includes(needle))
      : users;
  }, [search, users]);

  const changeRole = async (user: AdminUser, role: Role) => {
    if (role === user.role) return;
    setSavingId(user.id);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/users/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ ok: false, text: data.error ?? 'Failed to save the role' });
        return;
      }
      setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, role } : u)));
      setMessage({ ok: true, text: `${user.userName} is now ${role === 'Admin' ? 'an Admin' : 'a User'}.` });
    } catch {
      setMessage({ ok: false, text: 'Failed to save the role' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 sm:p-8">
      <h2 className="text-2xl font-bold text-dark-blue mb-2">User Roles</h2>
      <p className="text-slate-600 mb-4">
        Admins can open this page and aren’t rate limited by default. You can’t change your own role, and there
        must always be at least one Admin.
      </p>

      <label htmlFor="role-user-search" className="block text-sm font-medium text-dark-blue mb-1">
        Find a user
      </label>
      <input
        id="role-user-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Name or email address"
        autoComplete="off"
        className={`${inputClass} w-full mb-4`}
      />

      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Account Status</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {matches.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  No users match.
                </td>
              </tr>
            )}
            {matches.slice(0, PAGE_SIZE).map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2 max-w-[260px]">
                    <p translate="no" className="truncate text-dark-blue font-medium">
                      {u.userName} {isSelf && <span className="text-slate-500 font-normal">(you)</span>}
                    </p>
                    <p translate="no" className="truncate text-xs text-slate-500">
                      {u.emailAddress}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{u.accountStatus}</td>
                  <td className="px-4 py-2">
                    <select
                      aria-label={`Role for ${u.userName}`}
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                      disabled={isSelf || savingId !== null}
                      title={isSelf ? 'You can’t change your own role' : undefined}
                      className={inputClass}
                    >
                      {ROLE_VALUES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {matches.length > PAGE_SIZE && (
        <p className="mt-2 text-xs text-slate-500">
          Showing {PAGE_SIZE} of {matches.length}. Search to find others.
        </p>
      )}

      {message && <AdminStatusMessage message={message} />}
    </div>
  );
}
