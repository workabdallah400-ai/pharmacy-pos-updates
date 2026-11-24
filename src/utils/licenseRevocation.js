/**
 * Revocation rules shared by the app and the developer tools.
 *
 * Pure module: no browser or Node-specific APIs, so the CLI/admin panel and
 * the running application all apply exactly the same decision.
 *
 * A machine is revoked at a moment in time (epoch seconds). Any licence token
 * issued at or before that moment stops working; a token issued after it is a
 * deliberate re-activation and stays valid.
 */

/** Display / validation form: uppercase, dashes preserved (EGYP-XXXX-YYYY-ZZZZ). */
export function normalizeMachineId(value) {
  return String(value || '').trim().toUpperCase();
}

/**
 * Canonical lookup key: separators removed. Guarantees that
 * "EGYP-9B4C-D478-B27C" and "egyp 9b4c d478 b27c" always hit the same entry.
 */
export function canonicalMid(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Backwards-compatible alias used by the app. */
export const normalizeMid = canonicalMid;

/**
 * True when the payload belongs to a revoked machine and was issued before
 * (or at) the revocation moment.
 *
 * @param {object} payload      decoded LIC2 payload ({ mid, iat, ... })
 * @param {object} revocations  { '<canonicalMid>': { iat, mid, lid, reason } }
 */
export function isRevokedPayload(payload, revocations) {
  if (!payload || !revocations) return false;
  const mid = canonicalMid(payload.mid);
  if (!mid) return false;
  const revocation = revocations[mid];
  if (!revocation) return false;

  const revokedAt = Number(revocation.iat || 0);
  // A revocation without a usable timestamp is treated as absolute.
  if (!Number.isFinite(revokedAt) || revokedAt <= 0) return true;

  return Number(payload.iat || 0) <= revokedAt;
}

/**
 * Merge any number of { mid: entry } maps. The newest revocation per machine
 * wins, so a bundled list can never override a newer local revocation.
 * Keys are canonical (separator-free) machine IDs.
 */
export function mergeRevocations(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const [rawMid, entry] of Object.entries(map)) {
      const key = canonicalMid(rawMid);
      if (!key) continue;
      const iat = Number(entry && entry.iat ? entry.iat : 0);
      const existing = out[key];
      if (!existing || Number(existing.iat || 0) < iat) {
        out[key] = {
          ...(entry || {}),
          mid: normalizeMachineId((entry && entry.mid) || rawMid),
          iat
        };
      }
    }
  }
  return out;
}
