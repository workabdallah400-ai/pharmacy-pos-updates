const fs = require('fs');

let pos = fs.readFileSync('src/components/POSView.jsx', 'utf8');

// 1. Update import
pos = pos.replace(
  "import { getUnitName } from '../utils/pharmacyUnits';",
  "import { getUnitName, getUnitDisplayInfo } from '../utils/pharmacyUnits';"
);

// 2. Update stock & price display in card
const oldStockPriceBlock = `<div className="flex flex-wrap items-center justify-between gap-1 text-xs mb-2 pt-1.5 border-t border-[#23324D]/60">
                        {/* Stock status with composite display */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={\`w-2 h-2 rounded-full shrink-0 \${
                              inStock ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'
                            }\`}
                          ></span>
                          <span className={\`text-[11px] font-semibold whitespace-nowrap \${inStock ? 'text-slate-300' : 'text-rose-400 font-bold'}\`}>
                            {inStock ? (
                              <span>
                                {boxes} ع {strips > 0 ? \`و \${strips} ش\` : ''} {units > 0 ? \`و \${units} \${unitTypeName}\` : ''}
                              </span>
                            ) : 'نفد من المخزن'}
                          </span>
                        </div>

                        {/* Prices: Box | Strip | Unit */}
                        <div className="text-left font-mono shrink-0 whitespace-nowrap" dir="ltr">
                          <span className="font-extrabold text-teal-300 text-sm">
                            {med.price_box.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1">ج</span>
                          <span className="text-[10px] text-slate-500 mr-1 ml-1">|</span>
                          <span className="text-[11px] text-slate-400">
                            ش: {med.price_strip.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 mr-1 ml-1">|</span>
                          <span className="text-[11px] text-cyan-300">
                            {unitTypeName}: {unitPriceCalc.toFixed(2)}
                          </span>
                        </div>
                      </div>`;

const newStockPriceBlock = `{(() => {
                        const unitInfo = getUnitDisplayInfo(med.unit_type);
                        const hasStrip = unitInfo.hasMidUnit;

                        return (
                          <div className="flex flex-wrap items-center justify-between gap-1 text-xs mb-2 pt-1.5 border-t border-[#23324D]/60">
                            {/* Stock status with composite display */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={\`w-2 h-2 rounded-full shrink-0 \${
                                  inStock ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'
                                }\`}
                              ></span>
                              <span className={\`text-[11px] font-semibold whitespace-nowrap \${inStock ? 'text-slate-300' : 'text-rose-400 font-bold'}\`}>
                                {inStock ? (
                                  hasStrip ? (
                                    <span>
                                      {boxes} ع {strips > 0 ? \`و \${strips} ش\` : ''} {units > 0 ? \`و \${units} \${unitTypeName}\` : ''}
                                    </span>
                                  ) : (
                                    <span>
                                      {boxes} ع {units > 0 ? \`و \${units} \${unitTypeName}\` : ''}
                                    </span>
                                  )
                                ) : 'نفد من المخزن'}
                              </span>
                            </div>

                            {/* Prices: Box | (Strip) | Unit */}
                            <div className="text-left font-mono shrink-0 whitespace-nowrap" dir="ltr">
                              <span className="font-extrabold text-teal-300 text-sm">
                                {med.price_box.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">ج</span>
                              {hasStrip && (
                                <>
                                  <span className="text-[10px] text-slate-500 mr-1 ml-1">|</span>
                                  <span className="text-[11px] text-slate-400">
                                    ش: {med.price_strip.toFixed(2)}
                                  </span>
                                </>
                              )}
                              <span className="text-[10px] text-slate-500 mr-1 ml-1">|</span>
                              <span className="text-[11px] text-cyan-300">
                                {unitTypeName}: {unitPriceCalc.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}`;

if (pos.includes(oldStockPriceBlock)) {
  pos = pos.replace(oldStockPriceBlock, newStockPriceBlock);
  console.log('Updated stock & price display in POSView!');
} else {
  console.log('Stock & price block did not match directly.');
}

// 3. Update fast action buttons (hide strip button if not hasMidUnit)
const oldButtonsGrid = `<div className="grid grid-cols-4 gap-1">
                        {/* Add Box Button */}
                        <button
                          type="button"
                          onClick={() => addToCart(med, 'box')}
                          disabled={!inStock}
                          className={\`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all \${
                            inStock
                              ? 'bg-[#17233A] hover:bg-teal-500 hover:text-slate-950 text-white border border-[#23324D] active:scale-95 cursor-pointer'
                              : 'bg-slate-800/40 text-slate-600 border border-slate-700/40 cursor-not-allowed opacity-50'
                          }\`}
                          title={inStock ? 'إضافة علبة كاملة للسلة' : 'الرصيد نفد'}
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>علبة</span>
                        </button>

                        {/* Add Strip Button */}
                        <button
                          type="button"
                          onClick={() => addToCart(med, 'strip')}
                          disabled={!inStock || spb <= 1}
                          className={\`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all \${
                            inStock && spb > 1
                              ? 'bg-[#17233A] hover:bg-teal-500 hover:text-slate-950 text-white border border-[#23324D] active:scale-95 cursor-pointer'
                              : 'bg-slate-800/20 text-slate-600 border border-slate-800 cursor-not-allowed opacity-40'
                          }\`}
                          title={spb > 1 ? 'إضافة شريط للسلة' : 'لا يحتوي على شرائط'}
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>شريط</span>
                        </button>

                        {/* Add Unit / Tablet Button */}
                        <button
                          type="button"
                          onClick={() => addToCart(med, 'unit')}
                          disabled={!inStock}
                          className={\`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all \${
                            inStock
                              ? 'bg-cyan-500/15 hover:bg-cyan-400 hover:text-slate-950 text-cyan-300 border border-cyan-500/30 active:scale-95 cursor-pointer'
                              : 'bg-slate-800/40 text-slate-600 border border-slate-700/40 cursor-not-allowed opacity-50'
                          }\`}
                          title={\`إضافة \${unitTypeName} واحد للسلة\`}
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>{unitTypeName}</span>
                        </button>

                        {/* Alternatives Button (F6) */}
                        <button
                          type="button"
                          onClick={() => handleOpenAlternatives(med)}
                          className={\`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all \${
                            !inStock
                              ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 animate-pulse'
                              : 'bg-[#17233A]/80 hover:bg-[#202E4C] text-slate-300 border border-[#23324D]'
                          }\`}
                          title="عرض الأدوية البديلة لنفس المادة الفعالة"
                        >
                          <Dna className="w-2.5 h-2.5 text-teal-400" />
                          <span>بدائل</span>
                        </button>
                      </div>`;

const newButtonsGrid = `{(() => {
                        const unitInfo = getUnitDisplayInfo(med.unit_type);
                        const hasStrip = unitInfo.hasMidUnit;

                        return (
                          <div className={\`grid gap-1 \${hasStrip ? 'grid-cols-4' : 'grid-cols-3'}\`}>
                            {/* Add Box Button */}
                            <button
                              type="button"
                              onClick={() => addToCart(med, 'box')}
                              disabled={!inStock}
                              className={\`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all \${
                                inStock
                                  ? 'bg-[#17233A] hover:bg-teal-500 hover:text-slate-950 text-white border border-[#23324D] active:scale-95 cursor-pointer'
                                  : 'bg-slate-800/40 text-slate-600 border border-slate-700/40 cursor-not-allowed opacity-50'
                              }\`}
                              title={inStock ? 'إضافة علبة كاملة للسلة' : 'الرصيد نفد'}
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>علبة</span>
                            </button>

                            {/* Add Strip Button (Only for medicines with strips) */}
                            {hasStrip && (
                              <button
                                type="button"
                                onClick={() => addToCart(med, 'strip')}
                                disabled={!inStock || spb <= 1}
                                className={\`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all \${
                                  inStock && spb > 1
                                    ? 'bg-[#17233A] hover:bg-teal-500 hover:text-slate-950 text-white border border-[#23324D] active:scale-95 cursor-pointer'
                                    : 'bg-slate-800/20 text-slate-600 border border-slate-800 cursor-not-allowed opacity-40'
                                }\`}
                                title={spb > 1 ? 'إضافة شريط للسلة' : 'لا يحتوي على شرائط'}
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>شريط</span>
                              </button>
                            )}

                            {/* Add Unit / Tablet / Ampoule Button */}
                            <button
                              type="button"
                              onClick={() => addToCart(med, 'unit')}
                              disabled={!inStock}
                              className={\`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all \${
                                inStock
                                  ? 'bg-cyan-500/15 hover:bg-cyan-400 hover:text-slate-950 text-cyan-300 border border-cyan-500/30 active:scale-95 cursor-pointer'
                                  : 'bg-slate-800/40 text-slate-600 border border-slate-700/40 cursor-not-allowed opacity-50'
                              }\`}
                              title={\`إضافة \${unitTypeName} واحد للسلة\`}
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>{unitTypeName}</span>
                            </button>

                            {/* Alternatives Button (F6) */}
                            <button
                              type="button"
                              onClick={() => handleOpenAlternatives(med)}
                              className={\`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all \${
                                !inStock
                                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 animate-pulse'
                                  : 'bg-[#17233A]/80 hover:bg-[#202E4C] text-slate-300 border border-[#23324D]'
                              }\`}
                              title="عرض الأدوية البديلة لنفس المادة الفعالة"
                            >
                              <Dna className="w-2.5 h-2.5 text-teal-400" />
                              <span>بدائل</span>
                            </button>
                          </div>
                        );
                      })()}`;

if (pos.includes(oldButtonsGrid)) {
  pos = pos.replace(oldButtonsGrid, newButtonsGrid);
  console.log('Updated fast action buttons grid in POSView!');
} else {
  console.log('Buttons grid did not match directly.');
}

// 4. Update toggleUnitType in Cart
const oldToggleUnit = `      let nextUnit = 'box';
      if (item.unitType === 'box') {
        nextUnit = spb > 1 ? 'strip' : 'unit';
      } else if (item.unitType === 'strip') {
        nextUnit = 'unit';
      } else {
        nextUnit = 'box';
      }`;

const newToggleUnit = `      const unitInfo = getUnitDisplayInfo(item.unit_type);
      const hasStrip = unitInfo.hasMidUnit;

      let nextUnit = 'box';
      if (item.unitType === 'box') {
        nextUnit = (hasStrip && spb > 1) ? 'strip' : 'unit';
      } else if (item.unitType === 'strip') {
        nextUnit = 'unit';
      } else {
        nextUnit = 'box';
      }`;

if (pos.includes(oldToggleUnit)) {
  pos = pos.replace(oldToggleUnit, newToggleUnit);
  console.log('Updated toggleUnitType in POSView!');
} else {
  console.log('ToggleUnit did not match directly.');
}

fs.writeFileSync('src/components/POSView.jsx', pos, 'utf8');
