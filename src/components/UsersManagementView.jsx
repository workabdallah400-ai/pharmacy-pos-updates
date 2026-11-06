import React, { useState, useEffect } from 'react';
import {
  Users, UserPlus, Edit2, Trash2, Eye, EyeOff, CheckCircle2,
  Crown, Stethoscope, User, Lock, AlertCircle, Shield,
  ToggleLeft, ToggleRight, Save, X, RefreshCw, Key
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';
import { hasPermission } from '../utils/permissions';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'المالك / المدير العام', icon: Crown, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
  { value: 'pharmacist', label: 'مدير صيدلية (Pharmacist)', icon: User, color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
  { value: 'cashier', label: 'موظف / كاشير (Cashier)', icon: Stethoscope, color: 'text-teal-400', bg: 'bg-teal-500/20 border-teal-500/30' },
];

const DEFAULT_PERMISSIONS_BY_ROLE = {
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
    canViewAuditLog: true,
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
    canViewAuditLog: false,
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
    canViewAuditLog: false,
  },
};

// Grouped permissions matching requirements
const PERMISSION_GROUPS = [
  {
    title: 'المبيعات ونقاط البيع',
    permissions: [
      { key: 'canGiveDiscount', label: 'منح خصومات على البيع', icon: '🏷️' },
      { key: 'canEditPrice', label: 'تعديل أسعار الأدوية', icon: '💲' },
      { key: 'canDeleteItem', label: 'حذف أصناف من السلة والمخزن', icon: '❌' },
      { key: 'canRefund', label: 'تسجيل مرتجعات بيع للعملاء', icon: '🔄' },
      { key: 'canCloseShift', label: 'فتح وتقفيل الورديات', icon: '🔒' }
    ]
  },
  {
    title: 'التقارير والأرباح',
    permissions: [
      { key: 'canViewReports', label: 'عرض التقارير والإحصائيات', icon: '📊' },
      { key: 'canViewProfits', label: 'رؤية الأرباح وأسعار التكلفة', icon: '💰' }
    ]
  },
  {
    title: 'المخزون والمستودع',
    permissions: [
      { key: 'canManageStock', label: 'إدارة المخزن وإدخال البضاعة', icon: '📦' },
      { key: 'canStockTake', label: 'إجراء جرد المخزون الفعلي', icon: '📋' }
    ]
  },
  {
    title: 'الإدارة والأمان',
    permissions: [
      { key: 'canManageUsers', label: 'إدارة المستخدمين والحسابات', icon: '👥' },
      { key: 'canManageSettings', label: 'تعديل الإعدادات العامة', icon: '⚙️' },
      { key: 'canDeleteInvoices', label: 'حذف وإلغاء الفواتير الصادرة', icon: '🗑️' },
      { key: 'canViewAuditLog', label: 'عرض سجل العمليات والتدقيق (Audit Log)', icon: '🛡️' }
    ]
  }
];

function UserForm({ existingUser = null, currentUser, onSave, onCancel }) {
  const isEdit = !!existingUser;
  const isTargetOwner = Boolean(existingUser?.is_owner);

  const [formData, setFormData] = useState({
    username: existingUser?.username || '',
    full_name: existingUser?.full_name || '',
    role: existingUser?.role || 'cashier',
    password: '',
    confirmPassword: '',
    is_active: existingUser?.is_active !== 0,
    permissions: existingUser?.permissions || DEFAULT_PERMISSIONS_BY_ROLE.cashier,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isActorAdmin = currentUser?.role === 'admin';

  const handleRoleChange = (role) => {
    // Non-admins can only assign cashier role
    if (!isActorAdmin && role !== 'cashier') {
      setError('صلاحياتك تسمح بإنشاء أو تعيين حسابات موظفين (كاشير) فقط.');
      return;
    }
    setError('');
    setFormData(prev => ({
      ...prev,
      role,
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[role] || DEFAULT_PERMISSIONS_BY_ROLE.cashier
    }));
  };

  const handlePermToggle = (key) => {
    // Check if actor has this permission themselves
    if (!hasPermission(currentUser, key)) {
      setError(`لا يمكنك منح صلاحية (${key}) لأنك لا تملكها في حسابك.`);
      return;
    }
    setError('');
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.full_name.trim()) {
      setError('يرجى إدخال الاسم الكامل.');
      return;
    }

    if (!isEdit) {
      if (!formData.username.trim() || !formData.password) {
        setError('اسم المستخدم وكلمة المرور مطلوبان.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('كلمة المرور وتأكيد كلمة المرور غير متطابقين.');
        return;
      }
    } else {
      if (formData.password && formData.password !== formData.confirmPassword) {
        setError('كلمة المرور الجديدة وتأكيدها غير متطابقين.');
        return;
      }
    }

    setIsSaving(true);
    try {
      if (isEdit) {
        const payload = {
          id: existingUser.id,
          full_name: formData.full_name.trim(),
          role: formData.role,
          is_active: formData.is_active,
          permissions: formData.permissions,
          updated_by: currentUser?.username || 'admin',
          actor: currentUser
        };
        if (formData.password) payload.newPassword = formData.password;

        const res = await sqliteService.updateUser(payload);
        if (res.success) {
          onSave(res.message);
        } else {
          setError(res.error || 'حدث خطأ أثناء تعديل الحساب.');
        }
      } else {
        const res = await sqliteService.createUser({
          username: formData.username.trim(),
          full_name: formData.full_name.trim(),
          password: formData.password,
          role: formData.role,
          permissions: formData.permissions,
          created_by: currentUser?.username || 'admin',
          actor: currentUser
        });
        if (res.success) {
          onSave(res.message);
        } else {
          setError(res.error || 'حدث خطأ أثناء إنشاء الحساب.');
        }
      }
    } catch (err) {
      setError('حدث خطأ أثناء الحفظ. تأكد من البيانات.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-cairo select-none" dir="rtl">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#23324D] bg-[#141E30] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
              {isEdit ? <Edit2 className="w-5 h-5 text-teal-400" /> : <UserPlus className="w-5 h-5 text-teal-400" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isEdit ? `تعديل حساب: ${existingUser.username}` : 'إنشاء حساب مستخدم جديد'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isEdit ? 'تعديل بيانات وصلاحيات الحساب' : 'إضافة موظف أو مدير صيدلية جديد'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">اسم المستخدم (Username) *</label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  dir="ltr"
                  value={formData.username}
                  onChange={(e) => setFormData(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  placeholder="ahmed_user"
                  disabled={isEdit}
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-9 pl-3 py-2.5 text-sm text-white font-mono focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              {isEdit && <p className="text-[10px] text-slate-500">لا يمكن تغيير اسم المستخدم بعد الإنشاء</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">الاسم الكامل *</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData(p => ({ ...p, full_name: e.target.value }))}
                placeholder="د. أحمد محمد"
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                {isEdit ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور *'}
              </label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={formData.password}
                  onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder={isEdit ? 'اتركها فارغة للإبقاء' : '••••••••••••'}
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-9 pl-9 py-2.5 text-sm text-white font-mono focus:outline-none"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-400" tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">تأكيد كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="••••••••••••"
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-9 pl-3 py-2.5 text-sm text-white font-mono focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Role Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300">الدور الوظيفي الرئيسي *</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((r) => {
                const RIcon = r.icon;
                const isOptionDisabled = !isActorAdmin && r.value !== 'cashier';
                return (
                  <button
                    key={r.value}
                    type="button"
                    disabled={isOptionDisabled}
                    onClick={() => handleRoleChange(r.value)}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      formData.role === r.value
                        ? 'bg-teal-500/15 border-teal-500/60'
                        : 'bg-[#0B1220] border-[#23324D] hover:border-teal-500/30'
                    } ${isOptionDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-1 ${r.bg} border`}>
                      <RIcon className={`w-5 h-5 ${r.color}`} />
                    </div>
                    <div className="text-xs font-bold text-white leading-tight">{r.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grouped Permissions Grid */}
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between border-b border-[#23324D] pb-2">
              <label className="block text-xs font-bold text-slate-200">الصلاحيات التفصيلية المقسمة</label>
              {formData.role === 'admin' && (
                <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                  المدير يمتلك جميع الصلاحيات تلقائياً
                </span>
              )}
            </div>

            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <div className="text-xs font-bold text-teal-400">{group.title}</div>
                <div className="grid grid-cols-2 gap-2">
                  {group.permissions.map(({ key, label, icon }) => {
                    const enabled = formData.permissions[key] || false;
                    const locked = formData.role === 'admin';
                    const actorHasIt = hasPermission(currentUser, key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handlePermToggle(key)}
                        disabled={locked || !actorHasIt}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                          enabled
                            ? 'bg-teal-500/10 border-teal-500/40 text-teal-200'
                            : 'bg-[#0B1220] border-[#23324D] opacity-60'
                        } ${!actorHasIt ? 'opacity-30 cursor-not-allowed' : ''}`}
                        title={!actorHasIt ? 'لا تملك هذه الصلاحية في حسابك لمنحها' : ''}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm shrink-0">{icon}</span>
                          <span className="text-xs font-medium truncate">{label}</span>
                        </div>
                        {enabled
                          ? <ToggleRight className="w-5 h-5 text-teal-400 shrink-0 mr-1" />
                          : <ToggleLeft className="w-5 h-5 text-slate-500 shrink-0 mr-1" />
                        }
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Account Status Toggle (edit only) */}
          {isEdit && !isTargetOwner && (
            <div className="flex items-center justify-between p-3.5 bg-[#0B1220] rounded-xl border border-[#23324D]">
              <div>
                <div className="text-xs font-bold text-white">حالة الحساب</div>
                <div className="text-[11px] text-slate-400">تعطيل الحساب يمنع المستخدم من تسجيل الدخول</div>
              </div>
              <button
                type="button"
                onClick={() => setFormData(p => ({ ...p, is_active: !p.is_active }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                  formData.is_active
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                }`}
              >
                {formData.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                {formData.is_active ? 'حساب نشط ومفعّل' : 'حساب معطّل'}
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-rose-400 text-xs font-medium bg-rose-500/10 border border-rose-500/30 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>

        {/* Footer Buttons */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-[#23324D] bg-[#17233A]/50 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-[#0B1220] border border-[#23324D] text-slate-300 text-xs font-bold hover:bg-[#17233A] transition-all cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-black shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إنشاء الحساب الآن'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsersManagementView({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const canManage = hasPermission(currentUser, 'canManageUsers');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await sqliteService.getUsers();
      setUsers(data);
    } catch (e) {
      showToast('خطأ في تحميل المستخدمين');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleSaved = (msg) => {
    setShowForm(false);
    setEditingUser(null);
    showToast(msg || 'تم الحفظ بنجاح ✓');
    loadUsers();
  };

  const handleDelete = async (user) => {
    const result = await sqliteService.deleteUser(user.id, currentUser?.username || 'admin', currentUser);
    if (result.success) {
      showToast(`تم حذف حساب "${user.username}" بنجاح`);
      loadUsers();
    } else {
      showToast(`خطأ: ${result.error}`);
    }
    setConfirmDelete(null);
  };

  const handleToggleActive = async (user) => {
    const result = await sqliteService.updateUser({
      id: user.id,
      is_active: !user.is_active,
      updated_by: currentUser?.username || 'admin',
      actor: currentUser
    });
    if (result.success) {
      showToast(user.is_active ? `تم تعطيل حساب "${user.username}"` : `تم تفعيل حساب "${user.username}"`);
      loadUsers();
    } else {
      showToast(`خطأ: ${result.error}`);
    }
  };

  const roleInfo = (u) => {
    if (u.is_owner) {
      return { label: 'المالك / المدير العام 👑', color: 'text-amber-300 bg-amber-500/15 border-amber-500/40', icon: Crown };
    }
    if (u.role === 'admin') {
      return { label: 'مدير عام', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30', icon: Crown };
    }
    if (u.role === 'pharmacist') {
      return { label: 'مدير صيدلية', color: 'text-blue-300 bg-blue-500/10 border-blue-500/30', icon: User };
    }
    return { label: 'موظف / كاشير', color: 'text-teal-300 bg-teal-500/10 border-teal-500/30', icon: Stethoscope };
  };

  return (
    <div className="space-y-4 max-w-4xl font-cairo" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-2xl border border-teal-400/30 flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-teal-400">
          <Users className="w-5 h-5" />
          <span>إدارة حسابات المستخدمين والصلاحيات ({users.length} مستخدم)</span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => { setEditingUser(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-black shadow-lg transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>إنشاء حساب جديد</span>
          </button>
        )}
      </div>

      {!canManage && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-amber-300 text-sm font-medium">
          <Shield className="w-5 h-5 shrink-0" />
          <span>هذا القسم متاح فقط للمديرين وأصحاب الصلاحية. تواصل مع الإدارة لإدارة الحسابات.</span>
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#23324D] bg-[#111A2B]">
        <table className="w-full text-right text-xs">
          <thead className="bg-[#17233A] text-slate-400 font-bold border-b border-[#23324D]">
            <tr>
              <th className="p-3">المستخدم</th>
              <th className="p-3">اسم الدخول</th>
              <th className="p-3 text-center">الدور الوظيفي</th>
              <th className="p-3 text-center">الحالة</th>
              <th className="p-3">آخر دخول</th>
              <th className="p-3">أنشأه</th>
              {canManage && <th className="p-3 text-center">الإجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#23324D]/60">
            {isLoading ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="text-center py-10 text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  جاري تحميل بيانات المستخدمين...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="text-center py-10 text-slate-500">لا توجد حسابات مسجلة.</td>
              </tr>
            ) : users.map((u) => {
              const ri = roleInfo(u);
              const RIcon = ri.icon;
              const isCurrentUser = u.username === currentUser?.username;
              const isOwner = Boolean(u.is_owner);
              return (
                <tr key={u.id} className={`hover:bg-[#17233A]/50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${ri.color.split(' ').slice(1).join(' ')}`}>
                        <RIcon className={`w-5 h-5 ${ri.color.split(' ')[0]}`} />
                      </div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{u.full_name}</span>
                          {isOwner && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              المالك
                            </span>
                          )}
                        </div>
                        {isCurrentUser && (
                          <div className="text-[10px] text-teal-400 font-bold">← أنت الآن</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-teal-300 font-bold">{u.username}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${ri.color}`}>
                      {ri.label}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {canManage && !isCurrentUser && !isOwner ? (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                          u.is_active
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'text-rose-400 bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20'
                        }`}
                      >
                        {u.is_active ? '🟢 نشط' : '🔴 معطّل'}
                      </button>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${u.is_active ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-400 bg-rose-500/10 border-rose-500/30'}`}>
                        {u.is_active ? '🟢 نشط' : '🔴 معطّل'}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-400 font-mono">
                    {u.last_login ? new Date(u.last_login).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : 'لم يسجل بعد'}
                  </td>
                  <td className="p-3 text-slate-500 text-[11px]">{u.created_by || 'SYSTEM'}</td>
                  {canManage && (
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        {(!isOwner || currentUser?.is_owner) && (
                          <button
                            type="button"
                            onClick={() => { setEditingUser(u); setShowForm(true); }}
                            className="w-8 h-8 rounded-lg bg-[#17233A] hover:bg-teal-500/20 text-slate-400 hover:text-teal-300 border border-[#23324D] flex items-center justify-center transition-all cursor-pointer"
                            title="تعديل"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!isCurrentUser && !isOwner && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(u)}
                            className="w-8 h-8 rounded-lg bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-all cursor-pointer"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111A2B] border border-rose-500/40 rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">تأكيد حذف المستخدم</h3>
              <p className="text-xs text-slate-400 mt-1">
                هل أنت متأكد من حذف حساب "{confirmDelete.username}" نهائياً من النظام؟
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#17233A] text-slate-300 text-xs font-bold hover:bg-[#202E4C]"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/40"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <UserForm
          existingUser={editingUser}
          currentUser={currentUser}
          onSave={handleSaved}
          onCancel={() => { setShowForm(false); setEditingUser(null); }}
        />
      )}
    </div>
  );
}
