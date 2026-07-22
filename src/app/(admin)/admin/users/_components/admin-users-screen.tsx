'use client';

import { AdminToast } from '../../_components/admin-toast';
import { useAdminUsers } from '../_hooks/use-admin-users';
import { EditUserModal } from './edit-user-modal';
import { UsersFilters } from './users-filters';
import { UsersList } from './users-list';
import { UsersSummary } from './users-summary';

export function AdminUsersScreen() {
  const workflow = useAdminUsers();
  return (
    <div className="flex flex-col gap-6">
      <div><h1 style={{ fontSize: '22px', fontWeight: 700, color: '#16181D' }}>사용자 관리</h1><p style={{ fontSize: '15px', color: '#5A6270', marginTop: 3 }}>전체 학생과 선생님 계정을 조회하고 관리하세요.</p></div>
      <UsersSummary stats={workflow.stats} />
      <UsersFilters query={workflow.query} roleFilter={workflow.roleFilter} statusFilter={workflow.statusFilter} onQueryChange={workflow.setQuery} onRoleChange={workflow.setRoleFilter} onStatusChange={workflow.setStatusFilter} onSubmit={workflow.fetchUsers} />
      <UsersList users={workflow.users} loading={workflow.loading} query={workflow.query} onToggleActive={workflow.toggleActive} onEdit={workflow.setEditTarget} />
      {workflow.editTarget && <EditUserModal user={workflow.editTarget} onClose={() => workflow.setEditTarget(null)} onSave={workflow.saveUser} />}
      {workflow.toast && <AdminToast message={workflow.toast.message} type={workflow.toast.type} />}
    </div>
  );
}
