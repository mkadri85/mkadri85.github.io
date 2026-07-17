/* mw-loop orchestrator (Layers 3, 5, 6)
 *
 * Layer 3 - decision & policy: turns a Layer-2 verdict into an action
 *   PROPOSAL, then gates it. The gate is the whole point:
 *     may_auto_execute = reversible_action
 *                        AND verdict_confidence >= 0.8
 *                        AND blast_radius_if_wrong <= policy.maxAutoBlast
 *                        AND breaker_allows
 *   Anything that fails the gate is PROPOSED to a human, never fired.
 *
 * Layer 5 - verification: every executed action carries a verify contract
 *   (what must be true afterwards) and a rollback (what to do if it isn't).
 *
 * Layer 6 - assurance over the agent itself: a burn-rate style breaker on
 *   the orchestrator's own actions (guardplane pattern) - too many auto
 *   actions in a window demotes the agent to propose-only. Who watches the
 *   watcher, applied to ourselves.
 */

(function () {
  "use strict";

  const POLICY = {
    minAutoConfidence: 0.8,
    maxAutoBlast: 3,          // sites-below threshold for auto actions
    breakerWindow: 40,        // ticks
    breakerMaxAutoActions: 2, // more than this per window -> demote (verify-failures also count)
  };

  // action catalogue: typed, auditable, each with risk class
  const ACTIONS = {
    WATCH:            { reversible: true,  writes: false, label: "Watch + re-verify after cell passes" },
    TICKET_DISPATCH:  { reversible: true,  writes: false, opex: true, label: "Open ticket + dispatch field crew (evidence attached)" },
    SPECTRUM_SCAN:    { reversible: true,  writes: false, label: "Trigger spectrum scan / frequency assurance" },
    SITE_SURVEY:      { reversible: true,  writes: false, opex: true, label: "Schedule site survey (tower/alignment)" },
    CONFIG_ROLLBACK:  { reversible: true,  writes: true,  label: "Roll back last config change" },
    ACTIVATE_STANDBY: { reversible: true,  writes: true,  label: "Activate standby protection link (reroute)" },
  };

  class Orchestrator {
    constructor(sim) {
      this.sim = sim;
      this.log = [];         // decision log (glass box)
      this.proposals = [];   // waiting for a human
      this.executed = [];    // actions fired, with verify contracts pending
      this.autoActionTicks = []; // breaker memory
      this.mode = "active";  // "active" | "propose_only"
    }
    note(kind, txt, extra) { this.log.push({ tick: this.sim.tick, kind, txt, ...(extra || {}) }); }

    // ---- Layer 6: the breaker -------------------------------------------
    breakerAllows() {
      const w = this.sim.tick - POLICY.breakerWindow;
      this.autoActionTicks = this.autoActionTicks.filter(t => t > w);
      if (this.autoActionTicks.length >= POLICY.breakerMaxAutoActions && this.mode === "active") {
        this.mode = "propose_only";
        this.note("breaker", `Breaker tripped: ${this.autoActionTicks.length} auto actions in ${POLICY.breakerWindow} ticks - agent demoted to propose-only`);
      }
      return this.mode === "active";
    }
    resetBreaker() { this.mode = "active"; this.autoActionTicks = []; this.note("breaker", "Manually reset to active"); }

    // ---- Layer 3: verdict -> plan -> gate -------------------------------
    // topology-aware standby choice: only a standby that actually reconnects
    // the isolated sites is a valid plan (the plan stage must know the graph,
    // not just the gate)
    chooseStandby(causeId) {
      return this.sim.links.filter(x => x.standby && !x.active)
        .find(sb => this.sim.wouldRestore(causeId, sb.id)) || null;
    }
    planFor(diag) {
      switch (diag.verdict) {
        case "RAIN_FADE":     return { action: "WATCH", target: diag.linkId };
        case "LINK_DOWN_RAIN": {
          // storm outage: restore if we can, but no truck roll for rain
          const standby = this.chooseStandby(diag.linkId);
          if ((diag.sitesBelow || []).length > 0 && standby)
            return { action: "ACTIVATE_STANDBY", target: standby.id, cause: diag.linkId };
          return { action: "WATCH", target: diag.linkId };
        }
        case "LINK_DOWN": {
          const standby = this.chooseStandby(diag.linkId);
          if ((diag.sitesBelow || []).length > 0 && standby) {
            return { action: "ACTIVATE_STANDBY", target: standby.id, cause: diag.linkId,
                     also: { action: "TICKET_DISPATCH", target: diag.linkId } };
          }
          return { action: "TICKET_DISPATCH", target: diag.linkId };
        }
        case "HARDWARE": {
          // if the faulty link is a lifeline (sites hang below), plan a reroute too
          const below = this.sim.sitesBelow(diag.linkId);
          const standby = this.chooseStandby(diag.linkId);
          if (below.length > 0 && standby) {
            return { action: "ACTIVATE_STANDBY", target: standby.id, cause: diag.linkId,
                     also: { action: "TICKET_DISPATCH", target: diag.linkId } };
          }
          return { action: "TICKET_DISPATCH", target: diag.linkId };
        }
        case "INTERFERENCE":  return { action: "SPECTRUM_SCAN", target: diag.linkId };
        case "CONFIG":        return { action: "CONFIG_ROLLBACK", target: diag.linkId };
        case "OBSTRUCTION_OR_MISALIGNMENT": return { action: "SITE_SURVEY", target: diag.linkId };
        default:              return null;
      }
    }

    gate(plan, diag) {
      const a = ACTIONS[plan.action];
      const checks = [];
      const pass = (name, ok, detail) => { checks.push({ name, ok, detail }); return ok; };

      let ok = true;
      ok = pass("action reversible", a.reversible, a.reversible ? "yes" : "IRREVERSIBLE") && ok;
      ok = pass(`confidence >= ${POLICY.minAutoConfidence}`, diag.confidence >= POLICY.minAutoConfidence,
                `verdict confidence ${diag.confidence}`) && ok;
      ok = pass("dispatch economics", !a.opex || diag.confidence >= 0.9,
                a.opex ? `truck roll / field cost requires confidence >= 0.9 (have ${diag.confidence})` : "no field cost") && ok;
      // blast radius if we are WRONG: for write actions, what could this touch?
      let blast = 0;
      if (a.writes) {
        blast = plan.cause ? this.sim.sitesBelow(plan.cause).length : this.sim.sitesBelow(plan.target).length;
      }
      ok = pass(`blast radius <= ${POLICY.maxAutoBlast} (or read-only)`, !a.writes || blast <= POLICY.maxAutoBlast,
                a.writes ? `${blast} sites depend on the affected object` : "read-only action") && ok;
      ok = pass("agent breaker", this.breakerAllows(), this.mode) && ok;
      return { allowed: ok, checks, blast };
    }

    // ---- Layer 5: verify contracts --------------------------------------
    verifyContractFor(plan) {
      if (plan.action === "ACTIVATE_STANDBY") {
        return {
          description: `All sites below ${plan.cause} reachable again within 20 ticks; standby link KPIs healthy`,
          due: this.sim.tick + 20,
          check: (sim) => sim.sitesBelow(plan.cause).length === 0,
          rollback: (sim) => sim.deactivateStandby(plan.target),
        };
      }
      if (plan.action === "CONFIG_ROLLBACK") {
        return {
          description: `Link ${plan.target} back to pre-change baseline within 20 ticks`,
          due: this.sim.tick + 20,
          check: (sim) => { const p = sim.probeLink(plan.target); return p && p.ab.up && p.ba.up; },
          rollback: () => ({ ok: true, note: "re-apply change, escalate to change owner" }),
        };
      }
      return null; // read-only actions carry no contract
    }

    execute(plan, diag) {
      const g = this.gate(plan, diag);
      const entry = { tick: this.sim.tick, plan, diag: { verdict: diag.verdict, confidence: diag.confidence, linkId: diag.linkId }, gate: g };
      entry.pid = (this._pidSeq = (this._pidSeq || 0) + 1);
      if (!g.allowed) {
        // correlate: one proposal per (action,target); new causes fold into it.
        // (otherwise an island outage spams N copies of the same reroute -
        // the alarm-storm problem reborn at the proposal layer)
        const dup = this.proposals.find(p => p.plan.action === plan.action && p.plan.target === plan.target);
        if (dup) {
          dup.covers = dup.covers || [dup.plan.cause || dup.diag.linkId];
          const c = plan.cause || diag.linkId;
          if (!dup.covers.includes(c)) { dup.covers.push(c); this.note("proposal", `Correlated: existing ${plan.action} proposal on ${plan.target} also covers ${c}`); }
          return { executed: false, proposed: true, gate: g, correlated: true };
        }
        this.proposals.push(entry);
        this.note("proposal", `${ACTIONS[plan.action].label} on ${plan.target} - PROPOSED (gate: ${g.checks.filter(c => !c.ok).map(c => c.name).join(", ") || "breaker"})`, { blast: g.blast });
        return { executed: false, proposed: true, gate: g };
      }
      // fire the typed call
      if (plan.action === "ACTIVATE_STANDBY") {
        const t = this.sim.links.find(x => x.id === plan.target);
        if (t && t.active) return { executed: false, skipped: "standby already active", gate: g };
        this.sim.activateStandby(plan.target);
      }
      if (plan.action === "CONFIG_ROLLBACK") this.note("action", `(sim) config rollback issued on ${plan.target}`);
      if (ACTIONS[plan.action].writes) this.autoActionTicks.push(this.sim.tick);
      const contract = this.verifyContractFor(plan);
      this.executed.push({ ...entry, contract, verified: null });
      this.note("action", `${ACTIONS[plan.action].label} on ${plan.target} - EXECUTED (blast ${g.blast}, conf ${diag.confidence})`);
      if (plan.also) this.note("action", `${ACTIONS[plan.also.action].label} on ${plan.also.target} - EXECUTED (companion, read-only)`);
      return { executed: true, gate: g };
    }

    // human approves a pending proposal (the HITL path)
    approve(pidOrIndex) {
      const idx = this.proposals.findIndex(p => p.pid === pidOrIndex);
      const p = this.proposals.splice(idx >= 0 ? idx : pidOrIndex, 1)[0];
      if (!p) return { ok: false };
      if (p.plan.action === "ACTIVATE_STANDBY") this.sim.activateStandby(p.plan.target);
      const contract = this.verifyContractFor(p.plan);
      this.executed.push({ ...p, contract, verified: null, approvedByHuman: true });
      this.note("action", `${ACTIONS[p.plan.action].label} on ${p.plan.target} - EXECUTED after human approval`);
      if (p.plan.also) this.note("action", `${ACTIONS[p.plan.also.action].label} on ${p.plan.also.target} - EXECUTED (companion carries the evidence pack)`);
      return { ok: true };
    }

    // called every tick: settle due verify contracts
    settleVerifications() {
      for (const e of this.executed) {
        if (!e.contract || e.verified !== null || this.sim.tick < e.contract.due) continue;
        const ok = e.contract.check(this.sim);
        e.verified = ok;
        if (ok) {
          this.note("verify", `VERIFIED: ${e.contract.description}`);
        } else {
          this.note("verify", `VERIFY FAILED: ${e.contract.description} - rolling back + escalating`);
          e.contract.rollback(this.sim);
          // an agent that keeps being wrong loses autonomy: failures feed the breaker
          this.autoActionTicks.push(this.sim.tick);
        }
      }
    }

    // one full loop pass: diagnose region -> plan -> gate -> act -> verify
    runOnce(diagnoseRegion) {
      const findings = diagnoseRegion(this.sim);
      const open = new Set(findings.map(f => f.linkId + "|" + f.verdict));
      // findings that cleared: resolve history (re-arms the loop for repeat
      // events) and withdraw stale proposals (a pending fix for a healthy
      // network is worse than none)
      for (const e of this.executed) {
        if (e.resolved || !e.diag) continue;
        const cleared = !open.has(e.diag.linkId + "|" + e.diag.verdict);
        const contractSettled = !e.contract || e.verified !== null;
        if (cleared && contractSettled) e.resolved = true;
      }
      this.proposals = this.proposals.filter(p => {
        const still = open.has(p.diag.linkId + "|" + p.diag.verdict);
        if (!still) this.note("proposal", `Withdrawn: ${ACTIONS[p.plan.action].label} on ${p.plan.target} - finding cleared`);
        return still;
      });
      const results = [];
      for (const d of findings) {
        const seen = [...this.executed, ...this.proposals].some(e => e.diag && !e.resolved && e.diag.linkId === d.linkId && e.diag.verdict === d.verdict);
        if (seen) continue;
        const plan = this.planFor(d);
        if (plan) results.push({ diag: d, plan, result: this.execute(plan, d) });
      }
      this.settleVerifications();
      if (this.executed.length > 120) this.executed.splice(0, this.executed.length - 120);
      if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
      return results;
    }
  }

  window.MWLoop = { Orchestrator, POLICY, ACTIONS };
})();
