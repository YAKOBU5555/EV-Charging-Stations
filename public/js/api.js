/** Thin fetch wrapper that attaches the JWT and unwraps the API envelope. */
const api = (() => {
  const token = () => localStorage.getItem('ev_token');

  async function request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = `Bearer ${token()}`;

    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let payload = {};
    try { payload = await res.json(); } catch (e) { /* empty body */ }

    if (res.status === 401 && !location.pathname.endsWith('login.html')) {
      localStorage.removeItem('ev_token');
      localStorage.removeItem('ev_user');
      location.href = '/login.html';
      return {};
    }
    if (!res.ok || payload.success === false) {
      const error = new Error(payload.message || 'The request could not be completed');
      error.code = payload.error;
      error.details = payload.details;
      throw error;
    }
    return payload.data;
  }

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
    token
  };
})();
