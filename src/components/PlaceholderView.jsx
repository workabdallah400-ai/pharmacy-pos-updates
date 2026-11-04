import React from 'react';
import { NAV_ITEMS } from './Sidebar';
import { Sparkles, ArrowLeft, Layers, ShieldCheck } from 'lucide-react';

const TAB_DESCRIPTIONS = {
  pos: {
    subtitle: 'شاشة الكاشير السريع ونقاط البيع',
    desc: 'إتمام عمليات البيع بالعلبة والشريط، دعم الباركود، الدفع المجزأ، والطباعة الحرارية الفورية.',
    features: ['بحث فوري بالاسم والباركود', 'بيع بالعلبة والشريط', 'طباعة فواتير 80mm / 58mm', 'دعم الدفع المتعدد']
  },
  products: {
    subtitle: 'إدارة المخزن والأدوية',
    desc: 'دليل الأدوية المصري الشامل، تعديل الأسعار، ومراقبة الأرصدة الحالية في الأرفف والمخزن.',
    features: ['دليل 30,000 دواء مصري', 'تحديد الأماكن والأرفف', 'تعديل أسعار الجمهور', 'حركة الأصناف']
  },
  purchases: {
    subtitle: 'فواتير الموردين وشركات التوزيع',
    desc: 'تسجيل بضاعة شركات التوزيع (المتحدة، ابن سينا، فارما أوفرسيز) وضبط متوسط التكلفة.',
    features: ['حساب نسبة الخصم للصيدلي', 'إدخال البونص والخصم التجاري', 'تحديث المخزن التلقائي', 'حساب صافي الأرباح']
  },
  shortages: {
    subtitle: 'كشكول النواقص الذكي',
    desc: 'تتبع الأصناف التي اقتربت من حد الطلب أو نفدت تماماً وتصدير طلبية الشراء للموزعين.',
    features: ['حد الطلب التلقائي', 'تصدير طلبية للموزعين', 'تنبيه النواقص باللون الأحمر', 'اقتراح كميات التوريد']
  },
  expiry: {
    subtitle: 'نظام تواريخ الصلاحية وتنبيهات الإكسباير',
    desc: 'مراقبة صلاحيات التشغيلات وتنبيهات الأدوية المنتهية أو القريبة (أقل من 3 أشهر أو 6 أشهر).',
    features: ['تتبع التشغيلات (Batch)', 'تنبيهات ملونة حسب القرب', 'تقرير مرتجعات الإكسباير للشركات', 'منع بيع المنتهي']
  },
  customers: {
    subtitle: 'حسابات العملاء والبيع الآجل',
    desc: 'إدارة سقف المديونية، كشوف الحسابات، وسندات تحصيل النقدية من العملاء الدائمين.',
    features: ['حد ائتماني محدد لكل عميل', 'كشف حساب تفصيلي', 'سندات قبض نقدي', 'حظر تجاوز السقف']
  },
  reports: {
    subtitle: 'التقارير المالية والورديات',
    desc: 'تقفيل وردية الكاشير، إجمالي المبيعات، الأرباح اليومية، ومصروفات النثريات.',
    features: ['تقفيل وردية تفصيلي (Z-Report)', 'حساب العهدة ونقدية الدرج', 'تقارير أرباح يومية وشهرية', 'QR كود المتابعة']
  },
  settings: {
    subtitle: 'إعدادات النظام والأجهزة',
    desc: 'تخصيص ترويسة الفاتورة الحرارية، درج النقدية، النسخ الاحتياطي، وإدارة التراخيص.',
    features: ['تخصيص الفاتورة وبيانات الصيدلية', 'ربط الطابعات ودرج النقدية', 'نسخ احتياطي محلي وعلى فلاشة', 'حماية وترخيص البرنامج']
  }
};

export function PlaceholderView({ activeTabId }) {
  const currentNav = NAV_ITEMS.find((item) => item.id === activeTabId) || NAV_ITEMS[0];
  const Icon = currentNav.icon;
  const meta = TAB_DESCRIPTIONS[activeTabId] || {
    subtitle: 'وحدة النظام',
    desc: 'سيتم بناء وتفعيل هذه الشاشة بالتفصيل في المرحلة التالية.',
    features: []
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0B1220] p-6 sm:p-8 flex flex-col justify-center items-center select-none text-slate-100">
      
      {/* Decorative center card */}
      <div className="max-w-2xl w-full bg-[#111A2B] border border-[#23324D] rounded-3xl p-8 sm:p-10 shadow-card-dark text-center relative overflow-hidden">
        
        {/* Subtle backdrop light */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Radiant Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-teal-500/25 via-[#17233A] to-[#111A2B] border border-teal-500/40 text-teal-400 shadow-glow-teal mb-5">
          <Icon className="w-10 h-10" />
        </div>

        {/* Tab Title & Subtitle */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-xs font-bold text-teal-400 bg-teal-500/10 border border-teal-500/25 px-2.5 py-0.5 rounded-full">
            المرحلة القادمة
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {currentNav.label}
          </h2>
        </div>
        
        <p className="text-teal-300 font-semibold text-sm mb-3">
          {meta.subtitle}
        </p>

        <p className="text-slate-400 text-sm max-w-lg mx-auto leading-relaxed mb-8">
          {meta.desc}
        </p>

        {/* Feature Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 text-right">
          {meta.features.map((feature, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2.5 bg-[#17233A] border border-[#23324D] px-3.5 py-2.5 rounded-xl text-xs text-slate-200 font-medium"
            >
              <div className="w-2 h-2 rounded-full bg-teal-400 shrink-0"></div>
              <span>{feature}</span>
            </div>
          ))}
        </div>

        {/* Ready Notification Pill */}
        <div className="inline-flex items-center gap-2 bg-[#17233A]/80 border border-[#23324D] px-4 py-2 rounded-xl text-xs text-slate-400">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span>الهيكل العام والشريط الجانبي جاهزان 100% — جاهزون لبناء تفاصيل هذه الشاشة الآن!</span>
        </div>

      </div>

    </div>
  );
}
