const fs = require('fs');

// 1. Update ProductModal.jsx
let modal = fs.readFileSync('src/components/ProductModal.jsx', 'utf8');

if (!modal.includes('PHARMACY_DOSAGE_UNITS')) {
  modal = modal.replace(
    "import { X, Pill, Sparkles, Wand2, CheckCircle2, AlertCircle } from 'lucide-react';",
    "import { X, Pill, Sparkles, Wand2, CheckCircle2, AlertCircle } from 'lucide-react';\nimport { PHARMACY_DOSAGE_UNITS, getUnitDisplayInfo } from '../utils/pharmacyUnits';"
  );
}

const oldSelect = `<select
                  value={formData.unit_type || 'tablets'}
                  onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}
                  className="h-7 bg-[#111A2B] border border-[#23324D] text-teal-300 text-xs rounded-lg px-2 outline-none font-bold"
                >
                  <option value="tablets">أقراص / حبوب (قرص)</option>
                  <option value="ampoules">حقن وأمبولات (أمبول)</option>
                  <option value="spray">بخاخ ومحاليل (بخاخ/زجاجة)</option>
                  <option value="sachets">فوار وأكياس (كيس)</option>
                  <option value="capsules">كبسولات (كبسولة)</option>
                  <option value="units">وحدات مفردة (وحدة)</option>
                </select>`;

const newSelect = `<select
                  value={formData.unit_type || 'tablets'}
                  onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}
                  className="h-7 bg-[#111A2B] border border-[#23324D] text-teal-300 text-xs rounded-lg px-2 outline-none font-bold"
                >
                  {PHARMACY_DOSAGE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>`;

if (modal.includes(oldSelect)) {
  modal = modal.replace(oldSelect, newSelect);
}

modal = modal.replace('سعر الحبة / الوحدة', 'سعر {getUnitDisplayInfo(formData.unit_type).unitName} (ج.م)');
modal = modal.replace('عدد الحبات/الوحدات في الشريط الواحد:', 'عدد ({getUnitDisplayInfo(formData.unit_type).unitName}) في الشريط / الجزء:');
modal = modal.replace('>حبات / وحدات<', '>{getUnitDisplayInfo(formData.unit_type).unitName} مفردة<');

fs.writeFileSync('src/components/ProductModal.jsx', modal, 'utf8');
console.log('ProductModal.jsx updated.');

// 2. Update POSView.jsx to use getUnitName
let pos = fs.readFileSync('src/components/POSView.jsx', 'utf8');

if (!pos.includes('getUnitName')) {
  pos = pos.replace(
    "import { DEFAULT_SETTINGS } from '../data/mockSettings';",
    "import { DEFAULT_SETTINGS } from '../data/mockSettings';\nimport { getUnitName } from '../utils/pharmacyUnits';"
  );
}

// Replace hardcoded switch in POSView (line 820)
const oldSwitch1 = `                const unitTypeName = (() => {
                  switch (med.unit_type) {
                    case 'ampoules': return 'أمبول';
                    case 'spray': return 'بخاخ';
                    case 'sachets': return 'كيس';
                    case 'capsules': return 'كبسولة';
                    case 'units': return 'وحدة';
                    default: return 'قرص';
                  }
                })();`;

const newSwitch1 = `                const unitTypeName = getUnitName(med.unit_type);`;

if (pos.includes(oldSwitch1)) {
  pos = pos.replace(oldSwitch1, newSwitch1);
}

// Replace hardcoded switch in POSView (line 1058)
const oldSwitch2 = `                const unitTypeName = (() => {
                  switch (item.unit_type) {
                    case 'ampoules': return 'أمبول';
                    case 'spray': return 'بخاخ';
                    case 'sachets': return 'كيس';
                    case 'capsules': return 'كبسولة';
                    case 'units': return 'وحدة';
                    default: return 'قرص';
                  }
                })();`;

const newSwitch2 = `                const unitTypeName = getUnitName(item.unit_type);`;

if (pos.includes(oldSwitch2)) {
  pos = pos.replace(oldSwitch2, newSwitch2);
}

fs.writeFileSync('src/components/POSView.jsx', pos, 'utf8');
console.log('POSView.jsx updated.');
