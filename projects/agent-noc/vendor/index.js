export { SignalPlane } from "./signal-plane.js";
export { KillSwitch } from "./kill-switch.js";
export { confidenceGate } from "./confidence-gate.js";
export { loopDetector, costRunawayDetector, errorRateDetector, driftDetector } from "./detector.js";
export { BurnRateMonitor, burnRateDetector } from "./burn-rate.js";
export { ControlPlane } from "./control-plane.js";
import { ControlPlane } from "./control-plane.js";
/** Convenience factory. `const plane = controlPlane({ ... })`. */
export function controlPlane(cfg) {
    return new ControlPlane(cfg);
}
