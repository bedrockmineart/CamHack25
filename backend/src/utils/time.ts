// High-resolution server epoch utilities using process.hrtime.bigint()
// Provides nanosecond-precision server epoch timestamps.

let epochOffsetNs: bigint | null = null;

/**
 * Initialize the mapping between process.hrtime.bigint() and UNIX epoch in nanoseconds.
 * Call once at process startup.
 */
export function initTime() {
    epochOffsetNs = BigInt(Date.now()) * 1_000_000n - process.hrtime.bigint();
}

/**
 * Returns current server epoch in nanoseconds (BigInt).
 * Ensures initTime() has been called.
 */
export function nowNs(): bigint {
    if (epochOffsetNs === null) initTime();
    return process.hrtime.bigint() + (epochOffsetNs as bigint);
}

/**
 * Convert nanoseconds BigInt to milliseconds as a float (may lose sub-ns precision).
 */
export function nsToMsFloat(ns: bigint): number {
    return Number(ns) / 1_000_000;
}

/**
 * Convert nanoseconds BigInt to ISO timestamp string (UTC) with millisecond precision.
 */
export function nsToISOString(ns: bigint): string {
    const ms = Number(ns / 1_000_000n);
    return new Date(ms).toISOString();
}