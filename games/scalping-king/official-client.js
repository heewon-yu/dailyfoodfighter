(function () {
  'use strict';

  const config = window.scalpOfficialConfig;
  if (!config?.url || !config?.key) return;
  const origin = new URL(config.url);
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co')) throw new Error('Invalid official service URL');
  const api = origin.origin + '/functions/v1/scalping-king';
  const auth = origin.origin + '/auth/v1';
  const storage = 'scalpOfficialSession';
  let tokens;
  try { tokens = JSON.parse(localStorage.getItem(storage)); } catch { /* A new login is available. */ }
  let refresh;

  function save(session) {
    tokens = session?.access_token && session?.refresh_token ? session : null;
    if (tokens) localStorage.setItem(storage, JSON.stringify(tokens));
    else localStorage.removeItem(storage);
  }

  async function request(path, body, accessToken) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {apikey: config.key, 'Content-Type': 'application/json',
        ...(accessToken ? {Authorization: 'Bearer ' + accessToken} : {})},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error_description || data.msg || data.error || 'service_unavailable'),
      {status: response.status});
    return data;
  }

  async function call(body) {
    if (!tokens) throw new Error('sign_in_required');
    try {
      return await request(api, body, tokens.access_token);
    } catch (error) {
      if (error.status !== 401) throw error;
      if (!refresh) refresh = request(auth + '/token?grant_type=refresh_token', {refresh_token: tokens.refresh_token})
        .then(save).finally(() => { refresh = null; });
      try { await refresh; } catch (refreshError) {
        if (refreshError.status === 400 || refreshError.status === 401) save(null);
        throw new Error('sign_in_required');
      }
      return request(api, body, tokens.access_token);
    }
  }

  window.scalpOfficial = Object.freeze({
    signedIn: () => Boolean(tokens),
    async signIn(email, password) {
      save(await request(auth + '/token?grant_type=password', {email, password}));
    },
    async register(email, password) {
      const data = await request(auth + '/signup', {email, password});
      if (data.access_token) save(data);
      return Boolean(tokens);
    },
    async signOut() {
      if (tokens) {
        try { await request(auth + '/logout?scope=local', {}, tokens.access_token); }
        catch (error) { if (error.status !== 401) throw error; }
      }
      save(null);
    },
    async deleteAccount() {
      await call({action: 'deleteAccount', confirm: true});
      save(null);
    },
    call,
    rankings: () => request(api + '/rankings'),
  });
}());
