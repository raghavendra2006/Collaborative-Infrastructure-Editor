# Testing Instructions

You can manually verify each requirement of the project by making REST API calls and connecting via WebSockets.

## 1. Verify Project Starts
Ensure the system is running:
```bash
docker-compose up -d --build
docker-compose ps
```
Both `app` and `db` should say `Up (healthy)`.

## 2. Verify Database Schema (Requirements 3 & 4)
Connect to the database instance to verify the tables and migrations:
```bash
docker exec -it infra-editor-db-1 psql -U editor -d infra_editor
```
Inside `psql`, type `\dt` to see the tables (`documents`, `operations`, `snapshots`), and `\d operations` to see that `validation_status` exists. Type `\q` to exit.

## 3. Verify Document Creation (Requirement 5)
Run this `curl` command to create a document:
```bash
curl -X POST http://localhost:8080/api/v1/documents \
-H "Content-Type: application/json" \
-d '{"name":"test.yaml", "content":"apiVersion: v1"}'
```
It should return `201 Created` with a `document_id`.

## 4. Verify Validation Pipeline - Success (Requirement 8)
Using the document ID from above, commit a valid Kubernetes YAML:
```bash
curl -X POST http://localhost:8080/api/v1/documents/YOUR_DOC_ID/commit
```
(Replace `YOUR_DOC_ID` with the actual UUID). It should return `{"status":"validated", ...}`.

## 5. Verify Validation Pipeline - Failure (Requirement 9)
Create an invalid document and try to commit it:
```bash
DOC_ID=$(curl -s -X POST http://localhost:8080/api/v1/documents -H "Content-Type: application/json" -d '{"name":"bad.yaml", "content":"invalid: yaml: ["}' | grep -oP '(?<="id":")[^"]*')

curl -X POST http://localhost:8080/api/v1/documents/$DOC_ID/commit
```
It should return a `400 Bad Request` with `{"status":"failed", ...}`.

## 6. Verify Rollback (Requirement 10)
Let's rollback the document we just created to revision `1` (its initial state).
```bash
curl -X POST http://localhost:8080/api/v1/documents/$DOC_ID/rollback \
-H "Content-Type: application/json" \
-d '{"target_revision": 1}'
```
It should return a `200 OK` showing the new revision.

## 7. Verify Metrics (Requirement 11)
Check the Prometheus metrics:
```bash
curl http://localhost:8080/metrics
```
You should see output including `# TYPE edit_latency_ms histogram`, `transform_conflicts_total`, `validation_failures_total`, and `snapshot_count`.

## 8. Verify WebSockets and OT (Requirements 6 & 7)
The easiest way to test real-time WebSockets and Operational Transformation is to run the automated script I prepared for you inside the container:
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
You will see both transformations occur correctly, broadcasting to the clients, and the script exiting.
