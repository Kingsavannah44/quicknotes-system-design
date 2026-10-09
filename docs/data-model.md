# QuickNotes – Data Model Document

## 1. Entities

### 1.1 `users`

Stores account credentials and profile information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique user identifier. |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | Login email address. |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt hash of the password. |
| `display_name` | VARCHAR(100) | NOT NULL | Public-facing name. |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Account creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last profile update. |

---

### 1.2 `notes`

Stores individual note content owned by a user.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique note identifier. |
| `user_id` | UUID | NOT NULL, FOREIGN KEY → users(id) ON DELETE CASCADE | Owner of the note. |
| `title` | VARCHAR(100) | NOT NULL | Note title (max 100 chars). |
| `body` | TEXT | | Note body text (optional). |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last modification timestamp. |

---

### 1.3 `tags`

Stores reusable labels that can be attached to notes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique tag identifier. |
| `user_id` | UUID | NOT NULL, FOREIGN KEY → users(id) ON DELETE CASCADE | Owner of the tag. |
| `name` | VARCHAR(50) | NOT NULL | Display name (e.g. "Work"). |
| `slug` | VARCHAR(50) | NOT NULL | URL-safe version (e.g. "work"). |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp. |

**Unique constraint:** `(user_id, slug)` – a user cannot have two tags with the same slug.

---

### 1.4 `note_tags`

Junction table that links notes to tags (many-to-many).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `note_id` | UUID | NOT NULL, FOREIGN KEY → notes(id) ON DELETE CASCADE | References the note. |
| `tag_id` | UUID | NOT NULL, FOREIGN KEY → tags(id) ON DELETE CASCADE | References the tag. |

**Primary key:** `(note_id, tag_id)` – composite, prevents duplicate pairings.

---

## 2. Relationships

### One-to-Many
- A **user** owns many **notes** (`users.id → notes.user_id`).
- A **user** owns many **tags** (`users.id → tags.user_id`).

### Many-to-Many
- A **note** can have many **tags**, and a **tag** can be applied to many **notes**. This is modelled through the `note_tags` junction table. The junction approach keeps both `notes` and `tags` normalised and allows tags to be renamed without touching every note row.

---

## 3. CREATE TABLE Statements

```sql
-- Enable the pgcrypto extension for gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- users
CREATE TABLE users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- notes
CREATE TABLE notes (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(100) NOT NULL,
    body       TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- tags
CREATE TABLE tags (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(50) NOT NULL,
    slug       VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, slug)
);

-- note_tags  (junction table)
CREATE TABLE note_tags (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);
```

---

## 4. Example SQL Queries

### 4.1 Get all notes for a user, newest first

```sql
SELECT id, title, body, created_at
FROM   notes
WHERE  user_id = 'u_9k2m'
ORDER  BY created_at DESC
LIMIT  20 OFFSET 0;
```

### 4.2 Get notes with their tags using a JOIN

```sql
SELECT
    n.id          AS note_id,
    n.title,
    n.body,
    t.name        AS tag_name
FROM   notes n
LEFT JOIN note_tags nt ON nt.note_id = n.id
LEFT JOIN tags      t  ON t.id       = nt.tag_id
WHERE  n.user_id = 'u_9k2m'
ORDER  BY n.created_at DESC;
```

A `LEFT JOIN` is used so that notes without any tags are still returned (the `tag_name` column will be `NULL` for untagged notes).

### 4.3 Count notes per tag for a specific user

```sql
SELECT
    t.name,
    COUNT(nt.note_id) AS note_count
FROM   tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE  t.user_id = 'u_9k2m'
GROUP  BY t.id, t.name
ORDER  BY note_count DESC;
```

### 4.4 Full-text search within a user's notes

```sql
SELECT id, title, body
FROM   notes
WHERE  user_id = 'u_9k2m'
  AND  to_tsvector('english', title || ' ' || COALESCE(body, ''))
       @@ plainto_tsquery('english', 'meeting agenda');
```

---

## 5. Indexes

```sql
-- Speeds up the most common query: fetch all notes for a given user.
CREATE INDEX idx_notes_user_id ON notes(user_id);

-- Speeds up tag lookups and enforces the unique slug per user.
-- (The UNIQUE constraint on tags already creates an implicit index on (user_id, slug),
--  but an explicit index on user_id alone helps queries that filter only by user.)
CREATE INDEX idx_tags_user_id ON tags(user_id);

-- Covers the JOIN from note_tags back to notes (for tag → notes lookups).
CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);
```

**Rationale for `idx_notes_user_id`:** Every list-notes request filters `WHERE user_id = ?`. Without this index, PostgreSQL would perform a full sequential scan of the `notes` table. At 1 million users with an average of 50 notes each (50 M rows), an index scan reduces per-query I/O from O(n) to O(log n), cutting latency from hundreds of milliseconds to single-digit milliseconds.

---

## 6. SQL vs NoSQL Decision

**QuickNotes uses a relational (SQL) database – specifically PostgreSQL.**

Notes data is inherently structured: every note has a known set of typed fields (id, title, body, timestamps) and clear relationships to users and tags. PostgreSQL's foreign-key constraints and `ON DELETE CASCADE` rules enforce referential integrity automatically, preventing orphaned records without application-level guards. The many-to-many relationship between notes and tags is naturally expressed through a junction table, and complex queries (joins, aggregates, full-text search) are first-class citizens in SQL. PostgreSQL also provides ACID transactions, which are important when, for example, creating a note and attaching tags atomically. A document store such as MongoDB would offer more flexibility on note body structure but would sacrifice join performance and referential integrity, adding complexity back into the application layer. For a product of this scale and data shape, a relational model is the right trade-off.
