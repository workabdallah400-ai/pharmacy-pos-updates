/**
 * Pharmacy Dosage Forms and Dispensing Units Definition
 * الوحدات الصغرى ووحدات التجزئة والصرف الصيدلي
 */

export const PHARMACY_DOSAGE_UNITS = [
  { id: 'tablets', label: 'أقراص / حبوب (قرص)', unitName: 'قرص', midUnit: 'شريط', hasMidUnit: true },
  { id: 'capsules', label: 'كبسولات (كبسولة)', unitName: 'كبسولة', midUnit: 'شريط', hasMidUnit: true },
  { id: 'ampoules', label: 'أمبولات (حقن كسر)', unitName: 'أمبول', midUnit: 'شريط', hasMidUnit: false },
  { id: 'vials', label: 'فيال (حقن بودرة أو سائل)', unitName: 'فيال', midUnit: 'شريط', hasMidUnit: false },
  { id: 'sachets', label: 'فوار / أكياس بودرة (كيس)', unitName: 'كيس', midUnit: 'علبة صغيرة', hasMidUnit: false },
  { id: 'bottles', label: 'زجاجات / معلق / شراب (زجاجة)', unitName: 'زجاجة', midUnit: 'شريط', hasMidUnit: false },
  { id: 'tubes', label: 'مراهم / كريمات / جل (أنبوبة)', unitName: 'أنبوبة', midUnit: 'شريط', hasMidUnit: false },
  { id: 'droppers', label: 'قطرات نقط للعين/الأذن/الأنف (قطارة)', unitName: 'قطارة', midUnit: 'شريط', hasMidUnit: false },
  { id: 'sprays', label: 'بخاخات واستنشاق (بخاخة)', unitName: 'بخاخة', midUnit: 'شريط', hasMidUnit: false },
  { id: 'suppositories', label: 'أقماع / لبوس شرجي ومهبلي (لبوسة)', unitName: 'لبوسة', midUnit: 'شريط', hasMidUnit: true },
  { id: 'patches', label: 'لاصقات طبية موضعية (لاصقة)', unitName: 'لاصقة', midUnit: 'شريط', hasMidUnit: false },
  { id: 'grams', label: 'جرامات / تراكيب معملية (جرام/مل)', unitName: 'جرام/مل', midUnit: 'عبوة', hasMidUnit: false },
  { id: 'units', label: 'وحدات مفردة متنوعة (وحدة)', unitName: 'وحدة', midUnit: 'شريط', hasMidUnit: false },
];

export function getUnitDisplayInfo(unitTypeId) {
  const match = PHARMACY_DOSAGE_UNITS.find(u => u.id === unitTypeId);
  if (match) return match;
  if (unitTypeId === 'spray') {
    return { id: 'sprays', label: 'بخاخات واستنشاق (بخاخة)', unitName: 'بخاخة', midUnit: 'شريط', hasMidUnit: false };
  }
  return { id: 'tablets', label: 'أقراص / حبوب (قرص)', unitName: 'قرص', midUnit: 'شريط', hasMidUnit: true };
}

export function getUnitName(unitTypeId) {
  return getUnitDisplayInfo(unitTypeId).unitName;
}
