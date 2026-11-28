// WIDEBODY TRACK server helper (Cloudflare Pages Function, free plan).
// 1. Fetches Flightradar24 and ADS-B data for the app (phones cannot ask Flightradar24 directly).
// 2. Keeps the shared settings (stations, aircraft), the team voice message and who is online, in the free D1 database.
// The password is NOT in this file. It is set in Cloudflare as a secret called ADMIN_PASSWORD.

// Air India wide-body aircraft (Boeing 787-8, 787-9, 777-300ER, 777-200LR, Airbus A350)
const DEFAULT_REGS = [
  "VT-ANA", "VT-ANC", "VT-AND", "VT-ANE", "VT-ANG", "VT-ANH", "VT-ANI", "VT-ANJ", "VT-ANK", "VT-ANL", "VT-ANM",
  "VT-ANN", "VT-ANO", "VT-ANP", "VT-ANQ", "VT-ANR", "VT-ANS", "VT-ANT", "VT-ANU", "VT-ANV", "VT-ANW", "VT-ANX",
  "VT-ANY", "VT-ANZ", "VT-NAA", "VT-NAC",
  "VT-AWA", "VT-AWB", "VT-AWC", "VT-AWD", "VT-TSD", "VT-TSE", "VT-TSH", "VT-TSN", "VT-TSO", "VT-TSP",
  "VT-AEM", "VT-AEN", "VT-AEO", "VT-AEP", "VT-AEQ", "VT-ALJ", "VT-ALK", "VT-ALL", "VT-ALM", "VT-ALN", "VT-ALO",
  "VT-ALP", "VT-ALQ", "VT-ALR", "VT-ALS", "VT-ALT", "VT-ALU", "VT-ALX",
  "VT-ALF", "VT-ALG", "VT-AEF", "VT-AEI",
  "VT-JRA", "VT-JRB", "VT-JRC", "VT-JRD", "VT-JRE", "VT-JRF", "VT-JRG", "VT-JRH", "VT-JRI"];
const DEFAULT_STATIONS = [{ code: "BOM", name: "Mumbai" }, { code: "DEL", name: "Delhi" }, { code: "BLR", name: "Bengaluru" },
  { code: "MAA", name: "Chennai" }, { code: "CCU", name: "Kolkata" }];
// airport positions, for "aircraft near this airport" from the free ADS-B networks
const AIRPORTS = { BOM: [19.0887, 72.8679], DEL: [28.5562, 77.1000], BLR: [13.1986, 77.7066], MAA: [12.9941, 80.1709],
  CCU: [22.6547, 88.4467], HYD: [17.2403, 78.4294], COK: [10.1520, 76.4019], AMD: [23.0772, 72.6347], GOI: [15.3808, 73.8314],
  GOX: [15.7300, 73.8660], PNQ: [18.5821, 73.9197], TRV: [8.4821, 76.9201], LKO: [26.7606, 80.8893], ATQ: [31.7096, 74.7973],
  JAI: [26.8242, 75.8122], CCJ: [11.1368, 75.9553], NAG: [21.0922, 79.0472], GAU: [26.1061, 91.5859], IXC: [30.6735, 76.7885] };
const MSG_PER_DAY = 3;
const UA = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
};

function json(data, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

// Ask a website, but keep the answer for `ttl` seconds so everyone shares one answer.
async function cachedFetch(ctx, url, ttl, headers = UA) {
  const cache = caches.default;
  const key = new Request("https://widebody-cache/" + encodeURIComponent(url));
  const hit = await cache.match(key);
  if (hit) return { data: await hit.json(), cached: true };
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers, cf: { cacheTtl: 0 } });
      if (r.status === 429 || r.status >= 500) { last = new Error("busy " + r.status); await sleep(800); continue; }
      if (!r.ok) throw new Error("status " + r.status);
      const data = await r.json();
      const res = new Response(JSON.stringify(data), { headers: { "cache-control": `public, max-age=${ttl}` } });
      ctx.waitUntil(cache.put(key, res));
      return { data, cached: false };
    } catch (e) { last = e; if (attempt === 0) await sleep(600); }
  }
  throw last || new Error("failed");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtFlight(v) {
  const s = String(v || "").toUpperCase().replace(/\s+/g, "");
  const m = s.match(/^([A-Z0-9]{2})0*(\d+)([A-Z]?)$/);
  return m ? m[1] + m[2] + m[3] : s;
}
function fmtReg(v) {
  let s = String(v || "").toUpperCase().replace(/\s+/g, "");
  if (s.startsWith("VT") && s.length === 5) s = "VT-" + s.slice(2);
  return s;
}

// Flightradar24 flight list, made small and simple for the phone.
async function fr24(ctx, by, q) {
  const url = "https://api.flightradar24.com/common/v1/flight/list.json?query=" +
    encodeURIComponent(q.toLowerCase()) + "&fetchBy=" + by + "&page=1&limit=40";
  const { data } = await cachedFetch(ctx, url, 180);
  const rows = (((data || {}).result || {}).response || {}).data || [];
  const fallback = by === "reg" ? fmtReg(q) : "";
  return rows.map((it) => {
    try {
      const ap = it.airport || {}, t = it.time || {}, s = t.scheduled || {}, r = t.real || {}, e = t.estimated || {};
      return {
        flight: fmtFlight(((it.identification || {}).number || {}).default),
        reg: fmtReg((it.aircraft || {}).registration) || fallback,
        model: ((((it.aircraft || {}).model) || {}).code) || "",
        origin: (((ap.origin || {}).code || {}).iata) || "",
        dest: (((ap.destination || {}).code || {}).iata) || "",
        sd: s.departure || 0, sa: s.arrival || 0,
        rd: r.departure || 0, ra: r.arrival || 0,
        ed: e.departure || 0, ea: e.arrival || 0,
        text: (it.status || {}).text || "", live: !!(it.status || {}).live,
      };
    } catch (e) { return null; }
  }).filter(Boolean);
}

// Where the aircraft is now (free ADS-B networks). First network that answers wins.
async function adsb(ctx, reg) {
  const sources = [
    ["adsb.lol", "https://api.adsb.lol/v2/reg/" + encodeURIComponent(reg)],
    ["adsb.fi", "https://opendata.adsb.fi/api/v2/registration/" + encodeURIComponent(reg)],
  ];
  // Extra backup source: FlyItalyADSB (free key, saved in Cloudflare as the secret FLYITALY_KEY).
  // If the key is not set, this source is simply skipped.
  const flyKey = String((ctx.env || {}).FLYITALY_KEY || "");
  if (flyKey) sources.push(["FlyItalyADSB", "https://api.flyitalyadsb.com/v2/reg/" + encodeURIComponent(reg), flyKey]);
  const health = {};
  for (const [name, url, key] of sources) {
    try {
      const { data } = await cachedFetch(ctx, url, 120, key ? { ...UA, "X-Api-Key": key } : UA);
      health[name] = true;
      const ac = (data.ac || data.aircraft || [])[0];
      if (!ac) return { seen: false, source: name, health };
      const alt = ac.alt_baro;
      return {
        seen: true, source: name, health, flight: fmtFlight(String(ac.flight || "").trim()),
        ground: alt === "ground", alt: typeof alt === "number" ? alt : 0, speed: ac.gs || 0,
      };
    } catch (e) { health[name] = false; }
  }
  return { seen: false, source: "", health };
}

// ---------------- database (free D1) ----------------
async function db(env) {
  if (!env.DB) throw new Error("Database not connected. Add a D1 binding called DB in Cloudflare.");
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS online (sid TEXT PRIMARY KEY, seen INTEGER, city TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS visits (day TEXT, sid TEXT, city TEXT, PRIMARY KEY (day, sid))"),
  ]);
  return env.DB;
}
async function getKV(env, k, dflt) {
  const d = await db(env);
  const row = await d.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first();
  return row ? JSON.parse(row.v) : dflt;
}
async function setKV(env, k, v) {
  const d = await db(env);
  await d.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
    .bind(k, JSON.stringify(v)).run();
}
function passwordOk(env, pw) {
  const real = String(env.ADMIN_PASSWORD || "");
  return real.length > 0 && String(pw || "") === real;
}
function todayIST() {
  return new Date(Date.now() + 19800000).toISOString().slice(0, 10);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const q = url.searchParams;
  try {
    if (request.method === "OPTIONS") return json({});

    // ----- flight data -----
    if (path === "fr24") {
      const by = q.get("by") === "flight" ? "flight" : "reg";
      const v = (q.get("q") || "").trim();
      if (!v) return json({ error: "missing q" }, 400);
      try { return json({ ok: true, flights: await fr24(context, by, v) }, 200, 60); }
      catch (e) { return json({ ok: false, flights: [], error: String(e.message || e) }, 200); }
    }
    if (path === "airport") {         // every arrival and departure at one airport, one call for all aircraft
      const code = (q.get("code") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
      const from = Math.max(-24, Math.min(0, Number(q.get("from") || -12)));
      const to = Math.max(6, Math.min(52, Number(q.get("to") || 26)));
      if (code.length !== 3) return json({ error: "bad code" }, 400);
      const bucket = Math.floor(Date.now() / 180000);           // same answer for everyone for 3 minutes
      const key = new Request(`https://widebody-cache/airport/${code}/${from}/${to}/${bucket}`);
      const hit = await caches.default.match(key);
      if (hit) return new Response(hit.body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      const now = Math.floor(Date.now() / 1000);
      const out = { ok: true, code, arr: [], dep: [], pagesOk: 0, pagesFail: 0 };
      for (const mode of ["arrivals", "departures"]) {
        const start = now + from * 3600, end = now + to * 3600;
        for (let page = 1; page <= 14; page++) {
          const url = "https://api.flightradar24.com/common/v1/airport.json?code=" + code.toLowerCase() +
            "&plugin[]=schedule&plugin-setting[schedule][mode]=" + mode +
            "&plugin-setting[schedule][timestamp]=" + start + "&page=" + page + "&limit=100";
          let data;
          try {
            const r = await fetch(url, { headers: UA });
            if (!r.ok) throw new Error("status " + r.status);
            data = await r.json();
            out.pagesOk++;
          } catch (e) { out.pagesFail++; await sleep(500); continue; }
          const sch = ((((data.result || {}).response || {}).airport || {}).pluginData || {}).schedule || {};
          const block = sch[mode] || {};
          const rows = block.data || [];
          let last = 0;
          for (const row of rows) {
            const f = row.flight || {};
            const ac = f.aircraft || {}, t = f.time || {}, sc = t.scheduled || {}, re = t.real || {}, es = t.estimated || {};
            const reg = fmtReg(ac.registration || "");
            last = Math.max(last, mode === "arrivals" ? (sc.arrival || 0) : (sc.departure || 0));
            if (!reg.startsWith("VT-")) continue;
            const other = (((f.airport || {})[mode === "arrivals" ? "origin" : "destination"] || {}).code || {}).iata || "";
            const item = {
              flight: fmtFlight(((f.identification || {}).number || {}).default), reg,
              model: ((ac.model || {}).code) || "",
              origin: mode === "arrivals" ? other : code, dest: mode === "arrivals" ? code : other,
              sd: sc.departure || 0, sa: sc.arrival || 0, rd: re.departure || 0, ra: re.arrival || 0,
              ed: es.departure || 0, ea: es.arrival || 0,
              text: (f.status || {}).text || "", live: !!(f.status || {}).live,
            };
            (mode === "arrivals" ? out.arr : out.dep).push(item);
          }
          const pg = block.page || {};
          if (!rows.length || last > end || (pg.total && page >= pg.total)) break;
          await sleep(120);
        }
      }
      out.ok = out.pagesOk > 0;
      const body = JSON.stringify(out);
      if (out.ok) context.waitUntil(caches.default.put(key, new Response(body, { headers: { "cache-control": "public, max-age=180" } })));
      return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (path === "fr24batch") {        // up to 10 registrations or flights in one call
      const by = q.get("by") === "flight" ? "flight" : "reg";
      const list = (q.get("q") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
      const results = {};
      for (const v of list) {          // one at a time with a short gap, so Flightradar24 does not refuse
        try { results[v] = { ok: true, flights: await fr24(context, by, v) }; }
        catch (e) { results[v] = { ok: false, flights: [] }; }
        await sleep(150);
      }
      return json({ results }, 200, 60);
    }
    if (path === "near") {             // all aircraft near our airports, in one call
      const codes = (q.get("stations") || "").toUpperCase().split(",").filter((c) => AIRPORTS[c]).slice(0, 8);
      const ac = {}, health = {};
      await Promise.all(codes.map(async (c) => {
        const [lat, lon] = AIRPORTS[c];
        const sources = [["adsb.lol", `https://api.adsb.lol/v2/point/${lat}/${lon}/250`],
                         ["adsb.fi", `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/250`]];
        for (const [name, url] of sources) {
          try {
            const { data } = await cachedFetch(context, url, 90);
            health[name] = true;
            for (const a of (data.ac || data.aircraft || [])) {
              const reg = fmtReg(a.r || "");
              if (!reg.startsWith("VT-")) continue;
              const alt = a.alt_baro;
              ac[reg] = { seen: true, source: name, ground: alt === "ground", alt: typeof alt === "number" ? alt : 0,
                          speed: a.gs || 0, flight: fmtFlight(String(a.flight || "").trim()) };
            }
            break;
          } catch (e) { if (health[name] !== true) health[name] = false; }
        }
      }));
      return json({ ac, health }, 200, 60);
    }
    if (path === "adsb") {
      const reg = fmtReg(q.get("reg"));
      return json(await adsb(context, reg), 200, 60);
    }
    if (path === "search") {           // suggestions for stations and aircraft
      const v = (q.get("q") || "").trim();
      if (v.length < 2) return json({ results: [] });
      try {
        const { data } = await cachedFetch(context,
          "https://www.flightradar24.com/v1/search/web/find?limit=12&query=" + encodeURIComponent(v), 86400);
        const out = (data.results || []).map((r) => ({
          type: r.type, id: r.id, label: r.label, detail: (r.detail || {}).operator || (r.detail || {}).equip || "",
          iata: (r.detail || {}).iata || r.id,
        }));
        return json({ results: out }, 200, 3600);
      } catch (e) { return json({ results: [] }); }
    }

    // ----- password check -----
    if (path === "check" && request.method === "POST") {
      const body = await request.json();
      return json({ ok: passwordOk(env, body.password) });
    }

    // ----- shared settings: stations and aircraft (same for everyone) -----
    if (path === "settings") {
      if (request.method === "POST") {
        const body = await request.json();
        if (!passwordOk(env, body.password)) return json({ ok: false, error: "Wrong password" }, 403);
        const cur = await getKV(env, "settings", { stations: DEFAULT_STATIONS, regs: DEFAULT_REGS });
        if (Array.isArray(body.stations)) {
          cur.stations = body.stations.filter((s) => /^[A-Z]{3}$/.test(s.code))
            .map((s) => ({ code: s.code, name: String(s.name || s.code).slice(0, 30) })).slice(0, 10);
        }
        if (Array.isArray(body.regs)) cur.regs = [...new Set(body.regs.map(fmtReg).filter(Boolean))].slice(0, 150);
        await setKV(env, "settings", cur);
        return json({ ok: true, settings: cur });
      }
      let s;
      try { s = await getKV(env, "settings", null); } catch (e) { s = null; }
      return json(s || { stations: DEFAULT_STATIONS, regs: DEFAULT_REGS });
    }

    // ----- team voice message (one per station, up to 3 per day) -----
    if (path === "voice" && request.method === "GET") {
      const st = (q.get("station") || "").toUpperCase();
      const m = await getKV(env, "voice:" + st, null);
      if (!m) return json({ none: true });
      if (q.get("audio") === "1") {
        const bin = Uint8Array.from(atob(m.b64), (c) => c.charCodeAt(0));
        return new Response(bin, { headers: { "content-type": "audio/wav", "cache-control": "public, max-age=86400" } });
      }
      const cnt = await getKV(env, "voicecount:" + st, { date: "", n: 0 });
      return json({ id: m.id, secs: m.secs, at: m.at, used: cnt.date === todayIST() ? cnt.n : 0, perDay: MSG_PER_DAY });
    }
    if (path === "voice" && request.method === "POST") {
      const body = await request.json();
      if (!passwordOk(env, body.password)) return json({ ok: false, error: "Wrong password" }, 403);
      const st = String(body.station || "").toUpperCase();
      if (body.delete) {
        await (await db(env)).prepare("DELETE FROM kv WHERE k = ?").bind("voice:" + st).run();
        return json({ ok: true });
      }
      const cnt = await getKV(env, "voicecount:" + st, { date: "", n: 0 });
      const used = cnt.date === todayIST() ? cnt.n : 0;
      if (used >= MSG_PER_DAY) return json({ ok: false, error: `All ${MSG_PER_DAY} messages for today are used.` }, 429);
      if (!body.b64 || body.b64.length > 900000) return json({ ok: false, error: "Recording too big" }, 400);
      const id = crypto.randomUUID().slice(0, 10);
      const at = new Date(Date.now() + 19800000).toISOString().slice(11, 16);
      await setKV(env, "voice:" + st, { id, b64: body.b64, secs: Number(body.secs) || 10, at });
      await setKV(env, "voicecount:" + st, { date: todayIST(), n: used + 1 });
      return json({ ok: true, id });
    }

    // ----- who is online (phones say hello every 2 minutes) and how many used the app today -----
    if (path === "online") {
      const d = await db(env);
      const now = Math.floor(Date.now() / 1000);
      const today = new Date((now + 19800) * 1000).toISOString().slice(0, 10);   // date in India time, resets at midnight
      if (request.method === "POST") {
        const body = await request.json();
        const sid = String(body.sid || "").slice(0, 40);
        const city = String(body.city || "").slice(0, 60);
        if (sid) {
          await d.batch([
            d.prepare("INSERT INTO online (sid, seen, city) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET seen = excluded.seen, city = excluded.city")
              .bind(sid, now, city),
            // one row per phone per day, so opening the app many times still counts as one person
            d.prepare("INSERT INTO visits (day, sid, city) VALUES (?, ?, ?) ON CONFLICT(day, sid) DO UPDATE SET city = CASE WHEN excluded.city <> '' THEN excluded.city ELSE visits.city END")
              .bind(today, sid, city),
          ]);
        }
        if (Math.random() < 0.1) {
          await d.prepare("DELETE FROM online WHERE seen < ?").bind(now - 3600).run();
          await d.prepare("DELETE FROM visits WHERE day < ?").bind(new Date((now + 19800 - 7 * 86400) * 1000).toISOString().slice(0, 10)).run();
        }
      }
      const rows = await d.prepare("SELECT sid, seen, city FROM online WHERE seen > ? ORDER BY seen DESC LIMIT 50")
        .bind(now - 360).all();
      const used = await d.prepare("SELECT city, COUNT(*) AS n FROM visits WHERE day = ? GROUP BY city ORDER BY n DESC").bind(today).all();
      const todayCount = used.results.reduce((t, r) => t + r.n, 0);
      return json({ count: rows.results.length, today: todayCount,
        todayCities: used.results.map((r) => ({ city: r.city, n: r.n })),
        people: rows.results.map((r) => ({ sid: r.sid, mins: Math.floor((now - r.seen) / 60), city: r.city })) });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}
