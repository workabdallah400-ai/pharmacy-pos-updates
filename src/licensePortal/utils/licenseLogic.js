export const DURATION_OPTIONS = [
  {
    value: "\u064A\u0648\u0645",
    label: "\u064A\u0648\u0645 \u0648\u0627\u062D\u062F",
    days: 1,
    description: "\u062A\u0631\u062E\u064A\u0635 \u062A\u062C\u0631\u064A\u0628\u064A \u0633\u0631\u064A\u0639 \u0644\u0645\u062F\u0629 24 \u0633\u0627\u0639\u0629",
    codePrefix: "D01"
  },
  {
    value: "\u0623\u0633\u0628\u0648\u0639",
    label: "\u0623\u0633\u0628\u0648\u0639",
    days: 7,
    description: "\u0628\u0627\u0642\u0629 \u062A\u062C\u0631\u064A\u0628\u064A\u0629 \u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u0643\u0627\u0645\u0644\u0629 \u0627\u0644\u0645\u0632\u0627\u064A\u0627",
    codePrefix: "W07"
  },
  {
    value: "\u0634\u0647\u0631",
    label: "\u0634\u0647\u0631",
    days: 30,
    description: "\u0627\u0634\u062A\u0631\u0627\u0643 \u0634\u0647\u0631\u064A \u0642\u064A\u0627\u0633\u064A \u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629",
    codePrefix: "M30"
  },
  {
    value: "90 \u064A\u0648\u0645",
    label: "90 \u064A\u0648\u0645",
    days: 90,
    description: "\u0627\u0634\u062A\u0631\u0627\u0643 \u0631\u0628\u0639 \u0633\u0646\u0648\u064A (3 \u0623\u0634\u0647\u0631)",
    codePrefix: "Q90"
  },
  {
    value: "120 \u064A\u0648\u0645",
    label: "120 \u064A\u0648\u0645",
    days: 120,
    description: "\u0627\u0634\u062A\u0631\u0627\u0643 \u062B\u0644\u062B \u0633\u0646\u0648\u064A (4 \u0623\u0634\u0647\u0631)",
    codePrefix: "T120"
  },
  {
    value: "\u0633\u0646\u0629",
    label: "\u0633\u0646\u0629",
    days: 365,
    description: "\u0627\u0634\u062A\u0631\u0627\u0643 \u0633\u0646\u0648\u064A \u0634\u0627\u0645\u0644 \u0645\u0639 \u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A",
    codePrefix: "Y365"
  },
  {
    value: "\u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629",
    label: "\u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629",
    days: null,
    description: "\u062A\u0631\u062E\u064A\u0635 \u062F\u0627\u0626\u0645 \u063A\u064A\u0631 \u0645\u062D\u062F\u062F \u0628\u0645\u062F\u0629 \u0632\u0645\u0646\u064A\u0629",
    codePrefix: "LIFE"
  }
];
export function calculateExpiryDate(issuedDateStr, duration) {
  const option = DURATION_OPTIONS.find((opt) => opt.value === duration);
  if (!option || option.days === null) {
    return "\u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629";
  }
  const parts = issuedDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return "\u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629";
  }
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() + option.days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function generateLicenseKey(clientCode, duration, seed = 4829) {
  const option = DURATION_OPTIONS.find((opt) => opt.value === duration);
  const prefix = option ? option.codePrefix : "STD";
  const cleanCode = clientCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(-4).padStart(4, "0");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let block1 = "";
  let block2 = "";
  let current = Math.abs(seed) + cleanCode.charCodeAt(0) * 31 + prefix.charCodeAt(0) * 17;
  for (let i = 0; i < 4; i++) {
    current = current * 1103515245 + 12345 & 2147483647;
    block1 += chars[current % chars.length];
  }
  for (let i = 0; i < 4; i++) {
    current = current * 1103515245 + 12345 & 2147483647;
    block2 += chars[current % chars.length];
  }
  return `PHRM-${prefix}-${cleanCode}-${block1}-${block2}`;
}
export function generateClientCode(existingClients) {
  let maxNum = 1e3;
  for (const client of existingClients) {
    const match = client.clientCode.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `PH-${maxNum + 1}`;
}
export function generateTempPassword(clientCode, seed = 9182) {
  const clean = clientCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "PHRM";
  const digits = String(Math.abs(seed) % 9e3 + 1e3);
  return `Rx@${clean}#${digits}`;
}
export function validateLicenseForm(input) {
  const errors = {};
  if (!input.clientCode || !input.clientCode.trim()) {
    errors.clientCode = "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0643\u0648\u062F \u0627\u0644\u0639\u0645\u064A\u0644";
  }
  if (!input.clientName || !input.clientName.trim()) {
    errors.clientName = "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644";
  }
  if (!input.pharmacyName || !input.pharmacyName.trim()) {
    errors.pharmacyName = "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629";
  }
  const validDurations = DURATION_OPTIONS.map((d) => d.value);
  if (!validDurations.includes(input.duration)) {
    errors.duration = "\u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u062F\u0629 \u0635\u0644\u0627\u062D\u064A\u0629 \u0635\u062D\u064A\u062D\u0629";
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
export function validateClientForm(input) {
  const errors = {};
  if (!input.clientCode || !input.clientCode.trim()) {
    errors.clientCode = "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0643\u0648\u062F \u0627\u0644\u0639\u0645\u064A\u0644";
  }
  if (!input.clientName || !input.clientName.trim()) {
    errors.clientName = "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644";
  }
  if (!input.pharmacyName || !input.pharmacyName.trim()) {
    errors.pharmacyName = "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629";
  }
  if (!input.phone || !input.phone.trim()) {
    errors.phone = "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0644\u0644\u062A\u0648\u0627\u0635\u0644";
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
export function validatePasswordReset(input) {
  if (!input.password || input.password.trim().length < 6) {
    return {
      valid: false,
      error: "\u064A\u062C\u0628 \u0623\u0646 \u062A\u062A\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u0645\u0646 6 \u0623\u062D\u0631\u0641 \u0623\u0648 \u0623\u0631\u0642\u0627\u0645 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644"
    };
  }
  if (input.password !== input.confirmPassword) {
    return {
      valid: false,
      error: "\u0643\u0644\u0645\u062A\u0627 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0645\u062A\u0637\u0627\u0628\u0642\u062A\u064A\u0646"
    };
  }
  return { valid: true };
}
export function filterLicenses(licenses, query, durationFilter, statusFilter) {
  const normalizedQuery = query.trim().toLowerCase();
  return licenses.filter((item) => {
    const matchesDuration = durationFilter === "all" || item.duration === durationFilter;
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesQuery = !normalizedQuery || item.clientCode.toLowerCase().includes(normalizedQuery) || item.clientName.toLowerCase().includes(normalizedQuery) || item.pharmacyName.toLowerCase().includes(normalizedQuery) || item.licenseKey.toLowerCase().includes(normalizedQuery) || item.city.toLowerCase().includes(normalizedQuery);
    return matchesDuration && matchesStatus && matchesQuery;
  });
}
export function filterClients(clients, query, statusFilter) {
  const normalizedQuery = query.trim().toLowerCase();
  return clients.filter((client) => {
    const matchesStatus = statusFilter === "all" || statusFilter === "active" && client.isActive || statusFilter === "inactive" && !client.isActive;
    const matchesQuery = !normalizedQuery || client.clientCode.toLowerCase().includes(normalizedQuery) || client.clientName.toLowerCase().includes(normalizedQuery) || client.pharmacyName.toLowerCase().includes(normalizedQuery) || client.phone.toLowerCase().includes(normalizedQuery) || client.city.toLowerCase().includes(normalizedQuery);
    return matchesStatus && matchesQuery;
  });
}
export function toggleClientStatus(clients, clientId) {
  return clients.map(
    (client) => client.id === clientId ? { ...client, isActive: !client.isActive } : client
  );
}
export function resetClientPassword(clients, clientId, newPassword, resetDate) {
  return clients.map(
    (client) => client.id === clientId ? {
      ...client,
      lastPasswordReset: resetDate,
      lastTempPassword: newPassword
    } : client
  );
}
export const INITIAL_CLIENTS = [
  {
    id: "cli-1",
    clientCode: "PH-1024",
    clientName: "\u062F. \u0623\u062D\u0645\u062F \u0645\u062D\u0645\u0648\u062F \u0627\u0644\u0634\u0646\u0627\u0648\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0634\u0641\u0627\u0621 \u0627\u0644\u062C\u062F\u064A\u062F\u0629",
    phone: "01092837465",
    email: "ahmed.shenawy@shifa-pharm.eg",
    city: "\u0627\u0644\u0642\u0627\u0647\u0631\u0629 - \u0645\u062F\u064A\u0646\u0629 \u0646\u0635\u0631",
    registeredAt: "2026-01-14",
    isActive: true,
    lastPasswordReset: "2026-09-10"
  },
  {
    id: "cli-2",
    clientCode: "PH-1025",
    clientName: "\u062F. \u0633\u0627\u0631\u0629 \u0639\u0628\u062F \u0627\u0644\u0631\u062D\u0645\u0646 \u0627\u0644\u0643\u064A\u0644\u0627\u0646\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0627\u062A \u0627\u0644\u0646\u0648\u0631 \u0627\u0644\u062A\u062E\u0635\u0635\u064A\u0629",
    phone: "01148291034",
    email: "sara.kilany@alnoor-rx.com",
    city: "\u0627\u0644\u062C\u064A\u0632\u0629 - \u0627\u0644\u0645\u0647\u0646\u062F\u0633\u064A\u0646",
    registeredAt: "2026-02-22",
    isActive: true
  },
  {
    id: "cli-3",
    clientCode: "PH-1026",
    clientName: "\u062F. \u0643\u0631\u064A\u0645 \u0637\u0627\u0631\u0642 \u0627\u0644\u0645\u0646\u064A\u0627\u0648\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0623\u0645\u0644 \u0627\u0644\u0643\u0628\u0631\u0649",
    phone: "01273648291",
    email: "karim.tarek@amalpharmacy.net",
    city: "\u0627\u0644\u0625\u0633\u0643\u0646\u062F\u0631\u064A\u0629 - \u0633\u0645\u0648\u062D\u0629",
    registeredAt: "2026-04-05",
    isActive: true
  },
  {
    id: "cli-4",
    clientCode: "PH-1027",
    clientName: "\u062F. \u0645\u0646\u0649 \u062D\u0633\u0646 \u0627\u0644\u0632\u064A\u0627\u062A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u062D\u064A\u0627\u0629 \u0627\u0644\u0637\u0628\u064A\u0629",
    phone: "01065432189",
    email: "mona.zayat@hayatmed.org",
    city: "\u0627\u0644\u0645\u0646\u0635\u0648\u0631\u0629 - \u062D\u064A \u0627\u0644\u062C\u0627\u0645\u0639\u0629",
    registeredAt: "2026-05-19",
    isActive: false,
    lastPasswordReset: "2026-08-01"
  },
  {
    id: "cli-5",
    clientCode: "PH-1028",
    clientName: "\u062F. \u062E\u0627\u0644\u062F \u0648\u0644\u064A\u062F \u0627\u0644\u062F\u0633\u0648\u0642\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0639\u0631\u0648\u0628\u0629 \u0627\u0644\u062D\u062F\u064A\u062B\u0629",
    phone: "01552398741",
    email: "khaled.desouky@orouba-rx.com",
    city: "\u0637\u0646\u0637\u0627 - \u0634\u0627\u0631\u0639 \u0627\u0644\u0628\u062D\u0631",
    registeredAt: "2026-07-11",
    isActive: true
  },
  {
    id: "cli-6",
    clientCode: "PH-1029",
    clientName: "\u062F. \u064A\u0627\u0633\u0645\u064A\u0646 \u0639\u0627\u062F\u0644 \u0627\u0644\u0641\u0631\u0645\u0627\u0648\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0633\u0644\u0627\u0645 \u0627\u0644\u062F\u0648\u0644\u064A\u0629",
    phone: "01011223344",
    email: "yasmin.adel@salam-pharm.com",
    city: "\u0627\u0644\u0642\u0627\u0647\u0631\u0629 - \u0627\u0644\u062A\u062C\u0645\u0639 \u0627\u0644\u062E\u0627\u0645\u0633",
    registeredAt: "2026-09-28",
    isActive: true
  },
  {
    id: "cli-7",
    clientCode: "PH-1030",
    clientName: "\u062F. \u0645\u0635\u0637\u0641\u0649 \u0643\u0645\u0627\u0644 \u0627\u0644\u0646\u062C\u0627\u0631",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0646\u062E\u0628\u0629 \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629",
    phone: "01288776655",
    email: "mostafa.naggar@elite-rx.eg",
    city: "\u0623\u0633\u064A\u0648\u0637 - \u0634\u0627\u0631\u0639 \u0627\u0644\u062C\u0645\u0647\u0648\u0631\u064A\u0629",
    registeredAt: "2026-10-15",
    isActive: false
  }
];
export const INITIAL_LICENSES = [
  {
    id: "lic-1",
    clientCode: "PH-1024",
    clientName: "\u062F. \u0623\u062D\u0645\u062F \u0645\u062D\u0645\u0648\u062F \u0627\u0644\u0634\u0646\u0627\u0648\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0634\u0641\u0627\u0621 \u0627\u0644\u062C\u062F\u064A\u062F\u0629",
    duration: "\u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629",
    licenseKey: "PHRM-LIFE-1024-8K2M-9P4X",
    issuedAt: "2026-01-15",
    expiresAt: "\u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629",
    status: "active",
    city: "\u0627\u0644\u0642\u0627\u0647\u0631\u0629 - \u0645\u062F\u064A\u0646\u0629 \u0646\u0635\u0631"
  },
  {
    id: "lic-2",
    clientCode: "PH-1025",
    clientName: "\u062F. \u0633\u0627\u0631\u0629 \u0639\u0628\u062F \u0627\u0644\u0631\u062D\u0645\u0646 \u0627\u0644\u0643\u064A\u0644\u0627\u0646\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0627\u062A \u0627\u0644\u0646\u0648\u0631 \u0627\u0644\u062A\u062E\u0635\u0635\u064A\u0629",
    duration: "\u0633\u0646\u0629",
    licenseKey: "PHRM-Y365-1025-4R7N-2W8Q",
    issuedAt: "2026-02-23",
    expiresAt: "2027-02-23",
    status: "active",
    city: "\u0627\u0644\u062C\u064A\u0632\u0629 - \u0627\u0644\u0645\u0647\u0646\u062F\u0633\u064A\u0646"
  },
  {
    id: "lic-3",
    clientCode: "PH-1026",
    clientName: "\u062F. \u0643\u0631\u064A\u0645 \u0637\u0627\u0631\u0642 \u0627\u0644\u0645\u0646\u064A\u0627\u0648\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0623\u0645\u0644 \u0627\u0644\u0643\u0628\u0631\u0649",
    duration: "120 \u064A\u0648\u0645",
    licenseKey: "PHRM-T120-1026-6H9L-5M3C",
    issuedAt: "2026-08-10",
    expiresAt: "2026-12-08",
    status: "active",
    city: "\u0627\u0644\u0625\u0633\u0643\u0646\u062F\u0631\u064A\u0629 - \u0633\u0645\u0648\u062D\u0629"
  },
  {
    id: "lic-4",
    clientCode: "PH-1027",
    clientName: "\u062F. \u0645\u0646\u0649 \u062D\u0633\u0646 \u0627\u0644\u0632\u064A\u0627\u062A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u062D\u064A\u0627\u0629 \u0627\u0644\u0637\u0628\u064A\u0629",
    duration: "90 \u064A\u0648\u0645",
    licenseKey: "PHRM-Q90-1027-3B5V-7J2K",
    issuedAt: "2026-08-15",
    expiresAt: "2026-11-13",
    status: "expiring_soon",
    city: "\u0627\u0644\u0645\u0646\u0635\u0648\u0631\u0629 - \u062D\u064A \u0627\u0644\u062C\u0627\u0645\u0639\u0629"
  },
  {
    id: "lic-5",
    clientCode: "PH-1028",
    clientName: "\u062F. \u062E\u0627\u0644\u062F \u0648\u0644\u064A\u062F \u0627\u0644\u062F\u0633\u0648\u0642\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0639\u0631\u0648\u0628\u0629 \u0627\u0644\u062D\u062F\u064A\u062B\u0629",
    duration: "\u0634\u0647\u0631",
    licenseKey: "PHRM-M30-1028-9X4F-6T8R",
    issuedAt: "2026-10-20",
    expiresAt: "2026-11-19",
    status: "active",
    city: "\u0637\u0646\u0637\u0627 - \u0634\u0627\u0631\u0639 \u0627\u0644\u0628\u062D\u0631"
  },
  {
    id: "lic-6",
    clientCode: "PH-1029",
    clientName: "\u062F. \u064A\u0627\u0633\u0645\u064A\u0646 \u0639\u0627\u062F\u0644 \u0627\u0644\u0641\u0631\u0645\u0627\u0648\u064A",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0633\u0644\u0627\u0645 \u0627\u0644\u062F\u0648\u0644\u064A\u0629",
    duration: "\u0623\u0633\u0628\u0648\u0639",
    licenseKey: "PHRM-W07-1029-2D8G-4L5Z",
    issuedAt: "2026-11-01",
    expiresAt: "2026-11-08",
    status: "expiring_soon",
    city: "\u0627\u0644\u0642\u0627\u0647\u0631\u0629 - \u0627\u0644\u062A\u062C\u0645\u0639 \u0627\u0644\u062E\u0627\u0645\u0633"
  },
  {
    id: "lic-7",
    clientCode: "PH-1030",
    clientName: "\u062F. \u0645\u0635\u0637\u0641\u0649 \u0643\u0645\u0627\u0644 \u0627\u0644\u0646\u062C\u0627\u0631",
    pharmacyName: "\u0635\u064A\u062F\u0644\u064A\u0629 \u0627\u0644\u0646\u062E\u0628\u0629 \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629",
    duration: "\u064A\u0648\u0645",
    licenseKey: "PHRM-D01-1030-7C3P-9N2W",
    issuedAt: "2026-10-16",
    expiresAt: "2026-10-17",
    status: "expired",
    city: "\u0623\u0633\u064A\u0648\u0637 - \u0634\u0627\u0631\u0639 \u0627\u0644\u062C\u0645\u0647\u0648\u0631\u064A\u0629"
  }
];
