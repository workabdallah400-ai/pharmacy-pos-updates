import React, { useState } from "react";
import {
  KeyRound,
  Search,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
  Clock,
  PlusCircle
} from "lucide-react";
import {
  DURATION_OPTIONS,
  calculateExpiryDate,
  validateLicenseForm,
  filterLicenses
} from "../utils/licenseLogic";
export const LicensesView = ({
  licenses,
  clients,
  selectedClientForLicense,
  onClearSelectedClient,
  onIssueLicense,
  onRenewLicense,
  onToggleRevokeLicense,
  onOpenCertificate
}) => {
  const [clientCode, setClientCode] = useState(
    selectedClientForLicense?.clientCode ?? ""
  );
  const [clientName, setClientName] = useState(
    selectedClientForLicense?.clientName ?? ""
  );
  const [pharmacyName, setPharmacyName] = useState(
    selectedClientForLicense?.pharmacyName ?? ""
  );
  const [city, setCity] = useState(
    selectedClientForLicense?.city ?? "\u0627\u0644\u0642\u0627\u0647\u0631\u0629"
  );
  const [duration, setDuration] = useState("\u0633\u0646\u0629");
  const [formErrors, setFormErrors] = useState({});
  const [lastIssuedBanner, setLastIssuedBanner] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [durationFilter, setDurationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedId, setCopiedId] = useState(null);
  React.useEffect(() => {
    if (selectedClientForLicense) {
      setClientCode(selectedClientForLicense.clientCode);
      setClientName(selectedClientForLicense.clientName);
      setPharmacyName(selectedClientForLicense.pharmacyName);
      setCity(selectedClientForLicense.city);
      setFormErrors({});
    }
  }, [selectedClientForLicense]);
  const handleSelectExistingClient = (e) => {
    const val = e.target.value;
    if (!val) {
      onClearSelectedClient();
      return;
    }
    const found = clients.find((c) => c.id === val);
    if (found) {
      setClientCode(found.clientCode);
      setClientName(found.clientName);
      setPharmacyName(found.pharmacyName);
      setCity(found.city);
      setFormErrors({});
    }
  };
  const todayStr = "2026-11-06";
  const previewExpiry = calculateExpiryDate(todayStr, duration);
  const handleSubmit = (e) => {
    e.preventDefault();
    const validation = validateLicenseForm({
      clientCode,
      clientName,
      pharmacyName,
      duration
    });
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }
    setFormErrors({});
    onIssueLicense({
      clientCode: clientCode.trim(),
      clientName: clientName.trim(),
      pharmacyName: pharmacyName.trim(),
      duration,
      city: city.trim() || "\u0627\u0644\u0642\u0627\u0647\u0631\u0629"
    });
    setLastIssuedBanner(
      `\u062A\u0645 \u0625\u0635\u062F\u0627\u0631 \u062A\u0631\u062E\u064A\u0635 \u062C\u062F\u064A\u062F \u0628\u0646\u062C\u0627\u062D \u0644\u0635\u0627\u0644\u062D ${pharmacyName.trim()} (${clientName.trim()}) \u0628\u0645\u062F\u0629 \u0635\u0644\u0627\u062D\u064A\u0629: ${duration}`
    );
    setClientCode("");
    setClientName("");
    setPharmacyName("");
    onClearSelectedClient();
  };
  const handleCopyKey = (id, key) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(key).catch(() => {
      });
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2e3);
  };
  const filteredLicenses = filterLicenses(
    licenses,
    searchQuery,
    durationFilter,
    statusFilter
  );
  const activeCount = licenses.filter((l) => l.status === "active").length;
  const lifetimeCount = licenses.filter((l) => l.duration === "\u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629").length;
  const expiringOrExpiredCount = licenses.filter(
    (l) => l.status === "expiring_soon" || l.status === "expired"
  ).length;
  return <div className="space-y-8">
      {
    /* KPI Summary Strip */
  }
      <section
    aria-label="ملخص إحصائيات التراخيص"
    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl overflow-hidden"
  >
        <div className="p-5 border-b sm:border-b-0 sm:border-l border-slate-200">
          <p className="text-xs font-medium text-slate-500">إجمالي التراخيص المصدرة</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {licenses.length}
            </span>
            <span className="text-xs text-slate-500">ترخيص مسجل</span>
          </div>
        </div>

        <div className="p-5 border-b sm:border-b-0 lg:border-l border-slate-200">
          <p className="text-xs font-medium text-slate-500">التراخيص النشطة والسارية</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-teal-700 font-mono tabular-nums">
              {activeCount}
            </span>
            <span className="text-xs text-teal-700">تعمل بكفاءة</span>
          </div>
        </div>

        <div className="p-5 border-b sm:border-b-0 sm:border-l border-slate-200">
          <p className="text-xs font-medium text-slate-500">تراخيص مدى الحياة</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {lifetimeCount}
            </span>
            <span className="text-xs text-slate-500">صلاحية دائمة</span>
          </div>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">تراخيص قاربت على الانتهاء أو منتهية</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
              {expiringOrExpiredCount}
            </span>
            <span className="text-xs text-amber-700">تتطلب متابعة التجديد</span>
          </div>
        </div>
      </section>

      {
    /* License Issuance Panel */
  }
      <section
    aria-labelledby="issue-license-heading"
    className="bg-white border border-slate-200 rounded-xl p-6"
  >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2
    id="issue-license-heading"
    className="text-lg font-bold text-slate-900"
  >
              إصدار ترخيص برنامج صيدلية جديد
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              أدخل كود العميل واسم العميل واسم الصيدلية وحدد مدة الصلاحية لتوليد مفتاح التفعيل الفوري.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label
    htmlFor="quick-client-select"
    className="text-xs font-medium text-slate-600 whitespace-nowrap"
  >
              اختيار عميل مسجل:
            </label>
            <select
    id="quick-client-select"
    onChange={handleSelectExistingClient}
    value={clients.find((c) => c.clientCode === clientCode)?.id ?? ""}
    className="text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
  >
              <option value="">-- إدخال يدوي أو اختر من القائمة --</option>
              {clients.map((c) => <option key={c.id} value={c.id}>
                  {c.clientCode} — {c.clientName} ({c.pharmacyName})
                </option>)}
            </select>
          </div>
        </div>

        {lastIssuedBanner && <div
    role="status"
    className="mt-4 p-3.5 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-between text-sm text-teal-900"
  >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
              <span>{lastIssuedBanner}</span>
            </div>
            <button
    type="button"
    onClick={() => setLastIssuedBanner(null)}
    className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
  >
              إخفاء
            </button>
          </div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {
    /* Field 1: كود العميل */
  }
            <div>
              <label
    htmlFor="license-client-code"
    className="block text-sm font-medium text-slate-700 mb-1.5"
  >
                كود العميل <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <input
    id="license-client-code"
    type="text"
    value={clientCode}
    onChange={(e) => {
      setClientCode(e.target.value);
      if (formErrors.clientCode) {
        setFormErrors({ ...formErrors, clientCode: "" });
      }
    }}
    placeholder="مثال: PH-1035"
    className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 ${formErrors.clientCode ? "border-red-500 bg-red-50/30" : "border-slate-300"}`}
  />
              </div>
              {formErrors.clientCode && <p className="mt-1.5 text-xs text-red-600">
                  {formErrors.clientCode}
                </p>}
            </div>

            {
    /* Field 2: اسم العميل */
  }
            <div>
              <label
    htmlFor="license-client-name"
    className="block text-sm font-medium text-slate-700 mb-1.5"
  >
                اسم العميل <span className="text-red-600">*</span>
              </label>
              <input
    id="license-client-name"
    type="text"
    value={clientName}
    onChange={(e) => {
      setClientName(e.target.value);
      if (formErrors.clientName) {
        setFormErrors({ ...formErrors, clientName: "" });
      }
    }}
    placeholder="مثال: د. محمد عبد العزيز"
    className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 ${formErrors.clientName ? "border-red-500 bg-red-50/30" : "border-slate-300"}`}
  />
              {formErrors.clientName && <p className="mt-1.5 text-xs text-red-600">
                  {formErrors.clientName}
                </p>}
            </div>

            {
    /* Field 3: اسم الصيدلية */
  }
            <div>
              <label
    htmlFor="license-pharmacy-name"
    className="block text-sm font-medium text-slate-700 mb-1.5"
  >
                اسم الصيدلية <span className="text-red-600">*</span>
              </label>
              <input
    id="license-pharmacy-name"
    type="text"
    value={pharmacyName}
    onChange={(e) => {
      setPharmacyName(e.target.value);
      if (formErrors.pharmacyName) {
        setFormErrors({ ...formErrors, pharmacyName: "" });
      }
    }}
    placeholder="مثال: صيدلية الشفاء الحديثة"
    className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-600 ${formErrors.pharmacyName ? "border-red-500 bg-red-50/30" : "border-slate-300"}`}
  />
              {formErrors.pharmacyName && <p className="mt-1.5 text-xs text-red-600">
                  {formErrors.pharmacyName}
                </p>}
            </div>
          </div>

          {
    /* Field 4: مدة الصلاحية (7 exact options) */
  }
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                مدة الصلاحية <span className="text-red-600">*</span>
              </label>
              <span className="text-xs text-slate-500">
                تاريخ الانتهاء المتوقع:{" "}
                <strong className="font-mono tabular-nums text-slate-900">
                  {previewExpiry}
                </strong>
              </span>
            </div>

            <div
    role="radiogroup"
    aria-label="مدة الصلاحية"
    className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5"
  >
              {DURATION_OPTIONS.map((opt) => {
    const isSelected = duration === opt.value;
    return <button
      key={opt.value}
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={() => setDuration(opt.value)}
      className={`flex flex-col items-start justify-between p-3 rounded-lg border text-right transition-colors cursor-pointer ${isSelected ? "bg-teal-900 text-white border-teal-900" : "bg-slate-50/70 text-slate-800 border-slate-200 hover:bg-slate-100"}`}
    >
                    <span className="text-sm font-bold whitespace-nowrap">
                      {opt.value}
                    </span>
                    <span
      className={`text-xs mt-1 ${isSelected ? "text-teal-200" : "text-slate-500"}`}
    >
                      {opt.days === null ? "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F" : <>
                          <span className="font-mono tabular-nums">{opt.days}</span> يوم
                        </>}
                    </span>
                  </button>;
  })}
            </div>
          </div>

          {
    /* Submit Row */
  }
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                سيتم ربط مفتاح الترخيص بكود العميل{" "}
                <strong className="font-mono text-slate-800">
                  {clientCode || "---"}
                </strong>{" "}
                وصلاحية{" "}
                <strong className="text-slate-800">{duration}</strong>.
              </span>
            </div>

            <button
    type="submit"
    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
  >
              <PlusCircle className="w-4 h-4" />
              <span>إصدار وتفعيل الترخيص</span>
            </button>
          </div>
        </form>
      </section>

      {
    /* Licenses Registry Table */
  }
      <section
    aria-labelledby="licenses-table-heading"
    className="bg-white border border-slate-200 rounded-xl overflow-hidden"
  >
        <div className="p-6 border-b border-slate-200 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2
    id="licenses-table-heading"
    className="text-lg font-bold text-slate-900"
  >
                سجل تراخيص الصيدليات
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                عرض وإدارة كافة التراخيص المصدرة، التحقق من مدد الصلاحية، وتجديد الاشتراكات.
              </p>
            </div>

            {
    /* Search Input */
  }
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative min-w-[260px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
    type="search"
    aria-label="بحث في التراخيص"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    placeholder="بحث بكود العميل، الاسم، أو الصيدلية..."
    className="w-full pr-9 pl-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
              </div>

              <select
    aria-label="تصفية حسب حالة الترخيص"
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
  >
                <option value="all">جميع الحالات</option>
                <option value="active">ساري ونشط</option>
                <option value="expiring_soon">قارب على الانتهاء</option>
                <option value="expired">منتهي الصلاحية</option>
                <option value="revoked">موقوف</option>
              </select>
            </div>
          </div>

          {
    /* Interactive Duration Filter Bar */
  }
          <div
    role="tablist"
    aria-label="تصفية التراخيص حسب مدة الصلاحية"
    className="flex items-center gap-1.5 overflow-x-auto pb-1"
  >
            <button
    type="button"
    role="tab"
    aria-selected={durationFilter === "all"}
    onClick={() => setDurationFilter("all")}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${durationFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}
  >
              كل المدد (<span className="font-mono tabular-nums">{licenses.length}</span>)
            </button>
            {DURATION_OPTIONS.map((opt) => {
    const count = licenses.filter(
      (l) => l.duration === opt.value
    ).length;
    return <button
      key={opt.value}
      type="button"
      role="tab"
      aria-selected={durationFilter === opt.value}
      onClick={() => setDurationFilter(opt.value)}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${durationFilter === opt.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}
    >
                  {opt.value} (<span className="font-mono tabular-nums">{count}</span>)
                </button>;
  })}
          </div>
        </div>

        {
    /* Data Table */
  }
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-3.5 px-4 whitespace-nowrap">كود العميل</th>
                <th className="py-3.5 px-4 whitespace-nowrap">اسم العميل</th>
                <th className="py-3.5 px-4 whitespace-nowrap">اسم الصيدلية</th>
                <th className="py-3.5 px-4 whitespace-nowrap">مدة الصلاحية</th>
                <th className="py-3.5 px-4 whitespace-nowrap">تاريخ الإصدار / الانتهاء</th>
                <th className="py-3.5 px-4 whitespace-nowrap">مفتاح الترخيص والحالة</th>
                <th className="py-3.5 px-4 text-left whitespace-nowrap">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredLicenses.length === 0 ? <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    لا توجد تراخيص مطابقة لمعايير البحث أو التصفية الحالية.
                  </td>
                </tr> : filteredLicenses.map((lic) => {
    const isCopied = copiedId === lic.id;
    return <tr
      key={lic.id}
      className="hover:bg-slate-50/70 transition-colors"
    >
                      {
      /* كود العميل */
    }
                      <td className="py-3.5 px-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {lic.clientCode}
                      </td>

                      {
      /* اسم العميل */
    }
                      <td className="py-3.5 px-4 text-slate-900 font-medium whitespace-nowrap">
                        {lic.clientName}
                      </td>

                      {
      /* اسم الصيدلية */
    }
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {lic.pharmacyName}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span>{lic.city}</span>
                        </div>
                      </td>

                      {
      /* مدة الصلاحية (Unboxed metadata per Zero-Pill rule) */
    }
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Clock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                          <span>{lic.duration}</span>
                        </div>
                      </td>

                      {
      /* تاريخ الإصدار والانتهاء */
    }
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        <div>
                          إصدار:{" "}
                          <span className="font-mono tabular-nums">{lic.issuedAt}</span>
                        </div>
                        <div className="mt-0.5 text-slate-900 font-medium">
                          انتهاء:{" "}
                          <span
      className={lic.expiresAt === "\u0645\u062F\u0649 \u0627\u0644\u062D\u064A\u0627\u0629" ? "" : "font-mono tabular-nums"}
    >
                            {lic.expiresAt}
                          </span>
                        </div>
                      </td>

                      {
      /* مفتاح الترخيص والحالة */
    }
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono tabular-nums text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                            {lic.licenseKey}
                          </code>
                          <button
      type="button"
      onClick={() => handleCopyKey(lic.id, lic.licenseKey)}
      aria-label={`\u0646\u0633\u062E \u0645\u0641\u062A\u0627\u062D \u0627\u0644\u062A\u0631\u062E\u064A\u0635 \u0644\u0644\u0639\u0645\u064A\u0644 ${lic.clientName}`}
      className="p-1 text-slate-500 hover:text-slate-900 rounded transition-colors cursor-pointer"
      title="نسخ مفتاح الترخيص"
    >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-teal-700" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs">
                          {lic.status === "active" && <span className="text-emerald-700 font-medium flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>ترخيص ساري</span>
                            </span>}
                          {lic.status === "expiring_soon" && <span className="text-amber-700 font-medium flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>قارب على الانتهاء</span>
                            </span>}
                          {lic.status === "expired" && <span className="text-red-700 font-medium flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>منتهي الصلاحية</span>
                            </span>}
                          {lic.status === "revoked" && <span className="text-red-700 font-medium flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>ترخيص موقوف</span>
                            </span>}
                        </div>
                      </td>

                      {
      /* الإجراءات */
    }
                      <td className="py-3.5 px-4 text-left whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
      type="button"
      onClick={() => onOpenCertificate(lic)}
      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
    >
                            وثيقة الترخيص
                          </button>
                          <button
      type="button"
      onClick={() => onRenewLicense(lic.id, lic.duration)}
      className="px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap cursor-pointer"
    >
                            تجديد
                          </button>
                          <button
      type="button"
      onClick={() => onToggleRevokeLicense(lic.id)}
      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
    >
                            {lic.status === "revoked" ? "\u062A\u0641\u0639\u064A\u0644" : "\u0625\u064A\u0642\u0627\u0641"}
                          </button>
                        </div>
                      </td>
                    </tr>;
  })}
            </tbody>
          </table>
        </div>
      </section>
    </div>;
};
