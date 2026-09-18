const Api = (() => {
  const TOKEN_KEY = 'examplatform_token';
  const USER_KEY = 'examplatform_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const t = getToken();
      if (t) headers.Authorization = `Bearer ${t}`;
    }
    const res = await fetch('/api' + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body, e.g. some 204s */ }
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function requireLogin(redirectTo = 'login.html') {
    if (!getToken()) {
      const next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
      window.location.href = `${redirectTo}?next=${next}`;
      return false;
    }
    return true;
  }

  // Where to land after login/register when no ?next= was carried over —
  // examiners go to their exam dashboard, candidates to their results.
  function homeFor(user) {
    return user && user.role === 'examiner' ? 'dashboard.html' : 'my-results.html';
  }

  return { getToken, setSession, getUser, clearSession, request, requireLogin, homeFor };
})();
