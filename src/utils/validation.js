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

/* ------------------------------------------------------------------ */
/* Shared input validation helpers (dates, phones, numbers)            */
/* ------------------------------------------------------------------ */

/**
 * Converts Arabic-Indic / Persian digits to Latin digits so operators can
 * type dates and phone numbers with an Arabic keyboard.
 */
export function digitsToLatin(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/** Local calendar date as YYYY-MM-DD (avoids the UTC off-by-one near midnight). */
export function todayISODate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Strict YYYY-MM-DD validation, including real calendar days (no 31/02). */
export function isValidISODate(value) {
  const raw = digitsToLatin(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Parses the expiry formats used across the app:
 *   MM/YYYY, MM-YYYY, YYYY-MM, YYYY/MM
 *   DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
 * Returns null for anything else. A month-only value is treated as valid
 * through the last day of that month.
 */
export function parseExpiryDate(value) {
  const raw = digitsToLatin(value).trim();
  if (!raw) return null;

  let year;
  let month;
  let day = null;

  const yearFirst = raw.match(/^(\d{4})[\/.\-](\d{1,2})(?:[\/.\-](\d{1,2}))?$/);
  if (yearFirst) {
    year = Number(yearFirst[1]);
    month = Number(yearFirst[2]);
    day = yearFirst[3] ? Number(yearFirst[3]) : null;
  } else {
    const dayFirst = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (dayFirst) {
      day = Number(dayFirst[1]);
      month = Number(dayFirst[2]);
      year = Number(dayFirst[3]);
    } else {
      const monthYear = raw.match(/^(\d{1,2})[\/.\-](\d{4})$/);
      if (monthYear) {
        month = Number(monthYear[1]);
        year = Number(monthYear[2]);
      } else {
        return null;
      }
    }
  }

  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  if (day !== null) {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day
    ) {
      return null;
    }
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}`;
  const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return {
    year,
    month,
    day,
    hasDay: day !== null,
    iso,
    endOfMonth,
    // A month/year expiry is valid through the end of its month.
    effectiveDate: day !== null ? iso : endOfMonth
  };
}

/** True only for a valid expiry value that already ended before today. */
export function isExpiryInPast(value, today = todayISODate()) {
  const parsed = parseExpiryDate(value);
  if (!parsed) return false;
  return parsed.effectiveDate < today;
}

/** Validates an expiry input and returns a ready-to-display result. */
export function validateExpiryInput(value, options = {}) {
  const { required = true, allowPast = false, today = todayISODate() } = options;
  const raw = digitsToLatin(value).trim();

  if (!raw) {
    return required
      ? { valid: false, error: 'تاريخ الصلاحية إجباري.', parsed: null }
      : { valid: true, empty: true, parsed: null, normalized: '' };
  }

  const parsed = parseExpiryDate(raw);
  if (!parsed) {
    return {
      valid: false,
      error: 'صيغة تاريخ الصلاحية غير صحيحة. استخدم شهر/سنة مثل 12/2027 أو يوم/شهر/سنة مثل 2027-12-01.',
      parsed: null
    };
  }

  if (!allowPast && parsed.effectiveDate < today) {
    return {
      valid: false,
      error: `تاريخ الصلاحية (${raw}) منتهي بالفعل. لا يمكن استخدام تاريخ ماضٍ للإدخال الجديد.`,
      parsed
    };
  }

  return { valid: true, empty: false, parsed, normalized: parsed.iso };
}

/** Phone numbers may contain spaces, dashes, dots, brackets and a + prefix. */
export function isValidPhone(value) {
  const raw = digitsToLatin(value).trim();
  if (!raw) return false;
  // '+' is only allowed at the very start (country code).
  if (!/^\+?[()\d\s.\-]+$/.test(raw)) return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/** HH:mm (24h) validation; used by date/time range filters. */
export function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}
