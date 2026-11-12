const storageKey = "javascript-todo-list";
const isEmbedded = window.parent !== window;
const taskForm = document.querySelector("#todo-form");
const taskInput = document.querySelector("#todo-input");
const dueDateInput = document.querySelector("#task-due-date");
const priorityInput = document.querySelector("#task-priority");
const taskSearch = document.querySelector("#task-search");
const taskList = document.querySelector("#task-list");
const emptyState = document.querySelector("#empty-state");
const remainingCount = document.querySelector("#remaining-count");
const todayCount = document.querySelector("#today-count");
const overdueCount = document.querySelector("#overdue-count");
const completedCount = document.querySelector("#completed-count");
const progressTrack = document.querySelector(".progress-track");
const progressValue = document.querySelector("#progress-value");
const clearCompletedButton = document.querySelector("#clear-completed");
const notice = document.querySelector("#notice");
const filters = [...document.querySelectorAll("[data-filter]")];
const priorities = ["low", "normal", "high"];
let activeFilter = "all";
let editingId = null;

function getToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function showNotice(message = "") {
  notice.textContent = message;
}

function parseTasks(savedTasks) {
  if (!savedTasks) {
    return [];
  }

  const parsedTasks = JSON.parse(savedTasks);
  if (!Array.isArray(parsedTasks)) {
    throw new Error("Saved tasks have an unexpected format.");
  }

  return parsedTasks
    .filter(
      (task) =>
        typeof task === "object" &&
        task !== null &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        typeof task.completed === "boolean",
    )
    .map((task) => ({
      id: task.id,
      title: task.title,
      completed: task.completed,
      dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
      priority: priorities.includes(task.priority) ? task.priority : "normal",
      createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
    }));
}

function loadTasks() {
  try {
    return parseTasks(localStorage.getItem(storageKey));
  } catch {
    showNotice("Saved tasks could not be loaded. You can start a fresh list.");
    return [];
  }
}

let tasks = isEmbedded ? [] : loadTasks();

function saveTasks() {
  if (isEmbedded) {
    window.parent.postMessage(
      { type: "workspace:storage:set", key: storageKey, value: JSON.stringify(tasks) },
      "*",
    );
    showNotice();
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
    showNotice();
  } catch {
    showNotice("Your browser could not save this change.");
  }
}

function formatDueDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function getDueLabel(task) {
  if (!task.dueDate) {
    return "No due date";
  }
  if (task.completed) {
    return `Due ${formatDueDate(task.dueDate)}`;
  }
  if (task.dueDate < getToday()) {
    return `Overdue · ${formatDueDate(task.dueDate)}`;
  }
  if (task.dueDate === getToday()) {
    return "Due today";
  }
  return `Due ${formatDueDate(task.dueDate)}`;
}

function matchesFilter(task) {
  const today = getToday();
  if (activeFilter === "today") {
    return task.dueDate === today;
  }
  if (activeFilter === "upcoming") {
    return !task.completed && task.dueDate > today;
  }
  if (activeFilter === "overdue") {
    return !task.completed && Boolean(task.dueDate) && task.dueDate < today;
  }
  if (activeFilter === "completed") {
    return task.completed;
  }
  return true;
}

function sortTasks(left, right) {
  const leftDate = left.dueDate || "9999-12-31";
  const rightDate = right.dueDate || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  const priorityRank = { high: 0, normal: 1, low: 2 };
  if (priorityRank[left.priority] !== priorityRank[right.priority]) {
    return priorityRank[left.priority] - priorityRank[right.priority];
  }

  return right.createdAt.localeCompare(left.createdAt);
}

function makeBadge(label, className = "") {
  const badge = document.createElement("span");
  badge.className = `task-badge${className ? ` ${className}` : ""}`;
  badge.textContent = label;
  return badge;
}

function makeEditRow(task, row) {
  const form = document.createElement("form");
  form.className = "inline-edit-form";
  form.dataset.editFormId = task.id;

  const titleInput = document.createElement("input");
  titleInput.name = "title";
  titleInput.type = "text";
  titleInput.maxLength = 120;
  titleInput.value = task.title;
  titleInput.required = true;
  titleInput.setAttribute("aria-label", "Edit task name");

  const dateInput = document.createElement("input");
  dateInput.name = "dueDate";
  dateInput.type = "date";
  dateInput.value = task.dueDate;
  dateInput.setAttribute("aria-label", "Edit due date");

  const prioritySelect = document.createElement("select");
  prioritySelect.name = "priority";
  prioritySelect.setAttribute("aria-label", "Edit priority");
  for (const priority of priorities) {
    const option = document.createElement("option");
    option.value = priority;
    option.textContent = `${priority[0].toUpperCase()}${priority.slice(1)}`;
    option.selected = task.priority === priority;
    prioritySelect.append(option);
  }

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.cancelId = task.id;
  cancelButton.textContent = "Cancel";

  form.append(titleInput, dateInput, prioritySelect, saveButton, cancelButton);
  row.append(form);
}

function makeTaskRow(task) {
  const row = document.createElement("li");
  const isOverdue = !task.completed && Boolean(task.dueDate) && task.dueDate < getToday();
  row.className = `task-row${task.completed ? " is-complete" : ""}${isOverdue ? " is-overdue" : ""}`;

  if (editingId === task.id) {
    makeEditRow(task, row);
    return row;
  }

  const checkbox = document.createElement("input");
  checkbox.className = "task-check";
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.dataset.taskId = task.id;
  checkbox.setAttribute("aria-label", `Mark ${task.title} as complete`);

  const copy = document.createElement("div");
  copy.className = "task-copy";
  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "task-meta";
  const dueClass = isOverdue ? "task-badge--overdue" : task.dueDate === getToday() ? "task-badge--today" : "";
  meta.append(makeBadge(getDueLabel(task), dueClass));
  if (task.priority !== "normal") {
    const priorityLabel = `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`;
    meta.append(
      makeBadge(
        priorityLabel,
        task.priority === "high" ? "task-badge--high" : "task-badge--low",
      ),
    );
  }
  copy.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const editButton = document.createElement("button");
  editButton.className = "task-action";
  editButton.type = "button";
  editButton.dataset.editId = task.id;
  editButton.setAttribute("aria-label", `Edit ${task.title}`);
  editButton.textContent = "Edit";

  const deleteButton = document.createElement("button");
  deleteButton.className = "task-action task-action--delete";
  deleteButton.type = "button";
  deleteButton.dataset.deleteId = task.id;
  deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
  deleteButton.textContent = "Delete";
  actions.append(editButton, deleteButton);

  row.append(checkbox, copy, actions);
  return row;
}

function renderTasks() {
  const query = taskSearch.value.trim().toLowerCase();
  const visibleTasks = tasks
    .filter(matchesFilter)
    .filter((task) => task.title.toLowerCase().includes(query))
    .sort(sortTasks);
  const remaining = tasks.filter((task) => !task.completed).length;
  const completed = tasks.length - remaining;
  const dueToday = tasks.filter((task) => !task.completed && task.dueDate === getToday()).length;
  const overdue = tasks.filter(
    (task) => !task.completed && task.dueDate && task.dueDate < getToday(),
  ).length;
  const completionPercent = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  remainingCount.textContent = String(remaining);
  todayCount.textContent = String(dueToday);
  overdueCount.textContent = String(overdue);
  completedCount.textContent =
    tasks.length === 0
      ? "Nothing completed yet"
      : `${completed} of ${tasks.length} tasks complete`;
  progressValue.style.width = `${completionPercent}%`;
  progressTrack.setAttribute("aria-valuenow", String(completionPercent));
  clearCompletedButton.disabled = completed === 0;
  taskList.replaceChildren(...visibleTasks.map(makeTaskRow));
  emptyState.hidden = visibleTasks.length > 0;

  const emptyMessages = {
    all: ["Your list is clear.", "Add a task above to get started."],
    today: ["Nothing due today.", "Enjoy the extra breathing room."],
    upcoming: ["No upcoming tasks.", "Add a due date to plan ahead."],
    overdue: ["Nothing overdue.", "You are right on track."],
    completed: ["Nothing completed yet.", "Finish a task to see it here."],
  };
  const [emptyTitle, emptyCopy] = emptyMessages[activeFilter];
  emptyState.querySelector("p").textContent =
    query && visibleTasks.length === 0 ? "No matching tasks." : emptyTitle;
  emptyState.querySelector("small").textContent =
    query && visibleTasks.length === 0 ? "Try another search or clear the search field." : emptyCopy;
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) {
    taskInput.focus();
    return;
  }

  tasks.unshift({
    id: crypto.randomUUID(),
    title,
    dueDate: dueDateInput.value,
    priority: priorityInput.value,
    completed: false,
    createdAt: new Date().toISOString(),
  });
  activeFilter = "all";
  filters.forEach((filter) => {
    const isActive = filter.dataset.filter === activeFilter;
    filter.classList.toggle("is-active", isActive);
    filter.setAttribute("aria-pressed", String(isActive));
  });
  saveTasks();
  renderTasks();
  taskForm.reset();
  taskInput.focus();
});

filters.forEach((filter) => {
  filter.addEventListener("click", () => {
    activeFilter = filter.dataset.filter;
    editingId = null;
    filters.forEach((option) => {
      const isActive = option === filter;
      option.classList.toggle("is-active", isActive);
      option.setAttribute("aria-pressed", String(isActive));
    });
    renderTasks();
  });
});

taskSearch.addEventListener("input", renderTasks);

taskList.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.taskId) {
    return;
  }

  const task = tasks.find((item) => item.id === event.target.dataset.taskId);
  if (!task) {
    return;
  }

  task.completed = event.target.checked;
  saveTasks();
  renderTasks();
});

taskList.addEventListener("submit", (event) => {
  if (!(event.target instanceof HTMLFormElement) || !event.target.dataset.editFormId) {
    return;
  }
  event.preventDefault();

  const task = tasks.find((item) => item.id === event.target.dataset.editFormId);
  if (!task) {
    return;
  }

  const formData = new FormData(event.target);
  const title = String(formData.get("title") || "").trim();
  if (!title) {
    event.target.querySelector("[name='title']").focus();
    return;
  }

  task.title = title;
  task.dueDate = String(formData.get("dueDate") || "");
  const priority = String(formData.get("priority") || "normal");
  task.priority = priorities.includes(priority) ? priority : "normal";
  editingId = null;
  saveTasks();
  renderTasks();
});

taskList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const cancelButton = event.target.closest("[data-cancel-id]");
  if (cancelButton) {
    editingId = null;
    renderTasks();
    return;
  }

  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    editingId = editButton.dataset.editId;
    renderTasks();
    taskList.querySelector(".inline-edit-form input[name='title']").focus();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) {
    return;
  }

  tasks = tasks.filter((task) => task.id !== deleteButton.dataset.deleteId);
  saveTasks();
  renderTasks();
});

taskList.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && event.target instanceof HTMLInputElement) {
    editingId = null;
    renderTasks();
  }
});

clearCompletedButton.addEventListener("click", () => {
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  renderTasks();
});

window.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLTextAreaElement)
  ) {
    event.preventDefault();
    taskSearch.focus();
  }
});

if (isEmbedded) {
  window.addEventListener("message", (event) => {
    if (
      event.source !== window.parent ||
      typeof event.data !== "object" ||
      event.data === null ||
      !("type" in event.data) ||
      !("key" in event.data) ||
      event.data.key !== storageKey
    ) {
      return;
    }

    if (event.data.type === "workspace:storage:init") {
      try {
        tasks = parseTasks(
          "value" in event.data && typeof event.data.value === "string"
            ? event.data.value
            : null,
        );
        renderTasks();
      } catch {
        showNotice("Saved tasks could not be loaded. You can start a fresh list.");
      }
    } else if (event.data.type === "workspace:storage:error") {
      showNotice("Your browser could not save this change.");
    }
  });
}

renderTasks();
