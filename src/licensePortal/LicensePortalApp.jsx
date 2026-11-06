import { useState } from "react";
import {
  KeyRound,
  Users
} from "lucide-react";
import {
  INITIAL_CLIENTS,
  INITIAL_LICENSES,
  calculateExpiryDate,
  generateLicenseKey,
  toggleClientStatus,
  resetClientPassword
} from "./utils/licenseLogic";
import { LicensesView } from "./components/LicensesView";
import { ClientsView } from "./components/ClientsView";
import {
  PasswordResetModal,
  LicenseCertificateModal
} from "./components/Modals";
export default function App() {
  const [activeTab, setActiveTab] = useState("licenses");
  const [clients, setClients] = useState(INITIAL_CLIENTS);
  const [licenses, setLicenses] = useState(INITIAL_LICENSES);
  const [selectedClientForLicense, setSelectedClientForLicense] = useState(null);
  const [passwordResetClient, setPasswordResetClient] = useState(null);
  const [certificateLicense, setCertificateLicense] = useState(null);
  const todayStr = "2026-11-06";
  const handleIssueLicense = (data) => {
    const newId = `lic-${Date.now()}`;
    const licenseKey = generateLicenseKey(
      data.clientCode,
      data.duration,
      licenses.length + 101
    );
    const expiresAt = calculateExpiryDate(todayStr, data.duration);
    const newLicense = {
      id: newId,
      clientCode: data.clientCode,
      clientName: data.clientName,
      pharmacyName: data.pharmacyName,
      duration: data.duration,
      licenseKey,
      issuedAt: todayStr,
      expiresAt,
      status: "active",
      city: data.city
    };
    setLicenses((prev) => [newLicense, ...prev]);
    const exists = clients.some(
      (c) => c.clientCode.toLowerCase() === data.clientCode.toLowerCase()
    );
    if (!exists) {
      const newClient = {
        id: `cli-${Date.now()}`,
        clientCode: data.clientCode,
        clientName: data.clientName,
        pharmacyName: data.pharmacyName,
        phone: "01000000000",
        email: "pharmacy@pharmacare.eg",
        city: data.city,
        registeredAt: todayStr,
        isActive: true
      };
      setClients((prev) => [newClient, ...prev]);
    }
  };
  const handleRenewLicense = (licenseId, duration) => {
    setLicenses(
      (prev) => prev.map((lic) => {
        if (lic.id !== licenseId) return lic;
        return {
          ...lic,
          issuedAt: todayStr,
          expiresAt: calculateExpiryDate(todayStr, duration),
          status: "active"
        };
      })
    );
  };
  const handleToggleRevokeLicense = (licenseId) => {
    setLicenses(
      (prev) => prev.map((lic) => {
        if (lic.id !== licenseId) return lic;
        return {
          ...lic,
          status: lic.status === "revoked" ? "active" : "revoked"
        };
      })
    );
  };
  const handleToggleClientActive = (clientId) => {
    setClients((prev) => toggleClientStatus(prev, clientId));
  };
  const handleConfirmPasswordReset = (clientId, newPassword) => {
    setClients(
      (prev) => resetClientPassword(prev, clientId, newPassword, todayStr)
    );
  };
  const handleAddClient = (newClientData) => {
    const created = {
      id: `cli-${Date.now()}`,
      ...newClientData,
      isActive: true
    };
    setClients((prev) => [created, ...prev]);
  };
  const handleCreateLicenseForClient = (client) => {
    setSelectedClientForLicense(client);
    setActiveTab("licenses");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {
    /* Strictly Structured 3-Zone Top Bar */
  }
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {
    /* Zone 1: Single text element wordmark */
  }
          <a
    href="#top"
    onClick={(e) => {
      e.preventDefault();
      setActiveTab("licenses");
    }}
    className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
  >
            فارما كير لإدارة الصيدليات
          </a>

          {
    /* Zone 2: Clean single-line navigation links */
  }
          <nav
    aria-label="التنقل الرئيسي"
    className="flex items-center gap-6 text-sm font-medium text-slate-600"
  >
            <button
    type="button"
    onClick={() => setActiveTab("licenses")}
    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${activeTab === "licenses" ? "border-teal-700 text-slate-900 font-semibold" : "border-transparent hover:text-slate-900"}`}
  >
              صفحة التراخيص
            </button>
            <button
    type="button"
    onClick={() => setActiveTab("clients")}
    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${activeTab === "clients" ? "border-teal-700 text-slate-900 font-semibold" : "border-transparent hover:text-slate-900"}`}
  >
              صفحة العملاء
            </button>
          </nav>

          {
    /* Zone 3: 1 primary action */
  }
          <div className="flex items-center shrink-0">
            <button
    type="button"
    onClick={() => {
      setActiveTab("licenses");
      const input = document.getElementById("license-client-code");
      if (input) input.focus();
    }}
    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
  >
              إصدار ترخيص جديد
            </button>
          </div>
        </div>
      </header>

      {
    /* Workspace Subheader / View Switcher */
  }
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {activeTab === "licenses" ? "\u0625\u062F\u0627\u0631\u0629 \u062A\u0631\u0627\u062E\u064A\u0635 \u0628\u0631\u0646\u0627\u0645\u062C \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629" : "\u0633\u062C\u0644 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {activeTab === "licenses" ? "\u0625\u0635\u062F\u0627\u0631 \u0648\u0645\u062A\u0627\u0628\u0639\u0629 \u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0648\u0641\u062A\u0631\u0627\u062A \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 (\u064A\u0648\u0645\u060C \u0623\u0633\u0628\u0648\u0639\u060C \u0634\u0647\u0631\u060C 90 \u064A\u0648\u0645\u060C 120 \u064A\u0648\u0645\u060C \u0633\u0646\u0629\u060C \u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629)" : "\u0625\u062F\u0627\u0631\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0635\u064A\u0627\u062F\u0644\u0629 \u0648\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0648\u062A\u0641\u0639\u064A\u0644 \u0623\u0648 \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0648\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0631\u0648\u0631"}
            </p>
          </div>

          {
    /* Interactive View Switcher Segmented Control */
  }
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
            <button
    type="button"
    onClick={() => setActiveTab("licenses")}
    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${activeTab === "licenses" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
  >
              <KeyRound className="w-3.5 h-3.5 text-teal-700" />
              <span>التراخيص ({licenses.length})</span>
            </button>
            <button
    type="button"
    onClick={() => setActiveTab("clients")}
    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${activeTab === "clients" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
  >
              <Users className="w-3.5 h-3.5 text-teal-700" />
              <span>العملاء ({clients.length})</span>
            </button>
          </div>
        </div>
      </div>

      {
    /* Main Content Viewport */
  }
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "licenses" ? <LicensesView
    licenses={licenses}
    clients={clients}
    selectedClientForLicense={selectedClientForLicense}
    onClearSelectedClient={() => setSelectedClientForLicense(null)}
    onIssueLicense={handleIssueLicense}
    onRenewLicense={handleRenewLicense}
    onToggleRevokeLicense={handleToggleRevokeLicense}
    onOpenCertificate={(lic) => setCertificateLicense(lic)}
  /> : <ClientsView
    clients={clients}
    licenses={licenses}
    onToggleClientActive={handleToggleClientActive}
    onOpenPasswordReset={(client) => setPasswordResetClient(client)}
    onAddClient={handleAddClient}
    onCreateLicenseForClient={handleCreateLicenseForClient}
  />}
      </main>

      {
    /* Quiet Footer */
  }
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>نظام فارما كير لإدارة تراخيص وحسابات الصيدليات</span>
          <div className="flex items-center gap-4">
            <button
    type="button"
    onClick={() => setActiveTab("licenses")}
    className="hover:text-slate-900 transition-colors cursor-pointer"
  >
              التراخيص
            </button>
            <span aria-hidden="true">·</span>
            <button
    type="button"
    onClick={() => setActiveTab("clients")}
    className="hover:text-slate-900 transition-colors cursor-pointer"
  >
              العملاء
            </button>
          </div>
        </div>
      </footer>

      {
    /* Modals */
  }
      <PasswordResetModal
    client={passwordResetClient}
    onClose={() => setPasswordResetClient(null)}
    onConfirmReset={handleConfirmPasswordReset}
  />

      <LicenseCertificateModal
    license={certificateLicense}
    onClose={() => setCertificateLicense(null)}
  />
    </div>;
}
