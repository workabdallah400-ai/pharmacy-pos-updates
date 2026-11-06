/**
 * Pricing and discount calculation utilities.
 */

export function calculateCartTotal(subtotal, discount) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const rawDisc = parseFloat(discount);
  const safeDiscount = Math.max(0, isNaN(rawDisc) ? 0 : rawDisc);
  const cappedDiscount = Math.min(safeDiscount, sub);
  const finalTotal = Math.max(0, Math.round((sub - cappedDiscount) * 100) / 100);
  return {
    subtotal: sub,
    discount: cappedDiscount,
    total: finalTotal
  };
}
