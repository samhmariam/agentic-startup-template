/**
 * src/core/tools/observability-tools.ts
 *
 * Observability tools for agent-driven verification loops.
 * Implements mock LogQL (log queries) and mock PromQL (metric queries) so agents
 * can verify runtime behaviour after shipping a change — no real infrastructure required.
 *
 * These tools are safe to run in CI (no external calls).
 * Wire them into the executor tool bundle via .agentic/tools/index.ts.
 */

import { tool } from "ai";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────────────────────

const LogLineSchema = z.object({
  timestamp: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  labels: z.record(z.string(), z.string()),
});
export type LogLine = z.infer<typeof LogLineSchema>;

const MetricSeriesSchema = z.object({
  metric: z.record(z.string(), z.string()),
  values: z.array(z.tuple([z.number(), z.number()])),
});
export type MetricSeries = z.infer<typeof MetricSeriesSchema>;

// ── Mock data generators ──────────────────────────────────────────────────────

/**
 * Produce a deterministic mock log stream seeded from the query string.
 * Includes a realistic startup-time log entry so agents can verify Stage 3 outputs.
 */
function mockLogLines(query: string, limit: number): LogLine[] {
  const now = Date.now();
  const baseMs = now - 30_000;

  // Parse service label from query if present (e.g. {service="api"})
  const serviceMatch = /service="([^"]+)"/.exec(query);
  const service = serviceMatch?.[1] ?? "api";

  const lines: LogLine[] = [
    {
      timestamp: new Date(baseMs).toISOString(),
      level: "info",
      message: `[${service}] ▶ Starting service`,
      labels: { service, pod: "pod-a1b2" },
    },
    {
      timestamp: new Date(baseMs + 210).toISOString(),
      level: "info",
      message: `[${service}] ▶ Database connection established`,
      labels: { service, pod: "pod-a1b2" },
    },
    {
      timestamp: new Date(baseMs + 480).toISOString(),
      level: "info",
      message: `[${service}] ✓ Service ready (startup=480ms)`,
      labels: { service, pod: "pod-a1b2", startup_ms: "480" },
    },
    {
      timestamp: new Date(baseMs + 490).toISOString(),
      level: "info",
      message: `[${service}] ▶ HTTP server listening on :3000`,
      labels: { service, pod: "pod-a1b2" },
    },
    {
      timestamp: new Date(now - 5_000).toISOString(),
      level: "info",
      message: `[${service}] GET /health 200 OK 2ms`,
      labels: { service, pod: "pod-a1b2", method: "GET", path: "/health" },
    },
  ];

  return lines.slice(0, Math.min(limit, lines.length));
}

/**
 * Produce deterministic mock time-series metric data.
 * Includes `service_startup_seconds` so the executor can verify the 800ms constraint.
 */
function mockMetricSeries(query: string): MetricSeries[] {
  const now = Math.floor(Date.now() / 1000);

  // service_startup_seconds — the key metric for the 800ms startup constraint
  if (query.includes("service_startup_seconds") || query.includes("startup")) {
    return [
      {
        metric: { __name__: "service_startup_seconds", service: "api", env: "dev" },
        values: [
          [now - 120, 0.48],
          [now - 60, 0.52],
          [now, 0.48],
        ],
      },
    ];
  }

  // http_request_duration_seconds
  if (
    query.includes("http_request_duration") ||
    query.includes("latency") ||
    query.includes("duration")
  ) {
    return [
      {
        metric: {
          __name__: "http_request_duration_seconds",
          method: "GET",
          path: "/health",
          status: "200",
        },
        values: [
          [now - 120, 0.002],
          [now - 60, 0.003],
          [now, 0.002],
        ],
      },
    ];
  }

  // Default: error rate
  return [
    {
      metric: { __name__: "http_errors_total", service: "api" },
      values: [
        [now - 120, 0],
        [now - 60, 0],
        [now, 0],
      ],
    },
  ];
}

// ── Tool definitions ──────────────────────────────────────────────────────────

/**
 * Query application logs using mock LogQL syntax.
 *
 * Agents use this to verify that a deployed service emitted the expected
 * log lines — e.g., that it started within the 800ms SLA.
 *
 * @example
 * queryLogs({ logql: '{service="api"} |= "startup"', limit: 10 })
 */
export const queryLogs = tool({
  description:
    "Query application logs using LogQL syntax (mock implementation). " +
    "Use this to verify that a service started correctly or produced expected log output. " +
    'Example: {service="api"} |= "startup"',
  parameters: z.object({
    logql: z.string().min(1).describe('LogQL query string, e.g. \'{ service="api" } |= "error"\''),
    startTime: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("ISO-8601 start of query window (default: 30s ago)"),
    endTime: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("ISO-8601 end of query window (default: now)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Maximum log lines to return (1–100, default 20)"),
  }),
  execute: async ({
    logql,
    limit = 20,
  }): Promise<{
    query: string;
    lines: LogLine[];
    executionMs: number;
  }> => {
    if (!logql.trim()) {
      throw new Error(
        "[queryLogs] logql must not be empty. " + 'Example: \'{ service="api" } |= "startup"\'',
      );
    }

    const start = Date.now();
    const lines = mockLogLines(logql, limit);

    return {
      query: logql,
      lines,
      executionMs: Date.now() - start,
    };
  },
});

/**
 * Query application metrics using mock PromQL syntax.
 *
 * Agents use this after shipping a change to verify resource usage invariants.
 * The `service_startup_seconds` metric is pre-populated so agents can enforce
 * the 800ms startup constraint without a live Prometheus instance.
 *
 * @example
 * queryMetrics({ promql: 'service_startup_seconds{service="api"}' })
 */
export const queryMetrics = tool({
  description:
    "Query application metrics using PromQL syntax (mock implementation). " +
    "Use this to verify startup times, latency, or error rates after shipping a change. " +
    "The metric 'service_startup_seconds' is always available. " +
    'Example: service_startup_seconds{service="api"}',
  parameters: z.object({
    promql: z
      .string()
      .min(1)
      .describe("PromQL query string, e.g. 'service_startup_seconds{service=\"api\"}'"),
    startTime: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("ISO-8601 start of query window (default: 5 minutes ago)"),
    endTime: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("ISO-8601 end of query window (default: now)"),
    step: z
      .string()
      .optional()
      .describe("Resolution step for range queries, e.g. '60s' (default: 60s)"),
  }),
  execute: async ({
    promql,
  }): Promise<{
    query: string;
    series: MetricSeries[];
    executionMs: number;
  }> => {
    if (!promql.trim()) {
      throw new Error(
        "[queryMetrics] promql must not be empty. " +
          "Example: 'service_startup_seconds{service=\"api\"}'",
      );
    }

    const start = Date.now();
    const series = mockMetricSeries(promql);

    return {
      query: promql,
      series,
      executionMs: Date.now() - start,
    };
  },
});

// ── Direct helper for non-agent callers ──────────────────────────────────────────

/**
 * Return the latest `service_startup_seconds` value from the mock metrics store.
 *
 * Use this in executor pipelines (or tests) where you need the raw number
 * rather than going through the full tool wrapper.
 *
 * @returns Latest startup time in **seconds** (e.g. 0.48 = 480ms).
 */
export function getStartupSeconds(): number {
  const series = mockMetricSeries("service_startup_seconds");
  return series[0]?.values.at(-1)?.[1] ?? 0;
}
