import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  Save,
  X,
  History,
  TrendingDown,
  TrendingUp,
  FileText
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';

export function StockTakeModal({ isOpen, onClose, currentUser, onComplete }) {
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'
  const [title, setTitle] = useState(`جرد دوري - ${new Date().toLocaleDateString('ar-EG')}`);
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [displayedMedicines, setDisplayedMedicines] = useState([]);
  const [medicinesById, setMedicinesById] = useState(new Map());
  const [countedData, setCountedData] = useState({}); // { [medId]: { boxes: number, strips: number } }
  const [historyList, setHistoryList] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isLoadingAll, setIsLoadingAll] = useState(false);

  const searchDebounceRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Load medicines & history on open
  useEffect(() => {
    if (!isOpen) return;
    let isCurrent = true;

    const loadInitialData = async () => {
      setIsLoadingAll(true);
      try {
        // Load in batches to populate medicinesById map without freezing the UI
        let page = 1;
        let hasMore = true;
        const allMap = new Map();
        const initialCounts = {};

        // Fetch first batch quickly for immediate display
        const firstBatch = await sqliteService.getMedicinesForStockTake(1, 500);
        if (!isCurrent) return;
        (firstBatch.items || []).forEach((m) => {
          allMap.set(Number(m.id), m);
          initialCounts[m.id] = {
            boxes: Number(m.stock_boxes) || 0,
            strips: Number(m.stock_strips) || 0
          };
        });

        setMedicinesById(new Map(allMap));
        setDisplayedMedicines(firstBatch.items || []);
        setCountedData(initialCounts);

        // Fetch remaining in background if any
        hasMore = firstBatch.hasMore;
        page = 2;
        while (hasMore && isCurrent) {
          const batch = await sqliteService.getMedicinesForStockTake(page, 500);
          if (!isCurrent) break;
          (batch.items || []).forEach((m) => {
            allMap.set(Number(m.id), m);
            if (!initialCounts[m.id]) {
              initialCounts[m.id] = {
                boxes: Number(m.stock_boxes) || 0,
                strips: Number(m.stock_strips) || 0
              };
            }
          });
          hasMore = batch.hasMore;
          page++;
        }

        if (isCurrent) {
          setMedicinesById(new Map(allMap));
          setCountedData((prev) => ({ ...initialCounts, ...prev }));
        }

        const hist = await sqliteService.getStockTakes(30);
        if (isCurrent && hist) {
          setHistoryList(hist);
        }
      } catch (e) {
        console.warn('Error loading stock take data:', e);
      } finally {
        if (isCurrent) setIsLoadingAll(false);
      }
    };

    loadInitialData();
    return () => { isCurrent = false; };
  }, [isOpen]);

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await sqliteService.searchMedicines(val, 250);
        setDisplayedMedicines(results || []);
        setMedicinesById((prevMap) => {
          const nextMap = new Map(prevMap);
          (results || []).forEach((m) => nextMap.set(Number(m.id), m));
          return nextMap;
        });
        setCountedData((prevCounts) => {
          const nextCounts = { ...prevCounts };
          (results || []).forEach((m) => {
            if (!nextCounts[m.id]) {
              nextCounts[m.id] = {
                boxes: Number(m.stock_boxes) || 0,
                strips: Number(m.stock_strips) || 0
              };
            }
          });
          return nextCounts;
        });
      } catch (e) {
        console.warn('Search error in stock take:', e);
      }
    }, 350);
  };

  const handleBoxChange = (id, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setCountedData((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { strips: 0 }),
        boxes: num
      }
    }));
  };

  const handleStripChange = (id, val, stripsPerBox = 1) => {
    const maxStrips = Math.max(0, stripsPerBox - 1);
    const parsed = Math.max(0, parseInt(val, 10) || 0);
    const num = Math.min(maxStrips, parsed);
    setCountedData((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { boxes: 0 }),
        strips: num
      }
    }));
  };

  // Discrepancy analysis: evaluated across ALL counted items in medicinesById,
  // NOT just the currently filtered/displayed search results.
  const discrepancies = useMemo(() => {
    const list = [];
    for (const [medId, counted] of Object.entries(countedData)) {
      const med = medicinesById.get(Number(medId));
      if (!med || !counted) continue;

      const spb = Math.max(1, parseInt(med.strips_per_box, 10) || 1);
      const systemTotalStrips = ((parseInt(med.stock_boxes, 10) || 0) * spb) + (parseInt(med.stock_strips, 10) || 0);

      // Normalize actual strips: if actual strips >= spb, roll into boxes
      const rawBoxes = Math.max(0, parseInt(counted.boxes, 10) || 0);
      const rawStrips = Math.max(0, parseInt(counted.strips, 10) || 0);
      const countedTotalStrips = (rawBoxes * spb) + rawStrips;

      if (systemTotalStrips !== countedTotalStrips) {
        const diffStrips = countedTotalStrips - systemTotalStrips;
        const diffBoxesEquiv = diffStrips / spb;
        const diffValue = diffBoxesEquiv * (Number(med.price_box) || 0);

        list.push({
          med,
          actual_boxes: Math.floor(countedTotalStrips / spb),
          actual_strips: countedTotalStrips % spb,
          stock_boxes: Number(med.stock_boxes) || 0,
          stock_strips: Number(med.stock_strips) || 0,
          diffStrips,
          diffValue: Math.round(diffValue * 100) / 100
        });
      }
    }
    return list;
  }, [medicinesById, countedData]);

  const totalDiscrepancyValue = discrepancies.reduce((sum, d) => sum + d.diffValue, 0);

  const handleSaveStockTake = async () => {
    if (discrepancies.length === 0) {
      if (!window.confirm('لم يتم رصد أي فروقات بين الرصيد الفعلي والمسجل. هل تريد حفظ جلسة الجرد كمطابقة 100%؟')) {
        return;
      }
    } else {
      if (!window.confirm(`تم رصد فروقات في (${discrepancies.length}) صنف بقيمة إجمالية (${totalDiscrepancyValue.toFixed(2)} ج.م).\nهل تريد اعتماد التسوية وتحديث رصيد المخزن الفعلي فوراً؟`)) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const itemsToSave = discrepancies.map((d) => ({
        id: d.med.id,
        actual_boxes: d.actual_boxes,
        actual_strips: d.actual_strips,
        stock_boxes: d.stock_boxes,
        stock_strips: d.stock_strips,
        price_box: d.med.price_box
      }));

      const res = await sqliteService.saveStockTake({
        title,
        notes,
        auditor_name: currentUser?.full_name || currentUser?.name || 'مدير الصيدلية',
        items: itemsToSave
      });

      showToast(`تم حفظ الجرد بنجاح! تم تسوية ${res.discrepancyCount} صنف بقيمة ${res.netDiffValue.toFixed(2)} ج.م ✓`);
      if (onComplete) onComplete();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (e) {
      alert('خطأ أثناء حفظ جلسة الجرد: ' + (e.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-cairo select-none">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-3xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-[#23324D] flex items-center justify-between bg-[#141E30]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                جرد المخزون الفعلي وتسوية الأرصدة
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                  تدقيق دقيق
                </span>
                {isLoadingAll && (
                  <span className="text-[10px] text-purple-300 animate-pulse">
                    (جاري فهرسة الأصناف...)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                تسجيل العلب والشرائط الفعلية على الرف ومقارنتها برصيد النظام مع احتساب الفروقات المالية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[#0B1220] rounded-xl p-1 border border-[#23324D]">
              <button
                type="button"
                onClick={() => setActiveTab('new')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'new'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                جلسة جرد جديدة
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'history'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                سجل الجرودات السابقة
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-[#0B1220] border border-[#23324D] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {activeTab === 'new' ? (
          <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
            
            {/* Top Toolbar: Title & Notes & Search */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">عنوان جلسة الجرد:</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-9 bg-[#0B1220] border border-[#23324D] focus:border-purple-400 rounded-xl px-3 text-xs text-white outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">ملاحظات التدقيق:</label>
                <input
                  type="text"
                  value={notes}
                  placeholder="مثال: جرد رفوف المضادات الحيوية..."
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-9 bg-[#0B1220] border border-[#23324D] focus:border-purple-400 rounded-xl px-3 text-xs text-slate-300 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">البحث في الأصناف:</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="ابحث بالاسم أو الباركود..."
                    className="w-full h-9 bg-[#0B1220] border border-[#23324D] focus:border-purple-400 rounded-xl pr-9 pl-3 text-xs text-white outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Discrepancies Summary Bar */}
            <div className="bg-[#0B1220] border border-[#23324D] rounded-2xl p-3 flex items-center justify-between shrink-0 text-xs">
              <div className="flex items-center gap-4">
                <span className="text-slate-400">
                  المعروض للعد: <strong className="text-white font-mono">{displayedMedicines.length}</strong>
                </span>
                <span className="text-slate-400">
                  إجمالي الأصناف التي بها فروقات:{' '}
                  <strong className={`font-mono ${discrepancies.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {discrepancies.length}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400">صافي قيمة الفروقات:</span>
                <span
                  className={`font-mono font-bold text-sm ${
                    totalDiscrepancyValue < 0
                      ? 'text-rose-400'
                      : totalDiscrepancyValue > 0
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                  }`}
                  dir="ltr"
                >
                  {totalDiscrepancyValue.toFixed(2)} ج.م
                </span>
              </div>
            </div>

            {/* Medicines Count Table */}
            <div className="flex-1 overflow-x-auto overflow-y-auto bg-[#0B1220] border border-[#23324D] rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] sticky top-0 z-10 font-bold">
                  <tr>
                    <th className="p-3">الصنف الدوائي</th>
                    <th className="p-3">الباركود</th>
                    <th className="p-3 text-center">الرصيد بالنظام</th>
                    <th className="p-3 text-center bg-purple-950/40 border-x border-[#23324D]">الرصيد الفعلي (جرد)</th>
                    <th className="p-3 text-center">الفرق</th>
                    <th className="p-3 text-center">قيمة الفرق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23324D]/60 font-medium">
                  {displayedMedicines.map((med) => {
                    const spb = Math.max(1, parseInt(med.strips_per_box, 10) || 1);
                    const sysBoxes = Number(med.stock_boxes) || 0;
                    const sysStrips = Number(med.stock_strips) || 0;
                    const currentCount = countedData[med.id] || { boxes: sysBoxes, strips: sysStrips };

                    const sysTotalStrips = (sysBoxes * spb) + sysStrips;
                    const actTotalStrips = (currentCount.boxes * spb) + currentCount.strips;
                    const diffStrips = actTotalStrips - sysTotalStrips;
                    const diffVal = (diffStrips / spb) * (Number(med.price_box) || 0);
                    const hasDiff = diffStrips !== 0;

                    return (
                      <tr
                        key={med.id}
                        className={`transition-colors ${
                          hasDiff ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-[#17233A]/60'
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-bold text-white">{med.trade_name_ar || med.trade_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{med.trade_name}</div>
                        </td>

                        <td className="p-3 font-mono text-slate-400 text-[11px]" dir="ltr">
                          {med.barcode || '-'}
                        </td>

                        <td className="p-3 text-center font-mono text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-[#17233A] border border-[#23324D]">
                            {sysBoxes} ع {spb > 1 ? `+ ${sysStrips} ش` : ''}
                          </span>
                        </td>

                        <td className="p-3 text-center bg-purple-950/20 border-x border-[#23324D]">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={currentCount.boxes}
                                onChange={(e) => handleBoxChange(med.id, e.target.value)}
                                className="w-14 h-7 text-center font-mono font-bold bg-[#111A2B] border border-purple-400/50 rounded-lg text-white text-xs outline-none focus:border-purple-300"
                              />
                              <span className="text-[10px] text-purple-300">علبة</span>
                            </div>

                            {spb > 1 && (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max={spb - 1}
                                  value={currentCount.strips}
                                  onChange={(e) => handleStripChange(med.id, e.target.value, spb)}
                                  className="w-12 h-7 text-center font-mono font-bold bg-[#111A2B] border border-purple-400/50 rounded-lg text-white text-xs outline-none focus:border-purple-300"
                                />
                                <span className="text-[10px] text-purple-300">شريط</span>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="p-3 text-center font-mono font-bold">
                          {hasDiff ? (
                            <span className={diffStrips > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {diffStrips > 0 ? `+${diffStrips}` : diffStrips} شريط
                            </span>
                          ) : (
                            <span className="text-slate-400">مطابق ✓</span>
                          )}
                        </td>

                        <td className="p-3 text-center font-mono font-bold" dir="ltr">
                          {hasDiff ? (
                            <span className={diffVal > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {diffVal > 0 ? `+${diffVal.toFixed(2)}` : diffVal.toFixed(2)} ج.م
                            </span>
                          ) : (
                            <span className="text-slate-400">0.00</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between border-t border-[#23324D] pt-3 shrink-0">
              <div className="text-xs text-slate-400">
                المسؤول: <strong className="text-purple-300">{currentUser?.full_name || 'مدير الصيدلية'}</strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-[#17233A] text-slate-300 hover:text-white text-xs font-bold transition-colors"
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveStockTake}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري الحفظ والتسوية...' : 'اعتماد وتسوية المخزون'}</span>
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* History Tab */
          <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-3">
            <div className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              سجل جلسات جرد المخزون السابقة المسجلة بالنظام:
            </div>

            {historyList.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                لا توجد جلسات جرد مخزون مسجلة مسبقاً.
              </div>
            ) : (
              historyList.map((st) => (
                <div
                  key={st.id}
                  className="p-4 rounded-2xl bg-[#0B1220] border border-[#23324D] flex items-center justify-between text-xs font-mono"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-white text-sm font-sans flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-400" />
                      <span>{st.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                        {st.status || 'مكتمل'}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px] font-sans">
                      المراجع: <strong className="text-slate-200">{st.auditor_name}</strong> | التاريخ: {new Date(st.created_at).toLocaleString('ar-EG')}
                    </div>
                    {st.notes && (
                      <div className="text-slate-400 text-[11px] font-sans italic">
                        ملاحظة: {st.notes}
                      </div>
                    )}
                  </div>

                  <div className="text-left space-y-1">
                    <div>
                      الأصناف التي تم جردها: <strong className="text-teal-300">{st.total_items}</strong>
                    </div>
                    <div>
                      أصناف بها فروقات: <strong className="text-amber-400">{st.discrepancy_count}</strong>
                    </div>
                    <div className="border-t border-[#23324D] pt-1">
                      صافي الفروقات:{' '}
                      <strong className={Number(st.net_difference_value) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {Number(st.net_difference_value || 0).toFixed(2)} ج.م
                      </strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
