/* PharmacyPOS License Studio — renderer */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let state = null;
let issueType = 'LIFETIME';

/* ------------------------------- helpers ------------------------------- */

function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function setMsg(sel, text, kind) {
  const el = $(sel);
  el.textContent = text || '';
  el.classList.remove('error', 'success');
  if (kind) el.classList.add(kind);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (err) {
      return false;
    }
  }
}

/* -------------------------------- state -------------------------------- */

async function refreshState() {
  const res = await window.studio.getState();
  if (!res.ok) {
    toast(res.error || 'تعذر قراءة الحالة', true);
    return;
  }
  state = res.state;
  renderState();
}

function renderState() {
  const s = state;

  // Setup overlay
  const needsKey = !s.hasKey;
  $('#setup').classList.toggle('hidden', !needsKey);

  // Chips
  const keyChip = $('#keyChip');
  if (!s.hasKey) {
    keyChip.textContent = '⚠️ لا يوجد مفتاح';
    keyChip.className = 'chip bad';
  } else if (s.keyMatchesApp) {
    keyChip.textContent = '🔐 المفتاح جاهز';
    keyChip.className = 'chip ok';
  } else {
    keyChip.textContent = '⚠️ مفتاح لا يطابق التطبيق';
    keyChip.className = 'chip warn';
  }
  $('#countChip').textContent = `📄 ${s.counts.issued} صادر · 🚫 ${s.counts.revoked} ملغى`;

  // Issue / revoke buttons availability
  $('#btnIssue').disabled = !s.hasKey;
  $('#btnRevoke').disabled = !s.hasKey;

  // Export view
  $('#projectDir').value = s.projectDir || '';

  // Key view
  const status = $('#keyStatus');
  if (!s.hasKey) {
    status.innerHTML = '<div class="line">⚠️ <b>لم يتم استيراد مفتاح خاص بعد.</b></div>';
  } else {
    status.innerHTML = `
      <div class="line">✅ <b>المفتاح مستورد</b></div>
      <div class="line">🔑 البصمة: <span class="mono ltr">${esc(s.publicKey || '—')}</span></div>
      <div class="line">🛡️ الحماية: <b>${s.keyProtected ? 'مشفّر بحماية ويندوز (DPAPI)' : 'غير مشفّر (تحذير)'}</b></div>
      <div class="line">${s.keyMatchesApp ? '🟢 يطابق مفتاح التطبيق العام' : '🔴 لا يطابق مفتاح التطبيق — الأكواد لن تعمل'}</div>
    `;
  }
  $('#infoKid').textContent = s.kid || '—';
  $('#infoPub').textContent = s.publicKey || s.expectedKey || '—';
  $('#infoMatch').textContent = s.hasKey ? (s.keyMatchesApp ? 'نعم ✓' : 'لا ✗') : '—';
  $('#infoProtected').textContent = s.hasKey ? (s.keyProtected ? 'مشفّر (DPAPI)' : 'غير مشفّر') : '—';

  renderRevoked();
  renderLog();
}

/* ------------------------------- revocations --------------------------- */

function renderRevoked() {
  const body = $('#revokedBody');
  const list = (state && state.revoked) || [];
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">لا توجد أجهزة ملغاة.</td></tr>';
    return;
  }
  body.innerHTML = list.map((r) => `
    <tr>
      <td class="mono ltr">${esc(r.mid)}</td>
      <td>${esc(r.reason || '—')}</td>
      <td>${esc(fmtDate(r.revokedAt || (r.iat ? new Date(r.iat * 1000).toISOString() : null)))}</td>
      <td><button class="btn ghost small" data-remove-revocation="${esc(r.mid)}">إزالة</button></td>
    </tr>
  `).join('');
}

function renderLog() {
  const body = $('#logBody');
  const filter = ($('#logFilter').value || '').trim().toUpperCase();
  const rows = ((state && state.issued) || []).filter((r) =>
    !filter || String(r.mid || '').toUpperCase().includes(filter)
  );

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">${filter ? 'لا نتائج مطابقة.' : 'لم تصدر أي ترخيص بعد.'}</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((r) => {
    const typ = String(r.typ || '').toUpperCase();
    const label = typ === 'TIMED' ? 'مؤقت' : 'مدى الحياة';
    return `
      <tr>
        <td class="mono ltr">${esc(r.mid)}</td>
        <td>${esc(label)}</td>
        <td class="mono ltr" style="font-size:11.5px">${esc(r.lid || '—')}</td>
        <td>${esc(fmtDate(r.issuedAt))}</td>
        <td>${esc(r.expDate ? fmtDate(r.expDate) : '—')}</td>
      </tr>
    `;
  }).join('');
}

/* --------------------------------- tabs -------------------------------- */

function activateView(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
}

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => activateView(tab.dataset.view));
});

/* ------------------------------- key setup ----------------------------- */

async function handleImportResult(res) {
  if (!res || res.ok === false) {
    if (res && res.canceled) return;
    $('#setupMsg').textContent = (res && res.error) || 'فشل استيراد المفتاح.';
    $('#setupMsg').className = 'msg error';
    return;
  }
  if (!res.matchesApp) {
    toast('المفتاح لا يطابق مفتاح التطبيق — الأكواد الصادرة به لن تعمل!', true);
  } else {
    toast('تم استيراد المفتاح بنجاح ✓');
  }
  $('#setupMsg').textContent = '';
  await refreshState();
}

$('#setupBrowse').addEventListener('click', async () => {
  const res = await window.studio.importKeyFile();
  await handleImportResult(res);
});

$('#setupPaste').addEventListener('click', () => {
  $('#pasteBox').classList.toggle('hidden');
});

$('#setupSavePaste').addEventListener('click', async () => {
  const text = $('#pasteKey').value.trim();
  if (!text) {
    toast('الصق محتوى المفتاح أولاً', true);
    return;
  }
  const res = await window.studio.importKeyText(text);
  await handleImportResult(res);
});

/* -------------------------------- issuing ------------------------------ */

$$('#issueType .seg').forEach((btn) => {
  btn.addEventListener('click', () => {
    issueType = btn.dataset.type;
    $$('#issueType .seg').forEach((b) => b.classList.toggle('active', b === btn));
    $('#timedBox').classList.toggle('hidden', issueType !== 'TIMED');
  });
});

$('#btnIssue').addEventListener('click', async () => {
  const mid = $('#issueMid').value.trim();
  if (!mid) {
    setMsg('#issueMsg', 'أدخل كود الجهاز أولاً.', 'error');
    return;
  }

  const input = { mid, type: issueType };
  if (issueType === 'TIMED') {
    const until = $('#issueUntil').value.trim();
    if (until) input.until = until;
    else input.days = Number($('#issueDays').value);
  }

  setMsg('#issueMsg', 'جارٍ الإصدار…');
  $('#btnIssue').disabled = true;
  let res;
  try {
    res = await window.studio.issue(input);
  } finally {
    $('#btnIssue').disabled = false;
  }

  if (!res.ok) {
    setMsg('#issueMsg', res.error || 'فشل الإصدار.', 'error');
    return;
  }

  setMsg('#issueMsg', '');
  $('#issueToken').value = res.token;
  const meta = [
    res.payload.mid,
    res.payload.typ === 'TIMED' ? `مؤقت حتى ${fmtDate(res.expiresAt)}` : 'مدى الحياة',
    res.signatureValid ? 'التوقيع سليم ✓' : 'التوقيع غير سليم ✗'
  ].join(' · ');
  $('#issueMeta').textContent = meta;
  $('#issueResult').classList.remove('hidden');
  $('#issueResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  await refreshState();
});

$('#btnIssueClear').addEventListener('click', () => {
  $('#issueMid').value = '';
  $('#issueUntil').value = '';
  $('#issueDays').value = '365';
  $('#issueResult').classList.add('hidden');
  setMsg('#issueMsg', '');
});

$('#btnIssueAgain').addEventListener('click', () => {
  $('#issueMid').value = '';
  $('#issueResult').classList.add('hidden');
  $('#issueMid').focus();
});

$('#btnCopyIssue').addEventListener('click', async () => {
  const ok = await copyText($('#issueToken').value);
  toast(ok ? 'تم نسخ المفتاح ✓' : 'تعذر النسخ', !ok);
});

/* -------------------------------- revoking ----------------------------- */

$('#btnRevoke').addEventListener('click', async () => {
  const mid = $('#revokeMid').value.trim();
  if (!mid) {
    setMsg('#revokeMsg', 'أدخل كود الجهاز أولاً.', 'error');
    return;
  }
  if (!window.confirm(`تأكيد إلغاء الترخيص للجهاز:\n${mid}\n\nسيُوقف كل ترخيص صادر لهذا الجهاز.`)) {
    return;
  }

  setMsg('#revokeMsg', 'جارٍ الإلغاء…');
  $('#btnRevoke').disabled = true;
  let res;
  try {
    res = await window.studio.revoke({ mid, reason: $('#revokeReason').value.trim() });
  } finally {
    $('#btnRevoke').disabled = false;
  }

  if (!res.ok) {
    setMsg('#revokeMsg', res.error || 'فشل الإلغاء.', 'error');
    return;
  }

  setMsg('#revokeMsg', 'تم تسجيل الإلغاء. سلّم العميل الرمز التالي.', 'success');
  $('#revokeToken').value = res.token;
  $('#revokeResult').classList.remove('hidden');
  await refreshState();
});

$('#btnCopyRevoke').addEventListener('click', async () => {
  const ok = await copyText($('#revokeToken').value);
  toast(ok ? 'تم نسخ رمز الإلغاء ✓' : 'تعذر النسخ', !ok);
});

/* ---------------------------- revocations table ------------------------ */

$('#btnRefreshRevoked').addEventListener('click', async () => {
  await refreshState();
  toast('تم التحديث');
});

$('#revokedBody').addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-remove-revocation]');
  if (!btn) return;
  const mid = btn.getAttribute('data-remove-revocation');
  if (!window.confirm(`إزالة الجهاز من قائمة الإلغاء المحلية؟\n${mid}`)) return;
  const res = await window.studio.removeRevocation(mid);
  if (res.ok) {
    toast('تمت الإزالة');
    await refreshState();
  } else {
    toast(res.error || 'فشل', true);
  }
});

/* --------------------------------- log --------------------------------- */

$('#logFilter').addEventListener('input', renderLog);

/* -------------------------------- export ------------------------------- */

$('#btnChooseProject').addEventListener('click', async () => {
  const res = await window.studio.chooseProject();
  if (res.ok) {
    $('#projectDir').value = res.projectDir;
    toast('تم تحديد مجلد المشروع ✓');
    await refreshState();
  } else if (!res.canceled) {
    toast(res.error || 'فشل اختيار المجلد', true);
  }
});

$('#btnExport').addEventListener('click', async () => {
  setMsg('#exportMsg', 'جارٍ التصدير…');
  const res = await window.studio.exportRevocations();
  if (!res.ok) {
    if (res.canceled) setMsg('#exportMsg', '');
    else setMsg('#exportMsg', res.error || 'فشل التصدير.', 'error');
    return;
  }
  setMsg('#exportMsg', `تم تصدير ${res.count} جهاز إلى:\n${res.path}`, 'success');
  toast('تم التصدير ✓');
});

$('#btnOpenProject').addEventListener('click', async () => {
  const dir = $('#projectDir').value.trim();
  if (!dir) {
    toast('اختر مجلد المشروع أولاً', true);
    return;
  }
  const res = await window.studio.openFolder(dir);
  if (!res.ok) toast(res.error || 'فشل فتح المجلد', true);
});

/* ---------------------------------- key -------------------------------- */

$('#btnReimportKey').addEventListener('click', async () => {
  const res = await window.studio.importKeyFile();
  if (res && res.ok) {
    toast(res.matchesApp ? 'تم استيراد المفتاح ✓' : 'المفتاح لا يطابق التطبيق!', !res.matchesApp);
    await refreshState();
  } else if (res && !res.canceled) {
    toast(res.error || 'فشل الاستيراد', true);
  }
});

$('#btnForgetKey').addEventListener('click', async () => {
  if (!window.confirm('حذف المفتاح الخاص من الأداة؟\nلن تتمكن من إصدار تراخيص حتى تستورده مرة أخرى.')) return;
  const res = await window.studio.forgetKey();
  if (res.ok) {
    toast('تم حذف المفتاح');
    await refreshState();
  } else {
    toast(res.error || 'فشل', true);
  }
});

/* --------------------------------- boot -------------------------------- */

(async () => {
  try {
    await refreshState();
  } catch (e) {
    toast('تعذر تشغيل الأداة: ' + e.message, true);
  }
})();
