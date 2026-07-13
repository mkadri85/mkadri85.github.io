/**
 * Per-agent trailing-baseline burn-rate breaker: alarm on the derivative, not
 * the level. Each agent is compared to its OWN history; when its current
 * failure rate burns past its baseline (or past an absolute ceiling), the
 * agent is latched into "propose_only" until cooldown or manual reset.
 *
 * Poisoning guards, so a degrading agent cannot teach the baseline that
 * failure is normal:
 *  - learning freezes while burn rate exceeds `freezeLearningAbove`
 *  - the baseline learns improvement fast and degradation slowly
 *    (asymmetric EWMA half-life)
 *  - `absoluteCeiling` is a level backstop that catches the slow boil the
 *    ratio can never see
 *
 * Clock discipline matches SignalPlane: learning uses event.ts, reads take
 * `now` as a parameter. Never calls Date.now(). Zero dependencies, no Node
 * APIs, runs in the browser.
 */
export class BurnRateMonitor {
    agents = new Map();
    demoteListeners = [];
    promoteListeners = [];
    tripRatio;
    currentWindowMs;
    baselineHalfLifeMs;
    minCurrentSamples;
    minBaselineSamples;
    baselineFloor;
    absoluteCeiling;
    freezeLearningAbove;
    cooldownMs;
    constructor(opts = {}) {
        this.tripRatio = opts.tripRatio ?? 2;
        this.currentWindowMs = opts.currentWindowMs ?? 60_000;
        this.baselineHalfLifeMs = opts.baselineHalfLifeMs ?? 30 * 60_000;
        this.minCurrentSamples = opts.minCurrentSamples ?? 8;
        this.minBaselineSamples = opts.minBaselineSamples ?? 30;
        this.baselineFloor = opts.baselineFloor ?? 0.02;
        this.absoluteCeiling = opts.absoluteCeiling ?? 0.6;
        this.freezeLearningAbove = opts.freezeLearningAbove ?? 1.25;
        this.cooldownMs = opts.cooldownMs;
    }
    /** Feed one event. Uses event.ts as the clock; never Date.now(). */
    record(event) {
        const s = this.state(event.agentId);
        const dt = s.baselineSamples === 0 ? this.baselineHalfLifeMs : Math.max(0, event.ts - s.lastTs);
        s.lastTs = Math.max(s.lastTs, event.ts);
        // current window first, so the freeze guard sees the incident forming
        s.window.push({ ts: event.ts, ok: event.ok });
        this.trim(s, event.ts);
        const { current, burnRate } = this.rates(s);
        const frozen = burnRate !== null && burnRate > this.freezeLearningAbove;
        if (!frozen) {
            const value = event.ok ? 0 : 1;
            let alpha;
            if (s.baselineSamples < this.minBaselineSamples) {
                // warm-up: plain running mean, so early ordering cannot skew the start
                alpha = 1 / (s.baselineSamples + 1);
            }
            else {
                // asymmetric EWMA: improvements are learned fast, degradation slowly
                const halfLife = value < s.baseline ? this.baselineHalfLifeMs / 6 : this.baselineHalfLifeMs;
                alpha = 1 - Math.pow(0.5, dt / halfLife);
            }
            s.baseline = s.baseline + alpha * (value - s.baseline);
            s.baselineSamples += 1;
        }
        this.evaluate(event.agentId, s, current, burnRate, event.ts);
    }
    /** Current picture for one agent. Pure read; pass the clock in. */
    snapshot(agentId, now) {
        const s = this.state(agentId);
        this.trim(s, now);
        const { current, burnRate } = this.rates(s);
        this.maybePromote(agentId, s, burnRate, now);
        return {
            agentId,
            baseline: s.baseline,
            current,
            burnRate,
            samples: { baseline: s.baselineSamples, current: s.window.length },
            mode: s.mode,
            ...(s.demotedAt !== undefined ? { demotedAt: s.demotedAt } : {}),
            ...(s.reason !== undefined ? { reason: s.reason } : {}),
        };
    }
    /** Fleet-level aggregated view: one snapshot per known agent. */
    fleet(now) {
        return [...this.agents.keys()].map((id) => this.snapshot(id, now));
    }
    mode(agentId) {
        return this.agents.get(agentId)?.mode ?? "active";
    }
    /** Manual demote, mirroring KillSwitch.trip. */
    demote(agentId, reason = "manually demoted", now) {
        const s = this.state(agentId);
        if (s.mode === "propose_only")
            return;
        s.mode = "propose_only";
        s.demotedAt = now ?? s.lastTs;
        s.reason = reason;
        const snap = this.snapshot(agentId, s.demotedAt);
        for (const l of this.demoteListeners)
            l(snap);
    }
    /** Manual reset back to active, mirroring KillSwitch.reset. */
    reset(agentId) {
        const s = this.state(agentId);
        if (s.mode === "active")
            return;
        s.mode = "active";
        delete s.demotedAt;
        delete s.reason;
        for (const l of this.promoteListeners)
            l(agentId);
    }
    onDemote(fn) {
        this.demoteListeners.push(fn);
    }
    onPromote(fn) {
        this.promoteListeners.push(fn);
    }
    // ---- internals ----
    state(agentId) {
        let s = this.agents.get(agentId);
        if (!s) {
            s = { baseline: 0, baselineSamples: 0, lastTs: 0, window: [], mode: "active" };
            this.agents.set(agentId, s);
        }
        return s;
    }
    trim(s, now) {
        while (s.window.length > 0 && now - s.window[0].ts > this.currentWindowMs) {
            s.window.shift();
        }
    }
    rates(s) {
        if (s.window.length < this.minCurrentSamples)
            return { current: null, burnRate: null };
        const failures = s.window.filter((e) => !e.ok).length;
        const current = failures / s.window.length;
        if (s.baselineSamples < this.minBaselineSamples)
            return { current, burnRate: null };
        const burnRate = current / Math.max(s.baseline, this.baselineFloor);
        return { current, burnRate };
    }
    evaluate(agentId, s, current, burnRate, now) {
        if (s.mode === "propose_only") {
            this.maybePromote(agentId, s, burnRate, now);
            return;
        }
        if (current === null)
            return;
        // level backstop applies even during baseline cold start
        if (current >= this.absoluteCeiling) {
            this.latch(agentId, s, now, `failure rate ${(current * 100).toFixed(0)}% >= ceiling ${(this.absoluteCeiling * 100).toFixed(0)}%`);
            return;
        }
        if (burnRate !== null && burnRate >= this.tripRatio) {
            this.latch(agentId, s, now, `burn rate ${burnRate.toFixed(1)}x own baseline (${(s.baseline * 100).toFixed(1)}% -> ${(current * 100).toFixed(0)}%)`);
        }
    }
    latch(agentId, s, now, reason) {
        s.mode = "propose_only";
        s.demotedAt = now;
        s.reason = reason;
        const snap = {
            agentId,
            baseline: s.baseline,
            current: this.rates(s).current,
            burnRate: this.rates(s).burnRate,
            samples: { baseline: s.baselineSamples, current: s.window.length },
            mode: s.mode,
            demotedAt: now,
            reason,
        };
        for (const l of this.demoteListeners)
            l(snap);
    }
    maybePromote(agentId, s, burnRate, now) {
        if (s.mode !== "propose_only" || this.cooldownMs === undefined || s.demotedAt === undefined)
            return;
        if (now - s.demotedAt < this.cooldownMs)
            return;
        if (burnRate !== null && burnRate >= 1)
            return; // still burning; wait
        s.mode = "active";
        delete s.demotedAt;
        delete s.reason;
        for (const l of this.promoteListeners)
            l(agentId);
    }
}
/**
 * Wraps a BurnRateMonitor as a standard Detector so it composes with the rest
 * of the reasoning stack. Read-only view: feed the monitor via record();
 * the adapter only reads the latch, keyed off the last event in the window.
 */
export function burnRateDetector(monitor) {
    return (events) => {
        const last = events[events.length - 1];
        if (!last)
            return null;
        const snap = monitor.snapshot(last.agentId, last.ts);
        if (snap.mode === "propose_only") {
            return {
                status: "failing",
                confidence: 0.9,
                reason: snap.reason ?? "burn-rate breaker latched: propose-only",
            };
        }
        return null;
    };
}
