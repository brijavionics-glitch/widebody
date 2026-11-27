/* WIDEBODY TRACK · Flight Tracker
   Same features as the Streamlit app, as a fast web app. All free. */
(function () {
  "use strict";

  // ------------------------------------------------------------------ basics
  const IST = 19800;                       // India time = UTC + 5:30 (seconds)
  const REFRESH = 180;                     // update every 3 minutes
  const HOURS_BACK = 1;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nowS = () => Date.now() / 1000;
  const ist = (sec) => new Date((sec + IST) * 1000);           // read with getUTC...
  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = (sec) => sec ? pad(ist(sec).getUTCHours()) + ":" + pad(ist(sec).getUTCMinutes()) : "--:--";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dmy = (sec) => sec ? pad(ist(sec).getUTCDate()) + " " + MON[ist(sec).getUTCMonth()] : "";
  const dayStart = (sec) => Math.floor((sec + IST) / 86400) * 86400 - IST;   // 00:00 India time
  const istHour = (sec) => ist(sec).getUTCHours();
  const store = {
    get(k, d) { try { const v = localStorage.getItem("widebody_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("widebody_" + k, JSON.stringify(v)); } catch (e) {} },
  };
  const CITY = { BOM: "Mumbai", DEL: "Delhi", LHR: "London", DXB: "Dubai", FRA: "Frankfurt", HND: "Tokyo", NRT: "Tokyo",
    YYZ: "Toronto", FCO: "Rome", BLR: "Bengaluru", MAA: "Chennai", HYD: "Hyderabad", CCU: "Kolkata", COK: "Kochi",
    AMD: "Ahmedabad", GOI: "Goa", GOX: "Goa Mopa", JFK: "New York", EWR: "Newark", SFO: "San Francisco", ORD: "Chicago",
    IAD: "Washington", SIN: "Singapore", BKK: "Bangkok", CDG: "Paris", AMS: "Amsterdam", ZRH: "Zurich", VIE: "Vienna",
    CPH: "Copenhagen", MXP: "Milan", BHX: "Birmingham", LGW: "London Gatwick", SYD: "Sydney", MEL: "Melbourne",
    DOH: "Doha", AUH: "Abu Dhabi", RUH: "Riyadh", JED: "Jeddah", KTM: "Kathmandu", DAC: "Dhaka", CMB: "Colombo",
    MLE: "Male", ICN: "Seoul", HKG: "Hong Kong", MRU: "Mauritius", PNQ: "Pune", TRV: "Thiruvananthapuram",
    LKO: "Lucknow", JAI: "Jaipur", ATQ: "Amritsar", IXC: "Chandigarh", NAG: "Nagpur", GAU: "Guwahati", VNS: "Varanasi",
    PAT: "Patna", BBI: "Bhubaneswar", IXE: "Mangaluru", CCJ: "Kozhikode", IDR: "Indore", SXR: "Srinagar",
    IXB: "Bagdogra", NBO: "Nairobi", JNB: "Johannesburg", YVR: "Vancouver" };
  const cityName = (c) => CITY[c] || c;

  // ------------------------------------------------------------------ state
  const S = {

    settings: store.get("settings", { stations: [{ code: "BOM", name: "Mumbai" }, { code: "DEL", name: "Delhi" },
      { code: "BLR", name: "Bengaluru" }, { code: "MAA", name: "Chennai" }, { code: "CCU", name: "Kolkata" }],
      regs: ["VT-ANA","VT-ANC","VT-AND","VT-ANE","VT-ANG","VT-ANH","VT-ANI","VT-ANJ","VT-ANK","VT-ANL","VT-ANM","VT-ANN","VT-ANO","VT-ANP","VT-ANQ","VT-ANR","VT-ANS","VT-ANT","VT-ANU","VT-ANV","VT-ANW","VT-ANX","VT-ANY","VT-ANZ","VT-NAA","VT-NAC","VT-AWA","VT-AWB","VT-AWC","VT-AWD","VT-TSD","VT-TSE","VT-TSH","VT-TSN","VT-TSO","VT-TSP","VT-AEM","VT-AEN","VT-AEO","VT-AEP","VT-AEQ","VT-ALJ","VT-ALK","VT-ALL","VT-ALM","VT-ALN","VT-ALO","VT-ALP","VT-ALQ","VT-ALR","VT-ALS","VT-ALT","VT-ALU","VT-ALX","VT-ALF","VT-ALG","VT-AEF","VT-AEI","VT-JRA","VT-JRB","VT-JRC","VT-JRD","VT-JRE","VT-JRF","VT-JRG","VT-JRH","VT-JRI"] }),
    type: store.get("type", "ALL"),            // aircraft type filter: ALL, B777, B787, A330, A350, B737, A320
    page: store.get("page", null),            // remembered page (opens where you left it)
    nextDay: {},
    sched: store.get("sched", {}),            // reg -> {t, flights}   (last saved data, shown at once)
    pos: store.get("pos", {}),                // reg -> {t, ...}
    health: {},                               // source -> true/false
    lastUpdate: store.get("lastUpdate", 0),
    sid: store.get("sid", null),
    city: "",
    loading: false,
  };
  if (!S.sid) { S.sid = Math.random().toString(36).slice(2, 12); store.set("sid", S.sid); }

  const pages = () => S.settings.stations.map((s) => ({ key: s.code, label: s.name + " Live" })).concat([{ key: "FLEET", label: "Fleet" }]);
  const currentPage = () => { const p = pages(); return p.find((x) => x.key === S.page) || p[0]; };
  const stationName = (code) => (S.settings.stations.find((s) => s.code === code) || {}).name || cityName(code);

  // ------------------------------------------------------------------ server calls
  async function api(path, opts) {
    const r = await fetch("/api/" + path, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = "Error " + r.status;
    return j;
  }
  const post = (path, body) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function pool(items, n, fn) {
    const out = []; let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); }
    }));
    return out;
  }

  const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  async function refreshData() {
    if (S.loading) return;
    S.loading = true;
    renderStatus();
    // one list per airport (all arrivals and departures), then pick out our aircraft
    const ahead = Object.values(S.nextDay).some(Boolean) ? 50 : 26;
    const byReg = {};
    let okCount = 0, failCount = 0;
    await pool(S.settings.stations.map((x) => x.code), 2, async (code) => {
      const j = await api(`airport?code=${code}&from=-12&to=${ahead}`).catch(() => null);
      if (!j || !j.ok) { failCount++; return; }
      okCount++;
      for (const f of j.arr.concat(j.dep)) (byReg[f.reg] = byReg[f.reg] || []).push(f);
    });
    S.health["Flightradar24"] = okCount ? true : (failCount ? false : undefined);
    if (okCount) {
      const t = nowS();
      for (const reg of S.settings.regs) {
        const seen = new Set(), list = [];
        for (const f of (byReg[reg] || []).sort((x, y) => (x.sd || x.sa) - (y.sd || y.sa))) {
          const k = f.flight + "|" + (f.sd || f.sa);
          if (!seen.has(k)) { seen.add(k); list.push(f); }
        }
        // keep the old data for an aircraft only when an airport list failed to load
        if (list.length || !failCount || !S.sched[reg]) S.sched[reg] = { t, flights: list };
      }
    }
    // live positions: all aircraft near our airports, one call
    const nj = await api("near?stations=" + S.settings.stations.map((x) => x.code).join(",")).catch(() => null);
    if (nj && nj.ac) {
      Object.entries(nj.health || {}).forEach(([k, v]) => { S.health[k] = v; });
      const t = nowS();
      for (const reg of S.settings.regs) S.pos[reg] = nj.ac[reg] ? Object.assign({ t }, nj.ac[reg]) : { t, seen: false, source: "near" };
    }
    S.lastUpdate = nowS();
    store.set("sched", S.sched); store.set("pos", S.pos); store.set("lastUpdate", S.lastUpdate);
    S.loading = false;
    render();
    crossCheck();
  }

  // aircraft type: family (B787) and model (B787-9) from the Flightradar24 type code
  const MODEL = { B788: "B787-8", B789: "B787-9", B78X: "B787-10", B77W: "B777-300ER", B77L: "B777-200LR", B772: "B777-200",
    B773: "B777-300", B779: "B777-9", A359: "A350-900", A35K: "A350-1000", A332: "A330-200", A333: "A330-300", A339: "A330-900",
    B738: "B737-800", B737: "B737-700", B38M: "B737 MAX 8", B39M: "B737 MAX 9", A320: "A320", A20N: "A320neo",
    A321: "A321", A21N: "A321neo", A319: "A319", A19N: "A319neo" };
  function family(code) {
    const c = String(code || "").toUpperCase();
    if (/^B77/.test(c)) return "B777"; if (/^B78/.test(c)) return "B787";
    if (/^A33/.test(c)) return "A330"; if (/^A35/.test(c)) return "A350";
    if (/^B73|^B3[789]M/.test(c)) return "B737"; if (/^A3(19|20|21)|^A[12][019]N/.test(c)) return "A320";
    return "";
  }
  // known type of each registration, so the type buttons show even before flight data loads
  const KNOWN = {};
  ["ANA","ANC","AND","ANE","ANG","ANH","ANI","ANJ","ANK","ANL","ANM","ANN","ANO","ANP","ANQ","ANR","ANS","ANT","ANU",
   "ANV","ANW","ANX","ANY","ANZ","NAA","NAC"].forEach((x) => (KNOWN["VT-" + x] = "B788"));
  ["AWA","AWB","AWC","AWD","TSD","TSE","TSH","TSN","TSO","TSP"].forEach((x) => (KNOWN["VT-" + x] = "B789"));
  ["AEM","AEN","AEO","AEP","AEQ","ALJ","ALK","ALL","ALM","ALN","ALO","ALP","ALQ","ALR","ALS","ALT","ALU","ALX"]
    .forEach((x) => (KNOWN["VT-" + x] = "B77W"));
  ["ALF","ALG","AEF","AEI"].forEach((x) => (KNOWN["VT-" + x] = "B77L"));
  ["JRA","JRB","JRC","JRD","JRE","JRF","JRG","JRH","JRI"].forEach((x) => (KNOWN["VT-" + x] = "A359"));
  function modelOf(reg) {                         // latest known type code of this aircraft
    const fl = (S.sched[reg] || {}).flights || [];
    const f = fl.find((x) => x.model);
    return f ? f.model : (KNOWN[reg] || "");
  }
  const FAMILIES = ["B777", "B787", "A330", "A350", "B737", "A320"];

  // ------------------------------------------------------------------ flight logic (same as the Streamlit app)
  function timesFor(f, kind) {
    return kind === "ARR" ? [f.sa, f.ra || f.ea, f.ra] : [f.sd, f.rd || f.ed, f.rd];
  }
  function liveState(f, kind, pos, now) {
    const txt = (f.text || "").toLowerCase();
    const [sched, exp] = timesFor(f, kind);
    const ref = exp || sched;
    const mins = (a, b) => (a && b ? Math.floor((a - b) / 60) : 0);
    const flyingNow = !!(pos && pos.seen && !pos.ground && pos.flight && pos.flight === f.flight);
    if (txt.includes("cancel")) return ["Cancelled", true, 0, ref];
    if (txt.includes("divert")) return ["Diverted", true, 0, ref];
    if (kind === "DEP") {
      if (f.rd || flyingNow || (f.live && txt.includes("estimated")) || txt.includes("departed")) {
        const t = f.rd || ref; return ["Departed", true, mins(t, sched), t];
      }
      if (ref && now > ref + 600) return ["Departed", false, mins(ref, sched), ref];
      return ["", false, mins(ref, sched), ref];
    }
    if (f.ra || txt.startsWith("landed")) { const t = f.ra || ref; return ["Landed", true, mins(t, sched), t]; }
    if (flyingNow || f.rd || f.live) return ["In air", true, mins(ref, sched), ref];
    if (ref && now > ref + 600) return ["Landed", false, mins(ref, sched), ref];
    return ["", false, mins(ref, sched), ref];
  }
  function progress(f, state, end, now) {
    if (state === "Landed") return 100;
    const start = f.rd || f.ed || f.sd;
    if (state !== "In air" || !start || !end || end <= start) return 0;
    return Math.round(Math.max(1, Math.min(99, (now - start) / (end - start) * 100)));
  }
  function windowFor(station) {
    const now = nowS(), d0 = dayStart(now);
    if (S.nextDay[station]) return [d0 + 86400, d0 + 2 * 86400 - 60];
    return [now - HOURS_BACK * 3600, istHour(now) >= 18 ? d0 + 86400 + 7 * 3600 : d0 + 86400 - 60];
  }
  function board(station, win, noFilter) {
    const now = nowS();
    const [lo, hi] = win || windowFor(station);
    const arr = [], dep = [], seen = new Set();
    for (const reg of S.settings.regs) {
      const fl = (S.sched[reg] || {}).flights || [];
      for (const f of fl) {
        for (const kind of ["ARR", "DEP"]) {
          const at = kind === "ARR" ? f.dest : f.origin;
          const ref = kind === "ARR" ? f.sa : f.sd;
          if (at !== station || !ref || ref < lo || ref > hi) continue;
          const key = f.flight + kind + ref;
          if (seen.has(key)) continue; seen.add(key);
          const [sched, exp] = timesFor(f, kind);
          const [state, confirmed, delay, shown] = liveState(f, kind, S.pos[f.reg || reg], now);
          let cls = "s-good";
          if (state === "Cancelled" || state === "Diverted" || delay > 60) cls = "s-bad";
          else if (delay > 15) cls = "s-warn";
          else if (state === "In air") cls = "s-info";
          const done = ["Departed", "Landed", "Cancelled", "Diverted"].includes(state);
          const code = f.model || modelOf(f.reg || reg);
          if (S.type !== "ALL" && family(code) !== S.type && !noFilter) continue;
          const rec = { code, model: MODEL[code] || code, reg: f.reg || reg, flight: f.flight, from: f.origin, to: f.dest, date: dmy(ref), ref,
            sched: hhmm(sched), exp: shown ? hhmm(shown) : "", delay, state, confirmed, cls, done,
            expT: exp || sched, timeT: shown || exp || sched };
          if (kind === "ARR") rec.pct = progress(f, state, shown || exp || sched, now);
          (kind === "ARR" ? arr : dep).push(rec);
        }
      }
    }
    arr.sort((a, b) => a.ref - b.ref); dep.sort((a, b) => a.ref - b.ref);
    return { arr, dep };
  }
  const niceDur = (m) => { m = Math.max(0, Math.round(m)); if (m < 60) return m + "m"; const h = Math.floor(m / 60), r = m % 60; return r ? `${h}h ${r}m` : `${h}h`; };
  const timing = (d) => d > 15 ? `${d}m late` : (d < -10 ? `${-d}m early` : "On time");
  function statusLines(r, kind) {
    if (r.state === "Cancelled" || r.state === "Diverted") return [[r.state, ""]];
    const t = timing(r.delay);
    if (r.done) return [[r.state + (r.confirmed ? "" : "*"), ""], [t, ""]];
    let lines = [[t, ""]];
    const mins = r.expT ? (r.expT - nowS()) / 60 : null;
    if (mins != null) {
      if (kind === "arr") { if (mins <= 0) lines.push(["Due now", "s-info"]); else if (mins <= 1440) lines.push(["in " + niceDur(mins), "s-info"]); }
      else { if (t === "On time") lines = []; lines.push([mins <= 0 ? "Due now" : niceDur(mins) + " left", "s-info"]); }
    }
    return lines;
  }
  function shareText(r, kind, place) {
    const t = r.exp || r.sched, d = r.delay;
    const tm = d > 15 ? `${d} min late` : (d < -10 ? `${-d} min early` : "on time");
    if (kind === "arr") return `${r.reg} ${r.flight} from ${cityName(r.from)} (${r.from}) ${r.done ? "landed" : "arriving"} ${place} at ${t} (${tm})`;
    return `${r.reg} ${r.flight} to ${cityName(r.to)} (${r.to}) ${r.done ? "departed" : "departing"} ${place} at ${t} (${tm})`;
  }
  const wa = (text) => "https://wa.me/?text=" + encodeURIComponent(text);

  // ------------------------------------------------------------------ html pieces
  function nextCards(arr, dep, place) {
    const now = nowS();
    const pick = (rows) => rows.filter((r) => !r.done && r.expT && r.expT >= now - 600).sort((a, b) => a.expT - b.expT)[0];
    const card = (r, kind) => {
      const ty = S.type !== "ALL" ? S.type + " " : "";
      const label = kind === "arr" ? `NEXT ${ty}ARRIVAL` : `NEXT ${ty}DEPARTURE`;
      if (!r) return `<div class="nm ${kind}"><div class="l"><span class="d"></span>${label}</div><div class="r2">None in this time window</div></div>`;
      const mins = (r.expT - now) / 60;
      const colour = r.delay > 60 ? "#ff453a" : (r.delay > 15 ? "#ff9f0a" : "#30d158");
      return `<div class="nm ${kind}"><div class="l"><span class="d"></span>${label}</div><div class="r1"><span class="rg">${esc(r.reg)}</span>` +
        `<a class="w" target="_blank" rel="noopener" href="${wa(shareText(r, kind, place))}">Share</a></div>` +
        `<div class="r2">${mins <= 0 ? "Due now" : niceDur(mins)} · <span style="color:${colour}">${timing(r.delay)}</span> · ${r.exp || r.sched}</div></div>`;
    };
    return `<div class="nx">${card(pick(arr), "arr")}${card(pick(dep), "dep")}</div>`;
  }
  function table(rows, kind, title, place) {
    let h = `<div class="box ${kind}"><div class="bh">${esc(title)}</div>`;
    if (!rows.length) return h + `<div class="empty">No flights of our aircraft in this time window.</div></div>`;
    h += `<table class="xl"><colgroup><col class="c-ac"><col class="c-fl"><col class="c-pl"><col class="c-dt"><col class="c-t"><col class="c-t"><col class="c-st"></colgroup>` +
      `<thead><tr><th>Aircraft</th><th>Flight</th><th>${kind === "arr" ? "From" : "To"}</th><th>Date</th><th>Sched</th><th>Actual</th><th>Status</th></tr></thead><tbody>`;
    const now = nowS();
    for (const r of rows) {
      const other = kind === "arr" ? r.from : r.to;
      const lines = statusLines(r, kind).map(([t, c]) => `<span class="st ${c || r.cls}">${esc(t)}</span>`).join("");
      const exp = r.exp && r.exp !== r.sched ? r.exp : (!r.exp ? "--" : r.exp);
      const limit = kind === "arr" ? 15 : 90;
      const mins = r.expT ? (r.expT - now) / 60 : null;
      const urgent = !r.done && mins != null && mins >= -10 && mins <= limit;
      const schedCell = urgent && exp === "--" ? `<span class="blink">${r.sched}</span>` : r.sched;
      let expCell = urgent && exp !== "--" ? `<span class="blink">${exp}</span>` : exp;
      h += `<tr class="${kind === "arr" ? "main" : ""}"><td class="reg"><a target="_blank" rel="noopener" href="${wa(shareText(r, kind, place))}">${esc(r.reg)}</a>${r.model ? `<div class="ty">${esc(r.model)}</div>` : ""}</td>` +
        `<td>${esc(r.flight)}</td><td><b>${esc(other)}</b></td><td>${esc(r.date)}</td><td>${schedCell}</td><td>${expCell}</td><td class="stc">${lines}</td></tr>`;
      if (kind === "arr") {
        const p = r.pct || 0;
        h += `<tr class="trkrow"><td colspan="7"><div class="trk"><span class="ta">${esc(other)}</span><div class="ln">` +
          `<div class="dn" style="width:${p}%"></div><div class="pl" style="left:${Math.min(Math.max(p, 4), 90)}%"><b>${esc(r.reg)}</b><span>✈️</span></div></div>` +
          `<span class="te">${esc(r.to)}</span></div></td></tr>`;
      }
    }
    h += `</tbody></table></div>`;
    let note = (kind === "arr" ? "Orange line shows how far the aircraft has flown · " : "") + "Tap an aircraft name to share it on WhatsApp";
    if (rows.some((r) => r.state && !r.confirmed)) note += " · * = time has passed, not yet confirmed";
    return h + `<div class="note">${esc(note)}</div>`;
  }
  function groundPairs(arr, dep) {
    const ev = {};
    arr.forEach((r) => (ev[r.reg] = ev[r.reg] || []).push(["A", r.timeT, r]));
    dep.forEach((r) => (ev[r.reg] = ev[r.reg] || []).push(["D", r.timeT, r]));
    const pairs = [];
    for (const [reg, list0] of Object.entries(ev)) {
      const list = list0.filter((e) => e[1]).sort((a, b) => a[1] - b[1]);
      let i = 0;
      while (i < list.length) {
        const [k, t, r] = list[i];
        if (k === "A") {
          const j = list.findIndex((e, idx) => idx > i && e[0] === "D");
          pairs.push({ reg, arr: r, dep: j >= 0 ? list[j][2] : null, start: t, end: j >= 0 ? list[j][1] : null });
          i = j >= 0 ? j + 1 : i + 1;
        } else {
          // a departure with no arrival before it: the aircraft was already here (only for its first movement)
          if (i === 0 && t <= nowS() + 24 * 3600) pairs.push({ reg, arr: null, dep: r, start: null, end: t });
          i++;
        }
      }
    }
    return pairs;
  }
  function groundList(pairs, d0) {
    const end = d0 + 86400, now = nowS(), rows = [];
    for (const p of pairs) {
      const a = p.start, b = p.end;
      if ((a || d0) >= end || (b && b <= d0)) continue;
      if (p.dep && p.dep.done) continue;
      if (b && b < now - 600) continue;
      const tIn = a ? hhmm(a) : "yesterday";
      let tOut = b ? hhmm(b) : "no departure";
      if (b && dayStart(b) !== d0) tOut += " " + dmy(b);
      let pct, cls, big;
      if (a && a > now) { pct = 0; cls = "wait"; big = "Arrives in " + niceDur((a - now) / 60); }
      else if (b) {
        const left = (b - now) / 60, total = Math.max(1, b - (a || d0));
        pct = Math.min(100, Math.round(Math.max(0, now - (a || d0)) / total * 100)); cls = "now";
        big = left <= 0 ? "Departs now" : niceDur(left) + " left";
      } else { pct = 100; cls = "now"; big = "Stays tonight"; }
      const night = !b && cls === "now" ? " stay" : "";
      const dot = cls === "wait" ? "" : `<span class="dot" style="left:${Math.min(Math.max(pct, 3), 97)}%"></span>`;
      rows.push([a || d0, `<div class="gx ${cls}${night}"><div class="t"><span class="rg">${esc(p.reg)}</span><span class="sm">${tIn} → ${tOut}</span>` +
        `<span class="big">${big}</span></div><div class="ba"><div class="tr"></div><div class="fl" style="width:${pct}%"></div>${dot}</div>` +
        `</div>`]);
    }
    if (!rows.length) return `<div class="okbox">No aircraft on the ground at this station on this day.</div>`;
    return rows.sort((x, y) => x[0] - y[0]).map((x) => x[1]).join("") +
      `<div class="lnote">Arrival → departure · Red = on ground now · Grey = not arrived yet</div>`;
  }
  function tonight(pairs, d0) {
    const nightEnd = d0 + 86400 - 60, now = nowS(), rows = [];
    for (const p of pairs) {
      if (!p.start || p.start > nightEnd || p.start < nightEnd - 36 * 3600) continue;
      if (p.end && (p.end <= nightEnd || p.end < now)) continue;
      const landed = (p.arr && p.arr.done ? "landed " : "lands ") + hhmm(p.start);
      const nxt = p.dep ? `next ${p.dep.flight} ${hhmm(p.end)} ${dmy(p.end)}` : "no departure listed";
      rows.push(`<div class="gr"><b>${esc(p.reg)}</b><span>${landed} · ${esc(nxt)}</span></div>`);
    }
    let seed = Math.floor(d0 / 86400);
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    let stars = "";
    for (let i = 0; i < 28; i++) {
      const s = [1.5, 2, 2.5][Math.floor(rnd() * 3)];
      stars += `<span class="star" style="left:${(2 + rnd() * 95).toFixed(1)}%;top:${(4 + rnd() * 90).toFixed(1)}%;animation-delay:${(rnd() * 2).toFixed(2)}s;width:${s}px;height:${s}px"></span>`;
    }
    return `<div class="gl">${stars}<span class="moon">🌙</span><div class="gltitle">Tonight's grounded aircraft</div>` +
      (rows.join("") || `<div class="gr"><span>No aircraft staying overnight.</span></div>`) + `</div>`;
  }

  // ------------------------------------------------------------------ aircraft changes
  function changesFor(station) {
    const all = store.get("changes", []).filter((c) => c.when > nowS() - 86400);
    store.set("changes", all);
    return all.filter((c) => c.station === station);
  }
  function addChange(station, kind, flight, oldReg, newReg, other, sched, day) {
    const all = store.get("changes", []);
    const key = [station, kind, flight, sched, day, oldReg, newReg].join("|");
    if (all.some((c) => c.key === key)) return;
    const place = stationName(station), o = `${cityName(other)} (${other})`;
    const text = kind === "DEP"
      ? `Before ${oldReg} was departing ${place} on ${flight} to ${o} at ${sched} on ${day}. Now ${newReg} is departing.`
      : `Before ${oldReg} was arriving at ${place} on ${flight} from ${o} at ${sched} on ${day}. Now ${newReg} is arriving.`;
    all.push({ key, station, text, when: nowS() });
    store.set("changes", all);
  }
  async function crossCheck() {
    const now = nowS();
    const seen = store.get("seen", {});
    const todo = [];
    for (const st of S.settings.stations) {
      const { arr, dep } = board(st.code, [now - 3600, now + 48 * 3600], true);
      for (const [kind, rows] of [["ARR", arr], ["DEP", dep]]) {
        for (const r of rows) {
          const k = [st.code, kind, r.flight, r.ref].join("|");
          const other = kind === "ARR" ? r.from : r.to;
          if (seen[k] && seen[k].reg && seen[k].reg !== r.reg) addChange(st.code, kind, r.flight, seen[k].reg, r.reg, other, r.sched, r.date);
          seen[k] = { reg: r.reg, ref: r.ref };
          if (!r.done && r.ref <= now + 12 * 3600) todo.push({ st: st.code, kind, r, other });
        }
      }
    }
    for (const k of Object.keys(seen)) if (seen[k].ref < now - 86400) delete seen[k];
    store.set("seen", seen);
    render();
  }

  // ------------------------------------------------------------------ render
  // type buttons: only types that our aircraft really have
  function typeButtons(station) {
    const fams = FAMILIES.filter((fm) => S.settings.regs.some((r) => family(modelOf(r)) === fm));
    if (!fams.length) return "";
    if (S.type !== "ALL" && !fams.includes(S.type)) S.type = "ALL";
    const all = board(station, null, true);
    const count = (fm) => all.arr.concat(all.dep).filter((r) => fm === "ALL" || family(r.code) === fm).length;
    const btn = (fm, label) => { const n = count(fm); return `<button data-type="${fm}" class="${S.type === fm ? "on" : ""}">${label}<small>${n} flight${n === 1 ? "" : "s"}</small></button>`; };
    return `<div class="tlab">AIRCRAFT TYPE</div><div class="types">${btn("ALL", "All")}${fams.map((fm) => btn(fm, fm)).join("")}</div>`;
  }
  function renderMenu() {
    const cur = currentPage();
    $("menu").innerHTML = pages().map((p) => `<button data-page="${p.key}" class="${p.key === cur.key ? "on" : ""}">${esc(p.label)}</button>`).join("");
  }
  function applyTheme() {
    const t = ist(nowS()), m = t.getUTCHours() * 60 + t.getUTCMinutes();
    const night = m >= 17 * 60 + 30 || m < 7 * 60;
    document.body.classList.toggle("night", night);
  }
  function render() {
    applyTheme();
    renderMenu();
    const cur = currentPage();
    if (cur.key === "FLEET") return renderFleet();
    const station = cur.key, place = stationName(station);
    const { arr, dep } = board(station);
    const hasData = Object.keys(S.sched).length > 0;
    $("topbody").innerHTML = !hasData ? `<div class="loading">Loading flights…</div>` :
      typeButtons(station) + nextCards(arr, dep, place) + table(arr, "arr", `🛬 Arrivals to ${place}${S.type !== "ALL" ? " · " + S.type : ""}`, place) +
      `<div style="height:10px"></div>` + table(dep, "dep", `🛫 Departures from ${place}${S.type !== "ALL" ? " · " + S.type : ""}`, place);

    const now = nowS();
    const d0 = S.nextDay[station] ? dayStart(now) + 86400 : dayStart(now);
    const all = board(station, [d0 - 86400, d0 + 2 * 86400]);
    const pairs = groundPairs(all.arr, all.dep);
    const showing = S.nextDay[station] ? "Next day · " + dmy(d0) : (istHour(now) >= 18 ? "Today + early morning till 07:00" : "Today till midnight");
    const ch = changesFor(station);
    $("lightbody").innerHTML =
      `<h2 class="sec">🛬 Aircraft on ground · ${dmy(d0)}</h2>` + groundList(pairs, d0) +
      `<div class="dayrow"><span>Showing: ${showing}</span><button class="btn red" id="nextday">${S.nextDay[station] ? "Back to today" : "Next day ›"}</button></div>` +
      tonight(pairs, d0) +
      `<h2 class="sec">⚠️ Aircraft changes at ${esc(place)}</h2>` +
      (ch.length ? ch.slice().reverse().map((c, i) => `<div class="chg">${i + 1}. ${esc(c.text)}<br><span class="when">Noticed at ${hhmm(c.when)} IST</span></div>`).join("")
        : `<div class="okbox">No aircraft changes. Every flight is checked at each update against the flight number and the aircraft list.</div>`);
    renderStatus();
  }
  function renderFleet() {
    const now = nowS();
    const rows = S.settings.regs.map((reg) => {
      const fl = ((S.sched[reg] || {}).flights || []).slice().sort((a, b) => (a.sd || 0) - (b.sd || 0));
      const pos = S.pos[reg];
      let where = "No data yet";
      const flying = fl.find((f) => f.rd && !f.ra && f.sd > now - 20 * 3600);
      const last = fl.filter((f) => f.ra && f.ra <= now).pop();
      const next = fl.find((f) => !f.rd && f.sd >= now - 3600);
      if (pos && pos.seen && !pos.ground) where = `✈️ In the air${pos.flight ? " · " + pos.flight : ""}${flying ? " → " + flying.dest : ""}`;
      else if (flying) where = `✈️ ${flying.flight} ${flying.origin} → ${flying.dest}, lands ${hhmm(flying.ea || flying.sa)}`;
      else if (last) where = `🅿️ At ${last.dest} since ${hhmm(last.ra)}`;
      if (next && !(pos && pos.seen && !pos.ground)) where += ` · next ${next.flight} ${hhmm(next.ed || next.sd)}`;
      const m = MODEL[modelOf(reg)] || modelOf(reg);
      if (S.type !== "ALL" && family(modelOf(reg)) !== S.type) return "";
      return `<div class="row"><b>${esc(reg)}${m ? `<div class="ty">${esc(m)}</div>` : ""}</b><span>${esc(where)}</span></div>`;
    }).join("");
    $("topbody").innerHTML = typeButtons(S.settings.stations[0].code) + `<div class="box fleet"><div class="bh">✈️ Where each aircraft is now</div>${rows}</div>`;
    $("lightbody").innerHTML = "";
    renderStatus();
  }
  function renderStatus() {
    const t = S.lastUpdate ? `${dmy(S.lastUpdate)} · ${hhmm(S.lastUpdate)} IST` : "not yet";
    const dots = ["Flightradar24", "adsb.lol", "adsb.fi"].map((n) => {
      const v = S.health[n]; return `<span class="dot ${v === true ? "ok" : (v === false ? "fail" : "idle")}"></span>${n}`;
    }).join("");
    $("status").innerHTML = `Version 4 · Last update ${t} · updates every 3 minutes${S.loading ? " · updating…" : ""}<br>${dots}`;
  }

  // ------------------------------------------------------------------ settings (shared for everyone, password every time)
  function askPassword(title) {                  // 6 boxes, one digit in each
    return new Promise((resolve) => {
      $("sheetbody").innerHTML = `<h3>${esc(title)}</h3><p class="hint" style="margin:0 0 10px">Enter the 6 digit password</p>` +
        `<div class="pin">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" data-i="${i}" aria-label="Digit ${i + 1}">`).join("")}</div>` +
        `<div id="pwerr" class="err"></div><div class="rowb"><button class="btn red" id="pwok">OK</button><button class="btn" id="pwno">Cancel</button></div>`;
      $("sheet").classList.remove("hidden");
      const boxes = [...document.querySelectorAll(".pin input")];
      setTimeout(() => boxes[0].focus(), 50);
      const value = () => boxes.map((b) => b.value).join("");
      const done = (v) => { $("sheet").classList.add("hidden"); resolve(v); };
      const submit = () => { const v = value(); if (v.length < 6) { $("pwerr").textContent = "Please enter all 6 digits."; return; } done(v); };
      boxes.forEach((b, i) => {
        b.addEventListener("input", () => {
          const d = b.value.replace(/\D/g, "");
          if (d.length > 1) {                       // pasted the whole password
            d.slice(0, 6).split("").forEach((c, k) => { if (boxes[k]) boxes[k].value = c; });
            boxes[Math.min(d.length, 6) - 1].focus();
          } else { b.value = d; if (d && boxes[i + 1]) boxes[i + 1].focus(); }
          $("pwerr").textContent = "";
          if (value().length === 6) submit();
        });
        b.addEventListener("keydown", (e) => {
          if (e.key === "Backspace" && !b.value && boxes[i - 1]) { boxes[i - 1].focus(); boxes[i - 1].value = ""; }
          if (e.key === "Enter") submit();
        });
      });
      $("pwok").onclick = submit;
      $("pwno").onclick = () => done(null);
    });
  }
  function toast(msg) {
    $("sheetbody").innerHTML = `<h3>${esc(msg)}</h3><div class="rowb"><button class="btn" id="tok">OK</button></div>`;
    $("sheet").classList.remove("hidden");
    $("tok").onclick = () => $("sheet").classList.add("hidden");
  }
  async function saveSettings(change, what) {
    const pw = await askPassword(what);
    if (pw == null) return;
    const body = Object.assign({ password: pw }, change);
    const j = await post("settings", body);
    if (!j.ok) return toast(j.error || "Could not save");
    S.settings = j.settings; store.set("settings", S.settings);
    renderSettings(); render(); refreshData();
  }
  function renderSettings() {
    $("stationlist").innerHTML = S.settings.stations.map((s) => `<span class="chip">${esc(s.name)} (${esc(s.code)})<button data-delst="${s.code}">✕</button></span>`).join("");
    $("reglist").innerHTML = S.settings.regs.map((r) => `<span class="chip">${esc(r)}<button data-delreg="${r}">✕</button></span>`).join("");
  }
  let sugTimer;
  function suggest(input, box, type) {
    clearTimeout(sugTimer);
    const v = input.value.trim().toUpperCase();
    if (v.length < 2) { box.innerHTML = ""; return; }
    const local = type === "airport"
      ? Object.entries(CITY).filter(([c, n]) => c.startsWith(v) || n.toUpperCase().startsWith(v)).slice(0, 5).map(([c, n]) => ({ code: c, text: `${n} (${c})`, name: n }))
      : [];
    const draw = (items) => { box.innerHTML = items.map((i) => `<button data-code="${esc(i.code)}" data-name="${esc(i.name || "")}">${esc(i.text)}</button>`).join(""); };
    draw(local);
    sugTimer = setTimeout(async () => {
      const j = await api("search?q=" + encodeURIComponent(v)).catch(() => ({ results: [] }));
      const more = (j.results || []).filter((r) => r.type === (type === "airport" ? "airport" : "aircraft")).map((r) => {
        if (type === "airport") { const code = String(r.iata || "").toUpperCase(); return { code, name: r.label.split("(")[0].trim(), text: r.label }; }
        return { code: String(r.id || r.label).toUpperCase(), text: `${r.label}${r.detail ? " · " + r.detail : ""}` };
      }).filter((x) => x.code && !local.some((l) => l.code === x.code));
      if (input.value.trim().toUpperCase() === v) draw(local.concat(more).slice(0, 8));
    }, 350);
  }
  function setupSettings() {
    const si = $("stationinput"), ri = $("reginput");
    si.oninput = () => suggest(si, $("stationsug"), "airport");
    ri.oninput = () => suggest(ri, $("regsug"), "aircraft");
    $("stationsug").onclick = (e) => { const b = e.target.closest("button"); if (b) { si.value = b.dataset.code; si.dataset.name = b.dataset.name; $("stationsug").innerHTML = ""; } };
    $("regsug").onclick = (e) => { const b = e.target.closest("button"); if (b) { ri.value = b.dataset.code; $("regsug").innerHTML = ""; } };
    $("stationadd").onclick = () => {
      const code = si.value.trim().toUpperCase().slice(0, 3);
      if (!/^[A-Z]{3}$/.test(code)) return toast("Write a 3 letter airport code, like BLR.");
      if (S.settings.stations.some((s) => s.code === code)) return toast(code + " is already added.");
      const name = si.dataset.name || CITY[code] || code;
      si.value = ""; si.dataset.name = "";
      saveSettings({ stations: S.settings.stations.concat([{ code, name }]) }, `Password to add ${name} (${code})`);
    };
    $("regadd").onclick = () => {
      let reg = ri.value.trim().toUpperCase().replace(/\s+/g, "");
      if (/^VT[A-Z]{3}$/.test(reg)) reg = "VT-" + reg.slice(2);
      if (!/^[A-Z0-9]{1,2}-?[A-Z0-9]{2,5}$/.test(reg)) return toast("Write a registration, like VT-ANB.");
      if (S.settings.regs.includes(reg)) return toast(reg + " is already added.");
      ri.value = "";
      saveSettings({ regs: S.settings.regs.concat([reg]) }, `Password to add ${reg}`);
    };
    $("stationlist").onclick = (e) => {
      const b = e.target.closest("button[data-delst]"); if (!b) return;
      if (S.settings.stations.length <= 1) return toast("Keep at least one station.");
      saveSettings({ stations: S.settings.stations.filter((s) => s.code !== b.dataset.delst) }, `Password to remove ${b.dataset.delst}`);
    };
    $("reglist").onclick = (e) => {
      const b = e.target.closest("button[data-delreg]"); if (!b) return;
      saveSettings({ regs: S.settings.regs.filter((r) => r !== b.dataset.delreg) }, `Password to remove ${b.dataset.delreg}`);
    };
    $("set-voice").addEventListener("toggle", () => { if ($("set-voice").open) renderVoice(); });
  }

  // ------------------------------------------------------------------ team voice message (record, send, delete)
  let voiceStation = null, recBlob = null, recWav = null, recSecs = 0, recorder = null, recTimer = null;
  async function renderVoice() {
    voiceStation = voiceStation || S.settings.stations[0].code;
    const place = stationName(voiceStation);
    const meta = await api("voice?station=" + voiceStation).catch(() => ({ none: true }));
    let h = `<div class="radio">` + S.settings.stations.map((s) => `<button class="btn ${s.code === voiceStation ? "on" : ""}" data-vst="${s.code}">${esc(s.name)} Live</button>`).join("") + `</div>`;
    if (meta && !meta.none && meta.id) {
      h += `<b>Current ${esc(place)} message</b> · sent ${esc(meta.at)} · ${Math.round(meta.secs)} seconds` +
        `<audio controls src="/api/voice?station=${voiceStation}&audio=1&id=${meta.id}"></audio>` +
        `<button class="btn" id="vdel">🗑️ Delete the ${esc(place)} message</button>`;
    } else h += `<p class="hint">No ${esc(place)} message right now.</p>`;
    const used = (meta && meta.used) || 0;
    h += `<p class="hint">${used} of 3 messages used today for ${esc(place)}. A new message replaces the old one. It plays once each time the app is opened, before the aircraft alerts.</p>`;
    if (used >= 3) h += `<p class="err">All 3 messages for ${esc(place)} are used today.</p>`;
    else h += `<div id="recarea"><button class="btn red" id="recbtn">🎙️ Tap to record (up to 10 seconds)</button></div>`;
    $("voicebody").innerHTML = h;
    $("voicebody").querySelectorAll("[data-vst]").forEach((b) => b.onclick = () => { voiceStation = b.dataset.vst; renderVoice(); });
    if ($("vdel")) $("vdel").onclick = async () => {
      const pw = await askPassword(`Password to delete the ${place} message`); if (pw == null) return;
      const j = await post("voice", { password: pw, station: voiceStation, delete: true });
      if (!j.ok) return toast(j.error || "Could not delete");
      toast("Message deleted."); renderVoice();
    };
    if ($("recbtn")) $("recbtn").onclick = startRec;
  }
  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recTimer);
        recBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        try { [recWav, recSecs] = await toWav(recBlob); } catch (e) { return toast("Could not read the recording. Please record again."); }
        $("recarea").innerHTML = `<audio controls src="${URL.createObjectURL(recWav)}"></audio>` +
          `<div class="rowb"><button class="btn green" id="vsend">📤 Send to ${esc(stationName(voiceStation))} Live</button><button class="btn" id="vagain">Record again</button></div>`;
        $("vsend").onclick = sendRec; $("vagain").onclick = startRec;
      };
      recorder.start();
      let t = 0;
      $("recarea").innerHTML = `<div class="rec"><span class="recdot"></span><b id="rect">Recording… 0:00</b></div><button class="btn red" id="recstop">⏹ Stop</button>`;
      $("recstop").onclick = () => recorder.state !== "inactive" && recorder.stop();
      recTimer = setInterval(() => { t++; if ($("rect")) $("rect").textContent = `Recording… 0:${pad(t)}`; if (t >= 10 && recorder.state !== "inactive") recorder.stop(); }, 1000);
    } catch (e) { toast("Microphone not allowed. Please allow the microphone for this app."); }
  }
  async function toWav(blob) {                     // any recording -> 16 kHz mono WAV, max 10 s, louder if quiet
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const buf = await new Promise((res, rej) => blob.arrayBuffer().then((ab) => ctx.decodeAudioData(ab, res, rej)));
    const rate = 16000, len = Math.min(buf.duration, 10);
    const off = new OfflineAudioContext(1, Math.ceil(len * rate), rate);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start(0);
    const out = (await off.startRendering()).getChannelData(0);
    ctx.close && ctx.close();
    let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
    const gain = peak > 0 ? Math.min(4, 0.92 / peak) : 1;
    const dv = new DataView(new ArrayBuffer(44 + out.length * 2));
    const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); dv.setUint32(4, 36 + out.length * 2, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, out.length * 2, true);
    out.forEach((v, i) => dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v * gain)) * 32767, true));
    return [new Blob([dv], { type: "audio/wav" }), len];
  }
  async function sendRec() {
    const pw = await askPassword(`Password to send to ${stationName(voiceStation)} Live`); if (pw == null) return;
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(recWav); });
    const j = await post("voice", { password: pw, station: voiceStation, b64, secs: recSecs });
    if (!j.ok) return toast(j.error || "Could not send");
    toast(`Sent. It plays once each time someone opens ${stationName(voiceStation)} Live.`);
    renderVoice();
  }

  // ------------------------------------------------------------------ voice alerts
  const synth = window.speechSynthesis;
  const V = { unlocked: false, busyUntil: 0, heard: {}, audio: null, msg: {} };
  function chip() {
    const c = $("chip");
    const m = V.msg[currentPage().key];
    if (!m || V.unlocked) { c.className = "hidden"; c.textContent = ""; return; }
    c.className = "off"; c.textContent = "🔈 Tap once for team message";
  }
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
  function primeAudio() {
    try { if (!V.audio) { V.audio = new Audio(); V.audio.src = SILENT; const p = V.audio.play(); p && p.catch && p.catch(() => {}); } } catch (e) {}
  }
  function unlock() {
    primeAudio();
    if (V.unlocked) return;
    try { synth && synth.cancel(); V.unlocked = true; chip(); } catch (e) {}
  }
  async function loadMsgMeta() {                    // the team message for the page you are on
    const cur = currentPage(); if (cur.key === "FLEET") return;
    const m = await api("voice?station=" + cur.key).catch(() => null);
    V.msg[cur.key] = m && m.id ? m : null;
    chip();
  }
  function playTeamMessage() {
    const cur = currentPage(); const m = V.msg[cur.key];
    if (!m || V.heard[m.id]) return false;
    V.heard[m.id] = true;
    try {
      synth && synth.cancel();
      V.audio = V.audio || new Audio();
      V.audio.src = `/api/voice?station=${cur.key}&audio=1&id=${m.id}`;
      V.audio.onended = () => { V.busyUntil = Date.now() + 900; };
      const p = V.audio.play(); p && p.catch && p.catch(() => { V.busyUntil = Date.now() + 500; });
      V.busyUntil = Date.now() + (m.secs || 10) * 1000 + 2500;
      return true;
    } catch (e) { return false; }
  }
  function tick() {                            // no spoken alerts; only the recorded team message plays
    if (!V.unlocked || document.visibilityState !== "visible" || Date.now() < V.busyUntil) return;
    playTeamMessage();
  }
  function sleepReset() { try { synth && synth.cancel(); } catch (e) {} V.unlocked = false; V.busyUntil = 0; V.heard = {}; chip(); }

  // keep the screen on while the app is open
  let wakeLock = null;
  async function wake() {
    try { if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; });
    } } catch (e) {}
  }

  // ------------------------------------------------------------------ who is online
  async function ping() {
    if (document.visibilityState !== "visible") return;
    const j = await post("online", { sid: S.sid, city: S.city }).catch(() => null);
    if (j && j.count != null) {
      S.online = j;
      $("onlinebtn").textContent = `🟢 ${j.count} ${j.count === 1 ? "person" : "people"} online now · tap to see where`;
    }
  }
  function showOnline() {
    const j = S.online || { people: [] };
    $("sheetbody").innerHTML = `<h3>Online now</h3>` + (j.people || []).map((p, i) =>
      `<div style="padding:6px 0">${i + 1}. ${esc(p.city || "Location not available")} · active ${p.mins < 1 ? "now" : p.mins + " min ago"}${p.sid === S.sid ? " · <b>you</b>" : ""}</div>`).join("") +
      `<p class="hint">Rough city from each phone's internet address. Mobile networks can show a nearby big city.</p><div class="rowb"><button class="btn" id="tok">Close</button></div>`;
    $("sheet").classList.remove("hidden");
    $("tok").onclick = () => $("sheet").classList.add("hidden");
  }
  async function findCity() {
    try { const j = await (await fetch("https://ipwho.is/")).json(); if (j.success) S.city = [j.city, j.region].filter(Boolean).join(", "); }
    catch (e) { try { const j = await (await fetch("https://ipapi.co/json/")).json(); S.city = [j.city, j.region].filter(Boolean).join(", "); } catch (e2) {} }
    ping();
  }

  // ------------------------------------------------------------------ events and start
  document.addEventListener("click", (e) => {
    const m = e.target.closest("#menu button");
    if (m) {
      const p = pages().find((x) => x.key === m.dataset.page);
      if (p && p.key !== currentPage().key) {
        S.page = p.key; store.set("page", p.key);
        try { synth && synth.cancel(); } catch (err) {}
        primeAudio();
        V.unlocked = true; chip();
        render(); loadMsgMeta(); window.scrollTo(0, 0);
      }
      return;
    }
    const tb = e.target.closest("button[data-type]");
    if (tb) { S.type = tb.dataset.type; store.set("type", S.type); render(); return; }
    if (e.target.id === "nextday") { const st = currentPage().key; S.nextDay[st] = !S.nextDay[st]; render(); refreshData(); return; }
    if (e.target.id === "onlinebtn") { showOnline(); return; }

    if (e.target.id === "sheet") $("sheet").classList.add("hidden");
  });
  ["touchend", "click", "keydown"].forEach((ev) => document.addEventListener(ev, () => { unlock(); wake(); }, true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sleepReset();
    else { chip(); wake(); if (nowS() - S.lastUpdate > 60) refreshData(); loadMsgMeta(); ping(); }
  });
  window.addEventListener("pagehide", sleepReset);

  async function loadSettings() {
    const j = await api("settings").catch(() => null);
    if (j && Array.isArray(j.stations) && Array.isArray(j.regs)) {
      const changed = JSON.stringify(j) !== JSON.stringify(S.settings);
      S.settings = { stations: j.stations, regs: j.regs }; store.set("settings", S.settings);
      if (changed) { renderSettings(); render(); }
    }
  }

  chip();
  render();                    // last saved data shows at once
  renderSettings();
  setupSettings();
  setInterval(applyTheme, 60000);
  loadSettings().then(refreshData);
  loadMsgMeta();
  findCity();
  setInterval(tick, 400);
  setInterval(() => { if (document.visibilityState === "visible") refreshData(); }, REFRESH * 1000);
  setInterval(() => { if (document.visibilityState === "visible") render(); }, 30000);   // countdowns move every 30 s
  setInterval(ping, 300000);
  setInterval(loadSettings, 10 * 60000);
  setInterval(loadMsgMeta, REFRESH * 1000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
