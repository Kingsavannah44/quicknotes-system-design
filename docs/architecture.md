# QuickNotes – Architecture Document

## 1. Requirements

### 1.1 Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Users can register, log in, and log out. |
| FR-2 | Authenticated users can create, read, update, and delete their own notes. |
| FR-3 | Users can create tags and attach them to notes. |
| FR-4 | Users can search notes by keyword (full-text). |
| FR-5 | Notes are private; users cannot access each other's notes. |
| FR-6 | The service exposes a versioned REST API (`/api/v1/`). |
| FR-7 | Static assets (HTML, CSS, JS) are served from a CDN. |

### 1.2 Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **Availability:** 99.9 % uptime (≤ 8.7 h downtime per year). |
| NFR-2 | **Latency:** p95 API response time < 200 ms under normal load. |
| NFR-3 | **Scalability:** Handle 1 million active users without redesign. |
| NFR-4 | **Security:** All traffic over HTTPS; passwords hashed with bcrypt (cost ≥ 12); JWTs signed with RS256. |
| NFR-5 | **Durability:** Zero data loss; database backups every 6 hours with point-in-time recovery. |
| NFR-6 | **Observability:** Structured logging, distributed tracing, and metrics dashboards. |

---

## 2. Load Estimate (1 Million Users)

### Assumptions
- 1 000 000 registered users; 10 % daily active (100 000 DAU).
- Average DAU reads 15 notes per day, writes 3 notes per day.
- Average note payload: ~2 KB (title + body + metadata).
- 365 days per year.

### Reads per Second (RPS)
```
100 000 DAU × 15 reads/day = 1 500 000 reads/day
1 500 000 / 86 400 s ≈ 17 reads/s (average)
Peak (10× average) ≈ 170 reads/s
```

### Writes per Second (WPS)
```
100 000 DAU × 3 writes/day = 300 000 writes/day
300 000 / 86 400 s ≈ 3.5 writes/s (average)
Peak ≈ 35 writes/s
```

### Storage per Year
```
New notes per day: 100 000 × 3 = 300 000 notes/day
Per year: 300 000 × 365 = 109 500 000 notes ≈ 110 M notes
Storage: 110 M × 2 KB = 220 GB raw note data / year
+ indexes, metadata, audit logs: ≈ 2× multiplier → ~440 GB/year
```

These figures are modest. A single well-provisioned database server can handle peak load; the primary replica is added for durability and read offload, not capacity.

---

## 3. Architecture Diagram

```
                        ┌───────────────────┐
                        │   User (Browser)  │
                        └────────┬──────────┘
                                 │ HTTPS
                        ┌────────▼──────────┐
                        │      DNS          │  (Route 53 / Cloudflare)
                        └────────┬──────────┘
                                 │
                        ┌────────▼──────────┐
                        │      CDN          │  (CloudFront / Cloudflare)
                        │  Static Assets    │
                        └────────┬──────────┘
                                 │ API requests pass through
                        ┌────────▼──────────┐
                        │  Load Balancer    │  (ALB / Nginx)
                        └────┬─────────┬────┘
                             │         │
               ┌─────────────▼─┐   ┌───▼─────────────┐
               │  App Server 1 │   │  App Server 2   │
               │  (Node.js)    │   │  (Node.js)      │
               └───────┬───────┘   └────────┬────────┘
                       │                    │
               ┌───────▼────────────────────▼───────┐
               │          Cache (Redis)              │
               └───────────────┬────────────────────┘
                               │
               ┌───────────────▼────────────────────┐
               │     Primary Database (PostgreSQL)   │
               └───────────────┬────────────────────┘
                               │ streaming replication
               ┌───────────────▼────────────────────┐
               │     Read Replica (PostgreSQL)       │
               └────────────────────────────────────┘

               ┌────────────────────────────────────┐
               │  Message Queue (RabbitMQ / SQS)     │
               └───────────────┬────────────────────┘
                               │
               ┌───────────────▼────────────────────┐
               │         Worker Process              │
               │  (emails, search indexing, cleanup) │
               └────────────────────────────────────┘
```

---

## 4. Component Explanations

| Component | Problem it solves |
|-----------|-------------------|
| **DNS** | Translates the human-readable domain (`quicknotes.app`) into the load balancer's IP address, with low-TTL records to enable fast failover. |
| **CDN** | Caches and serves static assets (HTML, CSS, JS) from edge nodes close to users, eliminating round-trips to the origin for every page load. |
| **Load Balancer** | Distributes incoming API requests across app servers so no single server becomes a bottleneck; performs TLS termination and health checks. |
| **App Server 1 & 2** | Stateless Node.js processes that handle business logic, validate requests, call the cache/database, and return JSON responses. Running two (or more) instances removes the app tier as a single point of failure. |
| **Cache (Redis)** | Stores frequently read data (e.g. user session tokens, popular note lists) in memory, reducing database load and cutting response latency for hot data. |
| **Primary Database (PostgreSQL)** | Durably stores all application data with ACID guarantees; handles all write operations. |
| **Read Replica (PostgreSQL)** | Receives a continuous stream of changes from the primary; handles read-heavy queries (list notes, search) to offload the primary and provide a warm standby for failover. |
| **Message Queue** | Decouples slow or asynchronous work (sending welcome emails, updating the full-text search index, purging deleted data) from the synchronous request path, keeping API latency low. |
| **Worker Process** | Consumes jobs from the queue and executes them independently of the web servers, allowing retries and scaling compute for background work without affecting the API. |

---

## 5. Request Flows

### 5.1 GET /api/v1/notes (List Notes)

1. Browser sends `GET /api/v1/notes` with a `Bearer` JWT.
2. DNS resolves to the load balancer IP.
3. CDN passes the API request through (no static asset match).
4. Load balancer routes the request to the least-loaded app server.
5. App server validates the JWT (checks signature, expiry, and user ID).
6. App server checks Redis for a cached result keyed to `notes:{userId}:page:1`.
7. **Cache hit:** returns the cached JSON immediately. **Cache miss:** continues to step 8.
8. App server issues `SELECT … FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 20` against the **read replica**.
9. Result is serialised to JSON, written to Redis with a 60-second TTL, and returned to the browser with `200 OK`.

### 5.2 POST /api/v1/notes (Create Note)

1. Browser sends `POST /api/v1/notes` with a JSON body and a `Bearer` JWT.
2. Load balancer routes the request to an app server.
3. App server validates the JWT.
4. App server validates the request body (title required, ≤ 100 chars).
5. App server executes `INSERT INTO notes …` against the **primary database**.
6. On success, the app server invalidates the Redis cache key `notes:{userId}:*` so the next list request reflects the new note.
7. App server publishes a `note.created` event to the message queue (for search index update).
8. App server returns `201 Created` with the new note object.
9. Worker picks up the `note.created` event and updates the full-text search index asynchronously.

---

## 6. Trade-offs

### Trade-off 1 – Cache Consistency vs. Complexity
Introducing Redis improves read latency significantly (cache hit < 1 ms vs. DB query ~10 ms). The trade-off is added operational complexity: the cache must be invalidated correctly on writes or the user will see stale data. We mitigate this by using short TTLs (60 s) and explicit key-based invalidation on write operations. For a notes app, a brief window of stale data is acceptable; if stronger consistency is required, a write-through cache strategy can be adopted at the cost of slightly higher write latency.

### Trade-off 2 – Asynchronous Search Indexing vs. Immediate Availability
Publishing note creation to a queue and updating the search index asynchronously keeps the POST response fast and decouples a potentially slow indexing operation from the user-facing API. The trade-off is that a newly created note may not appear in search results for a few seconds (eventual consistency). This is acceptable for a notes app; if real-time searchability were critical, synchronous indexing inside the transaction would be needed, increasing write latency.

---

## 7. Single Points of Failure and How They Are Avoided

| Potential SPOF | Mitigation |
|----------------|------------|
| A single app server crashes. | Two (or more) app servers behind the load balancer. If one fails, the load balancer's health check routes all traffic to the remaining server within seconds. |
| Primary database fails. | The read replica runs streaming replication and can be promoted to primary (automated with Patroni or AWS RDS Multi-AZ) with < 30 s failover. |
| Redis crashes. | App servers are coded to fall through to the database on a cache miss; Redis failure degrades performance but does not cause an outage. Redis Sentinel or Cluster provides HA for the cache itself. |
| Load balancer fails. | Cloud providers (AWS ALB, GCP HTTPS LB) manage the load balancer as a managed, redundant service with no single underlying machine. |
| Message queue is unavailable. | Background tasks (email, search indexing) are deferred, not lost. The app stores pending events in a `outbox` table and retries via a scheduled reconciliation job. API responses to users are unaffected. |
