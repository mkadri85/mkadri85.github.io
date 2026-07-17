/* mw-loop diagnosis engine (Layer 2)
 *
 * The differential-diagnosis runbook a senior transmission engineer runs in
 * their head, made executable and GLASS-BOX: every verdict carries the
 * evidence trail that produced it - each probe, what it showed, and how it
 * moved the hypothesis. Nothing here is magic; it is the runbook.
 *
 * Heuristics encoded (sourced in the article):
 *  H1 both-direction RSL drop        -> environmental (fade/obstruction)
 *  H2 one-direction RSL drop         -> hardware TX/RX chain (ODU/IDU/cable)
 *  H3 healthy RSL + degraded SNR     -> interference
 *  H4 neighbour co-fade (topology)   -> weather cell, not equipment
 *  H5 external weather evidence      -> confirms / kills the rain hypothesis
 *  H6 degradation persists after rain-> whatever remains is NOT rain
 *  H7 recent config change on object -> config-induced, check before RF
 *
 * Verdicts: RAIN_FADE | HARDWARE | INTERFERENCE | CONFIG | OBSTRUCTION_OR_MISALIGNMENT | HEALTHY | INCONCLUSIVE
 */

(function () {
  "use strict";

  const THRESH = {
    rslDropDb: 5,        // deviation from nominal that counts as "dropped"
    rslAsymmetryDb: 6,   // one direction this much worse than the other = asymmetric
    snrOnlyGapDb: 8,     // SNR degraded while RSL within this of nominal = interference signature
    coFadeMin: 2,        // neighbours co-fading to call it a weather cell
    rainRateMin: 5,      // mm/h from external feed to accept rain as cause
  };

  function diagnoseLink(sim, linkId) {
    const ev = [];               // the glass-box evidence trail
    const say = (probe, observed, inference) => ev.push({ probe, observed, inference });

    const p = sim.probeLink(linkId);
    if (!p) return { verdict: "INCONCLUSIVE", confidence: 0, evidence: [{ probe: "probeLink", observed: "no such link", inference: "-" }] };

    // hard outage first: restoration is the priority - but the CAUSE still
    // steers the dispatch decision. A storm outage self-clears; a dry-path
    // failure needs a crew. Rolling trucks for rain is the classic false cost.
    if (!p.ab.up && !p.ba.up) {
      say("probeLink status", "both directions DOWN", "hard outage - restore first, but cause steers dispatch");
      const below = sim.sitesBelow(linkId);
      say("sitesBelow", `${below.length} site(s) isolated: ${below.join(", ") || "-"}`,
          below.length ? "lifeline failure - restoration is time-critical" : "no downstream isolation");
      const wx0 = sim.probeWeather(linkId);
      const neigh0 = sim.probeNeighbors(linkId).filter(n => !n.standby);
      const coFading0 = neigh0.filter(n => {
        const nom = n.band === "80GHz" ? -42 : -38;
        return !n.ab.up || !n.ba.up || (nom - n.ab.rsl) >= THRESH.rslDropDb || (nom - n.ba.rsl) >= THRESH.rslDropDb;
      });
      say("probeWeather", `${wx0.rateMmh} mm/h at link geometry`,
          wx0.rateMmh >= THRESH.rainRateMin ? "active rain over path (H5)" : "dry path - rain ruled out (H5)");
      say("probeNeighbors", `${coFading0.length}/${neigh0.length} neighbours degraded or down`,
          coFading0.length >= THRESH.coFadeMin ? "co-fade -> storm outage pattern (H4)" : "neighbours healthy -> failure is local");
      if (wx0.rateMmh >= THRESH.rainRateMin || coFading0.length >= THRESH.coFadeMin) {
        say("verdict path", "outage with rain / co-fade evidence",
            "STORM OUTAGE: reroute if sites are isolated, but HOLD the truck roll - re-verify after the cell passes (H5+H4 gate dispatch)");
        return { verdict: "LINK_DOWN_RAIN", confidence: 0.9, evidence: ev, linkId, sitesBelow: below, recheckAfter: true,
                 note: "hold dispatch - storm outage pattern; restore via protection if isolated, re-diagnose after cell exits (H6)" };
      }
      say("verdict path", "outage on a dry path with healthy neighbours", "hard failure - dispatch is justified");
      return { verdict: "LINK_DOWN", confidence: 0.95, evidence: ev, linkId, sitesBelow: below };
    }

    const nominal = p.band === "80GHz" ? -42 : -38;
    const dropAb = nominal - p.ab.rsl;   // +ve = degraded
    const dropBa = nominal - p.ba.rsl;
    const worstDrop = Math.max(dropAb, dropBa);
    const asym = Math.abs(dropAb - dropBa);
    const snrAb = p.ab.snr, snrBa = p.ba.snr;

    say("probeLink RSL", `ab ${p.ab.rsl} dBm (drop ${dropAb.toFixed(1)}, ES ${p.ab.es}), ba ${p.ba.rsl} dBm (drop ${dropBa.toFixed(1)}, ES ${p.ba.es})`,
        worstDrop < THRESH.rslDropDb ? "no meaningful RSL degradation" :
        asym >= THRESH.rslAsymmetryDb ? "ASYMMETRIC drop -> points at hardware (H2)" : "symmetric drop -> points at path/environment (H1)");

    // healthy fast-path (but interference hides here: RSL fine, SNR bad)
    const snrDegraded = Math.min(snrAb, snrBa) < 34; // aligned with interference signature gap
    if (worstDrop < THRESH.rslDropDb && !snrDegraded) {
      say("summary", "RSL and SNR within normal envelope", "link healthy");
      return { verdict: "HEALTHY", confidence: 0.95, evidence: ev, linkId };
    }

    // H0: the operator's actual first move - active alarms + history on the
    // object. A recurring pattern (same hour daily, flapping for weeks) reads
    // completely differently from a first-ever event.
    const hist = sim.alarmHistoryFor(linkId, 800);
    const rslLows = hist.filter(a => a.type === "RSL_LOW" || a.type === "ACM_DOWNSHIFT").length;
    say("alarm history", `${hist.length} alarms on this object recently (${rslLows} RSL/ACM events)`,
        rslLows > 12 ? "recurring degradation pattern - chronic issue, check trend before treating as new (H0)" :
        rslLows > 0 ? "some prior events - compare with current signature (H0)" : "first occurrence - fresh event (H0)");

    // H7: config first - cheapest check, embarrassing to miss
    const changes = sim.probeChangeLog(linkId);
    if (changes.length) {
      say("probeChangeLog", changes.map(c => c.txt).join("; "),
          "recent change on this object - config-induced until proven otherwise (H7)");
    } else {
      say("probeChangeLog", "no recent changes", "config cause unlikely (H7 clear)");
    }

    // H3: interference signature - SNR gone, RSL fine (per direction)
    for (const [dk, d] of [["ab", p.ab], ["ba", p.ba]]) {
      const drop = nominal - d.rsl;
      if (drop < THRESH.rslDropDb && d.snr < 42 - THRESH.snrOnlyGapDb) {
        say("signature check " + dk, `RSL healthy (${d.rsl} dBm) but SNR ${d.snr} dB`,
            "healthy RSL + degraded SNR = interference signature (H3)");
        return { verdict: "INTERFERENCE", confidence: 0.85, direction: dk, evidence: ev, linkId,
                 note: "recommend spectrum scan / frequency assurance on this hop" };
      }
    }

    // H5: external weather evidence at link geometry
    const wx = sim.probeWeather(linkId);
    say("probeWeather", `${wx.rateMmh} mm/h at link geometry`,
        wx.rateMmh >= THRESH.rainRateMin ? "active rain over path (H5 supports fade)" : "no meaningful rain over path (H5 kills rain hypothesis)");

    // H4: neighbour co-fade
    const neigh = sim.probeNeighbors(linkId).filter(n => !n.standby);
    const coFading = neigh.filter(n => {
      const nom = n.band === "80GHz" ? -42 : -38;
      return (nom - n.ab.rsl) >= THRESH.rslDropDb || (nom - n.ba.rsl) >= THRESH.rslDropDb;
    });
    say("probeNeighbors", `${coFading.length}/${neigh.length} adjacent links also degraded`,
        coFading.length >= THRESH.coFadeMin ? "co-fade across neighbours -> weather cell, not this equipment (H4)" : "neighbours healthy -> cause is local to this link (H4 inverse)");

    // ---- combine, in the order an engineer would ----
    const rainSupported = wx.rateMmh >= THRESH.rainRateMin;
    const coFade = coFading.length >= THRESH.coFadeMin;
    const symmetric = asym < THRESH.rslAsymmetryDb;

    if (symmetric && (rainSupported || coFade)) {
      // classic fade - but check for a fault HIDING inside the storm:
      // expected rain attenuation vs observed; a big residual on one side = something else too
      const residual = asym; // symmetric fade should leave tiny asymmetry
      const conf = rainSupported && coFade ? 0.92 : 0.8;
      say("verdict path", `symmetric drop + ${rainSupported ? "radar-confirmed rain" : "neighbour co-fade"}`,
          "RAIN_FADE - ACM is doing its job; do not dispatch, watch and re-verify after cell passes (H1+H4+H5)");
      return { verdict: "RAIN_FADE", confidence: conf, evidence: ev, linkId,
               recheckAfter: true, note: "re-run diagnosis when cell exits path (H6)" };
    }

    if (!symmetric) {
      const dir = dropAb > dropBa ? "ab" : "ba";
      const rxSite = dir === "ab" ? p.id.split("~")[1] : p.id.split("~")[0];
      if (rainSupported || coFade) {
        say("verdict path", `asymmetric drop (${asym.toFixed(1)} dB) even though rain is present`,
            "fault HIDING INSIDE the storm: rain explains the symmetric part, not the asymmetry -> hardware on the " + dir + " chain (H2 over H1)");
      } else {
        say("verdict path", `asymmetric drop (${asym.toFixed(1)} dB), no rain, neighbours healthy`,
            "hardware TX/RX chain degradation on " + dir + " (H2)");
      }
      return { verdict: "HARDWARE", confidence: rainSupported ? 0.75 : 0.88, direction: dir, evidence: ev, linkId,
               note: `suspect ODU/IDU/cable on receive path toward ${rxSite}; attach evidence to ticket, dispatch with spare` };
    }

    // symmetric but no rain and no co-fade: obstruction / misalignment family
    if (changes.length) {
      say("verdict path", "degradation matches change window", "CONFIG-induced (H7)");
      return { verdict: "CONFIG", confidence: 0.7, evidence: ev, linkId, note: "compare against pre-change baseline; rollback candidate" };
    }
    say("verdict path", "symmetric drop, dry path, neighbours healthy",
        "environmental but not rain: new obstruction, antenna movement after wind, or slow misalignment (H1 minus H5)");
    return { verdict: "OBSTRUCTION_OR_MISALIGNMENT", confidence: 0.6, evidence: ev, linkId,
             note: "check tower work orders and wind history; site survey if persistent" };
  }

  // sweep every non-standby link; return only non-healthy verdicts, worst first
  function diagnoseRegion(sim) {
    const out = [];
    for (const l of sim.links.filter(l => !l.standby)) {
      const d = diagnoseLink(sim, l.id);
      if (d.verdict !== "HEALTHY") out.push(d);
    }
    const rank = { LINK_DOWN: -1, LINK_DOWN_RAIN: -1, HARDWARE: 0, INTERFERENCE: 1, OBSTRUCTION_OR_MISALIGNMENT: 2, CONFIG: 3, RAIN_FADE: 4, INCONCLUSIVE: 5 };
    return out.sort((a, b) => (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9) || b.confidence - a.confidence);
  }

  window.MWDiag = { diagnoseLink, diagnoseRegion, THRESH };
})();
