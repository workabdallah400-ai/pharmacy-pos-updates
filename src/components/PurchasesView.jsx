import React, { useState, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  Building2,
  FileText,
  DollarSign,
  Calendar,
  Percent,
  CheckCircle2,
  Clock,
  Printer,
  Eye,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';
import { NewPurchaseModal } from './NewPurchaseModal';
import { SuppliersModal } from './SuppliersModal';
import { PurchaseDetailsModal } from './PurchaseDetailsModal';

export function PurchasesView({
  purchases,
  suppliers,
  medicines,
  onSavePurchase,
  onPaySupplier,
  initialPurchaseData = null,
  onClearInitialPurchaseData
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // 'ALL', 'CREDIT', 'CASH'

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [selectedInvoiceForDetails, setSelectedInvoiceForDetails] = useState(null);

  // If initial purchase data passed from shortages, auto open modal
  React.useEffect(() => {
    if (initialPurchaseData) {
      setShowNewModal(true);
    }
  }, [initialPurchaseData]);

  // Toast
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // 1. Calculate Monthly Purchases Stats
  const stats = useMemo(() => {
    let totalPurchasesNet = 0;
    let totalRetail = 0;
    let totalDiscount = 0;
    const count = purchases.length;

    purchases.forEach((p) => {
      totalPurchasesNet += p.net_total;
      totalRetail += p.total_retail;
      totalDiscount += p.total_discount;
    });

    const totalSuppliersDebt = suppliers.reduce((sum, s) => sum + (s.balance || 0), 0);
    const avgDiscount = totalRetail > 0 ? (totalDiscount / totalRetail) * 100 : 25.0;

    return {
      totalPurchasesNet,
      count,
      totalSuppliersDebt,
      avgDiscount
    };
  }, [purchases, suppliers]);

  // 2. Filter Purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      const code = String(p.invoice_code || p.id || '').toLowerCase();
      const supplierInv = String(p.supplier_invoice_no || '').toLowerCase();
      const supplierName = String(p.supplier_name || '').toLowerCase();
      const matchesSearch =
        !q || code.includes(q) || supplierInv.includes(q) || supplierName.includes(q);

      if (!matchesSearch) return false;

      if (paymentFilter === 'CREDIT' && p.payment_method !== 'آجل') return false;
      if (paymentFilter === 'CASH' && p.payment_method !== 'نقدي') return false;

      return true;
    });
  }, [purchases, searchQuery, paymentFilter]);

  const handleCreatePurchase = async (invoice) => {
    try {
      await onSavePurchase(invoice);
      showToast(`تم توريد الفاتورة [${invoice.invoice_code}] وتحديث أرصدة المخزن فورياً! 🎉`);
    } catch (e) {
      console.error('Purchase save failed:', e);
      showToast(`تعذر حفظ فاتورة التوريد: ${e.message || 'خطأ غير معروف'}`);
      throw e;
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#0B1220] text-slate-100 overflow-hidden select-none font-cairo">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-4 py-2.5 rounded-2xl shadow-glow-teal flex items-center gap-2 text-xs font-bold">
            <Sparkles className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4 sm:p-6 space-y-4">
        
        {/* ======================================================== */}
        {/* 1. TOP STATS CARDS (4 CARDS)                             */}
        {/* ======================================================== */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Monthly Purchases Net */}
          <div className="p-4 rounded-2xl bg-[#111A2B] border border-[#23324D] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">إجمالي مشتريات التوريد</span>
              <div className="text-2xl font-black text-white font-mono" dir="ltr">
                {stats.totalPurchasesNet.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-xs font-bold text-teal-300">EGP</span>
              </div>
              <span className="text-[10px] text-teal-400 font-medium">صافي مسحوبات الصيدلية من الموزعين</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-glow-teal">
              <Truck className="w-6 h-6" />
            </div>
          </div>

          {/* Supply Invoices Count */}
          <div className="p-4 rounded-2xl bg-[#111A2B] border border-[#23324D] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">فواتير التوريد المسجلة</span>
              <div className="text-2xl font-black text-white font-mono">{stats.count} <span className="text-xs font-normal text-slate-400 font-sans">فاتورة</span></div>
              <span className="text-[10px] text-slate-400 font-medium">إجمالي حركات الاستلام من الشركات</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          {/* Suppliers Debt */}
          <div className="p-4 rounded-2xl bg-[#111A2B] border border-[#23324D] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">مديونيات الموردين الآجلة</span>
              <div className="text-2xl font-black text-amber-400 font-mono" dir="ltr">
                {stats.totalSuppliersDebt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-xs font-bold text-amber-300">EGP</span>
              </div>
              <span className="text-[10px] text-amber-400/90 font-medium">مستحقات واجبة السداد لشركات التوزيع</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Building2 className="w-6 h-6" />
            </div>
          </div>

          {/* Average Discount % */}
          <div className="p-4 rounded-2xl bg-[#111A2B] border border-[#23324D] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">متوسط خصم الصيدلي المحقق</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {stats.avgDiscount.toFixed(1)}%
              </div>
              <span className="text-[10px] text-emerald-400 font-medium">هامش الربح التجاري والبونص</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <Percent className="w-6 h-6" />
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 2. TOOLBAR & ACTION BUTTONS                              */}
        {/* ======================================================== */}
        <section className="bg-[#111A2B] border border-[#23324D] p-3.5 rounded-2xl shadow-sm space-y-3">
          
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث برقم الفاتورة، اسم شركة التوزيع، أو رقم فاتورة المورد الورقية..."
                className="w-full h-11 bg-[#17233A] border border-[#23324D] focus:border-teal-400 focus:shadow-glow-teal rounded-xl pr-10 pl-4 text-white text-xs font-semibold outline-none transition-all placeholder-slate-400"
              />
            </div>

            {/* Quick Payment Filter */}
            <div className="flex items-center gap-1.5 bg-[#17233A] p-1 rounded-xl border border-[#23324D] text-xs">
              {[
                { id: 'ALL', label: 'الكل' },
                { id: 'CREDIT', label: 'الآجل' },
                { id: 'CASH', label: 'النقدي' }
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPaymentFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    paymentFilter === f.id
                      ? 'bg-teal-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Actions: New Invoice + Suppliers Directory */}
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => setShowSuppliersModal(true)}
                className="flex-1 sm:flex-initial h-11 px-3.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Building2 className="w-4 h-4 text-teal-400" />
                <span>دليل شركات التوزيع ({suppliers.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="flex-1 sm:flex-initial h-11 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-95 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-glow-teal transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل فاتورة شراء جديدة</span>
              </button>
            </div>

          </div>

        </section>

        {/* ======================================================== */}
        {/* 3. PURCHASES HISTORY DATA TABLE                          */}
        {/* ======================================================== */}
        <section className="flex-1 bg-[#111A2B] border border-[#23324D] rounded-2xl shadow-sm overflow-hidden flex flex-col">
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold">
                <tr>
                  <th className="p-3.5">كود الفاتورة</th>
                  <th className="p-3.5">شركة التوزيع (المورد)</th>
                  <th className="p-3.5">تاريخ الاستلام</th>
                  <th className="p-3.5 text-center">عدد الأصناف</th>
                  <th className="p-3.5">إجمالي الجمهور</th>
                  <th className="p-3.5">صافي الفاتورة</th>
                  <th className="p-3.5 text-center">طريقة السداد</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23324D]/60 font-medium">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-12 text-slate-400">
                      لا توجد فواتير توريد مسجلة مطابقة للبحث. اضغط على (+ تسجيل فاتورة شراء جديدة).
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((pur) => (
                    <tr key={pur.id} className="hover:bg-[#17233A]/70 transition-colors">
                      {/* 1. Invoice Code & Supplier Ref */}
                      <td className="p-3.5">
                        <div className="font-mono font-bold text-teal-400 text-sm">
                          {pur.invoice_code || pur.id}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          رقم المورد: {pur.supplier_invoice_no}
                        </div>
                      </td>

                      {/* 2. Supplier Name */}
                      <td className="p-3.5">
                        <div className="font-bold text-white text-sm">
                          {pur.supplier_name}
                        </div>
                      </td>

                      {/* 3. Date */}
                      <td className="p-3.5 font-mono text-slate-300">
                        {String(pur.date || pur.date_time || '').slice(0, 10) || '-'}
                      </td>

                      {/* 4. Items Count */}
                      <td className="p-3.5 text-center font-bold text-white font-mono">
                        {pur.items_count} صنف
                      </td>

                      {/* 5. Retail Total */}
                      <td className="p-3.5 font-mono text-slate-300" dir="ltr">
                        {Number(pur.total_retail || 0).toFixed(2)} EGP
                      </td>

                      {/* 6. Net Total */}
                      <td className="p-3.5 font-mono font-black text-emerald-400 text-sm" dir="ltr">
                        {Number(pur.net_total || 0).toFixed(2)} EGP
                      </td>

                      {/* 7. Payment Method Badge */}
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                            pur.payment_method === 'نقدي'
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                          }`}
                        >
                          {pur.payment_method}
                        </span>
                      </td>

                      {/* 8. Actions */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceForDetails(pur)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#17233A] hover:bg-teal-500/20 text-slate-300 hover:text-teal-300 border border-[#23324D] flex items-center gap-1 text-[11px] font-semibold transition-colors"
                            title="استعراض بنود الفاتورة"
                          >
                            <Eye className="w-3.5 h-3.5 text-teal-400" />
                            <span>تفاصيل</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoiceForDetails(pur);
                              setTimeout(() => window.print(), 300);
                            }}
                            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-teal-500/20 text-slate-400 hover:text-teal-300 border border-[#23324D] flex items-center justify-center transition-colors"
                            title="طباعة تقرير الفاتورة"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Info */}
          <div className="p-3 bg-[#141E30] border-t border-[#23324D] flex items-center justify-between text-xs text-slate-400">
            <div>
              إجمالي الفواتير المعروضة: <span className="font-bold text-white">{filteredPurchases.length}</span> فاتورة
            </div>
            <div>
              تُحدّث الفواتير الجديدة أرصدة الأدوية بالمخزن فورياً بصورة متزامنة.
            </div>
          </div>

        </section>

      </div>

      {/* New Purchase Invoice Modal */}
      <NewPurchaseModal
        isOpen={showNewModal}
        onClose={() => {
          setShowNewModal(false);
          if (onClearInitialPurchaseData) onClearInitialPurchaseData();
        }}
        suppliers={suppliers}
        medicines={medicines}
        onSavePurchase={async (invoice) => {
          await handleCreatePurchase(invoice);
          if (onClearInitialPurchaseData) onClearInitialPurchaseData();
        }}
        initialItems={initialPurchaseData?.items || []}
        initialSupplierId={initialPurchaseData?.supplierId || null}
      />

      {/* Suppliers Directory Modal */}
      <SuppliersModal
        isOpen={showSuppliersModal}
        onClose={() => setShowSuppliersModal(false)}
        suppliers={suppliers}
        onPaySupplier={(supId, amount) => {
          onPaySupplier(supId, amount);
          showToast(`تم سداد مبلغ ${amount} ج.م لشركة التوزيع بنجاح! 💵`);
        }}
      />

      {/* Invoice Details & Print Modal */}
      <PurchaseDetailsModal
        isOpen={!!selectedInvoiceForDetails}
        onClose={() => setSelectedInvoiceForDetails(null)}
        invoice={selectedInvoiceForDetails}
      />

    </div>
  );
}
