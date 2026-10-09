# QuickNotes – API Design Document

## 1. Endpoint Table

| # | Method | Path | Description | Success Status |
|---|--------|------|-------------|----------------|
| 1 | GET | `/api/v1/notes` | List the authenticated user's notes (paginated). | 200 OK |
| 2 | POST | `/api/v1/notes` | Create a new note for the authenticated user. | 201 Created |
| 3 | GET | `/api/v1/notes/{id}` | Retrieve a single note by its ID. | 200 OK |
| 4 | PUT | `/api/v1/notes/{id}` | Replace an existing note entirely. | 200 OK |
| 5 | PATCH | `/api/v1/notes/{id}` | Partially update a note (e.g. title only). | 200 OK |
| 6 | DELETE | `/api/v1/notes/{id}` | Permanently delete a note. | 204 No Content |
| 7 | GET | `/api/v1/tags` | List all tags belonging to the authenticated user. | 200 OK |
| 8 | POST | `/api/v1/notes/{id}/tags` | Attach one or more tags to a note. | 200 OK |

---

## 2. Request / Response Examples

### 2.1 Create a Note – POST `/api/v1/notes`

**Request headers**
```
Content-Type: application/json
Authorization: Bearer <access_token>
```

**Request body**
```json
{
  "title": "Meeting agenda",
  "body": "1. Q3 review\n2. Roadmap discussion\n3. AOB"
}
```

**Response – 201 Created**
```json
{
  "id": "a3f7c2e1-9b4d-4f88-bc12-8e2a1d0f5c67",
  "userId": "u_9k2m",
  "title": "Meeting agenda",
  "body": "1. Q3 review\n2. Roadmap discussion\n3. AOB",
  "tags": [],
  "createdAt": "2026-10-09T14:30:00Z",
  "updatedAt": "2026-10-09T14:30:00Z"
}
```

---

### 2.2 List Notes – GET `/api/v1/notes`

**Request headers**
```
Authorization: Bearer <access_token>
```

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-based). |
| `limit` | integer | 20 | Notes per page (max 100). |
| `tag` | string | — | Filter by tag slug. |
| `q` | string | — | Full-text search on title and body. |

**Example request**
```
GET /api/v1/notes?page=1&limit=10&tag=work
```

**Response – 200 OK**
```json
{
  "data": [
    {
      "id": "a3f7c2e1-9b4d-4f88-bc12-8e2a1d0f5c67",
      "userId": "u_9k2m",
      "title": "Meeting agenda",
      "body": "1. Q3 review\n2. Roadmap discussion\n3. AOB",
      "tags": ["work"],
      "createdAt": "2026-10-09T14:30:00Z",
      "updatedAt": "2026-10-09T14:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## 3. Error Status Codes

| Status | Meaning | When it occurs |
|--------|---------|----------------|
| 400 Bad Request | The request body or query parameters are invalid. | Missing required field, value out of range, malformed JSON. |
| 401 Unauthorized | No valid authentication credentials were provided. | Missing or expired JWT. |
| 403 Forbidden | The authenticated user does not own the resource. | Attempting to edit or delete another user's note. |
| 404 Not Found | The requested resource does not exist. | Note or tag ID not found. |
| 409 Conflict | A conflicting state prevents the operation. | Duplicate tag name on create. |
| 422 Unprocessable Entity | Validation passed parsing but failed business rules. | Title exceeds 100 characters after trimming. |
| 500 Internal Server Error | An unexpected server-side failure. | Database unreachable, unhandled exception. |

### Example error response body

All errors return the same envelope:

```json
{
  "error": {
    "status": 400,
    "code": "VALIDATION_ERROR",
    "message": "Title is required and must not exceed 100 characters.",
    "details": [
      {
        "field": "title",
        "issue": "required"
      }
    ]
  }
}
```

The `details` array is present on 400 and 422 errors to help clients surface per-field messages. It is omitted for 401, 403, 404 and 500 errors.

---

## 4. Authentication

All endpoints require a Bearer JWT in the `Authorization` header. Tokens are issued by `POST /api/v1/auth/login` and expire after 1 hour. Refresh tokens (7-day TTL) can be exchanged at `POST /api/v1/auth/refresh`.

---

## 5. Versioning

The API is versioned via the URL path (`/api/v1/`). Breaking changes will be released under a new version prefix. The previous version will receive security patches for 6 months after a new version ships.
