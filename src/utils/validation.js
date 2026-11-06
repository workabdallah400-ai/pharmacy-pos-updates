/**
 * Validation utilities for invoices, discounts, and customer debt collections.
 * Pure JS functions with zero browser/Vite dependencies, suitable for Node.js test runners and UI/Service layers.
 */

/**
 * Validates invoice discount against subtotal.
 * Rules:
 *  - undefined / null / '' => returns { discount: 0 }
 *  - NaN / non-numeric / negative => throws Arabic Error
 *  - if subtotal is finite number and discount > subtotal => throws Arabic Error
 *  - Otherwise returns { discount: safeDiscount } rounded to 2 decimal places.
 */
export function validateInvoiceDiscount(discount, subtotal) {
  if (discount === undefined || discount === null || discount === '') {
    return { discount: 0 };
  }

  const numDisc = typeof discount === 'number' ? discount : parseFloat(discount);
  if (!Number.isFinite(numDisc) || numDisc < 0) {
    throw new Error('قيمة الخصم لا يمكن أن تكون سالبة أو غير صالحة.');
  }

  const safeDiscount = Math.round(numDisc * 100) / 100;

  if (subtotal !== undefined && subtotal !== null && Number.isFinite(Number(subtotal))) {
    const numSubtotal = Number(subtotal);
    if (safeDiscount > numSubtotal) {
      throw new Error('قيمة الخصم لا يمكن أن تتجاوز الإجمالي الفرعي للفاتورة.');
    }
  }

  return { discount: safeDiscount };
}

/**
 * Validates customer debt collection amount against current customer balance.
 * Rules:
 *  - amountPaid <= 0 or not finite => throws Arabic Error
 *  - currentBalance <= 0 => throws Arabic Error
 *  - amountPaid > currentBalance + 0.001 => throws Arabic Error with exact amounts
 *  - Otherwise returns { amount: effectiveAmount, newBalance } rounded to 2 decimal places.
 */
export function validateDebtCollection(currentBalance, amountPaid) {
  const parsedAmount = typeof amountPaid === 'number' ? amountPaid : parseFloat(amountPaid);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('يرجى إدخال مبلغ تحصيل صحيح أكبر من صفر.');
  }

  const numBalance = Number(currentBalance) || 0;
  if (numBalance <= 0) {
    throw new Error('لا توجد مديونية مستحقة على هذا العميل.');
  }

  if (parsedAmount > numBalance + 0.001) {
    throw new Error(`مبلغ التحصيل (${parsedAmount.toFixed(2)} ج.م) يتجاوز إجمالي المديونية المستحقة (${numBalance.toFixed(2)} ج.م).`);
  }

  const effectiveAmount = Math.round(parsedAmount * 100) / 100;
  const newBalance = Math.max(0, Math.round((numBalance - effectiveAmount) * 100) / 100);

  return {
    amount: effectiveAmount,
    newBalance
  };
}
