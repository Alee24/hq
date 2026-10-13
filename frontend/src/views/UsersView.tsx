import React, { useEffect, useState } from 'react';
import { Users as UsersIcon, Shield, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { User, UserRole } from '../types';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { Button, InputField, SelectField, ModalShell } from '../components/common';

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Delete User Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<User | null>(null);

  // Create User Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('APPLICATION_ADMIN');


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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser({
        username: newUsername,
        email: newEmail,
        full_name: newFullName,
        password: newPassword,
        role: newRole,
      });
      setCreateModalOpen(false);
      setNewUsername('');
      setNewEmail('');
      setNewFullName('');
      setNewPassword('');
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to create user');
    }
  };

  const executeConfirmedDelete = async () => {
    if (!selectedUserForDelete) return;
    try {
      await api.deleteUser(selectedUserForDelete.id);
      setDeleteModalOpen(false);
      setSelectedUserForDelete(null);
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user account');
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
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden">
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadUsers()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Create User Account</span>
          </button>
        </div>
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
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">Loading user accounts...</td>
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
                    <td className="py-3 px-4 text-right">
                      {u.username !== 'admin' && (
                        <button
                          onClick={() => {
                            setSelectedUserForDelete(u);
                            setDeleteModalOpen(true);
                          }}
                          className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors"
                          title="Delete User"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      <ModalShell
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Enterprise User Account"
        description="Provision identity credentials and assign Role-Based Access Control permissions."
        icon={UsersIcon}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="create-user-form">
              Create User
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={handleCreateUser} className="space-y-4 text-xs">
          <InputField
            label="Username"
            isRequired
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="e.g. dev_lead"
          />

          <InputField
            label="Email Address"
            isRequired
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="e.g. dev@enterprise.net"
          />

          <InputField
            label="Full Name"
            isRequired
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            placeholder="e.g. Jane Doe"
          />

          <InputField
            label="Initial Password"
            isRequired
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••••••"
          />

          <SelectField
            label="Assigned RBAC Role"
            isRequired
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as UserRole)}
            className="mono"
            options={roles.map((r) => ({ value: r, label: r }))}
          />
        </form>
      </ModalShell>

      {/* Delete User Confirmation Modal */}
      {selectedUserForDelete && (
        <ConfirmationModal
          isOpen={deleteModalOpen}
          title="Delete User Account"
          message={`Are you sure you want to delete user account "${selectedUserForDelete.username}" (${selectedUserForDelete.email})? This action will permanently revoke their access credentials.`}
          confirmButtonText="Delete User"
          isDestructive={true}
          onConfirm={executeConfirmedDelete}
          onClose={() => {
            setDeleteModalOpen(false);
            setSelectedUserForDelete(null);
          }}
        />
      )}
    </div>
  );
};
