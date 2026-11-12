"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type TaskPriority = "low" | "normal" | "high";
type TaskFilter = "all" | "open" | "upcoming" | "overdue" | "done";

type Task = {
  id: number;
  title: string;
  dueDate: string;
  priority: TaskPriority;
  completed: boolean;
};

const apiBase = "http://localhost:8080";
const filters: { id: TaskFilter; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "open", label: "Open" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "done", label: "Completed" },
];

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") {
    return false;
  }
  const task = value as Record<string, unknown>;
  return (
    Number.isInteger(task.id) &&
    Number(task.id) > 0 &&
    typeof task.title === "string" &&
    typeof task.dueDate === "string" &&
    (task.priority === "low" ||
      task.priority === "normal" ||
      task.priority === "high") &&
    typeof task.completed === "boolean"
  );
}

function todayAsIsoDate() {
  const now = new Date();
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 10);
}

function displayDate(date: string) {
  if (!date) {
    return "No due date";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function isVisible(task: Task, filter: TaskFilter, today: string) {
  if (filter === "all") return true;
  if (filter === "done") return task.completed;
  if (filter === "open") return !task.completed;
  if (filter === "overdue") {
    return !task.completed && Boolean(task.dueDate) && task.dueDate < today;
  }
  return !task.completed && Boolean(task.dueDate) && task.dueDate > today;
}

function dueDateLabel(task: Task, today: string) {
  if (!task.dueDate) {
    return "No due date";
  }
  if (!task.completed && task.dueDate < today) {
    return `Overdue · ${displayDate(task.dueDate)}`;
  }
  if (!task.completed && task.dueDate === today) {
    return "Due today";
  }
  return `Due ${displayDate(task.dueDate)}`;
}

async function loadTaskList(): Promise<Task[]> {
  const response = await fetch(`${apiBase}/api/tasks`);
  if (!response.ok) {
    throw new Error(`The API returned ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every(isTask)) {
    throw new Error("The API returned an unexpected task list.");
  }
  return data;
}

function requestErrorMessage(requestError: unknown) {
  return requestError instanceof Error
    ? requestError.message
    : "Could not reach the maintenance API.";
}

export default function TaskApiDemo() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [status, setStatus] = useState<"connecting" | "online" | "offline">(
    "connecting",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = todayAsIsoDate();

  const refreshTasks = useCallback(async () => {
    try {
      setTasks(await loadTaskList());
      setError("");
      setStatus("online");
    } catch (requestError) {
      setStatus("offline");
      setError(requestErrorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadTaskList()
      .then((data) => {
        if (!active) return;
        setTasks(data);
        setError("");
        setStatus("online");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setStatus("offline");
        setError(requestErrorMessage(requestError));
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((task) => isVisible(task, filter, today))
        .sort((left, right) => {
          if (left.completed !== right.completed) {
            return Number(left.completed) - Number(right.completed);
          }
          const priorityRank = { high: 0, normal: 1, low: 2 };
          if (left.priority !== right.priority) {
            return priorityRank[left.priority] - priorityRank[right.priority];
          }
          if (left.dueDate !== right.dueDate) {
            if (!left.dueDate) return 1;
            if (!right.dueDate) return -1;
            return left.dueDate.localeCompare(right.dueDate);
          }
          return right.id - left.id;
        }),
    [filter, tasks, today],
  );

  const openCount = tasks.filter((task) => !task.completed).length;
  const overdueCount = tasks.filter(
    (task) =>
      !task.completed && Boolean(task.dueDate) && task.dueDate < today,
  ).length;
  const todayCount = tasks.filter(
    (task) => !task.completed && task.dueDate === today,
  ).length;

  async function sendMutation(path: string, method: string, body?: object) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `The API returned ${response.status}.`);
      }
      await refreshTasks();
      return true;
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const added = await sendMutation("/api/tasks", "POST", {
      title,
      dueDate,
      priority,
    });
    if (added) {
      setTitle("");
      setDueDate("");
      setPriority("normal");
    }
  }

  return (
    <section className="task-api-demo" aria-labelledby="maintenance-title">
      <header className="task-api-header">
        <div>
          <div className="task-api-eyebrow">SERVER UPKEEP · TASK BOARD</div>
          <h2 id="maintenance-title">Server Maintenance Board</h2>
          <p>
            Plan routine server work, keep deadlines visible, and track what is
            done. Tasks are saved by the local C++ API, so they remain after a
            restart.
          </p>
        </div>
        <div
          className={`task-api-status task-api-status-${status}`}
          role="status"
        >
          <span />
          {status === "online"
            ? "API connected"
            : status === "connecting"
              ? "Connecting"
              : "API offline"}
        </div>
      </header>

      <div className="task-api-metrics" aria-label="Task summary">
        <div className="task-api-metric">
          <span>Open tasks</span>
          <strong>{openCount}</strong>
        </div>
        <div className="task-api-metric">
          <span>Due today</span>
          <strong>{todayCount}</strong>
        </div>
        <div className="task-api-metric task-api-metric-alert">
          <span>Overdue</span>
          <strong>{overdueCount}</strong>
        </div>
      </div>

      {status === "offline" && (
        <div className="task-api-offline" role="alert">
          <strong>Start the maintenance API to manage tasks.</strong>
          <span>{error}</span>
          <code>
            cmake -S . -B build
            <br />
            cmake --build build --config Release
            <br />
            .\build\Release\task-api-server.exe
          </code>
          <span>
            Run these commands from the <code>cpp-task-api</code> project
            folder. Data is saved to <code>tasks.db</code> in that folder.
          </span>
          <button
            type="button"
            onClick={() => {
              setStatus("connecting");
              void refreshTasks();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {status === "online" && (
        <>
          <form className="task-api-form" onSubmit={addTask}>
            <label className="task-api-title-field">
              <span>Maintenance task</span>
              <input
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Verify nightly backup restore"
                required
                value={title}
              />
            </label>
            <label>
              <span>Due date</span>
              <input
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                value={dueDate}
              />
            </label>
            <label>
              <span>Priority</span>
              <select
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority)
                }
                value={priority}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
            <button disabled={busy || !title.trim()} type="submit">
              Add task
            </button>
          </form>

          <nav className="task-api-filters" aria-label="Filter tasks">
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.id}
                className={filter === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {error && (
            <p className="task-api-error" role="alert">
              {error}
            </p>
          )}

          {visibleTasks.length > 0 ? (
            <ul className="task-api-list">
              {visibleTasks.map((task) => (
                <li
                  className={`task-api-task ${
                    task.completed ? "is-complete" : ""
                  }`}
                  key={task.id}
                >
                  <input
                    aria-label={
                      task.completed
                        ? `Mark ${task.title} as open`
                        : `Mark ${task.title} complete`
                    }
                    checked={task.completed}
                    disabled={busy}
                    onChange={(event) =>
                      void sendMutation(`/api/tasks/${task.id}`, "PATCH", {
                        completed: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  <div className="task-api-task-content">
                    <strong>{task.title}</strong>
                    <div className="task-api-task-meta">
                      <span
                        className={`task-api-priority task-api-priority-${task.priority}`}
                      >
                        {task.priority} priority
                      </span>
                      <span
                        className={
                          !task.completed &&
                          task.dueDate &&
                          task.dueDate < today
                            ? "task-api-due is-overdue"
                            : "task-api-due"
                        }
                      >
                        {dueDateLabel(task, today)}
                      </span>
                    </div>
                  </div>
                  <button
                    aria-label={`Delete ${task.title}`}
                    className="task-api-delete"
                    disabled={busy}
                    onClick={() =>
                      void sendMutation(`/api/tasks/${task.id}`, "DELETE")
                    }
                    type="button"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="task-api-empty">
              <strong>
                {tasks.length === 0
                  ? "Your maintenance list is clear."
                  : "No tasks in this view."}
              </strong>
              <span>
                {tasks.length === 0
                  ? "Add work like patching, certificate renewals, or backup checks."
                  : "Choose another filter to see more tasks."}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
