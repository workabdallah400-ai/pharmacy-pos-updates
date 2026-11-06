const fs = require('fs');

let modal = fs.readFileSync('src/components/ProductModal.jsx', 'utf8');

const regex = /\{\/\* Unit Type & Sub-unit Pricing \*\/\}[\s\S]*?\{\/\* Stock & Reorder Level \*\/\}[\s\S]*?dir="ltr"\s*\/>\s*<\/div>\s*<\/div>/;

console.log('Regex matches?', regex.test(modal));

const replacement = `{/* Unit Type & Dynamic Sub-unit Pricing */}
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
                <div className={\`grid gap-2.5 \${isStripTier ? 'grid-cols-4' : 'grid-cols-3'}\`}>
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
          })()}`;

if (regex.test(modal)) {
  modal = modal.replace(regex, replacement);
  fs.writeFileSync('src/components/ProductModal.jsx', modal, 'utf8');
  console.log('ProductModal.jsx updated successfully!');
} else {
  console.error('Failed to match regex in ProductModal.jsx');
}
