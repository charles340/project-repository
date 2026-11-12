"use client";

import { useEffect, useMemo, useState } from "react";

type StructureName = "stack" | "queue" | "linked-list";
type Operation = {
  action: string;
  label: string;
  needsValue?: boolean;
  primary?: boolean;
};
type LabState = {
  structure: StructureName;
  label: string;
  message: string;
  items: string[];
  size: number;
  capacity: number;
  memoryBytes: number;
  allocations: number;
  frees: number;
  highWaterMark: number;
};

const apiBase = "http://localhost:8091";
const structureInfo: Record<
  StructureName,
  {
    title: string;
    category: string;
    description: string;
    complexity: string;
    storage: string;
    tip: string;
    order: string;
    actions: Operation[];
  }
> = {
  stack: {
    title: "Stack",
    category: "LIFO · FIXED ARRAY",
    description:
      "Last in, first out. Add to the top and remove from the same end.",
    complexity: "Push and pop: O(1)",
    storage: "A bounded array in a struct",
    tip: "The top is the last array item. Pushing grows the count; popping shrinks it.",
    order: "Bottom to top",
    actions: [
      { action: "push", label: "Push to top", needsValue: true, primary: true },
      { action: "pop", label: "Pop top" },
      { action: "peek", label: "Peek at top" },
    ],
  },
  queue: {
    title: "Queue",
    category: "FIFO · CIRCULAR BUFFER",
    description:
      "First in, first out. New values join the back; removals happen at the front.",
    complexity: "Enqueue and dequeue: O(1)",
    storage: "A circular array with head and count",
    tip: "The head moves forward as items leave. Modulo arithmetic wraps it to the start.",
    order: "Front to back",
    actions: [
      { action: "enqueue", label: "Add to back", needsValue: true, primary: true },
      { action: "dequeue", label: "Remove front" },
      { action: "front", label: "Inspect front" },
    ],
  },
  "linked-list": {
    title: "Linked list",
    category: "POINTERS · DYNAMIC NODES",
    description:
      "Each node stores a value and a pointer to the next node in the chain.",
    complexity: "Append: O(1) · Find and remove: O(n)",
    storage: "Nodes allocated and released with malloc/free",
    tip: "Follow next pointers from the head. Removing a node reconnects its neighbors, then frees its memory.",
    order: "Head to tail",
    actions: [
      { action: "append", label: "Append value", needsValue: true, primary: true },
      { action: "find", label: "Find value", needsValue: true },
      { action: "remove", label: "Remove first match", needsValue: true },
    ],
  },
};

function isStructure(value: unknown): value is StructureName {
  return value === "stack" || value === "queue" || value === "linked-list";
}

function isLabState(value: unknown): value is LabState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    isStructure(state.structure) &&
    typeof state.label === "string" &&
    typeof state.message === "string" &&
    Array.isArray(state.items) &&
    state.items.every((item) => typeof item === "string") &&
    Number.isInteger(state.size) &&
    Number.isInteger(state.capacity) &&
    Number.isInteger(state.memoryBytes) &&
    Number.isInteger(state.allocations) &&
    Number.isInteger(state.frees) &&
    Number.isInteger(state.highWaterMark)
  );
}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, options);
  } catch {
    throw new Error("Could not reach the C server at localhost:8091.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : null;
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `The C server returned ${response.status}.`,
    );
  }
  return data;
}

async function connectToStructure(structure: StructureName) {
  await request("/health");
  const state = await request(
    `/api/state?structure=${encodeURIComponent(structure)}`,
  );
  if (!isLabState(state)) {
    throw new Error("The C server returned an unexpected structure state.");
  }
  return state;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function CDataStructuresDemo() {
  const [structure, setStructure] = useState<StructureName>("stack");
  const [state, setState] = useState<LabState | null>(null);
  const [status, setStatus] = useState<"connecting" | "online" | "offline">(
    "connecting",
  );
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Choose an operation to begin.");
  const [activity, setActivity] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const definition = structureInfo[structure];
  const isDisabled = busy || status !== "online";

  useEffect(() => {
    let active = true;
    connectToStructure(structure)
      .then((nextState) => {
        if (!active) return;
        setState(nextState);
        setStatus("online");
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setStatus("offline");
        setError(errorText(requestError));
      });
    return () => {
      active = false;
    };
  }, [retry, structure]);

  const visualItems = useMemo(() => {
    if (!state) return [];
    return state.structure === "stack" ? [...state.items].reverse() : state.items;
  }, [state]);

  async function runOperation(operation: Operation) {
    const cleanValue = value.trim();
    if (
      operation.needsValue &&
      (!/^[\x20-\x7e]{1,24}$/.test(cleanValue) || !cleanValue)
    ) {
      setError("Enter 1 to 24 printable ASCII characters.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const body: { structure: StructureName; action: string; value?: string } = {
        structure,
        action: operation.action,
      };
      if (operation.needsValue) body.value = cleanValue;
      const nextState = await request("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!isLabState(nextState)) {
        throw new Error("The C server returned an unexpected structure state.");
      }
      setState(nextState);
      setStatus("online");
      setMessage(nextState.message);
      setActivity((items) => [nextState.message, ...items].slice(0, 5));
      if (["push", "enqueue", "append"].includes(operation.action)) {
        setValue("");
      }
    } catch (requestError) {
      const text = errorText(requestError);
      setError(text);
      if (text.includes("Could not reach")) setStatus("offline");
    } finally {
      setBusy(false);
    }
  }

  function renderItems() {
    if (!state || state.items.length === 0) {
      return <p className="c-lab-empty">This structure is empty. Add a value to begin.</p>;
    }

    return visualItems.map((item, index) => {
      const isStackTop = structure === "stack" && index === 0;
      const label =
        structure === "stack"
          ? isStackTop
            ? "TOP"
            : `ITEM ${state.size - index}`
          : structure === "queue"
            ? index === 0
              ? "FRONT"
              : index === state.items.length - 1
                ? "BACK"
                : `ITEM ${index + 1}`
            : index === 0
              ? "HEAD"
              : index === state.items.length - 1
                ? "TAIL"
                : `NODE ${index + 1}`;
      return (
        <div className="c-lab-visual-group" key={`${index}-${item}`}>
          {structure !== "stack" && index > 0 && (
            <span className="c-lab-arrow" aria-hidden="true">
              →
            </span>
          )}
          <div className="c-lab-node">
            <strong>{item}</strong>
            <span>{label}</span>
          </div>
        </div>
      );
    });
  }

  return (
    <section className="c-structures-demo" aria-labelledby="c-lab-title">
      <header className="c-lab-header">
        <div>
          <p className="c-lab-eyebrow">C17 · POINTERS · MEMORY</p>
          <h2 id="c-lab-title">C Data Structures Lab</h2>
          <p>
            I built this lab to let me try a stack, queue, and linked list, then
            see how each one handles values and memory.
          </p>
        </div>
        <div className={`c-lab-status is-${status}`} role="status">
          <span />
          {status === "online"
            ? "C server connected"
            : status === "connecting"
              ? "Connecting"
              : "C server offline"}
        </div>
      </header>

      {status === "offline" && (
        <div className="c-lab-offline" role="alert">
          <div>
            <strong>Start the C server to play.</strong>
            <p>{error}</p>
            <code>
              cmake -S . -B build
              <br />
              cmake --build build --config Release
              <br />
              .\build\Release\c-data-structures-lab.exe
            </code>
            <span>Run those commands from the <code>c-data-structures-lab</code> folder.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatus("connecting");
              setRetry((current) => current + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      <div className="c-lab-layout">
        <aside className="c-lab-lesson">
          <p className="c-lab-kicker">CHOOSE A STRUCTURE</p>
          <label htmlFor="c-lab-select">Data structure</label>
          <select
            disabled={status !== "online" || busy}
            id="c-lab-select"
            onChange={(event) => {
              const nextStructure = event.target.value;
              if (!isStructure(nextStructure)) return;
              setStructure(nextStructure);
              setStatus("connecting");
              setMessage("Loading this structure...");
            }}
            value={structure}
          >
            <option value="stack">Stack</option>
            <option value="queue">Queue</option>
            <option value="linked-list">Linked list</option>
          </select>

          <div className="c-lab-lesson-copy">
            <span>{definition.category}</span>
            <h3>{definition.title}</h3>
            <p>{definition.description}</p>
          </div>
          <div className="c-lab-lesson-fact">
            <span>Typical operations</span>
            <strong>{definition.complexity}</strong>
          </div>
          <div className="c-lab-lesson-fact">
            <span>How C stores it</span>
            <strong>{definition.storage}</strong>
          </div>
          <p className="c-lab-tip">{definition.tip}</p>
        </aside>

        <section className="c-lab-workbench" aria-labelledby="c-lab-workbench-title">
          <div className="c-lab-workbench-heading">
            <div>
              <p className="c-lab-kicker">LIVE PLAYGROUND</p>
              <h3 id="c-lab-workbench-title">Your {definition.title.toLowerCase()}</h3>
            </div>
            <button
              className="c-lab-reset"
              disabled={isDisabled}
              onClick={() => void runOperation({ action: "reset" })}
              type="button"
            >
              Reset
            </button>
          </div>

          <div className="c-lab-metrics" aria-label="Structure statistics">
            <div><span>Items</span><strong>{state?.size ?? 0}</strong></div>
            <div><span>Capacity</span><strong>{state?.capacity ?? 16}</strong></div>
            <div>
              <span>Storage estimate</span>
              <strong>{(state?.memoryBytes ?? 0).toLocaleString()} <small>bytes</small></strong>
            </div>
          </div>

          <div className="c-lab-memory-strip">
            <span>
              {structure === "linked-list"
                ? "Each list item is a separate C node."
                : "This structure uses fixed storage in the C server."}
            </span>
            <span>High-water mark: {state?.highWaterMark ?? 0}</span>
          </div>

          <form
            className="c-lab-controls"
            onSubmit={(event) => {
              event.preventDefault();
              const primary = definition.actions.find((action) => action.primary);
              if (primary) void runOperation(primary);
            }}
          >
            <label htmlFor="c-lab-value">
              Value <span>1-24 printable ASCII characters</span>
            </label>
            <input
              disabled={isDisabled}
              id="c-lab-value"
              maxLength={24}
              onChange={(event) => setValue(event.target.value)}
              placeholder="e.g. backup"
              value={value}
            />
            <div className="c-lab-actions">
              {definition.actions.map((action) => (
                <button
                  className={action.primary ? "is-primary" : ""}
                  disabled={isDisabled}
                  key={action.action}
                  onClick={() => void runOperation(action)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </form>

          <p className={`c-lab-message${error ? " is-error" : ""}`} role="status">
            {error || message}
          </p>
          <div className="c-lab-visual-heading">
            <span>MEMORY VIEW</span>
            <span>{definition.order}</span>
          </div>
          <div
            className={`c-lab-visualization is-${structure}`}
            aria-label={`${definition.title} items`}
          >
            {renderItems()}
          </div>

          {structure === "linked-list" && (
            <div className="c-lab-node-stats">
              <span>Node allocations <strong>{state?.allocations ?? 0}</strong></span>
              <span>Nodes freed <strong>{state?.frees ?? 0}</strong></span>
            </div>
          )}
        </section>
      </div>

      <section className="c-lab-activity" aria-labelledby="c-lab-activity-title">
        <div>
          <p className="c-lab-kicker">YOUR SESSION</p>
          <h3 id="c-lab-activity-title">Recent operations</h3>
        </div>
        <ul>
          {(activity.length ? activity : ["Your operations will show up here."]).map(
            (item, index) => <li key={`${index}-${item}`}>{item}</li>,
          )}
        </ul>
      </section>
    </section>
  );
}
