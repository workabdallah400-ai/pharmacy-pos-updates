/**
 * Stock helpers shared by the shortages screen and the product editor.
 *
 * A medicine's shelf quantity is stored in three tiers (boxes, loose strips,
 * loose single units). The shortages notebook used to compare only
 * `stock_boxes`, so 4 loose strips of a 3-strips-per-box item looked like an
 * empty shelf. These helpers convert every tier into "boxes" so the reorder
 * level is compared against the real quantity on hand.
 */

export function effectiveStockBoxes(medicine) {
  if (!medicine) return 0;
  const boxes = Number(medicine.stock_boxes) || 0;
  const strips = Number(medicine.stock_strips) || 0;
  const units = Number(medicine.stock_units) || 0;
  const stripsPerBox = Math.max(1, Number(medicine.strips_per_box) || 1);
  const unitsPerStrip = Math.max(1, Number(medicine.units_per_strip) || 1);
  return boxes + strips / stripsPerBox + units / (stripsPerBox * unitsPerStrip);
}

export function reorderLevelOf(medicine) {
  const reorder = Number(medicine?.reorder_level);
  return Number.isFinite(reorder) && reorder > 0 ? reorder : 5;
}

/** True when the item is at or below its reorder level. */
export function isShortage(medicine) {
  return effectiveStockBoxes(medicine) <= reorderLevelOf(medicine);
}
