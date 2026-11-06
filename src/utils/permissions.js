export const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    canViewReports: true,
    canManageUsers: true,
    canCloseShift: true,
    canManageStock: true,
    canViewProfits: true,
    canManageSettings: true,
    canDeleteInvoices: true,
    canGiveDiscount: true,
    canDiscount: true,
    canEditPrice: true,
    canDeleteItem: true,
    canRefund: true,
    canStockTake: true,
    canViewAuditLog: true
  },
  pharmacist: {
    canViewReports: true,
    canManageUsers: false,
    canCloseShift: true,
    canManageStock: true,
    canViewProfits: true,
    canManageSettings: false,
    canDeleteInvoices: false,
    canGiveDiscount: true,
    canDiscount: true,
    canEditPrice: false,
    canDeleteItem: false,
    canRefund: true,
    canStockTake: true,
    canViewAuditLog: false
  },
  cashier: {
    canViewReports: false,
    canManageUsers: false,
    canCloseShift: true,
    canManageStock: false,
    canViewProfits: false,
    canManageSettings: false,
    canDeleteInvoices: false,
    canGiveDiscount: false,
    canDiscount: false,
    canEditPrice: false,
    canDeleteItem: false,
    canRefund: false,
    canStockTake: false,
    canViewAuditLog: false
  }
};

/**
 * Normalizes permissions for a given role and permission object.
 */
export function normalizePermissions(role, perms = {}) {
  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.cashier;
  const normalized = { ...roleDefaults };
  if (perms && typeof perms === 'object') {
    for (const [k, v] of Object.entries(perms)) {
      if (v !== undefined) {
        normalized[k] = Boolean(v);
      }
    }
  }
  return normalized;
}

/**
 * Unified Role-Based Access Control (RBAC) helper.
 * An admin role always has full permissions.
 * Otherwise, checks if permissions[key] === true (with fallback to role default if undefined).
 */
export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;

  if (user?.permissions && user.permissions[key] !== undefined) {
    return Boolean(user.permissions[key]);
  }

  // Fallback to role default
  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[user.role] || DEFAULT_ROLE_PERMISSIONS.cashier;
  return Boolean(roleDefaults[key]);
}

/**
 * Strict Privilege Escalation Protection.
 * 
 * Rules:
 *  - The owner (admin with is_owner = 1) can create/update/delete any user except deleting/demoting themselves.
 *  - A pharmacist cannot create, update, or delete another pharmacist or an admin/owner.
 *  - Any actor with canManageUsers can only manage cashiers.
 *  - An actor cannot grant any permission they do not possess themselves.
 *  - The owner (is_owner = 1) cannot be updated, disabled, or deleted by any other user.
 *  - A user cannot modify their own role or permissions.
 *  - The last active admin cannot be deleted or disabled.
 *  - Current user cannot delete themselves.
 */
export function canManageUser({ actor, targetUser = null, action, requestedRole, requestedPermissions, totalAdminsCount = 1 }) {
  if (!actor) {
    return { allowed: false, error: 'يجب تسجيل الدخول لتنفيذ هذه العملية.' };
  }

  const isActorOwner = Boolean(actor.is_owner || (actor.role === 'admin' && actor.is_owner !== false));
  const isTargetOwner = Boolean(targetUser?.is_owner);

  // Self-modification protection on role and permissions
  if (action !== 'create' && targetUser && Number(targetUser.id) === Number(actor.id)) {
    if (action === 'delete') {
      return { allowed: false, error: 'لا يمكن للمستخدم حذف حسابه الخاص.' };
    }
    if (requestedRole && requestedRole !== actor.role) {
      return { allowed: false, error: 'لا يمكنك تغيير دور حسابك بنفسك.' };
    }
    if (requestedPermissions) {
      return { allowed: false, error: 'لا يمكنك تعديل صلاحيات حسابك بنفسك.' };
    }
  }

  // Deleting the last admin
  if (action === 'delete' && targetUser?.role === 'admin' && totalAdminsCount <= 1) {
    return { allowed: false, error: 'لا يمكن حذف المدير الوحيد المتبقي في النظام.' };
  }

  // Protecting the Owner account
  if (isTargetOwner && targetUser && Number(targetUser.id) !== Number(actor.id)) {
    return { allowed: false, error: 'حساب المالك محمي بالكامل ولا يمكن تعديله أو تعطيله أو حذفه بواسطة أي مستخدم آخر.' };
  }

  // Owner can manage everyone else
  if (isActorOwner) {
    return { allowed: true };
  }

  // Non-owner actor checks
  if (!hasPermission(actor, 'canManageUsers')) {
    return { allowed: false, error: 'ليس لديك صلاحية إدارة المستخدمين (canManageUsers).' };
  }

  // Pharmacist or custom manager cannot create or edit admins or pharmacists
  if (actor.role !== 'admin') {
    if (action === 'create') {
      if (requestedRole === 'admin' || requestedRole === 'pharmacist') {
        return { allowed: false, error: 'صلاحياتك تسمح بإنشاء حسابات الموظفين (الكاشير) فقط.' };
      }
    } else {
      if (targetUser?.role === 'admin' || targetUser?.role === 'pharmacist') {
        return { allowed: false, error: 'لا يمكنك تعديل أو حذف حسابات المديرين أو الصيادلة.' };
      }
      if (requestedRole && requestedRole !== 'cashier') {
        return { allowed: false, error: 'لا يمكنك ترقية أي مستخدم إلى مدير أو صيدلي.' };
      }
    }
  }

  // Cannot grant permissions actor does not possess
  if (requestedPermissions && typeof requestedPermissions === 'object') {
    for (const [key, val] of Object.entries(requestedPermissions)) {
      if (val === true && !hasPermission(actor, key)) {
        return {
          allowed: false,
          error: `لا يمكنك منح صلاحية (${key}) لأنك لا تملكها في حسابك.`
        };
      }
    }
  }

  return { allowed: true };
}

