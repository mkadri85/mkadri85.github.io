/**
 * The signal plane. Records one replayable event per agent decision and lets you
 * replay an agent's full history or query a recent window. In-memory ring buffer
 * by default; hand it a sink to also ship events somewhere durable.
 */
export class SignalPlane {
    events = [];
    capacity;
    sink;
    constructor(opts = {}) {
        this.capacity = opts.capacity ?? 10_000;
        this.sink = opts.sink;
    }
    /** Record a decision. Trims the oldest event once capacity is reached. */
    record(event) {
        this.events.push(event);
        if (this.events.length > this.capacity)
            this.events.shift();
        this.sink?.write(event);
    }
    /** Every recorded decision for one agent, oldest first. */
    replay(agentId) {
        return this.events.filter((e) => e.agentId === agentId);
    }
    /** Events for one agent within the last `windowMs` relative to `now`. */
    recent(agentId, windowMs, now) {
        return this.events.filter((e) => e.agentId === agentId && now - e.ts <= windowMs);
    }
    /** All events across every agent (read-only). */
    all() {
        return this.events;
    }
}
