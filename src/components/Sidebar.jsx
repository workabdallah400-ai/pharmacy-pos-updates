import React from 'react';
import {
  ShoppingCart,
  Pill,
  Truck,
  ClipboardList,
  Hourglass,
  BookUser,
  Clock,
  BarChart3,
  Settings,
  LogOut,
  UserCheck,
  Crown,
  Stethoscope
} from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'pos', label: 'نقطة البيع والكاشير', icon: ShoppingCart, tag: 'F1' },
  { id: 'products', label: 'دليل الأدوية والمخزن', icon: Pill, tag: 'F5', permission: 'canManageStock' },
  { id: 'purchases', label: 'فواتير الشراء والتوريد', icon: Truck, tag: 'F7', permission: 'canManageStock' },
  { id: 'shortages', label: 'كشكول النواقص', icon: ClipboardList, badge: 'تنبيه', permission: 'canManageStock' },
  { id: 'expiry', label: 'تواريخ الصلاحية', icon: Hourglass, badge: 'مهم', permission: 'canManageStock' },
  { id: 'customers', label: 'ديون العملاء', icon: BookUser, permission: 'canCloseShift' },
  { id: 'shifts', label: 'إدارة وتقفيل الورديات', icon: Clock, permission: 'canCloseShift' },
  { id: 'reports', label: 'تقارير المبيعات والأرباح', icon: BarChart3, permission: 'canViewReports' },
  { id: 'settings', label: 'الإعدادات العامة', icon: Settings, permission: 'canManageSettings' },
];

export function Sidebar({ activeTab, onSelectTab, currentUser, onLogout }) {
  const isAdmin = currentUser?.role === 'admin';
  const permissions = currentUser?.permissions || {};
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    if (isAdmin) return true;
    return permissions[item.permission] === true;
  });

  return (
    <aside className="w-64 bg-[#111A2B] border-l border-[#23324D] flex flex-col justify-between select-none z-20 shrink-0">
      
      {/* Top Navigation Menu List */}
      <div className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
        <div className="text-[11px] font-bold text-slate-400 px-3 py-1 mb-1 tracking-wider">
          القوائم والوظائف الرئيسية
        </div>

        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-right font-medium transition-all duration-200 group relative ${
                isActive
                  ? 'bg-gradient-to-l from-teal-500/15 via-[#17233A] to-[#17233A] text-white font-bold border border-teal-500/30 shadow-glow-teal'
                  : 'text-slate-300 hover:text-white hover:bg-[#17233A]/70 border border-transparent'
              }`}
            >
              {/* Active right glow line */}
              {isActive && (
                <div className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-teal-400 rounded-l-full shadow-glow-teal"></div>
              )}

              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-teal-500/20 text-teal-300'
                      : 'bg-[#17233A] text-slate-400 group-hover:text-teal-400 group-hover:bg-[#1D2B47]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm">{item.label}</span>
              </div>

              {/* Tag or Badge */}
              {item.tag && (
                <span className="text-[10px] font-mono bg-black/30 text-slate-400 px-1.5 py-0.5 rounded border border-[#23324D]/60">
                  {item.tag}
                </span>
              )}
              {item.badge && (
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom User Profile Badge & Logout */}
      <div className="p-3 border-t border-[#23324D] bg-[#0E1524]">
        <div className="flex items-center justify-between bg-[#17233A] border border-[#23324D] p-2.5 rounded-xl mb-2">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${
              currentUser?.role === 'admin' ? 'bg-amber-500/20 border-amber-500/40' : 'bg-teal-500/20 border-teal-500/40'
            }`}>
              {currentUser?.role === 'admin' ? (
                <Crown className="w-5 h-5 text-amber-400" />
              ) : (
                <Stethoscope className="w-5 h-5 text-teal-400" />
              )}
            </div>
            <div>
              <div className="font-bold text-xs text-white leading-tight">
                {currentUser?.full_name || currentUser?.name || 'الصيدلاني'}
              </div>
              <div className={`text-[11px] font-medium ${currentUser?.role === 'admin' ? 'text-amber-400/90' : 'text-teal-400/90'}`}>
                {currentUser?.role === 'admin' ? 'مدير الصيدلية' : currentUser?.role === 'pharmacist' ? 'صيدلاني' : 'كاشير / موظف'}
              </div>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-2 px-3 rounded-xl bg-[#17233A]/60 hover:bg-rose-500/15 border border-[#23324D] hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>تسجيل الخروج والتبديل</span>
        </button>
      </div>

    </aside>
  );
}
