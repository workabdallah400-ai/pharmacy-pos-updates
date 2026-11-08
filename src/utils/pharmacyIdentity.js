/**
 * Single source of truth for the pharmacy identity used on printed and
 * shareable output (receipts, Z-reports, statements, WhatsApp messages,
 * barcode stickers, QR pages).
 *
 * The name used to be hardcoded as "صيدلية النخبة الحديثة" in a dozen
 * components, so every pharmacy that installed the app printed another
 * pharmacy's name on its own receipts. Always resolve it from the saved
 * settings instead.
 */

export const FALLBACK_PHARMACY_NAME = 'صيدليتي';

const SETTINGS_KEY = 'PHARMACY_SETTINGS';

/**
 * Reads the saved settings object. Safe in any environment (no throw).
 */
export function readPharmacySettings() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

/**
 * The pharmacy's display name, never empty.
 */
export function getPharmacyName() {
  const name = readPharmacySettings().pharmacyName;
  const clean = typeof name === 'string' ? name.trim() : '';
  return clean || FALLBACK_PHARMACY_NAME;
}

/**
 * The pharmacy's branch label, if one is configured.
 */
export function getPharmacyBranch() {
  const branch = readPharmacySettings().pharmacyBranch;
  return typeof branch === 'string' ? branch.trim() : '';
}

/**
 * Resolves a caller-supplied name, falling back to the saved setting and then
 * to the generic fallback. Use this as the default for any `pharmacyName` prop.
 */
export function resolvePharmacyName(candidate) {
  const clean = typeof candidate === 'string' ? candidate.trim() : '';
  if (clean && clean !== FALLBACK_PHARMACY_NAME) return clean;
  return getPharmacyName();
}
