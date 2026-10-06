import React, { useEffect, useState } from 'react';
import { Users as UsersIcon, Shield, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { User, UserRole } from '../types';

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    try {
      const res = await api.listUsers();
      setUsers(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.updateUserRole(userId, newRole);
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user role');
    }
  };

  const roles: UserRole[] = [
    'SUPER_ADMIN',
    'INFRASTRUCTURE_ADMIN',
    'DEPLOYMENT_ADMIN',
    'APPLICATION_ADMIN',
    'LICENSE_ADMIN',
    'MONITORING_ADMIN',
    'READ_ONLY',
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            User Accounts & Identity Administration
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Enterprise identity management, MFA status, and Role-Based Access Control (RBAC) assignments.
          </p>
        </div>

        <button
          onClick={() => loadUsers()}
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Email Address</th>
                <th className="py-3 px-4">Assigned RBAC Role</th>
                <th className="py-3 px-4">MFA State</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Registered Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">Loading user accounts...</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-brand-700 flex items-center justify-center text-white font-semibold text-xs">
                          {u.username[0].toUpperCase()}
                        </div>
                        <div>
                          <div>{u.full_name || u.username}</div>
                          <div className="text-[10px] text-slate-500 font-mono">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{u.email}</td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-brand-300 font-mono focus:outline-none focus:border-brand-500"
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] text-slate-400">
                        {u.mfa_enabled ? 'TOTP Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        ACTIVE
                      </span>
                    </td>
                    <td className="py-3 px-4 mono text-slate-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
