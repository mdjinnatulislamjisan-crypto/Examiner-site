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
      const err = new Error(data.error || `Request failed (${res.status})`);
      // Carry over any extra fields the API sent alongside the error message
      // (e.g. needsVerification) so callers can branch on them.
      Object.assign(err, data);
      throw err;
    }
    return data;
  }

  // For endpoints that require login but return a file (not JSON) — a plain
  // <a href> can't attach the Authorization header, so downloads must go
  // through fetch instead. Triggers a normal browser "Save file" download.
  async function downloadFile(path, filename) {
    const headers = {};
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch('/api' + path, { headers });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch { /* non-JSON error body */ }
      throw new Error(data.error || `Could not download the file (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
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

  return { getToken, setSession, getUser, clearSession, request, downloadFile, requireLogin, homeFor };
})();

// Resizes/compresses an image file client-side (down to maxDim on the long
// edge, re-encoded as JPEG) before it's turned into a data URL and sent to
// the server — keeps question diagrams and answer photos from ballooning
// exam documents past MongoDB's size limits. Resolves to a data: URL string.
function compressImageFile(file, maxDim = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); // flatten transparency for JPEG
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image — try a different file.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}
