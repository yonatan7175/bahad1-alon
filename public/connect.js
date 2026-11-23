/*!
 * bahadConnect — "התחברות עם צ1" for outside websites.
 *
 *   <script src="https://<portal>/connect.js"></script>
 *   <script>
 *     const user = await bahadConnect.requireUser();   // signs in with the portal if needed
 *     const people = await bahadConnect.people();      // battalion directory (if the קב״מית allowed it)
 *     const token = bahadConnect.token();              // send to YOUR server; it calls /api/connect/userinfo
 *   </script>
 *
 * On localhost / 127.0.0.1 / file:// it runs in MOCK mode (fake user + people, no network), so you can
 * build without registering the site. Add ?mockRole=commander|admin to test other roles, ?real to use
 * the real portal from localhost (only works once the site is registered with a localhost-free URL).
 *
 * OAuth 2 authorization code + PKCE (S256). The token lives in sessionStorage for 24 h and is renewed
 * by a quick redirect through the portal (no screen once the user approved the site).
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var PORTAL = script && script.src ? new URL(script.src).origin : location.origin;
  var KEY = "bahad-connect:" + PORTAL;
  var params = new URLSearchParams(location.search);
  var LOCAL = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var MOCK = LOCAL && !params.has("real");

  function store(k, v) {
    try {
      if (v === undefined) sessionStorage.removeItem(KEY + k);
      else sessionStorage.setItem(KEY + k, JSON.stringify(v));
    } catch {
      /* storage blocked: the user signs in again on reload */
    }
  }
  function load(k) {
    try {
      var v = sessionStorage.getItem(KEY + k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }
  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function randomString(n) {
    return b64url(crypto.getRandomValues(new Uint8Array(n)));
  }
  function redirectUri() {
    return location.origin + location.pathname;
  }
  function err(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  // ─── Mock mode ─────────────────────────────────────────────────────────────────────
  var ROLE = params.get("mockRole");
  var MOCK_PEOPLE = [
    { id: "00000000-0000-4000-8000-000000000001", name: "ישראל ישראלי", role: ROLE === "admin" || ROLE === "commander" ? ROLE : "cadet", company: "פלוגה א'", platoon: "צוות 3", positions: [], phone: "050-1234567", email: null, avatarUrl: null },
    { id: "00000000-0000-4000-8000-000000000002", name: "נועה כהן", role: "cadet", company: "פלוגה א'", platoon: "צוות 3", positions: ['קל"פ · פלוגה א\''], phone: null, email: "noa@example.com", avatarUrl: null },
    { id: "00000000-0000-4000-8000-000000000003", name: "דניאל לוי", role: "commander", company: "פלוגה א'", platoon: null, positions: [], phone: "052-7654321", email: null, avatarUrl: null },
    { id: "00000000-0000-4000-8000-000000000004", name: "מאיה פרץ", role: "cadet", company: "פלוגה ב'", platoon: "צוות 7", positions: [], phone: null, email: null, avatarUrl: null },
    { id: "00000000-0000-4000-8000-000000000005", name: "מנהל המערכת", role: "admin", company: null, platoon: null, positions: ['קל"ג'], phone: null, email: null, avatarUrl: null },
  ];
  var MOCK_USER = Object.assign({}, MOCK_PEOPLE[0], { room: "241", companyId: "00000000-0000-4000-8000-0000000000c1", scopes: ["profile", "directory"] });

  // ─── Real mode ─────────────────────────────────────────────────────────────────────
  function currentToken() {
    var t = load(":token");
    return t && t.exp > Date.now() + 60000 ? t.value : null;
  }

  async function api(path, init) {
    var t = currentToken();
    if (!t) throw err("unauthorized", "not signed in");
    var res = await fetch(PORTAL + path, Object.assign({ credentials: "omit", headers: { authorization: "Bearer " + t } }, init || {}));
    var body = await res.json().catch(function () {
      return {};
    });
    if (res.status === 401) {
      store(":token", undefined);
      user = null;
      throw err("unauthorized", body.error_description || "signed out");
    }
    if (!res.ok) throw err(body.error || "error", body.error_description || "request failed (" + res.status + ")");
    return body;
  }

  /** Finishes a sign-in when the portal sent us back with ?code&state (or ?error). */
  async function handleCallback() {
    var code = params.get("code");
    var state = params.get("state");
    var error = params.get("error");
    var flow = load(":flow");
    if (!flow || !state || state !== flow.state || (!code && !error)) return;
    store(":flow", undefined);
    // Clean the URL (no code in history / bookmarks).
    history.replaceState(null, "", flow.returnTo || redirectUri());
    if (error) throw err(error === "access_denied" ? "denied" : error, error === "access_denied" ? "the user cancelled" : error);
    var res = await fetch(PORTAL + "/api/connect/token", {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code: code, code_verifier: flow.verifier, redirect_uri: flow.redirectUri }),
    });
    var body = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !body.access_token) throw err(body.error || "sign_in_failed", body.error_description || "sign-in failed");
    store(":token", { value: body.access_token, exp: Date.now() + body.expires_in * 1000 });
  }

  var user = null;
  var readyPromise = null;

  var bahadConnect = {
    /** true on localhost / file:// (fake data, no network). */
    mock: MOCK,
    portal: PORTAL,

    /** Resolves with the signed-in user, or null. Never redirects. Call once at start-up. */
    ready: function () {
      if (readyPromise) return readyPromise;
      readyPromise = (async function () {
        if (MOCK) return (user = MOCK_USER);
        await handleCallback();
        if (!currentToken()) return null;
        try {
          user = await api("/api/connect/userinfo");
        } catch (e) {
          if (e.code !== "unauthorized") throw e;
          user = null;
        }
        return user;
      })();
      return readyPromise;
    },

    /** Sends the browser to the portal to sign in (and back to this page). */
    signIn: async function () {
      if (MOCK) return;
      var verifier = randomString(48);
      var digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
      var state = randomString(24);
      var clean = new URL(location.href);
      ["code", "state", "error", "error_description"].forEach(function (k) {
        clean.searchParams.delete(k);
      });
      store(":flow", { state: state, verifier: verifier, redirectUri: redirectUri(), returnTo: clean.pathname + clean.search + clean.hash });
      var q = new URLSearchParams({
        response_type: "code",
        redirect_uri: redirectUri(),
        state: state,
        code_challenge: b64url(digest),
        code_challenge_method: "S256",
      });
      location.assign(PORTAL + "/oauth/authorize?" + q.toString());
      return new Promise(function () {}); // the page is leaving
    },

    /** The user, signing in first when needed (redirects once). */
    requireUser: async function () {
      var u = await bahadConnect.ready();
      if (u) return u;
      return bahadConnect.signIn();
    },

    /** The signed-in user (call ready() first). */
    me: async function () {
      var u = await bahadConnect.ready();
      if (!u) throw err("unauthorized", "not signed in");
      return u;
    },

    /** The battalion directory (needs the קב״מית's approval for this site; otherwise throws insufficient_scope). */
    people: async function () {
      if (MOCK) return params.has("mockNoDirectory") ? Promise.reject(err("insufficient_scope", "no directory in mock")) : MOCK_PEOPLE.slice();
      return (await api("/api/connect/people")).people;
    },

    /** The access token, for your own server (it must verify it with GET <portal>/api/connect/userinfo). */
    token: function () {
      return MOCK ? "mock-token" : currentToken();
    },

    signOut: async function () {
      if (!MOCK) {
        var t = currentToken();
        if (t) await fetch(PORTAL + "/api/connect/revoke", { method: "POST", credentials: "omit", headers: { authorization: "Bearer " + t } }).catch(function () {});
      }
      store(":token", undefined);
      user = null;
      readyPromise = null;
    },
  };

  window.bahadConnect = bahadConnect;
})();
