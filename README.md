# Collaborative Infrastructure Editor

A collaborative, real-time code editor for infrastructure manifests using Operational Transformation (OT) and Event Sourcing.

## Features
- Real-time collaborative editing using WebSockets.
- Immutable event stream of all document operations (Event Sourcing).
- Operational Transformation for conflict-free concurrent editing.
- Manifest validation using `kubectl apply --dry-run=client`.

## Setup and Running

### Prerequisites
- Docker
- Docker Compose

### Fast Start
1. Create a `.env` file based on the example:
   ```bash
   cp .env.example .env
   ```
2. Start the application stack:
   ```bash
   docker-compose up --build -d
   ```
3. The server will be available at `http://localhost:8080`. The database runs on port 5432.

### Endpoints
- `POST /api/v1/documents`: Create a document.
- `POST /api/v1/documents/:id/commit`: Validate and commit a document version.
- `POST /api/v1/documents/:id/rollback`: Roll back to a specific revision by appending compensating operations.
- `GET /metrics`: Prometheus metrics.
- `ws://localhost:8080/ws`: WebSocket connection for collaborative editing.
