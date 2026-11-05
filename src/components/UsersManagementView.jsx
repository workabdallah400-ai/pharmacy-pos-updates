import React, { useState, useEffect } from 'react';
import {
  Users, UserPlus, Edit2, Trash2, Eye, EyeOff, CheckCircle2,
  Crown, Stethoscope, User, Lock, AlertCircle, Shield,
  ToggleLeft, ToggleRight, Save, X, RefreshCw, Key
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'مدير الصيدلية (Admin)', icon: Crown, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
  { value: 'cashier', label: 'كاشير / موظف (Cashier)', icon: Stethoscope, color: 'text-teal-400', bg: 'bg-teal-500/20 border-teal-500/30' },
  { value: 'pharmacist', label: 'صيدلاني (Pharmacist)', icon: User, color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
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

const PERMISSION_LABELS = {
  canViewReports: { label: 'عرض التقارير والإحصائيات', icon: '📊' },
  canManageUsers: { label: 'إدارة المستخدمين والحسابات', icon: '👥' },
  canCloseShift: { label: 'تقفيل وفتح الورديات', icon: '🔒' },
  canManageStock: { label: 'إدارة المخزن وإدخال البضاعة', icon: '📦' },
  canViewProfits: { label: 'رؤية الأرباح وأسعار التكلفة', icon: '💰' },
  canManageSettings: { label: 'تعديل الإعدادات العامة', icon: '⚙️' },
  canDeleteInvoices: { label: 'حذف وإلغاء الفواتير', icon: '🗑️' },
  canGiveDiscount: { label: 'منح خصومات على البيع', icon: '🏷️' },
  canEditPrice: { label: 'تعديل أسعار الأدوية', icon: '💲' },
  canDeleteItem: { label: 'حذف أصناف من المخزن', icon: '❌' },
  canRefund: { label: 'تسجيل مرتجعات بيع للعملاء', icon: '🔄' },
  canStockTake: { label: 'إجراء جرد المخزون الفعلي', icon: '📋' },
  canViewAuditLog: { label: 'عرض سجل العمليات والتدقيق (Audit Log)', icon: '🛡️' },
};

function UserForm({ existingUser = null, currentUser, onSave, onCancel }) {
  const isEdit = !!existingUser;
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

  const handleRoleChange = (role) => {
    setFormData(prev => ({
      ...prev,
      role,
      permissions: { ...DEFAULT_PERMISSIONS_BY_ROLE[role] }
    }));
  };

  const handlePermToggle = (perm) => {
    if (formData.role === 'admin') return; // admin always has all
    setFormData(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [perm]: !prev.permissions[perm] }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.username.trim()) return setError('اسم المستخدم مطلوب');
    if (!formData.full_name.trim()) return setError('الاسم الكامل مطلوب');
    if (!isEdit && !formData.password) return setError('كلمة المرور مطلوبة');
    if (formData.password && formData.password !== formData.confirmPassword) {
      return setError('كلمة المرور وتأكيدها غير متطابقتين');
    }
    if (formData.password && formData.password.length < 4) {
      return setError('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
    }

    setIsSaving(true);
    try {
      let result;
      if (isEdit) {
        result = await sqliteService.updateUser({
          id: existingUser.id,
          full_name: formData.full_name,
          role: formData.role,
          is_active: formData.is_active,
          permissions: formData.permissions,
          newPassword: formData.password || undefined,
        });
      } else {
        result = await sqliteService.createUser({
          username: formData.username,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
          permissions: formData.permissions,
          created_by: currentUser?.full_name || 'admin',
        });
      }
      if (result.success) {
        onSave(result.message);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('حدث خطأ غير متوقع. حاول مجدداً.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedRole = ROLE_OPTIONS.find(r => r.value === formData.role);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
              {isEdit ? <Edit2 className="w-5 h-5 text-teal-400" /> : <UserPlus className="w-5 h-5 text-teal-400" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isEdit ? `تعديل حساب: ${existingUser.username}` : 'إنشاء حساب مستخدم جديد'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isEdit ? 'تعديل بيانات وصلاحيات الحساب' : 'المدير هو الوحيد المخول بإنشاء حسابات جديدة'}
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
                  value={formData.username}
                  onChange={(e) => setFormData(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  placeholder="مثال: ahmed_cashier"
                  disabled={isEdit}
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-9 pl-3 py-2.5 text-sm text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                placeholder="مثال: د. أحمد محمد"
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                {isEdit ? 'كلمة مرور جديدة (اتركها فارغة إن لم ترد التغيير)' : 'كلمة المرور *'}
              </label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder={isEdit ? 'اتركها فارغة للإبقاء على الحالية' : 'أدخل كلمة المرور...'}
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-9 pl-9 py-2.5 text-sm text-white focus:outline-none"
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
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="أعد إدخال كلمة المرور..."
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-9 pl-3 py-2.5 text-sm text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Role Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300">الدور الوظيفي والصلاحية الرئيسية *</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((r) => {
                const RIcon = r.icon;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => handleRoleChange(r.value)}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      formData.role === r.value
                        ? 'bg-teal-500/15 border-teal-500/60'
                        : 'bg-[#0B1220] border-[#23324D] hover:border-teal-500/30'
                    }`}
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

          {/* Permissions Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300">الصلاحيات التفصيلية</label>
              {formData.role === 'admin' && (
                <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                  المدير يمتلك جميع الصلاحيات تلقائياً
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PERMISSION_LABELS).map(([key, { label, icon }]) => {
                const enabled = formData.permissions[key] || false;
                const locked = formData.role === 'admin';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePermToggle(key)}
                    disabled={locked}
                    className={`flex items-center justify-between p-3 rounded-xl border text-right transition-all cursor-pointer disabled:cursor-default ${
                      enabled
                        ? 'bg-teal-500/10 border-teal-500/40'
                        : 'bg-[#0B1220] border-[#23324D] opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{icon}</span>
                      <span className="text-xs font-medium text-slate-200">{label}</span>
                    </div>
                    {enabled
                      ? <ToggleRight className="w-5 h-5 text-teal-400 shrink-0" />
                      : <ToggleLeft className="w-5 h-5 text-slate-500 shrink-0" />
                    }
                  </button>
                );
              })}
            </div>
          </div>

          {/* Account Status Toggle (edit only) */}
          {isEdit && (
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
            type="submit"
            form="user-form"
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

  const isAdmin = currentUser?.role === 'admin';

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
    const result = await sqliteService.deleteUser(user.id);
    if (result.success) {
      showToast(`تم حذف حساب "${user.username}" بنجاح`);
      loadUsers();
    } else {
      showToast(`خطأ: ${result.error}`);
    }
    setConfirmDelete(null);
  };

  const handleToggleActive = async (user) => {
    const result = await sqliteService.updateUser({ id: user.id, is_active: !user.is_active });
    if (result.success) {
      showToast(user.is_active ? `تم تعطيل حساب "${user.username}"` : `تم تفعيل حساب "${user.username}"`);
      loadUsers();
    }
  };

  const roleInfo = (role) => {
    if (role === 'admin') return { label: 'مدير صيدلية', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30', icon: Crown };
    if (role === 'pharmacist') return { label: 'صيدلاني', color: 'text-blue-300 bg-blue-500/10 border-blue-500/30', icon: User };
    return { label: 'كاشير / موظف', color: 'text-teal-300 bg-teal-500/10 border-teal-500/30', icon: Stethoscope };
  };

  return (
    <div className="space-y-4 max-w-4xl" dir="rtl">
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
        {isAdmin && (
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

      {!isAdmin && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-amber-300 text-sm font-medium">
          <Shield className="w-5 h-5 shrink-0" />
          <span>هذا القسم متاح فقط لمدير الصيدلية. تواصل مع المدير لإدارة الحسابات والصلاحيات.</span>
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
              {isAdmin && <th className="p-3 text-center">الإجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#23324D]/60">
            {isLoading ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="text-center py-10 text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  جاري تحميل بيانات المستخدمين...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="text-center py-10 text-slate-500">لا توجد حسابات.</td>
              </tr>
            ) : users.map((u) => {
              const ri = roleInfo(u.role);
              const RIcon = ri.icon;
              const isCurrentUser = u.username === currentUser?.username;
              return (
                <tr key={u.id} className={`hover:bg-[#17233A]/50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${ri.color.split(' ').slice(1).join(' ')}`}>
                        <RIcon className={`w-5 h-5 ${ri.color.split(' ')[0]}`} />
                      </div>
                      <div>
                        <div className="font-bold text-white">{u.full_name}</div>
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
                    {isAdmin && !isCurrentUser ? (
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
                  {isAdmin && (
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingUser(u); setShowForm(true); }}
                          className="w-8 h-8 rounded-lg bg-[#17233A] hover:bg-teal-500/20 text-slate-400 hover:text-teal-300 border border-[#23324D] flex items-center justify-center transition-all cursor-pointer"
                          title="تعديل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!isCurrentUser && (
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

      {/* Permissions Key */}
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 space-y-3">
        <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
          <Key className="w-4 h-4 text-teal-400" />
          دليل الصلاحيات حسب الدور الوظيفي
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          {ROLE_OPTIONS.map((r) => {
            const perms = DEFAULT_PERMISSIONS_BY_ROLE[r.value];
            const RIcon = r.icon;
            return (
              <div key={r.value} className="bg-[#0B1220] rounded-xl p-3 border border-[#23324D] space-y-2">
                <div className={`flex items-center gap-1.5 font-bold ${r.color}`}>
                  <RIcon className="w-3.5 h-3.5" />
                  <span>{r.label}</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(PERMISSION_LABELS).map(([key, { label, icon }]) => (
                    <div key={key} className={`flex items-center gap-1 ${perms[key] ? 'text-emerald-400' : 'text-slate-600 line-through'}`}>
                      <span>{perms[key] ? '✓' : '✗'}</span>
                      <span>{icon} {label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Form Modal */}
      {showForm && (
        <UserForm
          existingUser={editingUser}
          currentUser={currentUser}
          onSave={handleSaved}
          onCancel={() => { setShowForm(false); setEditingUser(null); }}
        />
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111A2B] border border-rose-500/40 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">تأكيد حذف الحساب</div>
                <div className="text-xs text-rose-400">هذا الإجراء لا يمكن التراجع عنه</div>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              هل أنت متأكد من حذف حساب <span className="font-bold text-white">"{confirmDelete.full_name}"</span> (<span className="font-mono text-teal-400">{confirmDelete.username}</span>)؟
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#17233A] text-slate-300 text-xs font-bold hover:bg-[#23324D] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>تأكيد الحذف</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
