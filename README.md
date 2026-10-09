# QuickNotes

A browser-based note-taking app with a live API client and full backend design documentation.

QuickNotes lets you load, create, and delete notes through the browser. The front end talks to the [JSONPlaceholder](https://jsonplaceholder.typicode.com/) practice API to demonstrate real HTTP requests, while the three design documents lay out the REST API, data model, and scalable architecture the backend team would build to support 1 million users.

---

## How to Run the API Client

No build step or server is required. Open `index.html` directly in any modern browser:

```
double-click index.html
```

Or serve it locally (recommended to avoid CORS quirks in some browsers):

```bash
# Python 3
python -m http.server 8080
# then open http://localhost:8080
```

Once open:

1. Click **Load Notes** to fetch 10 posts from JSONPlaceholder.
2. Fill in the **Title** field (required, max 100 characters) and optionally a **Body**, then click **Create Note** to POST a new note.
3. Click the **Delete** button on any note to send a DELETE request and remove it from the list.

> **Note:** JSONPlaceholder is a read-only practice API. It echoes back created notes with a fake id (always 101) and confirms DELETE requests, but does not actually persist any data. Created notes will disappear when you reload the page. This behaviour is documented in `api.js`.

---

## Design Documents

| Document | Description |
|----------|-------------|
| [API Design](docs/api-design.md) | REST endpoints, request/response examples, error codes. |
| [Data Model](docs/data-model.md) | Database entities, relationships, SQL, indexes, SQL vs NoSQL rationale. |
| [Architecture](docs/architecture.md) | System diagram, load estimates, component explanations, request flows, trade-offs. |

---

## What I Learned

1. **Async error handling matters more than the happy path.** Writing `try / catch / finally` around every `fetch` call and surfacing meaningful messages in the UI (loading, success, error, empty) is what separates a fragile demo from a usable app. The `finally` block for re-enabling buttons was easy to forget but critical for UX.

2. **`textContent` vs `innerHTML` is a security decision, not a style choice.** Every piece of user-supplied text — note titles and bodies — is inserted via `textContent`. Using `innerHTML` would open a stored XSS vector the moment notes are shared or synced across users, so the habit of always reaching for `textContent` first is essential.

3. **Designing the data model before the API revealed hidden complexity.** Working through the `note_tags` junction table and writing the `CREATE TABLE` statements forced me to think carefully about cascade deletes, unique constraints, and which foreign keys were needed. That clarity then fed directly into the API design (e.g. `POST /notes/{id}/tags` as a separate endpoint) and the architecture (the need for a full-text index and a read replica).

4. **Stateless app servers require deliberate cache invalidation.** Planning the architecture taught me that adding Redis for speed creates a consistency obligation: every write that could change a cached read must also invalidate the relevant cache keys. Thinking through the `POST /notes` flow end-to-end (app server → DB write → cache invalidation → queue publish → worker index update) showed how many moving parts a single user action touches in a production system.

---

## Project Structure

```
├── index.html          # HTML5 app shell
├── api.js              # API client (GET, POST, DELETE + all states)
├── style.css           # App styles with loading/success/error states
├── docs/
│   ├── api-design.md   # REST API specification
│   ├── data-model.md   # Database schema and SQL
│   └── architecture.md # System design and estimates
└── README.md           # This file
```
