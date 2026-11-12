const apiBase = "http://localhost:8091";

const structures = {
  stack: {
    title: "Stack",
    category: "LIFO · FIXED ARRAY",
    description:
      "Last in, first out. Add to the top and remove from the same end.",
    complexity: "Push and pop: O(1)",
    storage: "A bounded array in a struct",
    tip: "The top is the last array item. Pushing grows the count; popping shrinks it.",
    order: "Bottom → top",
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
    order: "Front → back",
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
    order: "Head → tail",
    actions: [
      { action: "append", label: "Append value", needsValue: true, primary: true },
      { action: "find", label: "Find value", needsValue: true },
      { action: "remove", label: "Remove first match", needsValue: true },
    ],
  },
};

const elements = {
  status: document.querySelector("#connection-status"),
  statusLabel: document.querySelector("#connection-label"),
  connectionHelp: document.querySelector("#connection-help"),
  retry: document.querySelector("#retry-connection"),
  selector: document.querySelector("#structure-select"),
  lesson: document.querySelector("#lesson-copy"),
  complexity: document.querySelector("#complexity-copy"),
  memory: document.querySelector("#memory-copy"),
  tip: document.querySelector("#lesson-tip"),
  title: document.querySelector("#workbench-title"),
  itemCount: document.querySelector("#item-count"),
  capacity: document.querySelector("#item-capacity"),
  memoryBytes: document.querySelector("#memory-bytes"),
  allocationCopy: document.querySelector("#allocation-copy"),
  highWater: document.querySelector("#high-water-copy"),
  valueForm: document.querySelector("#value-form"),
  valueInput: document.querySelector("#value-input"),
  valueHint: document.querySelector("#value-hint"),
  inputCounter: document.querySelector("#input-counter"),
  actionButtons: document.querySelector("#action-buttons"),
  reset: document.querySelector("#reset-structure"),
  message: document.querySelector("#operation-message"),
  visualHeading: document.querySelector("#visual-order"),
  visualization: document.querySelector("#visualization"),
  listMemory: document.querySelector("#list-memory"),
  allocations: document.querySelector("#allocation-count"),
  frees: document.querySelector("#free-count"),
  activity: document.querySelector("#activity-list"),
};

let currentStructure = "stack";
let busy = false;
let activity = [];

function setConnectionStatus(status, message) {
  elements.status.className = `connection-status is-${status}`;
  elements.statusLabel.textContent = message;
  elements.connectionHelp.hidden = status !== "offline";
  updateDisabledControls();
}

function updateDisabledControls() {
  elements.selector.disabled = busy || elements.status.classList.contains("is-offline");
  elements.valueInput.disabled = busy || elements.status.classList.contains("is-offline");
  elements.reset.disabled = busy || elements.status.classList.contains("is-offline");
  for (const button of elements.actionButtons.querySelectorAll("button")) {
    button.disabled = busy || elements.status.classList.contains("is-offline");
  }
}

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, options);
  } catch {
    throw new Error("Could not reach the C server at localhost:8091.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `The C server returned ${response.status}.`);
  }
  return data;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  updateDisabledControls();
}

function setMessage(message, type = "") {
  elements.message.textContent = message;
  elements.message.className = `operation-message${type ? ` is-${type}` : ""}`;
}

function recordActivity(message) {
  activity = [message, ...activity].slice(0, 5);
  elements.activity.replaceChildren();
  for (const entry of activity) {
    const item = document.createElement("li");
    item.textContent = entry;
    elements.activity.append(item);
  }
}

function makeVisualNode(value, label) {
  const node = document.createElement("div");
  node.className = "visual-node";
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  node.append(valueElement, labelElement);
  return node;
}

function appendArrow() {
  const arrow = document.createElement("span");
  arrow.className = "visual-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  return arrow;
}

function renderVisualization(state) {
  const isStack = state.structure === "stack";
  const isQueue = state.structure === "queue";
  elements.visualization.className = `visualization ${
    isStack
      ? "visualization-stack"
      : isQueue
        ? "visualization-queue"
        : "visualization-list"
  }`;
  elements.visualization.replaceChildren();

  if (state.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-visual";
    empty.textContent = "Your structure is empty. Add a value to begin.";
    elements.visualization.append(empty);
    return;
  }

  if (isStack) {
    [...state.items].reverse().forEach((value, index) => {
      elements.visualization.append(
        makeVisualNode(value, index === 0 ? "TOP" : `ITEM ${state.size - index}`),
      );
    });
    return;
  }

  state.items.forEach((value, index) => {
    if (index > 0) {
      elements.visualization.append(appendArrow());
    }
    const label = isQueue
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
    elements.visualization.append(makeVisualNode(value, label));
  });
}

function renderState(state) {
  const definition = structures[state.structure];
  elements.title.textContent = `Your ${definition.title.toLowerCase()}`;
  elements.itemCount.textContent = state.size;
  elements.capacity.textContent = state.capacity;
  elements.memoryBytes.textContent = Number(state.memoryBytes).toLocaleString();
  elements.highWater.textContent = `High-water mark: ${state.highWaterMark}`;
  elements.visualHeading.textContent = definition.order;
  elements.listMemory.hidden = state.structure !== "linked-list";
  elements.allocations.textContent = state.allocations;
  elements.frees.textContent = state.frees;
  elements.allocationCopy.textContent =
    state.structure === "linked-list"
      ? "Each linked-list item is a separately allocated C node."
      : "This structure uses fixed storage reserved inside the C server.";
  renderVisualization(state);
}

function renderStructureInfo(structure) {
  const definition = structures[structure];
  elements.lesson.querySelector(".lesson-type").textContent = definition.category;
  elements.lesson.querySelector("h2").textContent = definition.title;
  elements.lesson.querySelector("p").textContent = definition.description;
  elements.complexity.textContent = definition.complexity;
  elements.memory.textContent = definition.storage;
  elements.tip.textContent = definition.tip;
  elements.title.textContent = `Your ${definition.title.toLowerCase()}`;
  elements.visualHeading.textContent = definition.order;
  elements.actionButtons.replaceChildren();
  for (const operation of definition.actions) {
    const button = document.createElement("button");
    button.className = operation.primary ? "action-button is-primary" : "action-button";
    button.type = "button";
    button.textContent = operation.label;
    button.dataset.action = operation.action;
    button.dataset.needsValue = String(Boolean(operation.needsValue));
    button.addEventListener("click", () => void runOperation(operation));
    elements.actionButtons.append(button);
  }
  elements.valueHint.textContent = "1–24 printable ASCII characters";
  updateDisabledControls();
}

async function loadStructure(structure) {
  setBusy(true);
  try {
    const state = await request(
      `/api/state?structure=${encodeURIComponent(structure)}`,
    );
    renderState(state);
    setConnectionStatus("online", "C server connected");
    setMessage("Choose an operation to begin.");
  } catch (error) {
    setConnectionStatus("offline", "C server offline");
    setMessage(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function connect() {
  setConnectionStatus("connecting", "Connecting to C server");
  try {
    await request("/health");
    await loadStructure(currentStructure);
  } catch (error) {
    setConnectionStatus("offline", "C server offline");
    setMessage(error.message, "error");
  }
}

async function runOperation(operation) {
  if (operation.needsValue) {
    const value = elements.valueInput.value.trim();
    if (!/^[\x20-\x7e]{1,24}$/.test(value) || !value.trim()) {
      setMessage("Enter 1 to 24 printable ASCII characters.", "error");
      elements.valueInput.focus();
      return;
    }
  }

  const body = {
    structure: currentStructure,
    action: operation.action,
  };
  if (operation.needsValue) {
    body.value = elements.valueInput.value.trim();
  }

  setBusy(true);
  try {
    const state = await request("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    renderState(state);
    setConnectionStatus("online", "C server connected");
    setMessage(state.message, "success");
    recordActivity(state.message);
    if (["push", "enqueue", "append"].includes(operation.action)) {
      elements.valueInput.value = "";
      updateInputCounter();
    }
  } catch (error) {
    setMessage(error.message, "error");
    if (error.message.includes("Could not reach")) {
      setConnectionStatus("offline", "C server offline");
    }
  } finally {
    setBusy(false);
  }
}

function updateInputCounter() {
  elements.inputCounter.textContent = `${elements.valueInput.value.length} / 24`;
}

elements.selector.addEventListener("change", (event) => {
  currentStructure = event.target.value;
  renderStructureInfo(currentStructure);
  setMessage("Loading this structure...");
  void loadStructure(currentStructure);
});

elements.valueForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const operation = structures[currentStructure].actions.find(
    (item) => item.primary,
  );
  if (operation) {
    void runOperation(operation);
  }
});

elements.valueInput.addEventListener("input", updateInputCounter);
elements.retry.addEventListener("click", () => void connect());
elements.reset.addEventListener("click", () => {
  void runOperation({ action: "reset", needsValue: false });
});

renderStructureInfo(currentStructure);
void connect();
