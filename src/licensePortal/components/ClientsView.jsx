import { useState } from "react";
import {
  Search,
  UserPlus,
  KeyRound,
  CheckCircle2,
  XCircle,
  FileKey2
} from "lucide-react";
import {
  filterClients,
  validateClientForm,
  generateClientCode
} from "../utils/licenseLogic";
export const ClientsView = ({
  clients,
  licenses,
  onToggleClientActive,
  onOpenPasswordReset,
  onAddClient,
  onCreateLicenseForClient
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [clientCode, setClientCode] = useState(() => generateClientCode(clients));
  const [clientName, setClientName] = useState("");
  const [pharmacyName, setPharmacyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("\u0627\u0644\u0642\u0627\u0647\u0631\u0629");
  const [registeredAt, setRegisteredAt] = useState("2026-11-06");
  const [formErrors, setFormErrors] = useState({});
  const [feedbackBanner, setFeedbackBanner] = useState(null);
  const filteredClients = filterClients(clients, searchQuery, statusFilter);
  const activeClientsCount = clients.filter((c) => c.isActive).length;
  const inactiveClientsCount = clients.length - activeClientsCount;
  const resetCount = clients.filter((c) => Boolean(c.lastPasswordReset)).length;
  const handleOpenAddForm = () => {
    setClientCode(generateClientCode(clients));
    setFormErrors({});
    setShowAddForm((prev) => !prev);
  };
  const handleAddClientSubmit = (e) => {
    e.preventDefault();
    const validation = validateClientForm({
      clientCode,
      clientName,
      pharmacyName,
      phone
    });
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }
    onAddClient({
      clientCode: clientCode.trim(),
      clientName: clientName.trim(),
      pharmacyName: pharmacyName.trim(),
      phone: phone.trim(),
      email: email.trim() || "info@pharmacy.eg",
      city: city.trim() || "\u0627\u0644\u0642\u0627\u0647\u0631\u0629",
      registeredAt: registeredAt || "2026-11-06"
    });
    setFeedbackBanner(
      `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0639\u0645\u064A\u0644 "${clientName.trim()}" \u0628\u0643\u0648\u062F (${clientCode.trim()}) \u0648\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628 \u0628\u0646\u062C\u0627\u062D.`
    );
    setClientName("");
    setPharmacyName("");
    setPhone("");
    setEmail("");
    setShowAddForm(false);
  };
  const handleToggleAccount = (client) => {
    onToggleClientActive(client.id);
    const nextStateLabel = !client.isActive ? "\u062A\u0641\u0639\u064A\u0644" : "\u0625\u0644\u063A\u0627\u0621 \u062A\u0641\u0639\u064A\u0644";
    setFeedbackBanner(
      `\u062A\u0645 ${nextStateLabel} \u062D\u0633\u0627\u0628 \u0627\u0644\u0639\u0645\u064A\u0644 "${client.clientName}" (${client.clientCode}).`
    );
  };
  return <div className="space-y-8">
      {
    /* KPI Summary Strip */
  }
      <section
    aria-label="ملخص إحصائيات العملاء"
    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl overflow-hidden"
  >
        <div className="p-5 border-b sm:border-b-0 sm:border-l border-slate-200">
          <p className="text-xs font-medium text-slate-500">إجمالي العملاء المسجلين</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {clients.length}
            </span>
            <span className="text-xs text-slate-500">صيدلية وعميل</span>
          </div>
        </div>

        <div className="p-5 border-b sm:border-b-0 lg:border-l border-slate-200">
          <p className="text-xs font-medium text-slate-500">الحسابات المفعلة</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-teal-700 font-mono tabular-nums">
              {activeClientsCount}
            </span>
            <span className="text-xs text-teal-700">حساب نشط</span>
          </div>
        </div>

        <div className="p-5 border-b sm:border-b-0 sm:border-l border-slate-200">
          <p className="text-xs font-medium text-slate-500">الحسابات الموقوفة</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
              {inactiveClientsCount}
            </span>
            <span className="text-xs text-amber-700">موقوف مؤقتاً</span>
          </div>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">استعادة كلمة المرور</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {resetCount}
            </span>
            <span className="text-xs text-slate-500">عملية إعادة تعيين</span>
          </div>
        </div>
      </section>

      {
    /* Feedback Banner */
  }
      {feedbackBanner && <div
    role="status"
    className="p-3.5 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-between text-sm text-teal-900"
  >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span>{feedbackBanner}</span>
          </div>
          <button
    type="button"
    onClick={() => setFeedbackBanner(null)}
    className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
  >
            إغلاق
          </button>
        </div>}

      {
    /* Add New Client Drawer/Section */
  }
      {showAddForm && <section
    aria-labelledby="add-client-heading"
    className="bg-white border border-slate-200 rounded-xl p-6"
  >
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div>
              <h2 id="add-client-heading" className="text-base font-bold text-slate-900">
                إضافة عميل جديد إلى النظام
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                سيتم إنشاء كود خاص بالعميل وتاريخ تسجيله مع تفعيل الحساب مباشرة.
              </p>
            </div>
            <button
    type="button"
    onClick={() => setShowAddForm(false)}
    className="text-xs font-medium text-slate-500 hover:text-slate-900"
  >
              إلغاء
            </button>
          </div>

          <form onSubmit={handleAddClientSubmit} className="mt-5 space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label
    htmlFor="new-client-code"
    className="block text-xs font-medium text-slate-700 mb-1"
  >
                  كود العميل <span className="text-red-600">*</span>
                </label>
                <input
    id="new-client-code"
    type="text"
    value={clientCode}
    onChange={(e) => setClientCode(e.target.value)}
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
                {formErrors.clientCode && <p className="mt-1 text-xs text-red-600">{formErrors.clientCode}</p>}
              </div>

              <div>
                <label
    htmlFor="new-client-name"
    className="block text-xs font-medium text-slate-700 mb-1"
  >
                  اسم العميل <span className="text-red-600">*</span>
                </label>
                <input
    id="new-client-name"
    type="text"
    value={clientName}
    onChange={(e) => setClientName(e.target.value)}
    placeholder="مثال: د. طارق سليم"
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
                {formErrors.clientName && <p className="mt-1 text-xs text-red-600">{formErrors.clientName}</p>}
              </div>

              <div>
                <label
    htmlFor="new-client-pharmacy"
    className="block text-xs font-medium text-slate-700 mb-1"
  >
                  اسم الصيدلية <span className="text-red-600">*</span>
                </label>
                <input
    id="new-client-pharmacy"
    type="text"
    value={pharmacyName}
    onChange={(e) => setPharmacyName(e.target.value)}
    placeholder="مثال: صيدلية الفجر"
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
                {formErrors.pharmacyName && <p className="mt-1 text-xs text-red-600">{formErrors.pharmacyName}</p>}
              </div>

              <div>
                <label
    htmlFor="new-client-phone"
    className="block text-xs font-medium text-slate-700 mb-1"
  >
                  رقم الهاتف <span className="text-red-600">*</span>
                </label>
                <input
    id="new-client-phone"
    type="tel"
    value={phone}
    onChange={(e) => setPhone(e.target.value)}
    placeholder="010xxxxxxxx"
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
                {formErrors.phone && <p className="mt-1 text-xs text-red-600">{formErrors.phone}</p>}
              </div>

              <div>
                <label
    htmlFor="new-client-city"
    className="block text-xs font-medium text-slate-700 mb-1"
  >
                  المدينة / العنوان
                </label>
                <input
    id="new-client-city"
    type="text"
    value={city}
    onChange={(e) => setCity(e.target.value)}
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
              </div>

              <div>
                <label
    htmlFor="new-client-date"
    className="block text-xs font-medium text-slate-700 mb-1"
  >
                  تاريخ التسجيل
                </label>
                <input
    id="new-client-date"
    type="date"
    value={registeredAt}
    onChange={(e) => setRegisteredAt(e.target.value)}
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
    type="button"
    onClick={() => setShowAddForm(false)}
    className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
  >
                إلغاء
              </button>
              <button
    type="submit"
    className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
  >
                حفظ بيانات العميل
              </button>
            </div>
          </form>
        </section>}

      {
    /* Clients Table Section */
  }
      <section
    aria-labelledby="clients-heading"
    className="bg-white border border-slate-200 rounded-xl overflow-hidden"
  >
        <div className="p-6 border-b border-slate-200 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 id="clients-heading" className="text-lg font-bold text-slate-900">
                سجل العملاء وإدارة الحسابات
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                إدارة بيانات العملاء، تاريخ التسجيل، الكود الخاص بكل عميل، مع إمكانية تفعيل أو إلغاء تفعيل الحساب وإعادة تعيين كلمة المرور.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[250px] flex-1 sm:flex-initial">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
    type="search"
    aria-label="بحث في قائمة العملاء"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    placeholder="ابحث بالاسم، الكود، أو الصيدلية..."
    className="w-full pr-9 pl-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
              </div>

              <button
    type="button"
    onClick={handleOpenAddForm}
    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
  >
                <UserPlus className="w-4 h-4" />
                <span>إضافة عميل جديد</span>
              </button>
            </div>
          </div>

          {
    /* Interactive Status Filter Tabs */
  }
          <div
    role="tablist"
    aria-label="تصفية العملاء حسب حالة الحساب"
    className="flex items-center gap-1.5"
  >
            <button
    type="button"
    role="tab"
    aria-selected={statusFilter === "all"}
    onClick={() => setStatusFilter("all")}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${statusFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}
  >
              جميع العملاء (<span className="font-mono tabular-nums">{clients.length}</span>)
            </button>
            <button
    type="button"
    role="tab"
    aria-selected={statusFilter === "active"}
    onClick={() => setStatusFilter("active")}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${statusFilter === "active" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}
  >
              الحسابات المفعلة (<span className="font-mono tabular-nums">{activeClientsCount}</span>)
            </button>
            <button
    type="button"
    role="tab"
    aria-selected={statusFilter === "inactive"}
    onClick={() => setStatusFilter("inactive")}
    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${statusFilter === "inactive" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}
  >
              الحسابات الموقوفة (<span className="font-mono tabular-nums">{inactiveClientsCount}</span>)
            </button>
          </div>
        </div>

        {
    /* Clients Table */
  }
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-3.5 px-3.5 whitespace-nowrap">كود العميل</th>
                <th className="py-3.5 px-3.5 whitespace-nowrap">اسم العميل</th>
                <th className="py-3.5 px-3.5 whitespace-nowrap">اسم الصيدلية</th>
                <th className="py-3.5 px-3.5 whitespace-nowrap">تاريخ التسجيل</th>
                <th className="py-3.5 px-3.5 whitespace-nowrap">حالة الحساب والتفعيل</th>
                <th className="py-3.5 px-3.5 text-left whitespace-nowrap">
                  إعادة تعيين كلمة المرور وإجراءات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredClients.length === 0 ? <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    لا يوجد عملاء مطابقون للبحث الحالي.
                  </td>
                </tr> : filteredClients.map((client) => {
    const clientLicenses = licenses.filter(
      (l) => l.clientCode === client.clientCode
    );
    return <tr
      key={client.id}
      className="hover:bg-slate-50/70 transition-colors"
    >
                      {
      /* كود العميل */
    }
                      <td className="py-3.5 px-3.5 font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        {client.clientCode}
                      </td>

                      {
      /* اسم العميل */
    }
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {client.clientName}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
                          <span>{client.phone}</span>
                          <span aria-hidden="true">·</span>
                          <span>{client.email}</span>
                        </div>
                      </td>

                      {
      /* اسم الصيدلية */
    }
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {client.pharmacyName}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                          <span>{client.city}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            <strong className="font-mono tabular-nums font-medium">
                              {clientLicenses.length}
                            </strong>{" "}
                            ترخيص
                          </span>
                        </div>
                      </td>

                      {
      /* تاريخ التسجيل */
    }
                      <td className="py-3.5 px-3.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {client.registeredAt}
                      </td>

                      {
      /* حالة الحساب + زر تفعيل / إلغاء تفعيل الحساب */
    }
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {client.isActive ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>مفعل</span>
                            </span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>غير مفعل</span>
                            </span>}
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <button
      type="button"
      onClick={() => handleToggleAccount(client)}
      aria-label={client.isActive ? `\u0625\u0644\u063A\u0627\u0621 \u062A\u0641\u0639\u064A\u0644 \u062D\u0633\u0627\u0628 ${client.clientName}` : `\u062A\u0641\u0639\u064A\u0644 \u062D\u0633\u0627\u0628 ${client.clientName}`}
      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${client.isActive ? "bg-white text-slate-700 border-slate-300 hover:bg-red-50 hover:text-red-800 hover:border-red-200" : "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100"}`}
    >
                            {client.isActive ? "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062A\u0641\u0639\u064A\u0644" : "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628"}
                          </button>
                        </div>
                      </td>

                      {
      /* إعادة تعيين كلمة المرور + إصدار ترخيص */
    }
                      <td className="py-3.5 px-3.5 text-left whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
      type="button"
      onClick={() => onOpenPasswordReset(client)}
      aria-label={`\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0644\u0639\u0645\u064A\u0644 ${client.clientName}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
    >
                            <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                            <span>إعادة تعيين كلمة المرور</span>
                          </button>

                          <button
      type="button"
      onClick={() => onCreateLicenseForClient(client)}
      aria-label={`\u0625\u0635\u062F\u0627\u0631 \u062A\u0631\u062E\u064A\u0635 \u062C\u062F\u064A\u062F \u0644\u0644\u0639\u0645\u064A\u0644 ${client.clientName}`}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
    >
                            <FileKey2 className="w-3.5 h-3.5 text-slate-600" />
                            <span>ترخيص جديد</span>
                          </button>
                        </div>

                        {client.lastPasswordReset && <div className="text-[11px] text-slate-500 mt-1">
                            آخر إعادة تعيين:{" "}
                            <span className="font-mono tabular-nums">
                              {client.lastPasswordReset}
                            </span>
                            {client.lastTempPassword && <>
                                {" "}
                                · كلمة المرور:{" "}
                                <span className="font-mono tabular-nums font-semibold text-slate-700">
                                  {client.lastTempPassword}
                                </span>
                              </>}
                          </div>}
                      </td>
                    </tr>;
  })}
            </tbody>
          </table>
        </div>
      </section>
    </div>;
};
