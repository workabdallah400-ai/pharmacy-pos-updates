/**
 * Input guards shared by the data-entry screens.
 *
 * The pharmacy operators type with an Arabic keyboard most of the time, so
 * every helper first normalises Arabic-Indic/Persian digits to Latin digits and
 * then removes the characters that do not belong to the field:
 *
 *   - numbers / quantities / prices / barcodes  -> digits only (optionally + .)
 *   - phone numbers                             -> digits and a leading +
 *   - paper invoice numbers                     -> no Arabic letters, Latin
 *                                                  letters and - _ / . # allowed
 *   - people / company names                    -> letters only (no digits)
 */

const ARABIC_DIGITS = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;

/** Converts Arabic-Indic / Persian digits to Latin digits. */
export function latinDigits(value) {
  return String(value ?? '')
    .replace(ARABIC_DIGITS, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(PERSIAN_DIGITS, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/** Digits only (barcodes, quantities, counts). */
export function digitsOnly(value, maxLength = 64) {
  return latinDigits(value).replace(/\D+/g, '').slice(0, maxLength);
}

/** Integer input: digits only, no decimals, no letters. */
export function integerInput(value, maxLength = 9) {
  return digitsOnly(value, maxLength);
}

/** Decimal input: digits plus a single decimal point. */
export function decimalInput(value, maxDecimals = 2) {
  let raw = latinDigits(value).replace(/[^\d.]/g, '');
  const firstDot = raw.indexOf('.');
  if (firstDot !== -1) {
    raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    if (maxDecimals >= 0) {
      const [intPart, decPart] = raw.split('.');
      raw = `${intPart}.${(decPart || '').slice(0, maxDecimals)}`;
    }
  }
  return raw;
}

/** Phone: digits, an optional leading +, spaces and dashes for readability. */
export function phoneInput(value) {
  const raw = latinDigits(value).trimStart();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '').slice(0, 15);
  return hasPlus ? `+${digits}` : digits;
}

/** Arabic letter ranges plus the Arabic diacritics/marks. */
const ARABIC_CHARS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Paper invoice number: Latin letters, digits and separators only.
 * Arabic letters and Arabic-Indic digits are rejected/normalised, so an
 * operator cannot save "فاتورة" as an invoice number.
 */
export function invoiceNumberInput(value, maxLength = 40) {
  return latinDigits(value)
    .replace(/[^\x20-\x7E]/g, '') // drop Arabic and any non-ASCII character
    .replace(/[^A-Za-z0-9\-_/.# ]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trimStart()
    .slice(0, maxLength);
}

/** True when the value still contains Arabic letters (used by validators). */
export function containsArabic(value) {
  return ARABIC_CHARS.test(String(value || ''));
}

/** Names: letters (Arabic/Latin), spaces, . - ' & ( ) only — never digits. */
export function nameInput(value, maxLength = 120) {
  return String(value ?? '')
    .replace(/[0-9٠-٩۰-۹]/g, '')
    .replace(/[^\p{L}\p{M}\s.'&\-()]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength);
}

/** Human-readable phone check shared by the client and the service layer. */
export function isValidPhoneValue(value) {
  const digits = latinDigits(value).replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
