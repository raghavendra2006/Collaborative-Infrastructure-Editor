# Design Document: Collaborative Infrastructure Editor

## Architecture
The application follows a CQRS (Command Query Responsibility Segregation) and Event Sourcing pattern.
- **Write Path**: Real-time edits via WebSocket are sent as operations (Insert/Delete). These are appended to an append-only `operations` table.
- **Read Path**: The current state of a document is derived by replaying the sequence of operations from the `operations` table. For performance, snapshots of the document state are created periodically (e.g., every 10 revisions) and saved in the `snapshots` table. Reading a document involves fetching the latest snapshot and replaying only the operations that occurred after it.

## Operational Transformation (OT)
We implement a simplified OT algorithm suitable for plain text, as infrastructure manifests are ultimately text files.
The operations supported are:
- `insert(position, value)`
- `delete(position, length)` (assuming text-based, a delete removes `length` characters starting from `position`)

The transform function `T(opA, opB)` takes two concurrent operations and produces transformed operations `opA'` and `opB'` such that applying `opA` then `opB'` results in the same state as applying `opB` then `opA'`.
- Concurrent inserts: If both insert at the same location, breaking ties is resolved deterministically (e.g., based on lexicographical order of values or user IDs).
- Insert and Delete: If a delete is before an insert, the insert position shifts. If an insert is before a delete, the delete region may expand, absorb, or shift based on relative positions.
- Concurrent deletes: Overlapping deletes are merged.

## Validation Pipeline
A validation runner sub-process is triggered upon commit. It writes the reconstructed document content to a temporary file and runs `kubectl apply --dry-run=client -f <file>` to validate the YAML format and Kubernetes schema.
