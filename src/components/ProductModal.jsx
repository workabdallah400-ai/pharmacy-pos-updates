import React, { useState, useEffect } from 'react';
import { X, Pill, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { PHARMACY_DOSAGE_UNITS, getUnitDisplayInfo } from '../utils/pharmacyUnits';

const CATEGORIES = [
  'مسكنات وخافض حرارة',
  'مضادات حيوية',
  'برد وإنفلونزا',
  'فيتامينات ومعادن',
  'جهاز هضمي ومطهر',
  'دوار وأذن داخلية',
  'أدوية الضغط والقلب',
  'أدوية السكر والغدد',
  'جلدية وتجميل',
  'مستلزمات طبية',
  'أخرى'
];

export function ProductModal({ isOpen = true, onClose, medicine, medicineToEdit, onSave }) {
  const targetMedicine = medicineToEdit || medicine;

  const [formData, setFormData] = useState({
    trade_name_ar: '',
    trade_name: '',
    generic_name: '',
    barcode: '',
    category: 'مسكنات وخافض حرارة',
    shelf: 'A-01',
    strips_per_box: 2,
    units_per_strip: 10,
    unit_type: 'tablets',
    price_box: '',
    price_strip: '',
    price_unit: '',
    stock_boxes: 0,
    stock_strips: 0,
    stock_units: 0,
    reorder_level: 3,
    expiry: '',
    manufacturer: 'إيبيكو (EIPICO)'
  });

  const [error, setError] = useState('');

  useEffect(() => {
    if (targetMedicine) {
      setFormData({
        ...targetMedicine,
        trade_name_ar: targetMedicine.trade_name_ar || '',
        trade_name: targetMedicine.trade_name || '',
        generic_name: targetMedicine.generic_name || '',
        barcode: targetMedicine.barcode || '',
        category: targetMedicine.category || 'مسكنات وخافض حرارة',
        shelf: targetMedicine.shelf || 'A-01',
        unit_type: targetMedicine.unit_type || 'tablets',
        strips_per_box: targetMedicine.strips_per_box || 2,
        units_per_strip: targetMedicine.units_per_strip || 10,
        price_box: targetMedicine.price_box != null ? targetMedicine.price_box.toString() : '',
        price_strip: targetMedicine.price_strip != null ? targetMedicine.price_strip.toString() : '',
        price_unit: targetMedicine.price_unit != null ? targetMedicine.price_unit.toString() : '',
        stock_boxes: targetMedicine.stock_boxes != null ? targetMedicine.stock_boxes : 0,
        stock_strips: targetMedicine.stock_strips != null ? targetMedicine.stock_strips : 0,
        stock_units: targetMedicine.stock_units != null ? targetMedicine.stock_units : 0,
        reorder_level: targetMedicine.reorder_level != null ? targetMedicine.reorder_level : 3,
        expiry: targetMedicine.expiry || '',
        manufacturer: targetMedicine.manufacturer || 'إيبيكو (EIPICO)'
      });
    } else {
      setFormData({
        trade_name_ar: '',
        trade_name: '',
        generic_name: '',
        barcode: '',
        category: 'مسكنات وخافض حرارة',
        shelf: 'A-01',
        unit_type: 'tablets',
        strips_per_box: 2,
        units_per_strip: 10,
        price_box: '',
        price_strip: '',
        price_unit: '',
        stock_boxes: 0,
        stock_strips: 0,
        stock_units: 0,
        reorder_level: 3,
        expiry: '',
        manufacturer: 'إيبيكو (EIPICO)'
      });
    }
    setError('');
  }, [targetMedicine, isOpen]);

  if (!isOpen) return null;

  const handlePriceBoxChange = (val) => {
    const num = parseFloat(val);
    const unitInfo = getUnitDisplayInfo(formData.unit_type);
    const strips = parseInt(formData.strips_per_box, 10) || 1;
    const units = parseInt(formData.units_per_strip, 10) || 1;

    let stripP = formData.price_strip;
    let unitP = formData.price_unit;

    if (!isNaN(num) && num > 0) {
      if (unitInfo.hasMidUnit) {
        // 3-tier: Box -> Strip -> Tablet
        stripP = strips > 0 ? (num / strips).toFixed(2) : '';
        unitP = (strips > 0 && units > 0) ? (num / (strips * units)).toFixed(2) : '';
      } else {
        // 2-tier: Box -> Single Unit (Ampoule / Sachet / Bottle / etc.)
        stripP = '';
        unitP = strips > 0 ? (num / strips).toFixed(2) : '';
      }
    }

    setFormData((prev) => ({
      ...prev,
      price_box: val,
      price_strip: stripP,
      price_unit: unitP
    }));
  };

  const handleStripsChange = (val) => {
    const strips = parseInt(val, 10) || 1;
    const units = parseInt(formData.units_per_strip, 10) || 1;
    const num = parseFloat(formData.price_box);
    const stripP = !isNaN(num) && strips > 0 ? (num / strips).toFixed(2) : formData.price_strip;
    const unitP = !isNaN(num) && strips > 0 && units > 0 ? (num / (strips * units)).toFixed(2) : formData.price_unit;
    setFormData((prev) => ({
      ...prev,
      strips_per_box: strips,
      price_strip: stripP,
      price_unit: unitP
    }));
  };

  const handleUnitsPerStripChange = (val) => {
    const units = parseInt(val, 10) || 1;
    const strips = parseInt(formData.strips_per_box, 10) || 1;
    const num = parseFloat(formData.price_box);
    const unitP = !isNaN(num) && strips > 0 && units > 0 ? (num / (strips * units)).toFixed(2) : formData.price_unit;
    setFormData((prev) => ({
      ...prev,
      units_per_strip: units,
      price_unit: unitP
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.trade_name_ar.trim()) {
      setError('يرجى إدخال اسم الدواء باللغة العربية');
      return;
    }
    if (!formData.price_box || parseFloat(formData.price_box) <= 0) {
      setError('يرجى إدخال سعر بيع العلبة بشكل صحيح');
      return;
    }
    if (!String(formData.barcode || '').trim()) {
      setError('الباركود إجباري للصنف الجديد ولا يتم توليده تلقائياً.');
      return;
    }

    const payload = {
      ...formData,
      id: targetMedicine ? targetMedicine.id : Date.now(),
      unit_type: formData.unit_type || 'tablets',
      price_box: parseFloat(formData.price_box) || 0,
      price_strip: parseFloat(formData.price_strip) || 0,
      price_unit: parseFloat(formData.price_unit) || 0,
      strips_per_box: parseInt(formData.strips_per_box, 10) || 1,
      units_per_strip: parseInt(formData.units_per_strip, 10) || 1,
      stock_boxes: parseInt(formData.stock_boxes, 10) || 0,
      stock_strips: parseInt(formData.stock_strips, 10) || 0,
      stock_units: parseInt(formData.stock_units, 10) || 0,
      reorder_level: parseInt(formData.reorder_level, 10) || 3
    };

    onSave(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-xl bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shadow-glow-teal">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {targetMedicine ? 'تعديل بيانات الدواء والمخزون' : 'إضافة دواء جديد للدليل والمخزن'}
              </h3>
              <p className="text-xs text-slate-400">
                {targetMedicine ? `الصنف: ${targetMedicine.trade_name_ar}` : 'تسجيل صنف دوائي جديد بدليل الأدوية المصري'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Names Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                الاسم التجاري (بالعربية) *
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="مثال: بنادول أدفانس 500 مجم"
                value={formData.trade_name_ar}
                onChange={(e) => setFormData({ ...formData, trade_name_ar: e.target.value })}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                الاسم التجاري (بالإنجليزية)
              </label>
              <input
                type="text"
                placeholder="مثال: Panadol Advance 500mg"
                value={formData.trade_name}
                onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white text-xs outline-none"
                dir="ltr"
              />
            </div>
          </div>

          {/* Generic Name (Active Ingredient) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>المادة الفعالة والاسم العلمي (Generic Name) *</span>
              <span className="text-[10px] text-teal-400 font-normal">ضروري لربط البدائل الذكية (F6)</span>
            </label>
            <input
              type="text"
              required
              placeholder="مثال: Paracetamol 500mg"
              value={formData.generic_name}
              onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
              className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white text-xs outline-none"
              dir="ltr"
            />
          </div>

          {/* Barcode & Shelf */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                الباركود الدولي أو المحلي <span className="text-rose-400">*</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="أدخل الباركود الحقيقي..."
                  required
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="flex-1 h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-teal-300 font-mono text-xs outline-none"
                  dir="ltr"
                />

              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                مكان الرف بالصيدلية (Shelf)
              </label>
              <input
                type="text"
                placeholder="مثال: A-01 أو R-05"
                value={formData.shelf}
                onChange={(e) => setFormData({ ...formData, shelf: e.target.value })}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white text-xs outline-none font-mono"
              />
            </div>
          </div>

          {/* Unit Type & Dynamic Sub-unit Pricing */}
          {(() => {
            const unitInfo = getUnitDisplayInfo(formData.unit_type);
            const isStripTier = unitInfo.hasMidUnit; // Only tablets/capsules/suppositories have Strip tier

            return (
              <>
                <div className="p-3.5 rounded-2xl bg-[#17233A]/60 border border-[#23324D] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-300 block">وحدات وتجزئة البيع والتسعير:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">نوع الصنف الصيدلي:</span>
                      <select
                        value={formData.unit_type || 'tablets'}
                        onChange={(e) => {
                          const newType = e.target.value;
                          const nextInfo = getUnitDisplayInfo(newType);
                          setFormData((prev) => ({
                            ...prev,
                            unit_type: newType,
                            price_strip: nextInfo.hasMidUnit ? prev.price_strip : '',
                            strips_per_box: nextInfo.hasMidUnit ? prev.strips_per_box : (prev.strips_per_box || 1),
                            units_per_strip: nextInfo.hasMidUnit ? (prev.units_per_strip || 10) : 1
                          }));
                        }}
                        className="h-7 bg-[#111A2B] border border-[#23324D] text-teal-300 text-xs rounded-lg px-2 outline-none font-bold cursor-pointer"
                      >
                        {PHARMACY_DOSAGE_UNITS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* DYNAMIC PRICING GRID */}
                  {isStripTier ? (
                    /* 3-Tier Grid: Box -> Strip -> Tablet/Capsule */
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                            سعر العلبة (ج.م) *
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            required
                            placeholder="30.00"
                            value={formData.price_box}
                            onChange={(e) => handlePriceBoxChange(e.target.value)}
                            className="w-full h-10 bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-emerald-400 font-bold font-mono text-sm outline-none"
                            dir="ltr"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                            عدد الشرائط بالعلبة
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={formData.strips_per_box}
                            onChange={(e) => handleStripsChange(e.target.value)}
                            className="w-full h-10 bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white font-mono text-xs outline-none"
                            dir="ltr"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                            سعر الشريط (ج.م)
                          </label>
                          <input
                            type="number"
                            step="0.25"
                            value={formData.price_strip}
                            onChange={(e) => setFormData({ ...formData, price_strip: e.target.value })}
                            className="w-full h-10 bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-teal-300 font-mono text-xs outline-none"
                            dir="ltr"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                            سعر {unitInfo.unitName} (ج.م)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={formData.price_unit}
                            onChange={(e) => setFormData({ ...formData, price_unit: e.target.value })}
                            className="w-full h-10 bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-cyan-300 font-mono text-xs outline-none"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-[#23324D]/40 text-[11px] text-slate-400">
                        <span>عدد ({unitInfo.unitName}) في الشريط الواحد:</span>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={formData.units_per_strip}
                          onChange={(e) => handleUnitsPerStripChange(e.target.value)}
                          className="w-16 h-7 bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-lg text-center text-white font-mono text-xs outline-none"
                          dir="ltr"
                        />
                        <span className="text-[10px] text-slate-500">
                          (إجمالي العلبة = {(parseInt(formData.strips_per_box, 10) || 1) * (parseInt(formData.units_per_strip, 10) || 1)} {unitInfo.unitName})
                        </span>
                      </div>
                    </>
                  ) : (
                    /* 2-Tier Grid: Box -> Single Unit (Ampoule, Sachet, Bottle, etc.) */
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          سعر بيع العلبة (ج.م) *
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          required
                          placeholder="50.00"
                          value={formData.price_box}
                          onChange={(e) => handlePriceBoxChange(e.target.value)}
                          className="w-full h-10 bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-emerald-400 font-bold font-mono text-sm outline-none"
                          dir="ltr"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          عدد ({unitInfo.unitName}) في العلبة
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="200"
                          value={formData.strips_per_box}
                          onChange={(e) => handleStripsChange(e.target.value)}
                          className="w-full h-10 bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white font-mono text-xs outline-none"
                          dir="ltr"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          سعر {unitInfo.unitName} الواحد (ج.م)
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          value={formData.price_unit}
                          onChange={(e) => setFormData({ ...formData, price_unit: e.target.value })}
                          className="w-full h-10 bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-cyan-300 font-mono text-xs outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Dynamic Stock Grid */}
                <div className={`grid gap-2.5 ${isStripTier ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      رصيد العلب
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.stock_boxes}
                      onChange={(e) => setFormData({ ...formData, stock_boxes: e.target.value })}
                      className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white font-mono text-xs outline-none"
                      dir="ltr"
                    />
                  </div>

                  {isStripTier && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        شرائط منفصلة
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.stock_strips}
                        onChange={(e) => setFormData({ ...formData, stock_strips: e.target.value })}
                        className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-teal-300 font-mono text-xs outline-none"
                        dir="ltr"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {unitInfo.unitName} مفردة
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.stock_units}
                      onChange={(e) => setFormData({ ...formData, stock_units: e.target.value })}
                      className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-cyan-300 font-mono text-xs outline-none"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      حد الطلب (نواقص)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.reorder_level}
                      onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
                      className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-amber-300 font-mono text-xs outline-none"
                      dir="ltr"
                    />
                  </div>
                </div>
              </>
            );
          })()}

          {/* Expiry Date & Reorder Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                تاريخ الصلاحية (شهر / سنة أو يوم-شهر-سنة)
              </label>
              <input
                type="text"
                placeholder="مثال: 12/2026 أو 2026-12-01"
                value={formData.expiry || ''}
                onChange={(e) => setFormData({ ...formData, expiry: e.target.value })}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-amber-300 font-mono text-xs outline-none"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                مكان الرف / الدرج
              </label>
              <input
                type="text"
                placeholder="مثال: A-01"
                value={formData.shelf || ''}
                onChange={(e) => setFormData({ ...formData, shelf: e.target.value })}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white text-xs outline-none"
              />
            </div>
          </div>

          {/* Category & Manufacturer Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                القسم والتصنيف الطبي
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white text-xs outline-none"
              >
                {CATEGORIES.map((cat, idx) => (
                  <option key={idx} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                الشركة المنتجة / المصنعة
              </label>
              <input
                type="text"
                placeholder="مثال: فاركو / إيبيكو / نوفارتس / GSK"
                value={formData.manufacturer || ''}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white text-xs outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[#23324D] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold border border-[#23324D]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-glow-teal transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{medicineToEdit ? 'حفظ التعديلات' : 'إضافة الدواء للدليل'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
