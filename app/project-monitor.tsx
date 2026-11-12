"use client";

import { useEffect, useState } from "react";

type HealthState =
  | { kind: "checking" }
  | { kind: "healthy"; timestamp?: string }
  | { kind: "unhealthy"; serviceStatus: string }
  | { kind: "error"; message: string };

function isHealthPayload(value: unknown): value is { status: string; timestamp?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof value.status === "string"
  );
}

export default function ProjectMonitor() {
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      setHealth({ kind: "checking" });

      try {
        const response = await fetch("http://localhost:8080/health", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Health check returned HTTP ${response.status}.`);
        }

        const payload: unknown = await response.json();
        if (!isHealthPayload(payload)) {
          throw new Error("The health endpoint returned an unexpected response.");
        }

        if (payload.status === "healthy") {
          setHealth({ kind: "healthy", timestamp: payload.timestamp });
        } else {
          setHealth({ kind: "unhealthy", serviceStatus: payload.status });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setHealth({
          kind: "error",
          message: error instanceof Error ? error.message : "The health check failed.",
        });
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, [attempt]);

  const badgeLabel =
    health.kind === "checking"
      ? "Checking"
      : health.kind === "healthy"
        ? "Healthy"
        : health.kind === "unhealthy"
          ? "Unhealthy"
          : "API is down";

  return (
    <div className="health-dashboard">
      <div className="health-dashboard-inner">
        <p className="eyebrow">
          <span className="eyebrow-mark" aria-hidden="true" />
          DevOps Dashboard
        </p>
        <h2>API Health Monitor</h2>
        <p className="health-dashboard-copy">
          A live check of the backend service used by this project.
        </p>

        <section className="health-card" aria-live="polite">
          <div className="health-card-top">
            <div>
              <span>Backend service</span>
              <strong>
                {health.kind === "healthy"
                  ? "Service is responding"
                  : health.kind === "unhealthy"
                    ? `Service status: ${health.serviceStatus}`
                    : health.kind === "error"
                      ? "Unable to reach the API"
                      : "Checking service..."}
              </strong>
            </div>
            <span
              className={`health-badge${health.kind === "healthy" ? " health-badge--healthy" : ""}${health.kind === "error" || health.kind === "unhealthy" ? " health-badge--error" : ""}`}
            >
              {badgeLabel}
            </span>
          </div>

          <p className="health-endpoint">GET http://localhost:8080/health</p>

          {health.kind === "error" && (
            <p className="health-message">
              {health.message} Start the project&apos;s backend on port 8080 and try again.
            </p>
          )}
          {health.kind === "unhealthy" && (
            <p className="health-message">
              The API responded, but did not report a healthy status.
            </p>
          )}

          <div className="health-actions">
            <button
              className="health-retry"
              type="button"
              disabled={health.kind === "checking"}
              onClick={() => setAttempt((current) => current + 1)}
            >
              {health.kind === "checking" ? "Checking..." : "Check again"}
            </button>
            {health.kind === "healthy" && health.timestamp && (
              <span className="health-timestamp">
                Last response: {new Date(health.timestamp).toLocaleString()}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
