import assert from 'node:assert';
import { canManageUser, hasPermission } from '../src/utils/permissions.js';

console.log('--- Testing Permissions & Escalation Rules Module ---');

const owner = { id: 1, username: 'owner', role: 'admin', is_owner: 1, permissions: {} };
const pharmWithUsers = {
  id: 2,
  username: 'pharm_mgr',
  role: 'pharmacist',
  is_owner: 0,
  permissions: { canManageUsers: true, canSell: true, canRefund: true }
};
const pharmPlain = { id: 3, username: 'pharm_plain', role: 'pharmacist', is_owner: 0, permissions: {} };
const cashier = { id: 4, username: 'cashier1', role: 'cashier', is_owner: 0, permissions: {} };

// 1. Owner can create pharmacist and cashier
assert.strictEqual(
  canManageUser({ actor: owner, action: 'create', requestedRole: 'pharmacist' }).allowed,
  true
);
assert.strictEqual(
  canManageUser({ actor: owner, action: 'create', requestedRole: 'cashier' }).allowed,
  true
);
console.log('✅ Owner can create pharmacist and cashier');

// 2. Pharmacist cannot create another pharmacist or admin
const pharmCreatePharm = canManageUser({
  actor: pharmWithUsers,
  action: 'create',
  requestedRole: 'pharmacist'
});
assert.strictEqual(pharmCreatePharm.allowed, false);
assert.ok(pharmCreatePharm.error.includes('الموظفين') || pharmCreatePharm.error.includes('الكاشير'));

const pharmCreateAdmin = canManageUser({
  actor: pharmWithUsers,
  action: 'create',
  requestedRole: 'admin'
});
assert.strictEqual(pharmCreateAdmin.allowed, false);
console.log('✅ Pharmacist cannot create admin or pharmacist');

// 3. Manager with canManageUsers can only create cashiers
const pharmCreateCashier = canManageUser({
  actor: pharmWithUsers,
  action: 'create',
  requestedRole: 'cashier',
  requestedPermissions: { canSell: true }
});
assert.strictEqual(pharmCreateCashier.allowed, true);
console.log('✅ Manager with canManageUsers can create cashier');

// 4. Cannot grant permissions not possessed by actor
const pharmGrantExcess = canManageUser({
  actor: pharmWithUsers,
  action: 'create',
  requestedRole: 'cashier',
  requestedPermissions: { canViewAuditLog: true } // pharmacist doesn't have canViewAuditLog
});
assert.strictEqual(pharmGrantExcess.allowed, false);
assert.ok(pharmGrantExcess.error.includes('canViewAuditLog'));
console.log('✅ Privilege escalation by granting unowned permissions rejected');

// 5. Cannot modify or delete Owner
const editOwner = canManageUser({
  actor: pharmWithUsers,
  targetUser: owner,
  action: 'update',
  requestedRole: 'pharmacist'
});
assert.strictEqual(editOwner.allowed, false);
assert.ok(editOwner.error.includes('المالك محمي'));

const deleteOwner = canManageUser({
  actor: pharmWithUsers,
  targetUser: owner,
  action: 'delete'
});
assert.strictEqual(deleteOwner.allowed, false);
console.log('✅ Owner protection enforced against other users');

// 6. Cannot delete the last remaining admin
const deleteLastAdmin = canManageUser({
  actor: owner,
  targetUser: owner,
  action: 'delete',
  totalAdminsCount: 1
});
assert.strictEqual(deleteLastAdmin.allowed, false);
assert.ok(deleteLastAdmin.error.includes('حذف حسابه') || deleteLastAdmin.error.includes('المدير الوحيد'));
console.log('✅ Deleting self / last admin rejected');

// 7. User cannot modify their own permissions or role
const selfMod = canManageUser({
  actor: pharmWithUsers,
  targetUser: pharmWithUsers,
  action: 'update',
  requestedRole: 'admin'
});
assert.strictEqual(selfMod.allowed, false);
assert.ok(selfMod.error.includes('تغيير دور حسابك'));
console.log('✅ Self role escalation rejected');

console.log('🎉 All test-permissions.mjs checks passed!\n');
