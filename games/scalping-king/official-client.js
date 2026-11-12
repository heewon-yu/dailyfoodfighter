(function () {
  'use strict';
  if (window.scalpOfficial) return;
  const android = window.Capacitor?.getPlatform?.() === 'android' || location.hostname === 'localhost' && location.protocol === 'https:';
  const base = android ? 'https://dailyfoodfighter.com/api/scalping' : '/api/scalping';
  const storage = 'scalpD1Identity';
  const tokenPattern = /^[a-f0-9]{64}$/;
  const identity = () => {
    const token = localStorage.getItem(storage);
    return tokenPattern.test(token || '') ? token : null;
  };
  function newIdentity() {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(storage,token);
    return token;
  }
  async function request(path, body, token) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {...(body === undefined ? {} : {'Content-Type':'application/json'}),
        ...(token ? {Authorization:'Bearer '+token} : {})},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw Object.assign(new Error(data?.error || 'service_unavailable'),{status:response.status});
    return data;
  }
  window.scalpOfficial=Object.freeze({
    signedIn: () => Boolean(identity()),
    register: nickname => request('/session',{action:'register',nickname},identity() || newIdentity()),
    call: body => request(body.action==='finish'?'/rankings':'/session',body,identity()),
    rankings: () => request('/rankings'),
    mine: () => request('/rankings?mine=1',undefined,identity()),
  });
}());
