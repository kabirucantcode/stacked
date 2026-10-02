/* ============================================================
   stacked. — shared runtime
   - custom cursor (matches index.html)
   - a small mock auth layer backed by localStorage

   NOTE: this is a front-end demo. There is no server, no real
   account, and no real money. Passwords are never sent anywhere
   and are stored as a non-cryptographic hash only so the demo
   doesn't teach the habit of keeping plaintext passwords.
   ============================================================ */
(function () {
  'use strict';

  var SESSION_KEY = 'stacked.session';
  var ACCOUNTS_KEY = 'stacked.accounts';

  /* localStorage can be unavailable (e.g. some file:// setups).
     Fall back to an in-memory store so the demo still runs. */
  var mem = {};
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return k in mem ? mem[k] : null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
  };

  function parse(raw) { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }

  /* djb2 — deliberately simple, not for real credentials */
  function hash(str) {
    var h = 5381, i = 0;
    str = String(str);
    for (; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* ---- session ------------------------------------------- */
  function session() { return parse(store.get(SESSION_KEY)); }
  function save(payload) { store.set(SESSION_KEY, JSON.stringify(payload)); return payload; }
  function signOut() { store.del(SESSION_KEY); }

  /* Redirects to sign-in when there's no session. Returns the
     user object so callers can `var u = Stacked.requireAuth()`. */
  function requireAuth() {
    var u = session();
    if (!u) { location.replace('signin.html'); return null; }
    return u;
  }
  function redirectIfAuthed(to) { if (session()) location.replace(to || 'dashboard.html'); }

  /* ---- accounts (for the demo sign-in check) -------------- */
  function accounts() { return parse(store.get(ACCOUNTS_KEY)) || {}; }
  function findAccount(email) { return accounts()[String(email || '').toLowerCase()] || null; }
  function saveAccount(email, acct) {
    var all = accounts();
    all[String(email).toLowerCase()] = acct;
    store.set(ACCOUNTS_KEY, JSON.stringify(all));
  }

  /* ---- formatting ---------------------------------------- */
  function money(n) {
    var neg = n < 0;
    return (neg ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  }
  function pct(n) { return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'; }

  /* ---- custom cursor ------------------------------------- */
  function initCursor() {
    var dot = document.getElementById('dot');
    if (!dot || matchMedia('(hover:none)').matches) return;
    addEventListener('pointermove', function (e) {
      dot.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
    }, { passive: true });
    var grow = 'a,button,input,select,label,.chip,.vb,.kpi';
    document.addEventListener('pointerover', function (e) {
      if (e.target.closest && e.target.closest(grow)) dot.classList.add('big');
    });
    document.addEventListener('pointerout', function (e) {
      if (e.target.closest && e.target.closest(grow)) dot.classList.remove('big');
    });
  }

  function boot() { initCursor(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Stacked = {
    session: session,
    save: save,
    signOut: signOut,
    requireAuth: requireAuth,
    redirectIfAuthed: redirectIfAuthed,
    findAccount: findAccount,
    saveAccount: saveAccount,
    hash: hash,
    money: money,
    pct: pct
  };
})();
