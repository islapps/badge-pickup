/** @OnlyCurrentDoc */
/**
 * ISL Badge Pickup — data backend (v2)
 *
 * The attendee and staff pages live on GitHub Pages and call this script's
 * web app URL with POST requests (doPost). The original Apps Script pages
 * (Attendee.html / Staff.html) still work at the /exec URL as a fallback.
 *
 * Settings (event name, PIN, booth tabs) live in the Config file, so this
 * file can be replaced on updates without losing them.
 *
 * @OnlyCurrentDoc (top line) limits this script to the one sheet it's attached to.
 */

const VERSION = 2;
const PICKUP_HEADERS = ['Agency Owner', 'Booth', 'Picked Up By', 'Picked Up At'];
const TOKEN_SECONDS = 21600;   // staff stay signed in 6 hours (renewed while in use)
const MAX_FAILS = 5;           // wrong PINs before lockout
const LOCK_SECONDS = 600;      // lockout length (10 minutes)
const MAX_NAME_RESULTS = 3;

/* ---------------- Entry points ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.ping) return json_({ ok: true, version: VERSION });
  const isStaff = !!p.staff;
  const t = HtmlService.createTemplateFromFile(isStaff ? 'Staff' : 'Attendee');
  t.eventName = CONFIG.EVENT_NAME;
  t.helpBooth = CONFIG.HELP_BOOTH;
  return t.evaluate()
    .setTitle(isStaff ? 'Badge Pickup · Staff' : 'Badge Pickup')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  let res;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = { ok: true, data: route_(req) };
  } catch (err) {
    const msg = String((err && err.message) || err);
    let code = 'error';
    if (msg === 'Wrong PIN') code = 'auth';
    else if (msg.indexOf('Locked') === 0) code = 'locked';
    res = { ok: false, error: code, message: code === 'error' ? 'Something went wrong.' : msg };
  }
  return json_(res);
}

function route_(req) {
  const s = function (v, max) { return String(v == null ? '' : v).slice(0, max); };
  switch (req.action) {
    case 'lookupEmail': return lookupEmail(s(req.email, 254));
    case 'lookupName':  return lookupName(s(req.name, 100));
    case 'login':       return login(s(req.pin, 64));
    case 'staffLoad':   return staffLoad(s(req.cred, 64));
    case 'markPicked':  return staffMarkPicked(s(req.cred, 64), s(req.key, 200), s(req.pickedBy, 100));
    case 'undo':        return staffUndo(s(req.cred, 64), s(req.key, 200));
    default: throw new Error('Unknown action');
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Helpers ---------------- */

function tidy_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function norm_(s) {
  return tidy_(s).toLowerCase();
}

// "ELVIRA SANTOS" / "john assaf" -> "Elvira Santos" / "John Assaf". Mixed case is left alone.
function pretty_(s) {
  s = tidy_(s);
  if (s && (s === s.toUpperCase() || s === s.toLowerCase())) {
    return s.toLowerCase().replace(/(^|[\s\-'])([a-z])/g, function (m, a, b) {
      return a + b.toUpperCase();
    });
  }
  return s;
}

// "Lili" + "ventura" -> "Lili Ventura" (each part tidied on its own)
function fullName_(m) {
  return tidy_(pretty_(m.first) + ' ' + pretty_(m.last));
}

// Lowercase, accents removed: "Peña" -> "pena"
function fold_(s) {
  return tidy_(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Searchable pieces of a name: "Martinez-Mairena" -> martinez, mairena, martinezmairena; "O'Rourke" -> orourke
function nameParts_(s) {
  const out = [];
  fold_(s).split(' ').forEach(function (tok) {
    const noApos = tok.replace(/['’]/g, '');
    const joined = noApos.replace(/[^a-z0-9]/g, '');
    if (joined) out.push(joined);
    noApos.split(/[^a-z0-9]+/).forEach(function (p) { if (p && p !== joined) out.push(p); });
  });
  return out;
}

// Typed name -> words: "christian martinez-mairena" -> christian, martinez, mairena
function queryWords_(s) {
  return fold_(s).replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

function readGroups_() {
  const ss = SpreadsheetApp.getActive();
  const groups = {};
  Object.keys(CONFIG.BOOTH_TABS).forEach(function (tab) {
    const sh = ss.getSheetByName(tab);
    if (!sh) return;
    sh.getDataRange().getValues().slice(1).forEach(function (r) {
      const ao = tidy_(r[0]);
      if (!ao) return;
      const key = norm_(ao);
      if (!groups[key]) {
        groups[key] = { key: key, ao: ao, booth: CONFIG.BOOTH_TABS[tab], members: [] };
      }
      groups[key].members.push({ first: tidy_(r[1]), last: tidy_(r[2]), email: norm_(r[3]) });
    });
  });
  return groups;
}

function pickupsSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CONFIG.PICKUPS_TAB);
  if (!sh) sh = ss.insertSheet(CONFIG.PICKUPS_TAB);
  if (sh.getLastRow() === 0) sh.appendRow(PICKUP_HEADERS);
  return sh;
}

function readPickups_() {
  const sh = pickupsSheet_();
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const out = {};
  sh.getDataRange().getValues().slice(1).forEach(function (r, i) {
    const key = norm_(r[0]);
    if (!key) return;
    out[key] = {
      by: pretty_(r[2]),
      at: r[3] instanceof Date ? Utilities.formatDate(r[3], tz, 'h:mm a') : tidy_(r[3]),
      row: i + 2,
    };
  });
  return out;
}

function result_(g, m, pickups) {
  const p = pickups[g.key];
  return {
    status: p ? 'picked' : 'go',
    firstName: pretty_(m.first),
    attendee: fullName_(m),
    ao: pretty_(g.ao),
    booth: g.booth,
    size: g.members.length,
    pickedBy: p ? p.by : '',
    pickedAt: p ? p.at : '',
  };
}

/* ---------------- Attendee calls ---------------- */

function lookupEmail(email) {
  const target = norm_(email);
  if (!target) return { status: 'notfound' };
  const groups = readGroups_();
  const pickups = readPickups_();
  for (const key in groups) {
    const g = groups[key];
    const m = g.members.find(function (x) { return x.email === target; });
    if (m) return result_(g, m, pickups);
  }
  return { status: 'notfound' };
}

// Needs first AND last name. Each typed word must match the start of part of the name,
// ignoring case, accents and hyphens. Never lists more than MAX_NAME_RESULTS people.
function lookupName(query) {
  const words = queryWords_(query);
  if (words.length < 2 || words.some(function (w) { return w.length < 2; })) return { status: 'needfull' };
  const groups = readGroups_();
  const pickups = readPickups_();
  const matches = [];
  for (const key in groups) {
    const g = groups[key];
    g.members.forEach(function (m) {
      const parts = nameParts_(m.first + ' ' + m.last);
      const lastParts = nameParts_(m.last);
      const allMatch = words.every(function (w) {
        return parts.some(function (p) { return p.indexOf(w) === 0; });
      });
      const hitsLast = words.some(function (w) {
        return lastParts.some(function (p) { return p.indexOf(w) === 0; });
      });
      if (allMatch && hitsLast) matches.push(result_(g, m, pickups));
    });
  }
  if (!matches.length) return { status: 'notfound' };
  if (matches.length === 1) return matches[0];
  if (matches.length > MAX_NAME_RESULTS) return { status: 'toomany' };
  return { status: 'matches', matches: matches };
}

/* ---------------- Staff sign-in ---------------- */

// cred is either a session token (from login) or the PIN itself (the old Apps Script staff page sends the PIN).
function checkCred_(cred) {
  cred = String(cred || '');
  const cache = CacheService.getScriptCache();
  if (cred.length >= 32 && cache.get('tok:' + cred)) {
    cache.put('tok:' + cred, '1', TOKEN_SECONDS);   // keep signed-in staff signed in
    return;
  }
  // Signed-in staff (tokens above) keep working during a lockout; only new PIN attempts are blocked.
  if (cache.get('pinlock')) throw new Error('Locked: too many wrong PIN attempts. Try again in 10 minutes.');
  if (cred && cred === String(CONFIG.STAFF_PIN)) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const n = Number(cache.get('pinfails') || 0) + 1;
    if (n >= MAX_FAILS) {
      cache.put('pinlock', '1', LOCK_SECONDS);
      cache.remove('pinfails');
    } else {
      cache.put('pinfails', String(n), LOCK_SECONDS);
    }
  } finally {
    lock.releaseLock();
  }
  throw new Error('Wrong PIN');
}

function login(pin) {
  checkCred_(pin);
  if (String(pin).length >= 32) throw new Error('Wrong PIN');  // must be the PIN, not a token
  const token = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('tok:' + token, '1', TOKEN_SECONDS);
  return { token: token };
}

/* ---------------- Staff calls ---------------- */

function staffLoad(cred) {
  checkCred_(cred);
  return staffList_();
}

function staffList_() {
  const groups = readGroups_();
  const pickups = readPickups_();
  const list = Object.keys(groups).map(function (k) {
    const g = groups[k];
    const p = pickups[k];
    return {
      key: k,
      ao: pretty_(g.ao),
      booth: g.booth,
      members: g.members.map(function (m) { return fullName_(m); }),
      pickedBy: p ? p.by : '',
      pickedAt: p ? p.at : '',
      picked: !!p,
    };
  });
  list.sort(function (a, b) { return a.ao.localeCompare(b.ao); });
  return { groups: list };
}

function staffMarkPicked(cred, key, pickedBy) {
  checkCred_(cred);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const g = readGroups_()[key];
    if (!g) throw new Error('Group not found. Refresh and try again.');
    // Only accept a name that's actually in this group (or the agency owner); anything else is saved blank.
    const allowed = g.members.map(function (m) { return fullName_(m); }).concat([pretty_(g.ao)]);
    const who = allowed.indexOf(pretty_(pickedBy)) !== -1 ? pretty_(pickedBy) : '';
    if (!readPickups_()[key]) {
      pickupsSheet_().appendRow([g.ao, g.booth, who, new Date()]);
    }
  } finally {
    lock.releaseLock();
  }
  return staffList_();
}

function staffUndo(cred, key) {
  checkCred_(cred);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = readPickups_()[key];
    if (p) pickupsSheet_().deleteRow(p.row);
  } finally {
    lock.releaseLock();
  }
  return staffList_();
}
