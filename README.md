# Collaborative Infrastructure Editor

A production-ready, real-time collaborative code editor designed specifically for Kubernetes infrastructure manifests. This system enables multiple operators to seamlessly co-edit YAML configurations, maintaining a highly available and conflict-free concurrent environment.

Built with robust state management in mind, the platform leverages **Operational Transformation (OT)** for accurate concurrent text editing, **Event Sourcing** for a tamper-proof audit log, and an integrated **Validation Pipeline** to guarantee that only well-formed, deployable manifests make it to the state output.

---

## 🏗️ Project Structure
```text
infra-editor/
├── cmd/
│   └── server/          # Main application entrypoint
├── docs/                # (Deprecated - merged here)
├── internal/
│   ├── api/             # REST endpoints (Documents, Metrics)
│   ├── config/          # Environment configuration loader
│   ├── db/              # PostgreSQL Event Sourcing adapters
│   ├── models/          # Core CQRS logic and Entities
│   ├── ot/              # Operational Transformation algorithm
│   ├── validation/      # Sub-process kubectl manifest validator
│   └── ws/              # WebSocket collaboration hub
├── migrations/          # Database schema definitions
├── validation/          # Temporary folder used by the kubectl worker
├── docker-compose.yml   # Stack orchestration 
└── Dockerfile           # App container instruction
```

---

## 🌟 Key Features & Architecture

The application is built around the **CQRS (Command Query Responsibility Segregation)** pattern:

* **Event Sourcing (CQRS)**: Documents are deterministically re-constructed by replaying an operational log.
* **Intelligent Snapshotting**: Re-reading documents remains performant with period state snapshots.
* **Write Path**: WebSocket edits send operations (insert/delete) to a highly available worker handling Operational Transformation logic. Operations are persisted in an append-only `operations` table.
* **Read Path**: Document state is calculated dynamically by retrieving the nearest snapshot and rapidly replaying remaining operations.
* **Operational Transformation (OT)**: A robust text-based OT algorithm handles complex edge cases (e.g., inserts within delete boundaries, identical concurrent deletes) without sacrificing eventual document convergence.
  * _Operations Supported:_ `insert(position, value)` and `delete(position, length)`.
* **Strict Validation Pipeline**: A built-in sub-process evaluates document commits against Kubernetes schemas using `kubectl apply --dry-run=client`, guaranteeing manifest correctness before finalization.
* **Rollback & Compensating Transactions**: Fully reversible document states powered by event-sourcing, enabling easy reversion of destructive configuration changes.
* **Prometheus Metrics Generation**: Integrated observability tracking latencies, conflict counts, validation failures, and snapshot activities for easy alerting integration.

---

## 🚀 Getting Started

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine
* [Docker Compose](https://docs.docker.com/compose/)

### Fast Start

1. **Clone & Configure Environment**
   Set up your environment variables by copying the provided example file:
   ```bash
   cp .env.example .env
   ```

2. **Boot the Cluster**
   Start the robust API, WebSocket Server, and PostgreSQL Event Store using docker-compose:
   ```bash
   docker-compose up --build -d
   ```

3. **Verify Deployment**
   Both `app` and `db` services should display as `Up (healthy)`.
   The REST API & WebSocket server is exposed at `http://localhost:8080`.

---

## 🔌 API Reference

### 1. Create a Document
* **POST** `/api/v1/documents`
* **Body:** `{"name": "production-deployment.yaml", "content": "apiVersion: v1"}`
* **Returns:** `201 Created` with the new UUID.

### 2. Validate & Commit
* **POST** `/api/v1/documents/:id/commit`
* **Returns:** `validation_output` declaring success, or specific YAML syntax errors via dry-run execution (`400 Bad Request`).

### 3. State Rollback
* **POST** `/api/v1/documents/:id/rollback`
* **Body:** `{"target_revision": 1}`
* **Returns:** `200 OK`

### 4. Telemetry Metrics
* **GET** `/metrics`
* **Returns:** Prometheus metrics like `edit_latency_ms`, `transform_conflicts_total`, `snapshot_count`.

### 5. WebSockets API
Connect to `ws://localhost:8080/ws` with JSON payloads:
```json
{
  "document_id": "uuid",
  "user_id": "uuid",
  "revision": 3,
  "operation": {
    "type": "insert",
    "position": 14,
    "value": "\nkind: Pod"
  }
}
```

---

## 🧪 Testing Instructions

You can manually verify each requirement of the project by making REST API calls and connecting via WebSockets.

### 1. Verify Database Schema
Connect to the database instance to verify the tables and migrations:
```bash
docker exec -it infra-editor-db-1 psql -U editor -d infra_editor
```
Inside `psql`, type `\dt` to see the tables (`documents`, `operations`, `snapshots`), and `\d operations` to see that `validation_status` exists. Type `\q` to exit.

### 2. Verify Document Creation
```bash
curl -X POST http://localhost:8080/api/v1/documents \
-H "Content-Type: application/json" \
-d '{"name":"test.yaml", "content":"apiVersion: v1"}'
```

### 3. Verify Validation Pipeline - Success 
Using the document ID from above, commit a valid Kubernetes YAML:
```bash
curl -X POST http://localhost:8080/api/v1/documents/YOUR_DOC_ID/commit
```

### 4. Verify Validation Pipeline - Failure 
Create an invalid document and try to commit it:
```bash
DOC_ID=$(curl -s -X POST http://localhost:8080/api/v1/documents -H "Content-Type: application/json" -d '{"name":"bad.yaml", "content":"invalid: yaml: ["}' | grep -oP '(?<="id":")[^"]*')
curl -X POST http://localhost:8080/api/v1/documents/$DOC_ID/commit
```

### 5. Verify Rollback 
Let's rollback the document we just created to revision `1` (its initial state).
```bash
curl -X POST http://localhost:8080/api/v1/documents/$DOC_ID/rollback \
-H "Content-Type: application/json" \
-d '{"target_revision": 1}'
```

### 6. Verify WebSockets and OT 
Run the automated script inside the container to test Operational Transformation synchronization between two simulated clients:
```bash
docker exec -it infra-editor-app-1 sh -c 'cat <<EOF > /tmp/ws_test.js
const WebSocket = require("ws");
const http = require("http");

async function createDoc() {
  return new Promise((resolve) => {
    const data = JSON.stringify({ name: "ws_test.yaml", content: "apiVersion: v1" });
    const req = http.request({ hostname: "localhost", port: 8080, path: "/api/v1/documents", method: "POST", headers: { "Content-Type": "application/json" }}, res => {
      let body = ""; res.on("data", c => body += c); res.on("end", () => resolve(JSON.parse(body).id));
    });
    req.write(data); req.end();
  });
}

(async () => {
   const docId = await createDoc();
   const wsA = new WebSocket("ws://localhost:8080/ws");
   const wsB = new WebSocket("ws://localhost:8080/ws");
   
   let openCount = 0;
   const onOpen = () => {
     openCount++;
     if (openCount === 2) {
       wsA.send(JSON.stringify({ document_id: docId, user_id: "a0000000-0000-0000-0000-000000000001", revision: 1, operation: { type: "insert", position: 14, value: "\\nkind: Pod" }}));
       wsB.send(JSON.stringify({ document_id: docId, user_id: "b0000000-0000-0000-0000-000000000002", revision: 1, operation: { type: "insert", position: 14, value: "\\nmetadata:" }}));
     }
   };
   wsA.on("open", onOpen); wsB.on("open", onOpen);
   
   let receivedMsg = 0;
   const onMsg = (msg) => {
     console.log("Received:", msg.toString());
     receivedMsg++;
     if (receivedMsg === 4) {
        wsA.close(); wsB.close();
        console.log("WebSocket test complete.");
     }
   };
   wsA.on("message", onMsg); wsB.on("message", onMsg);
})();
EOF

node /tmp/ws_test.js
'
```
