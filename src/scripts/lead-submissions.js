const submissionKey = 'promix-lead-attempts-v1';
const submissionHistoryKey = 'promixLeadAttemptsV1';
const submissionLifetime = 24 * 60 * 60 * 1000;

export const advanceSubmissionState = (previous, outcome) => {
  if (previous === 'accepted' || outcome === 'accepted') return 'accepted';
  if (['pending', 'unknown'].includes(previous) && outcome === 'rejected') return 'unknown';
  return outcome;
};

export function createSubmissionHistory({
  crypto = globalThis.crypto,
  storage = () => globalThis.sessionStorage,
  history = () => globalThis.history,
  now = Date.now,
} = {}) {
  let submissionAttempts = [];

  const mergeSubmissionAttempts = (stored) => {
    if (!Array.isArray(stored)) return;
    stored.forEach((item) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item?.id || '') || !/^[0-9a-f]{64}$/.test(item?.digest || '') || !['new', 'pending', 'unknown', 'accepted', 'rejected'].includes(item.state) || !Number.isFinite(item.createdAt) || item.createdAt <= now() - submissionLifetime || item.createdAt > now() + 60000) return;
      const existing = submissionAttempts.find((entry) => entry.id === item.id);
      if (!existing) { submissionAttempts.push({ ...item }); return; }
      const newer = (item.revision || 0) > (existing.revision || 0)
        || (item.revision || 0) === (existing.revision || 0) && (item.updatedAt || item.createdAt) > (existing.updatedAt || existing.createdAt);
      existing.state = existing.state === 'accepted' || item.state === 'accepted' ? 'accepted' : newer ? item.state : existing.state;
      existing.eventSent = existing.eventSent || item.eventSent;
      existing.revision = Math.max(existing.revision || 0, item.revision || 0);
      existing.updatedAt = Math.max(existing.updatedAt || 0, item.updatedAt || 0);
    });
  };

  const refreshSubmissionAttempts = () => {
    try { mergeSubmissionAttempts(JSON.parse(storage().getItem(submissionKey) || '[]')); } catch {}
    try { mergeSubmissionAttempts(history().state?.[submissionHistoryKey]); } catch {}
  };

  const saveSubmissionAttempts = () => {
    submissionAttempts = submissionAttempts.filter((item) => item.createdAt > now() - submissionLifetime).slice(-30);
    submissionAttempts.forEach((item) => { item.updatedAt = now(); item.revision = (Number.isSafeInteger(item.revision) ? item.revision : 0) + 1; });
    let saved = false;
    try { storage().setItem(submissionKey, JSON.stringify(submissionAttempts)); saved = true; } catch {}
    try {
      const browserHistory = history();
      const state = browserHistory.state && typeof browserHistory.state === 'object' ? browserHistory.state : {};
      browserHistory.replaceState({ ...state, [submissionHistoryKey]: submissionAttempts.map((item) => ({ ...item })) }, '');
      saved = true;
    } catch {}
    return saved;
  };

  const identifySubmission = async (payload, signal) => {
    const content = { ...payload };
    delete content.startedAt;
    delete content.submissionId;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
    if (signal.aborted) return null;
    refreshSubmissionAttempts();
    submissionAttempts = submissionAttempts.filter((item) => item.createdAt > now() - submissionLifetime);
    const digest = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    let attempt = submissionAttempts.find((item) => item.digest === digest);
    if (!attempt) {
      attempt = { id: crypto.randomUUID(), digest, state: 'new', createdAt: now(), eventSent: false };
      submissionAttempts.push(attempt);
    }
    if (!saveSubmissionAttempts()) throw new Error('submission-persistence-unavailable');
    return attempt;
  };

  refreshSubmissionAttempts();
  return { identifySubmission, refreshSubmissionAttempts, saveSubmissionAttempts };
}
