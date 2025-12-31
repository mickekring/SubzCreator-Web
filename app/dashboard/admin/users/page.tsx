'use client';

/**
 * Admin User Management Page
 * CRUD interface for managing users
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UserMenu } from '@/components/UserMenu';

interface User {
  Id: number;
  Email: string;
  Name: string;
  Role: 'admin' | 'editor' | 'viewer';
  CreatedAt: string;
}

type ModalType = 'create' | 'edit' | 'password' | 'delete' | null;

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (res.status === 403) {
        setError('Admin access required');
        setLoading(false);
        return;
      }

      if (data.success) {
        setUsers(data.data);
      } else {
        setError(data.error || 'Failed to load users');
      }
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openModal = (type: ModalType, user?: User) => {
    setModalType(type);
    setSelectedUser(user || null);
    setFormError(null);
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedUser(null);
    setFormError(null);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
      name: formData.get('name'),
      role: formData.get('role'),
    };

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        closeModal();
        fetchUsers();
      } else {
        setFormError(data.error || 'Failed to create user');
      }
    } catch {
      setFormError('Failed to create user');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormLoading(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      Email: formData.get('email'),
      Name: formData.get('name'),
      Role: formData.get('role'),
    };

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        closeModal();
        fetchUsers();
      } else {
        setFormError(data.error || 'Failed to update user');
      }
    } catch {
      setFormError('Failed to update user');
    } finally {
      setFormLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormLoading(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      setFormLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.Id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (data.success) {
        closeModal();
      } else {
        setFormError(data.error || 'Failed to change password');
      }
    } catch {
      setFormError('Failed to change password');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setFormLoading(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.Id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        closeModal();
        fetchUsers();
      } else {
        setFormError(data.error || 'Failed to delete user');
      }
    } catch {
      setFormError('Failed to delete user');
    } finally {
      setFormLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    editor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    viewer: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/50">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading users...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-white/50 mb-6">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: `
            linear-gradient(to right, white 1px, transparent 1px),
            linear-gradient(to bottom, white 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 -ml-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-semibold text-white tracking-tight">User Management</h1>
            </div>
            <p className="text-white/40 text-sm font-mono">
              {users.length} user{users.length !== 1 ? 's' : ''} registered
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => openModal('create')}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-medium rounded-xl hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New User
            </button>
            <UserMenu />
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-white/30 uppercase tracking-wider">Created</th>
                <th className="text-right px-6 py-4 text-xs font-medium text-white/30 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {users.map((user) => (
                <tr key={user.Id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-white">{user.Name}</div>
                      <div className="text-sm text-white/40 font-mono">{user.Email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-lg border ${roleColors[user.Role]}`}>
                      {user.Role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-white/50 font-mono">{formatDate(user.CreatedAt)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openModal('edit', user)}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all"
                        title="Edit user"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openModal('password', user)}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all"
                        title="Change password"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openModal('delete', user)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-all"
                        title="Delete user"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="px-6 py-16 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-white/5 flex items-center justify-center">
                <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <p className="text-white/30 text-sm">No users found</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Backdrop */}
      {modalType && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          {/* Create User Modal */}
          {modalType === 'create' && (
            <div
              className="bg-[#111] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-white mb-6">Create New User</h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Name</label>
                  <input
                    name="name"
                    type="text"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Email</label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Password</label>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                    placeholder="Min. 8 characters"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Role</label>
                  <select
                    name="role"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 border border-white/[0.08] rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-medium rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all"
                  >
                    {formLoading ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Edit User Modal */}
          {modalType === 'edit' && selectedUser && (
            <div
              className="bg-[#111] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-white mb-6">Edit User</h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleEdit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Name</label>
                  <input
                    name="name"
                    type="text"
                    required
                    defaultValue={selectedUser.Name}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Email</label>
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={selectedUser.Email}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Role</label>
                  <select
                    name="role"
                    required
                    defaultValue={selectedUser.Role}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 border border-white/[0.08] rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-medium rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all"
                  >
                    {formLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Change Password Modal */}
          {modalType === 'password' && selectedUser && (
            <div
              className="bg-[#111] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-white mb-1">Change Password</h2>
              <p className="text-white/40 text-sm mb-6">Set a new password for {selectedUser.Name}</p>

              {formError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">New Password</label>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                    placeholder="Min. 8 characters"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Confirm Password</label>
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all"
                    placeholder="Repeat password"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 border border-white/[0.08] rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-medium rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all"
                  >
                    {formLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {modalType === 'delete' && selectedUser && (
            <div
              className="bg-[#111] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h2 className="text-lg font-semibold text-white text-center mb-2">Delete User</h2>
              <p className="text-white/50 text-sm text-center mb-6">
                Are you sure you want to delete <span className="text-white font-medium">{selectedUser.Name}</span>? This action cannot be undone.
              </p>

              {formError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
                  {formError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 border border-white/[0.08] rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={formLoading}
                  className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl disabled:opacity-50 transition-all"
                >
                  {formLoading ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
