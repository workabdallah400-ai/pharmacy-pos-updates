import { useState } from "react";
import {
  KeyRound,
  X,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck
} from "lucide-react";
import {
  generateTempPassword,
  validatePasswordReset
} from "../utils/licenseLogic";
export const PasswordResetModal = ({
  client,
  onClose,
  onConfirmReset
}) => {
  const [mode, setMode] = useState("auto");
  const [seed, setSeed] = useState(4918);
  const [manualPassword, setManualPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  if (!client) return null;
  const generatedPassword = generateTempPassword(client.clientCode, seed);
  const activePassword = mode === "auto" ? generatedPassword : manualPassword.trim();
  const handleCopy = () => {
    if (navigator.clipboard && activePassword) {
      navigator.clipboard.writeText(activePassword).catch(() => {
      });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === "manual") {
      const check = validatePasswordReset({
        password: manualPassword,
        confirmPassword
      });
      if (!check.valid) {
        setError(check.error || "\u0628\u064A\u0627\u0646\u0627\u062A \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629");
        return;
      }
    }
    setError(null);
    onConfirmReset(client.id, activePassword);
    setResetDone(true);
  };
  return <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="reset-password-modal-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
  >
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3
    id="reset-password-modal-title"
    className="text-base font-bold text-slate-900"
  >
                إعادة تعيين كلمة المرور للعميل
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                إصدار كلمة مرور جديدة لحساب العميل في حال نسيانها
              </p>
            </div>
          </div>
          <button
    type="button"
    onClick={onClose}
    aria-label="إغلاق نافذة إعادة تعيين كلمة المرور"
    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
  >
            <X className="w-4 h-4" />
          </button>
        </div>

        {
    /* Client Summary Strip */
  }
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">اسم العميل:</span>
            <span className="font-semibold text-slate-900">{client.clientName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">كود العميل:</span>
            <span className="font-mono tabular-nums font-bold text-slate-900">
              {client.clientCode}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">اسم الصيدلية:</span>
            <span className="font-medium text-slate-800">{client.pharmacyName}</span>
          </div>
        </div>

        {resetDone ? <div className="space-y-4">
            <div className="p-4 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-sm space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                <span>تم تحديث كلمة المرور بنجاح!</span>
              </div>
              <p className="text-xs text-teal-800">
                يمكنك الآن نسخ كلمة المرور الجديدة وإرسالها للعميل لتسجيل الدخول إلى برنامج الصيدلية:
              </p>
              <div className="flex items-center justify-between bg-white border border-teal-200 rounded-md px-3 py-2 mt-2">
                <code className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                  {activePassword}
                </code>
                <button
    type="button"
    onClick={handleCopy}
    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 cursor-pointer"
  >
                  {copied ? <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تم النسخ</span>
                    </> : <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ</span>
                    </>}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
    type="button"
    onClick={onClose}
    className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
  >
                تم وإغلاق
              </button>
            </div>
          </div> : <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {
    /* Mode Switch */
  }
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
    type="button"
    onClick={() => {
      setMode("auto");
      setError(null);
    }}
    className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${mode === "auto" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
  >
                توليد كلمة مرور مؤقتة
              </button>
              <button
    type="button"
    onClick={() => {
      setMode("manual");
      setError(null);
    }}
    className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${mode === "manual" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
  >
                تعيين كلمة مرور يدوية
              </button>
            </div>

            {mode === "auto" ? <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">
                  كلمة المرور المؤقتة المقترحة
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 font-mono tabular-nums text-sm font-bold text-slate-900">
                    {generatedPassword}
                  </div>
                  <button
    type="button"
    onClick={() => setSeed((s) => s + 379)}
    aria-label="توليد كلمة مرور عشوائية أخرى"
    className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
    title="توليد كلمة مرور أخرى"
  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
    type="button"
    onClick={handleCopy}
    aria-label="نسخ كلمة المرور المؤقتة"
    className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
    title="نسخ كلمة المرور"
  >
                    {copied ? <Check className="w-4 h-4 text-teal-700" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  سيُطلب من العميل تغيير كلمة المرور المؤقتة فور تسجيل الدخول الأول للبرنامج.
                </p>
              </div> : <div className="space-y-3">
                <div>
                  <label
    htmlFor="manual-new-password"
    className="block text-xs font-medium text-slate-700 mb-1"
  >
                    كلمة المرور الجديدة <span className="text-red-600">*</span>
                  </label>
                  <input
    id="manual-new-password"
    type="password"
    value={manualPassword}
    onChange={(e) => setManualPassword(e.target.value)}
    placeholder="أدخل 6 أحرف أو أرقام على الأقل"
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
                </div>
                <div>
                  <label
    htmlFor="manual-confirm-password"
    className="block text-xs font-medium text-slate-700 mb-1"
  >
                    تأكيد كلمة المرور الجديدة <span className="text-red-600">*</span>
                  </label>
                  <input
    id="manual-confirm-password"
    type="password"
    value={confirmPassword}
    onChange={(e) => setConfirmPassword(e.target.value)}
    placeholder="أعد كتابة كلمة المرور"
    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
  />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
    type="button"
    onClick={onClose}
    className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
  >
                إلغاء
              </button>
              <button
    type="submit"
    className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
  >
                تأكيد إعادة تعيين كلمة المرور
              </button>
            </div>
          </form>}
      </div>
    </div>;
};
export const LicenseCertificateModal = ({
  license,
  onClose
}) => {
  const [copied, setCopied] = useState(false);
  if (!license) return null;
  const handleCopySummary = () => {
    const summary = [
      `\u0648\u062B\u064A\u0642\u0629 \u062A\u0631\u062E\u064A\u0635 \u0628\u0631\u0646\u0627\u0645\u062C \u0641\u0627\u0631\u0645\u0627 \u0643\u064A\u0631 \u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0627\u062A`,
      `\u0643\u0648\u062F \u0627\u0644\u0639\u0645\u064A\u0644: ${license.clientCode}`,
      `\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644: ${license.clientName}`,
      `\u0627\u0633\u0645 \u0627\u0644\u0635\u064A\u062F\u0644\u064A\u0629: ${license.pharmacyName}`,
      `\u0645\u062F\u0629 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629: ${license.duration}`,
      `\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621: ${license.expiresAt}`,
      `\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u062A\u0641\u0639\u064A\u0644: ${license.licenseKey}`
    ].join("\n");
    if (navigator.clipboard) {
      navigator.clipboard.writeText(summary).catch(() => {
      });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  return <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="certificate-modal-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
  >
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <h3
    id="certificate-modal-title"
    className="text-base font-bold text-slate-900"
  >
              وثيقة ترخيص برنامج الصيدلية
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              بيانات التفعيل الرسمية المعتمدة للعميل والصيدلية
            </p>
          </div>
          <button
    type="button"
    onClick={onClose}
    aria-label="إغلاق وثيقة الترخيص"
    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
  >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 text-sm">
          <div className="flex justify-between py-1.5 border-b border-slate-200/70">
            <span className="text-slate-500">كود العميل:</span>
            <span className="font-mono tabular-nums font-bold text-slate-900">
              {license.clientCode}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-200/70">
            <span className="text-slate-500">اسم العميل:</span>
            <span className="font-semibold text-slate-900">
              {license.clientName}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-200/70">
            <span className="text-slate-500">اسم الصيدلية:</span>
            <span className="font-semibold text-slate-900">
              {license.pharmacyName}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-200/70">
            <span className="text-slate-500">مدة الصلاحية:</span>
            <span className="font-bold text-teal-800">{license.duration}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-200/70">
            <span className="text-slate-500">تاريخ الإصدار / الانتهاء:</span>
            <span className="font-mono tabular-nums text-slate-800">
              {license.issuedAt} ← {license.expiresAt}
            </span>
          </div>
          <div className="pt-2">
            <span className="block text-xs text-slate-500 mb-1.5">
              مفتاح التفعيل الرقمي (License Key):
            </span>
            <div className="bg-white border border-slate-300 rounded-lg p-3 text-center font-mono tabular-nums font-bold text-slate-900 tracking-wider">
              {license.licenseKey}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
    type="button"
    onClick={handleCopySummary}
    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors cursor-pointer"
  >
            {copied ? <>
                <Check className="w-4 h-4" />
                <span>تم نسخ بيانات الترخيص</span>
              </> : <>
                <Copy className="w-4 h-4" />
                <span>نسخ بيانات الوثيقة بالكامل</span>
              </>}
          </button>

          <button
    type="button"
    onClick={onClose}
    className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
  >
            إغلاق
          </button>
        </div>
      </div>
    </div>;
};
