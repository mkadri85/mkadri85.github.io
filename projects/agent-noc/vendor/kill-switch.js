/**
 * A global and per-agent kill switch. Build the off switch before you need it,
 * not during the outage. When tripped, the control plane blocks the agent's
 * next action outright, no deploy required.
 */
export class KillSwitch {
    globalTripped = false;
    tripped = new Set();
    listeners = [];
    /** Trip the switch. Default scope is the whole fleet. */
    trip(scope = "global") {
        if (scope === "global")
            this.globalTripped = true;
        else
            this.tripped.add(scope);
        for (const l of this.listeners)
            l(scope);
    }
    /** Reset the switch. Default scope is the whole fleet. */
    reset(scope = "global") {
        if (scope === "global")
            this.globalTripped = false;
        else
            this.tripped.delete(scope);
    }
    /** Is this agent (or the whole fleet) currently stopped. */
    isTripped(agentId) {
        if (this.globalTripped)
            return true;
        return agentId ? this.tripped.has(agentId) : false;
    }
    /** Notified whenever the switch is tripped. */
    onTrip(fn) {
        this.listeners.push(fn);
    }
}
