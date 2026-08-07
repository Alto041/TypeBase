export type AiAutocorrectTelemetry = {
  preflightRequests: number;
  preflightAccepted: number;
  staleResults: number;
  lastPreflightMs: number | null;
  p50PreflightMs: number | null;
};

const latencies: number[] = [];
let preflightRequests = 0;
let preflightAccepted = 0;
let staleResults = 0;

export function recordAiPreflightRequest(): void {
  preflightRequests += 1;
}

export function recordAiPreflightResult(
  latencyMs: number,
  accepted: boolean,
): void {
  latencies.push(Math.max(0, Math.round(latencyMs)));
  if (latencies.length > 100) {
    latencies.shift();
  }
  if (accepted) {
    preflightAccepted += 1;
  }
}

export function recordAiPreflightStale(): void {
  staleResults += 1;
}

export function getAiAutocorrectTelemetry(): AiAutocorrectTelemetry {
  if (latencies.length === 0) {
    return {
      preflightRequests,
      preflightAccepted,
      staleResults,
      lastPreflightMs: null,
      p50PreflightMs: null,
    };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    preflightRequests,
    preflightAccepted,
    staleResults,
    lastPreflightMs: latencies[latencies.length - 1]!,
    p50PreflightMs: sorted[Math.floor((sorted.length - 1) * 0.5)]!,
  };
}
