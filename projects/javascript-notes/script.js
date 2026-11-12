const storageKey = "javascript-quick-notes";
const isEmbedded = window.parent !== window;
const form = document.querySelector("#note-form");
const titleInput = document.querySelector("#note-title");
const bodyInput = document.querySelector("#note-body");
const notesGrid = document.querySelector("#notes-grid");
const emptyNotes = document.querySelector("#empty-notes");
const noteCount = document.querySelector("#note-count");
const characterCount = document.querySelector("#character-count");
const notice = document.querySelector("#notice");

function showNotice(message = "") {
  notice.textContent = message;
}

function parseNotes(savedNotes) {
  if (!savedNotes) {
    return [];
  }

  const parsedNotes = JSON.parse(savedNotes);
  if (!Array.isArray(parsedNotes)) {
    throw new Error("Saved notes have an unexpected format.");
  }

  return parsedNotes.filter(
    (note) =>
      typeof note.id === "string" &&
      typeof note.title === "string" &&
      typeof note.body === "string" &&
      typeof note.createdAt === "string",
  );
}

function loadNotes() {
  try {
    return parseNotes(localStorage.getItem(storageKey));
  } catch {
    showNotice("Saved notes could not be loaded. You can start a fresh page.");
    return [];
  }
}

let notes = isEmbedded ? [] : loadNotes();

function saveNotes() {
  if (isEmbedded) {
    window.parent.postMessage(
      { type: "workspace:storage:set", key: storageKey, value: JSON.stringify(notes) },
      "*",
    );
    showNotice();
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(notes));
    showNotice();
  } catch {
    showNotice("Your browser could not save this change.");
  }
}

function makeNoteCard(note) {
  const article = document.createElement("article");
  article.className = "note-card";

  const header = document.createElement("div");
  header.className = "note-card-header";

  const details = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = note.title;
  const time = document.createElement("time");
  time.dateTime = note.createdAt;

  const createdAt = new Date(note.createdAt);
  time.textContent = Number.isNaN(createdAt.getTime())
    ? "Saved note"
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(createdAt);
  details.append(title, time);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-note";
  deleteButton.type = "button";
  deleteButton.dataset.noteId = note.id;
  deleteButton.setAttribute("aria-label", `Delete ${note.title}`);
  deleteButton.textContent = "×";

  const body = document.createElement("p");
  body.textContent = note.body;
  header.append(details, deleteButton);
  article.append(header, body);
  return article;
}

function renderNotes() {
  notesGrid.replaceChildren(...notes.map(makeNoteCard));
  emptyNotes.hidden = notes.length > 0;
  noteCount.textContent = `${notes.length} note${notes.length === 1 ? "" : "s"}`;
}

bodyInput.addEventListener("input", () => {
  characterCount.textContent = `${bodyInput.value.length} / 1200`;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const body = bodyInput.value.trim();
  if (!body) {
    bodyInput.focus();
    return;
  }

  notes.unshift({
    id: crypto.randomUUID(),
    title: titleInput.value.trim() || "Untitled",
    body,
    createdAt: new Date().toISOString(),
  });

  saveNotes();
  renderNotes();
  form.reset();
  characterCount.textContent = "0 / 1200";
  bodyInput.focus();
});

notesGrid.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const deleteButton = event.target.closest("[data-note-id]");
  if (!(deleteButton instanceof HTMLButtonElement)) {
    return;
  }

  notes = notes.filter((note) => note.id !== deleteButton.dataset.noteId);
  saveNotes();
  renderNotes();
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
        notes = parseNotes(
          "value" in event.data && typeof event.data.value === "string"
            ? event.data.value
            : null,
        );
        renderNotes();
      } catch {
        showNotice("Saved notes could not be loaded. You can start a fresh page.");
      }
    } else if (event.data.type === "workspace:storage:error") {
      showNotice("Your browser could not save this change.");
    }
  });
}

renderNotes();
