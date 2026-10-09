/**
 * api.js - QuickNotes API client
 *
 * Uses JSONPlaceholder (https://jsonplaceholder.typicode.com/posts) as a
 * practice API. JSONPlaceholder simulates REST responses but does NOT
 * persist data. This means:
 *   - POSTed notes are echoed back with a fake id (always 101) but never
 *     actually stored on the server.
 *   - DELETE requests always return 200 OK regardless of whether the note
 *     ever existed on the server.
 *
 * Approach: We maintain a local in-memory list of notes. When the user
 * creates a note, the server response is used to confirm success and to
 * display the returned id; the note is then added to the local list.
 * When the user deletes a note, the server confirms the deletion and we
 * remove the note from the local list. This gives realistic UI behaviour
 * despite the practice API's stateless nature.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for the JSONPlaceholder posts resource. */
const API_URL = "https://jsonplaceholder.typicode.com/posts";

// ---------------------------------------------------------------------------
// DOM references (resolved after DOMContentLoaded)
// ---------------------------------------------------------------------------

let loadBtn;
let submitBtn;
let statusEl;
let notesList;
let noteForm;
let titleInput;
let bodyInput;
let titleError;

// ---------------------------------------------------------------------------
// Utility: generic fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Makes an HTTP request and returns the parsed JSON response.
 *
 * @param {string} url         - The endpoint URL.
 * @param {RequestInit} [opts] - Optional fetch options (method, headers, body).
 * @returns {Promise<any>}     - Resolves with the parsed JSON body.
 * @throws {Error}             - Throws if the network fails or response.ok is false.
 */
async function request(url, opts = {}) {
  const response = await fetch(url, opts);

  if (!response.ok) {
    // Attempt to read a JSON error body; fall back to statusText.
    let message;
    try {
      const err = await response.json();
      message = err.message || err.error || response.statusText;
    } catch {
      message = response.statusText;
    }
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// API operations
// ---------------------------------------------------------------------------

/**
 * Fetches the 10 most recent notes from the API.
 *
 * @returns {Promise<Array>} Array of note objects.
 */
async function getNotes() {
  return request(`${API_URL}?_limit=10`);
}

/**
 * Creates a new note via POST.
 *
 * @param {{ title: string, body: string, userId: number }} noteData
 * @returns {Promise<Object>} The created note object returned by the server.
 */
async function createNote(noteData) {
  return request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(noteData),
  });
}

/**
 * Deletes a note by id via DELETE.
 *
 * @param {number|string} id - The note's id.
 * @returns {Promise<Object>} Empty object {} on success (JSONPlaceholder behaviour).
 */
async function deleteNote(id) {
  return request(`${API_URL}/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates the create-note form fields.
 * Shows inline error messages and returns false when validation fails.
 *
 * @returns {boolean} true if valid, false otherwise.
 */
function validateForm() {
  let valid = true;
  const title = titleInput.value.trim();

  if (!title) {
    showFieldError(titleError, "Title is required.");
    valid = false;
  } else if (title.length > 100) {
    showFieldError(titleError, "Title must be 100 characters or fewer.");
    valid = false;
  } else {
    clearFieldError(titleError);
  }

  return valid;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * Sets the #status paragraph text and applies a CSS modifier class.
 *
 * @param {string} message        - Text to display.
 * @param {'loading'|'success'|'error'|''} type - Visual style.
 */
function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type ? `status--${type}` : "";
}

/**
 * Displays an inline field validation error.
 *
 * @param {HTMLElement} el  - The error span element.
 * @param {string} message  - Error message text.
 */
function showFieldError(el, message) {
  el.textContent = message;
  el.classList.add("visible");
}

/**
 * Clears an inline field validation error.
 *
 * @param {HTMLElement} el - The error span element.
 */
function clearFieldError(el) {
  el.textContent = "";
  el.classList.remove("visible");
}

/**
 * Builds and inserts a note <li> element into #notes-list.
 *
 * @param {{ id: number|string, title: string, body: string }} note
 * @param {boolean} [prepend=false] - Insert at the top when true.
 */
function renderNote(note, prepend = false) {
  const li = document.createElement("li");
  li.className = "note-item";
  li.dataset.id = note.id;

  const titleEl = document.createElement("h3");
  titleEl.className = "note-title";
  titleEl.textContent = note.title; // textContent prevents XSS

  const bodyEl = document.createElement("p");
  bodyEl.className = "note-body";
  bodyEl.textContent = note.body || ""; // textContent prevents XSS

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.setAttribute("aria-label", `Delete note: ${note.title}`);
  deleteBtn.addEventListener("click", () => handleDelete(note.id, li, deleteBtn));

  li.appendChild(titleEl);
  li.appendChild(bodyEl);
  li.appendChild(deleteBtn);

  if (prepend) {
    notesList.insertBefore(li, notesList.firstChild);
  } else {
    notesList.appendChild(li);
  }
}

/**
 * Shows the empty-state message inside the notes list.
 */
function showEmptyState() {
  const li = document.createElement("li");
  li.id = "empty-state";
  li.className = "empty-state";
  li.textContent = "No notes yet. Load notes or create your first one above.";
  notesList.appendChild(li);
}

/**
 * Removes the empty-state element if present.
 */
function removeEmptyState() {
  const existing = document.getElementById("empty-state");
  if (existing) existing.remove();
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Handles "Load Notes" button click.
 * Fetches 10 notes and renders them; shows all four states.
 */
async function handleLoad() {
  loadBtn.disabled = true;
  setStatus("Loading notes…", "loading");
  notesList.innerHTML = "";

  try {
    const notes = await getNotes();

    if (notes.length === 0) {
      showEmptyState();
      setStatus("No notes found on the server.", "");
    } else {
      notes.forEach((note) => renderNote(note));
      setStatus(`Loaded ${notes.length} notes from the server.`, "success");
    }
  } catch (err) {
    setStatus(`Could not load notes. ${err.message}`, "error");
    showEmptyState();
  } finally {
    loadBtn.disabled = false;
  }
}

/**
 * Handles create-note form submission.
 * Validates input, sends POST, and prepends the new note to the list.
 *
 * @param {Event} event
 */
async function handleCreate(event) {
  event.preventDefault();

  if (!validateForm()) return;

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  submitBtn.disabled = true;
  setStatus("Creating note…", "loading");

  try {
    const created = await createNote({ title, body, userId: 1 });

    // Remove empty-state placeholder if visible.
    removeEmptyState();

    renderNote(created, true);
    noteForm.reset();
    clearFieldError(titleError);

    setStatus(
      `Note created (status 201, id ${created.id}).`,
      "success"
    );
  } catch (err) {
    setStatus(`Could not create note. ${err.message}`, "error");
  } finally {
    submitBtn.disabled = false;
  }
}

/**
 * Handles delete button click for a note.
 * Sends DELETE request and removes the <li> on success.
 *
 * @param {number|string} id        - Note id to delete.
 * @param {HTMLElement}   liEl      - The <li> element to remove.
 * @param {HTMLButtonElement} btn   - The delete button (disabled during request).
 */
async function handleDelete(id, liEl, btn) {
  btn.disabled = true;
  setStatus("Deleting note…", "loading");

  try {
    await deleteNote(id);

    liEl.remove();

    // Show empty state if the list is now empty.
    if (notesList.children.length === 0) {
      showEmptyState();
    }

    setStatus("Note deleted successfully.", "success");
  } catch (err) {
    btn.disabled = false;
    setStatus(`Could not delete note. ${err.message}`, "error");
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  loadBtn    = document.getElementById("load-btn");
  submitBtn  = document.getElementById("submit-btn");
  statusEl   = document.getElementById("status");
  notesList  = document.getElementById("notes-list");
  noteForm   = document.getElementById("note-form");
  titleInput = document.getElementById("title-input");
  bodyInput  = document.getElementById("body-input");
  titleError = document.getElementById("title-error");

  loadBtn.addEventListener("click", handleLoad);
  noteForm.addEventListener("submit", handleCreate);
});
