// Settings for the GitHub-hosted pages. Nothing secret goes here: this repo is public.
window.BADGE_CONFIG = {
  // The Apps Script web app URL (ends in /exec). Keep it the same by deploying
  // updates as a "New version" of the existing deployment, never a "New deployment".
  API_URL: 'https://script.google.com/macros/s/AKfycbxJ8S-v85HKiqBpxKFgx1keTICIdhhj2GsfpnQFjQL4nCEgdsAIlu4FMZpI6q0sanI/exec',
  EVENT_NAME: 'Double My Sales Bootcamp (CA)',
  HELP_BOOTH: 3,
};

// Small helper both pages use to talk to the Apps Script backend.
// text/plain keeps this a "simple" request, so the browser doesn't need a CORS preflight.
window.badgeApi = function (action, payload) {
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
  var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
  return fetch(window.BADGE_CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body,
    redirect: 'follow',
    signal: ctrl ? ctrl.signal : undefined,
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res || !res.ok) {
        var err = new Error((res && res.message) || 'Something went wrong.');
        err.code = (res && res.error) || 'error';
        throw err;
      }
      return res.data;
    }, function (e) {
      if (timer) clearTimeout(timer);
      var err = new Error('Could not connect. Check your signal and try again.');
      err.code = 'network';
      throw err;
    });
};
