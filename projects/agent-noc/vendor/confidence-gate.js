/**
 * The confidence gate: the whole safety design in one function.
 *
 * High confidence in the diagnosis AND a known-safe, reversible remediation ->
 * the loop closes itself. Anything novel, ambiguous, or risky -> escalate to a
 * human. Autonomy is earned per failure type, not switched on globally.
 */
export function confidenceGate(policy = {}) {
    const threshold = policy.autoActThreshold ?? 0.8;
    const autoAllow = new Set(policy.autoAllow ?? ["reroute", "pause"]);
    return (health, remediation) => {
        if (health.status === "healthy") {
            return { action: "allow", reason: "healthy" };
        }
        if (health.confidence >= threshold && autoAllow.has(remediation.kind)) {
            return {
                action: "auto_remediate",
                remediation,
                reason: `confidence ${health.confidence.toFixed(2)} >= ${threshold} and ${remediation.kind} is auto-allowed`,
            };
        }
        const why = health.confidence < threshold
            ? `confidence ${health.confidence.toFixed(2)} < ${threshold}`
            : `${remediation.kind} is not in the auto-allow list`;
        return { action: "escalate", remediation, reason: why };
    };
}
