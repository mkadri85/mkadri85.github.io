/* mw-loop simulation core
 *
 * A simulated multi-vendor microwave backhaul region: three NMS islands,
 * hub-and-spoke topology, per-direction link physics, weather cells, and
 * fault injection. The NETWORK is simulated; the diagnosis/decision logic
 * that consumes it (diagnosis.js / loop.js) is the real contribution.
 *
 * Physics grounding (simplified, honest):
 *  - Rain attenuation: gamma = k * R^alpha (ITU-R P.838-3 coefficients,
 *    rounded per band), applied over the path length inside the rain cell.
 *    Rain hits BOTH directions of a link near-equally: that symmetry is a
 *    load-bearing diagnostic signature.
 *  - Hardware (ODU TX chain) degradation: far-end RSL drops on ONE direction.
 *  - Interference: SNR degrades while RSL stays healthy (one direction).
 *  - ACM: steps modulation down under fade (capacity drops, link survives),
 *    per ETSI GR mWT 028 behaviour, before errored seconds accumulate.
 */

(function () {
  "use strict";

  // ---- band coefficients: ITU-R P.838-3 (approx, horizontal pol) ----
  const BANDS = {
    "7GHz":  { k: 0.0011, alpha: 1.51, label: "7 GHz long-haul" },
    "18GHz": { k: 0.0708, alpha: 1.08, label: "18 GHz" },
    "23GHz": { k: 0.1286, alpha: 1.02, label: "23 GHz" },
    "80GHz": { k: 1.06,   alpha: 0.75, label: "E-band 80 GHz" },
  };

  // ACM ladder: index 0 = most robust. capFactor = share of top capacity.
  const ACM = [
    { mod: "QPSK",    snrMin: 9,  capFactor: 0.17 },
    { mod: "16QAM",   snrMin: 16, capFactor: 0.33 },
    { mod: "64QAM",   snrMin: 22, capFactor: 0.50 },
    { mod: "256QAM",  snrMin: 28, capFactor: 0.67 },
    { mod: "1024QAM", snrMin: 34, capFactor: 0.83 },
    { mod: "4096QAM", snrMin: 40, capFactor: 1.00 },
  ];

  // ---- topology ----------------------------------------------------------
  // Three islands, each rooted at a fiber POP. Coordinates are km on a
  // 100x70 canvas-plane; used for weather-cell geometry and the map.
  function buildTopology() {
    const sites = [];
    const links = [];
    const S = (id, name, x, y, island, kind) => {
      sites.push({ id, name, x, y, island, kind }); return id;
    };
    // island A (north-west) - "NMS Island A"
    S("A-POP", "Fiber POP North", 12, 12, "A", "pop");
    S("A-H1", "Hub A1", 24, 16, "A", "hub");
    S("A-H2", "Hub A2", 34, 24, "A", "hub");
    ["A-T1|20|6", "A-T2|30|8", "A-T3|40|14", "A-T4|42|30", "A-T5|30|32", "A-T6|22|26"]
      .forEach((s, i) => { const [id, x, y] = s.split("|"); S(id, "Site " + id, +x, +y, "A", "tail"); });
    // island B (east) - "NMS Island B"
    S("B-POP", "Fiber POP East", 88, 18, "B", "pop");
    S("B-H1", "Hub B1", 74, 24, "B", "hub");
    S("B-H2", "Hub B2", 62, 34, "B", "hub");
    ["B-T1|80|10", "B-T2|68|12", "B-T3|56|24", "B-T4|54|40", "B-T5|66|44", "B-T6|76|38"]
      .forEach((s) => { const [id, x, y] = s.split("|"); S(id, "Site " + id, +x, +y, "B", "tail"); });
    // island C (south) - "NMS Island C"
    S("C-POP", "Fiber POP South", 40, 62, "C", "pop");
    S("C-H1", "Hub C1", 30, 52, "C", "hub");
    S("C-H2", "Hub C2", 50, 52, "C", "hub");
    ["C-T1|18|56", "C-T2|22|44", "C-T3|38|44", "C-T4|58|58", "C-T5|62|46", "C-T6|48|40"]
      .forEach((s) => { const [id, x, y] = s.split("|"); S(id, "Site " + id, +x, +y, "C", "tail"); });

    const L = (a, b, band, capacityGbps) => links.push(mkLink(a, b, band, capacityGbps, sites));
    // island A: POP->H1->H2 backbone + tails
    L("A-POP", "A-H1", "18GHz", 2.5); L("A-H1", "A-H2", "23GHz", 2.0);
    L("A-H1", "A-T1", "23GHz", 1.0); L("A-H1", "A-T2", "80GHz", 10);
    L("A-H2", "A-T3", "80GHz", 10);  L("A-H2", "A-T4", "23GHz", 1.0);
    L("A-H2", "A-T5", "23GHz", 1.0); L("A-H1", "A-T6", "18GHz", 1.0);
    // island B
    L("B-POP", "B-H1", "18GHz", 2.5); L("B-H1", "B-H2", "23GHz", 2.0);
    L("B-H1", "B-T1", "80GHz", 10);  L("B-H1", "B-T2", "23GHz", 1.0);
    L("B-H2", "B-T3", "23GHz", 1.0); L("B-H2", "B-T4", "80GHz", 10);
    L("B-H2", "B-T5", "23GHz", 1.0); L("B-H1", "B-T6", "18GHz", 1.0);
    // island C
    L("C-POP", "C-H1", "18GHz", 2.5); L("C-POP", "C-H2", "18GHz", 2.5);
    L("C-H1", "C-T1", "23GHz", 1.0); L("C-H1", "C-T2", "80GHz", 10);
    L("C-H1", "C-T3", "23GHz", 1.0); L("C-H2", "C-T4", "23GHz", 1.0);
    L("C-H2", "C-T5", "80GHz", 10);  L("C-H2", "C-T6", "18GHz", 1.0);
    // cross-island protection candidates (normally standby; reroute targets)
    L("A-H2", "B-H2", "7GHz", 1.0, true); L("C-H2", "B-H2", "7GHz", 1.0, true);
    links[links.length - 2].standby = true; links[links.length - 2].active = false;
    links[links.length - 1].standby = true; links[links.length - 1].active = false;
    return { sites, links };
  }

  function mkLink(a, b, band, capacityGbps, sites) {
    const sa = sites.find(s => s.id === a), sb = sites.find(s => s.id === b);
    const lengthKm = Math.hypot(sa.x - sb.x, sa.y - sb.y) * 0.6; // plane->km scale
    // nominal RSL: mid-range healthy receive level; fade margin by band
    // operator calibration: receiver falls over around -75 dBm regardless of
    // band (low-mod sensitivity); fade margin is what stands between nominal
    // RSL and that floor - a ~35 dB drop from nominal is a real incident.
    const nominalRsl = band === "80GHz" ? -42 : -38;
    const fadeMargin = band === "80GHz" ? 33 : 37; // down at ~-75 dBm
    return {
      id: a + "~" + b, a, b, band, capacityGbps, lengthKm: +lengthKm.toFixed(1),
      island: sa.island === sb.island ? sa.island : "X",
      standby: false,
      nominalRsl, fadeMargin, nominalSnr: 42,
      active: true, // standby links flipped to false right after build
      atpc: band !== "80GHz", atpcRangeDb: band === "80GHz" ? 0 : 15, txNominalDbm: 20,
      // per-direction state: dir "ab" = received at b, dir "ba" = received at a
      dirs: {
        ab: { rsl: nominalRsl, snr: 42, acm: 5, es: 0, ses: 0, up: true, txBoostDb: 0 },
        ba: { rsl: nominalRsl, snr: 42, acm: 5, es: 0, ses: 0, up: true, txBoostDb: 0 },
      },
      faults: {}, // set by injectors
    };
  }

  // ---- weather -----------------------------------------------------------
  function mkRainCell(x, y, radiusKm, rateMmh, vx, vy) {
    return { x, y, radiusKm, rateMmh, vx, vy, active: true };
  }
  // path-in-cell length: crude but honest - overlap of segment with circle
  function pathInCell(link, sites, cell) {
    const sa = sites.find(s => s.id === link.a), sb = sites.find(s => s.id === link.b);
    const steps = 20; let inside = 0;
    for (let i = 0; i <= steps; i++) {
      const px = sa.x + (sb.x - sa.x) * i / steps, py = sa.y + (sb.y - sa.y) * i / steps;
      if (Math.hypot(px - cell.x, py - cell.y) * 0.6 <= cell.radiusKm) inside++;
    }
    return (inside / (steps + 1)) * link.lengthKm;
  }
  function rainAttenuationDb(link, sites, cells) {
    let att = 0;
    for (const c of cells) {
      if (!c.active) continue;
      const km = pathInCell(link, sites, c);
      if (km <= 0) continue;
      const { k, alpha } = BANDS[link.band];
      att += k * Math.pow(c.rateMmh, alpha) * km;
    }
    return att;
  }

  // ---- alarm formats per island (multi-vendor flavour, neutral labels) ---
  const FMT = {
    A: (sev, type, obj, txt) => ({ island: "A", raw: `[NMS-A] ${sev} ${type} managedObject=${obj} :: ${txt}` , sev, type, obj }),
    B: (sev, type, obj, txt) => ({ island: "B", raw: `<NMS-B> alarm=${type};severity=${sev};ne=${obj};desc="${txt}"`, sev, type, obj }),
    C: (sev, type, obj, txt) => ({ island: "C", raw: `NMS-C|${sev}|${obj}|${type}|${txt}`, sev, type, obj }),
    X: (sev, type, obj, txt) => ({ island: "X", raw: `[UMBRELLA] ${sev} ${type} ${obj} ${txt}`, sev, type, obj }),
  };

  // ---- services & traffic routing ---------------------------------------
  // Every tail site carries a realistic service mix (mobile backhaul + enterprise
  // leased services). Traffic is routed hop-by-hop toward the POP over ACTIVE
  // links, so each link knows exactly what rides it - count, mix, priority split.
  function seedServices(sites) {
    let eid = 100;
    for (const st of sites) {
      if (st.kind !== "tail") { st.services = []; continue; }
      const mobile = { type: "mobile", name: st.id + " 4G/5G backhaul", gbps: 0.25, priorityGbps: 0.05 };
      const entN = 1 + (st.id.charCodeAt(2) % 3); // 1-3 enterprise services per tail
      const ents = Array.from({ length: entN }, (_, i) => ({
        type: "enterprise", name: "ENT-" + (eid++) , gbps: 0.04, priorityGbps: 0.02 }));
      st.services = [mobile, ...ents];
    }
  }

  // ---- the simulation ----------------------------------------------------
  class MWSim {
    constructor() {
      const t = buildTopology();
      this.sites = t.sites; this.links = t.links;
      seedServices(this.sites);
      this.cells = []; this.tick = 0; this.alarms = []; this.events = [];
      this.startMinutes = 6 * 60; // sim clock starts 06:00; 1 tick = 3 sim-minutes
      this.changeLog = [
        { tick: -600, obj: "B-H1~B-T6", txt: "ACM profile updated during MW window" },
      ];
      this._noiseSeed = 42;
    }
    rnd() { this._noiseSeed = (this._noiseSeed * 16807) % 2147483647; return this._noiseSeed / 2147483647; }
    clockMinutes() { return (this.startMinutes + this.tick * 3) % 1440; }
    clockHHMM() { const m = this.clockMinutes(); return String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m%60).padStart(2,"0"); }
    // diurnal load: quiet nights, evening busy hour peaking ~20:30
    trafficFactor() {
      const h = this.clockMinutes() / 60;
      return +(0.45 + 0.55 * Math.exp(-Math.pow((h - 20.5 + (h < 8 ? 24 : 0)) / 5.5, 2))).toFixed(2);
    }

    // route every tail's services toward its POP over active, up links (BFS
    // parent tree). Fills l.carried = {gbps, priorityGbps, services[]} per link.
    computeRouting() {
      const act = this.links.filter(l => l.active && l.dirs.ab.up && l.dirs.ba.up);
      const adj = {};
      act.forEach(l => {
        (adj[l.a] = adj[l.a] || []).push({ n: l.b, l }); (adj[l.b] = adj[l.b] || []).push({ n: l.a, l });
      });
      const parent = {};
      const q = this.sites.filter(x => x.kind === "pop").map(x => x.id);
      const seen = new Set(q);
      while (q.length) {
        const n = q.shift();
        for (const e of (adj[n] || [])) if (!seen.has(e.n)) { seen.add(e.n); parent[e.n] = { via: e.l, to: n }; q.push(e.n); }
      }
      for (const l of this.links) l.carried = { gbps: 0, priorityGbps: 0, services: [] };
      for (const st of this.sites.filter(x => x.kind === "tail" && x.services.length)) {
        if (!seen.has(st.id)) { st.isolated = true; continue; }
        st.isolated = false;
        let cur = st.id;
        while (parent[cur]) {
          const hop = parent[cur];
          const f = this.trafficFactor();
          for (const svc of st.services) {
            hop.via.carried.gbps += svc.gbps * f;
            hop.via.carried.priorityGbps += svc.priorityGbps; // priority is committed, not diurnal
            hop.via.carried.services.push(svc.name);
          }
          cur = hop.to;
        }
      }
      for (const l of this.links) {
        l.carried.gbps = +l.carried.gbps.toFixed(2);
        l.carried.priorityGbps = +l.carried.priorityGbps.toFixed(2);
      }
    }
    capacityNowGbps(l) {
      const acmIdx = Math.min(l.dirs.ab.acm, l.dirs.ba.acm);
      const capFactor = [0.17, 0.33, 0.50, 0.67, 0.83, 1.00][acmIdx] || 0.17;
      return +(l.capacityGbps * capFactor).toFixed(2);
    }
    utilizationPct(l) {
      const cap = this.capacityNowGbps(l);
      return cap > 0 ? Math.round(100 * l.carried.gbps / cap) : 0;
    }
    // services on tail sites that currently have no path to the POP. Unlike the
    // ever-climbing alarm count, this rises during an incident and falls again as
    // links recover or the agent reroutes onto a standby - it is the service-impact
    // signal the loop correlates to, not the alarm scream. (st.isolated is set by
    // computeRouting on every step.)
    servicesImpacted() {
      let down = 0, priorityDown = 0, total = 0;
      for (const st of this.sites) {
        if (st.kind !== "tail" || !st.services) continue;
        total += st.services.length;
        if (st.isolated) {
          down += st.services.length;
          priorityDown += st.services.filter(s => s.priorityGbps > 0).length;
        }
      }
      return { down, priorityDown, total };
    }

    // -- fault injectors (the demo's control panel calls these) --
    injectRainCell(x, y, radiusKm, rateMmh, vx, vy) {
      this.cells.push(mkRainCell(x, y, radiusKm, rateMmh, vx, vy));
      this.events.push({ tick: this.tick, kind: "weather", txt: `Rain cell ${rateMmh} mm/h entering region` });
    }
    injectOduDegradation(linkId, dir /* "ab"|"ba" */, severity /* db loss */) {
      const l = this.links.find(x => x.id === linkId); if (!l) return;
      l.faults.odu = { dir, db: severity, progressive: true, appliedDb: 0 };
      this.events.push({ tick: this.tick, kind: "fault", txt: `Hidden ODU TX degradation seeded on ${linkId} (${dir})` });
    }
    injectInterference(linkId, dir, snrLossDb) {
      const l = this.links.find(x => x.id === linkId); if (!l) return;
      l.faults.interference = { dir, snrLossDb };
      this.events.push({ tick: this.tick, kind: "fault", txt: `Interferer seeded near ${linkId} (${dir})` });
    }
    injectConfigChange(linkId) {
      const l = this.links.find(x => x.id === linkId); if (!l) return;
      // a bad TX-power / profile change: modest symmetric RSL hit, dry path
      l.faults.config = { db: 9 };
      this.changeLog.push({ tick: this.tick, obj: linkId, txt: "TX power profile changed outside MW window" });
      this.events.push({ tick: this.tick, kind: "fault", txt: `Bad config change applied on ${linkId}` });
    }
    clearFaults() { this.links.forEach(l => (l.faults = {})); this.cells = []; }

    // -- topology math: what hangs below a link (blast radius) --
    sitesBelow(linkId) {
      // remove link, BFS from all POPs over ACTIVE links; unreachable non-standby sites = below
      const act = this.links.filter(l => l.id !== linkId && l.active && l.dirs.ab.up && l.dirs.ba.up); // duplex: one dead direction carries no service
      const adj = {};
      act.forEach(l => { (adj[l.a] = adj[l.a] || []).push(l.b); (adj[l.b] = adj[l.b] || []).push(l.a); });
      const reach = new Set(this.sites.filter(s => s.kind === "pop").map(s => s.id));
      const q = [...reach];
      while (q.length) { const n = q.shift(); (adj[n] || []).forEach(m => { if (!reach.has(m)) { reach.add(m); q.push(m); } }); }
      return this.sites.filter(s => !reach.has(s.id)).map(s => s.id);
    }

    // -- one tick of physics + alarming --
    step() {
      this.tick++;
      const newAlarms = [];
      for (const c of this.cells) { c.x += c.vx; c.y += c.vy; if (c.x > 110 || c.y > 80 || c.x < -10) c.active = false; }
      for (const l of this.links) {
        const rainDb = rainAttenuationDb(l, this.sites, this.cells);
        for (const dk of ["ab", "ba"]) {
          const d = l.dirs[dk];
          // total path attenuation beyond clear-sky for this direction
          let attDb = rainDb; // both dirs share rain
          if (l.faults.odu && l.faults.odu.dir === dk) {
            const f = l.faults.odu;
            if (f.progressive && f.appliedDb < f.db) f.appliedDb += 0.15; // slow drift
            attDb += f.appliedDb;
          }
          if (l.faults.odu2 && l.faults.odu2.dir === dk) attDb += l.faults.odu2.appliedDb;
          if (l.faults.config) attDb += l.faults.config.db;
          // ATPC: far-end TX rises to hold target RSL until it saturates - the
          // NMS sees TX power climb FIRST; RSL only falls once ATPC is
          // exhausted (what a transmission engineer expects to see)
          const boost = l.atpc ? Math.min(attDb, l.atpcRangeDb) : 0;
          d.txBoostDb = +boost.toFixed(1);
          const residual = attDb - boost;
          let rsl = l.nominalRsl - residual + (this.rnd() - 0.5) * 1.2;
          let snr = l.nominalSnr - residual + (this.rnd() - 0.5) * 1.0;
          if (l.faults.interference && l.faults.interference.dir === dk) {
            snr -= l.faults.interference.snrLossDb; // RSL untouched: the signature
          }
          d.rsl = +rsl.toFixed(1); d.snr = +snr.toFixed(1);
          // ACM selection: highest index whose snrMin fits
          let acm = 0; for (let i = ACM.length - 1; i >= 0; i--) { if (d.snr >= ACM[i].snrMin) { acm = i; break; } }
          const prevAcm = d.acm; d.acm = acm;
          const margin = d.rsl - (l.nominalRsl - l.fadeMargin);
          const wasUp = d.up; d.up = margin > 0 && d.snr > ACM[0].snrMin - 3;
          if (!d.up) { d.ses++; } else if (d.snr < ACM[1].snrMin) { d.es++; }
          // alarms in island format
          const F = FMT[l.island] || FMT.X, far = dk === "ab" ? l.b : l.a;
          if (wasUp && !d.up) newAlarms.push(F("CRITICAL", "MW_LINK_DOWN", `${l.id}/${dk}`, `RSL ${d.rsl} dBm below threshold at ${far}`));
          if (!wasUp && d.up) newAlarms.push(F("CLEARED", "MW_LINK_DOWN", `${l.id}/${dk}`, "link restored"));
          if (d.up && prevAcm > acm) newAlarms.push(F("MAJOR", "ACM_DOWNSHIFT", `${l.id}/${dk}`, `${ACM[prevAcm].mod} -> ${ACM[acm].mod}, capacity ${(ACM[acm].capFactor * l.capacityGbps).toFixed(1)} Gbps`));
          if (d.up && margin < 6) newAlarms.push(F("MINOR", "RSL_LOW", `${l.id}/${dk}`, `RSL ${d.rsl} dBm, margin ${margin.toFixed(1)} dB`));
          if (d.up && l.atpc && d.txBoostDb >= l.atpcRangeDb * 0.8 && margin >= 6) newAlarms.push(F("MINOR", "ATPC_NEAR_MAX", `${l.id}/${dk}`, `TX boost ${d.txBoostDb} dB of ${l.atpcRangeDb} dB - fade being absorbed`));
          if (d.up && d.snr < l.nominalSnr - 10 && d.rsl > l.nominalRsl - 4) newAlarms.push(F("MAJOR", "SNR_DEGRADED", `${l.id}/${dk}`, `SNR ${d.snr} dB with healthy RSL ${d.rsl} dBm`));
        }
        // both directions dead -> downstream sympathetic storm
        if (!l.dirs.ab.up && !l.dirs.ba.up && l.active) {
          for (const sid of this.sitesBelow(l.id)) {
            const F = FMT[this.sites.find(s => s.id === sid).island] || FMT.X;
            newAlarms.push(F("CRITICAL", "SITE_UNREACHABLE", sid, "NE not responding (sympathetic)"));
          }
        }
      }
      this.computeRouting();
      for (const l of this.links.filter(x => x.active && x.carried && x.carried.gbps > 0)) {
        const cap = this.capacityNowGbps(l);
        if (l.carried.gbps > cap) {
          const F = FMT[l.island] || FMT.X;
          newAlarms.push(F("MAJOR", "CONGESTION_QOS_SHED", l.id,
            `carrying ${l.carried.gbps} Gbps on ${cap} Gbps ACM-reduced capacity - best-effort shedding, priority protected`));
        }
      }
      newAlarms.forEach(a => (a.tick = this.tick));
      this.alarms.push(...newAlarms);
      if (this.alarms.length > 4000) this.alarms.splice(0, this.alarms.length - 4000);
      if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
      return newAlarms;
    }

    // -- probe API: what the orchestrator agent is ALLOWED to see ----------
    // (mirrors NBIs: per-island queries, no global magic view)
    probeLink(linkId) {
      const l = this.links.find(x => x.id === linkId); if (!l) return null;
      return {
        id: l.id, island: l.island, band: l.band, lengthKm: l.lengthKm,
        standby: l.standby, active: l.active, capacityGbps: l.capacityGbps,
        capacityNowGbps: this.capacityNowGbps(l),
        carriedGbps: l.carried ? l.carried.gbps : 0,
        carriedPriorityGbps: l.carried ? l.carried.priorityGbps : 0,
        utilizationPct: this.utilizationPct(l),
        serviceCount: l.carried ? l.carried.services.length : 0,
        services: l.carried ? l.carried.services.slice(0, 40) : [],
        atpc: l.atpc, atpcRangeDb: l.atpcRangeDb,
        ab: { ...l.dirs.ab }, ba: { ...l.dirs.ba },
      };
    }
    probeNeighbors(linkId) {
      const l = this.links.find(x => x.id === linkId); if (!l) return [];
      return this.links
        .filter(o => o.id !== linkId && (o.a === l.a || o.b === l.b || o.a === l.b || o.b === l.a))
        .map(o => this.probeLink(o.id));
    }
    probeWeather(linkId) {
      // external evidence feed: rain rate at link geometry (like a radar API)
      const l = this.links.find(x => x.id === linkId); if (!l) return { rateMmh: 0 };
      let worst = 0;
      for (const c of this.cells.filter(c => c.active)) {
        if (pathInCell(l, this.sites, c) > 0) worst = Math.max(worst, c.rateMmh);
      }
      return { rateMmh: worst };
    }
    probeChangeLog(linkId) {
      return this.changeLog.filter(c => c.obj === linkId && this.tick - c.tick < 900);
    }
    recentAlarms(n) { return this.alarms.slice(-n); }
    alarmHistoryFor(linkId, lastN) {
      return this.alarms.slice(-(lastN || 600)).filter(a => a.obj && a.obj.startsWith(linkId));
    }
    // traffic demand: tails carry subscriber load with a QoS split. The
    // pre-reroute question every operator asks: does the protection path have
    // headroom, and if not, what sheds first per QoS profile?
    demandOf(siteIds) {
      let priority = 0, total = 0;
      for (const sid of siteIds) {
        const site = this.sites.find(x => x.id === sid);
        if (!site) continue;
        const d = site.kind === "tail" ? { p: 0.08, t: 0.35 } : site.kind === "hub" ? { p: 0.04, t: 0.15 } : { p: 0, t: 0 };
        priority += d.p; total += d.t;
      }
      return { priorityGbps: +priority.toFixed(2), totalGbps: +total.toFixed(2) };
    }
    linkHeadroomGbps(linkId) {
      const l = this.links.find(x => x.id === linkId); if (!l) return 0;
      const carried = l.carried ? l.carried.gbps : 0;
      return +(this.capacityNowGbps(l) - carried).toFixed(2);
    }
    // topology-aware restoration check: would activating `standbyId` actually
    // reconnect everything isolated by losing `causeId`?
    wouldRestore(causeId, standbyId) {
      const below = this.sitesBelow(causeId);
      if (!below.length) return false;
      const act = this.links.filter(l => l.id !== causeId &&
        (l.active || l.id === standbyId) &&
        (l.id === standbyId || (l.dirs.ab.up && l.dirs.ba.up)));
      const adj = {};
      act.forEach(l => { (adj[l.a] = adj[l.a] || []).push(l.b); (adj[l.b] = adj[l.b] || []).push(l.a); });
      const reach = new Set(this.sites.filter(x => x.kind === "pop").map(x => x.id));
      const q = [...reach];
      while (q.length) { const n = q.shift(); (adj[n] || []).forEach(m => { if (!reach.has(m)) { reach.add(m); q.push(m); } }); }
      return below.every(sid => reach.has(sid));
    }
    // -- actuation API (typed, auditable; the ONLY writes the agent can make)
    activateStandby(linkId) {
      const l = this.links.find(x => x.id === linkId && x.standby);
      if (!l) return { ok: false, err: "no such standby link" };
      l.active = true;
      this.events.push({ tick: this.tick, kind: "action", txt: `Standby link ${linkId} activated (reroute)` });
      return { ok: true };
    }
    deactivateStandby(linkId) {
      const l = this.links.find(x => x.id === linkId && x.standby);
      if (!l) return { ok: false, err: "no such standby link" };
      l.active = false;
      this.events.push({ tick: this.tick, kind: "action", txt: `Standby link ${linkId} deactivated (rollback)` });
      return { ok: true };
    }
    hardFail(linkId) { // test helper: catastrophic both-direction failure
      const l = this.links.find(x => x.id === linkId); if (!l) return;
      l.faults.odu = { dir: "ab", db: 60, progressive: false, appliedDb: 60 };
      l.faults.odu2 = { dir: "ba", db: 60, progressive: false, appliedDb: 60 };
    }
  }

  window.MWSim = { MWSim, BANDS, ACM };
})();
