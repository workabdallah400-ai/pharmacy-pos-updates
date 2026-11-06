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
