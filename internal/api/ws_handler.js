const WebSocket = require('ws');
const repo = require('../storage/repository');
const { transform } = require('../ot/transform');
const { reconstructDocument } = require('../storage/replay');
const crypto = require('crypto');
const metrics = require('../metrics');

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server, path: '/ws' });

    const rooms = new Map();

    wss.on('connection', (ws) => {
        let currentDocId = null;

        ws.on('message', async (message) => {
            const endTimer = metrics.editLatencyHistogram.startTimer();
            try {
                const payload = JSON.parse(message);

                const { document_id, user_id, revision, operation } = payload;
                if (!document_id || !user_id || revision === undefined || !operation) {
                    ws.send(JSON.stringify({ error: 'Invalid payload' }));
                    return;
                }

                if (currentDocId !== document_id) {
                    if (currentDocId && rooms.has(currentDocId)) {
                        rooms.get(currentDocId).delete(ws);
                    }
                    currentDocId = document_id;
                    if (!rooms.has(currentDocId)) rooms.set(currentDocId, new Set());
                    rooms.get(currentDocId).add(ws);
                }

                const client = await repo.pool.connect();
                let nextRevision;
                let incomingOp = operation;
                try {
                    await client.query('BEGIN');
                    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [document_id]);

                    const { rows } = await client.query(
                        `SELECT * FROM operations WHERE document_id = $1 AND revision > $2 ORDER BY revision ASC`,
                        [document_id, revision]
                    );

                    if (rows.length > 0) {
                        metrics.transformConflictsCounter.inc();
                        for (const r of rows) {
                            const transformed = transform(incomingOp, r.operation_payload);
                            incomingOp = transformed[0];
                        }
                    }

                    const latestRes = await client.query(
                        `SELECT MAX(revision) as rev FROM operations WHERE document_id = $1`, [document_id]
                    );
                    nextRevision = parseInt(latestRes.rows[0].rev || 0, 10) + 1;

                    await repo.saveOperation(document_id, user_id, nextRevision, incomingOp, {}, client);

                    await client.query('COMMIT');
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }

                const { content, revision: newDocRev } = await reconstructDocument(document_id);
                const content_hash = crypto.createHash('sha256').update(content).digest('hex');

                if (newDocRev % 10 === 0) {
                    await repo.saveSnapshot(document_id, newDocRev, content);
                    // Gauge will be automatically synced by the interval.
                }

                const broadcastMsg = JSON.stringify({
                    document_id,
                    revision: nextRevision,
                    transformed_operation: incomingOp,
                    content_hash
                });

                const room = rooms.get(document_id);
                if (room) {
                    for (const c of room) {
                        if (c.readyState === WebSocket.OPEN) {
                            c.send(broadcastMsg);
                        }
                    }
                }

            } catch (err) {
                console.error('WS Error:', err);
                ws.send(JSON.stringify({ error: 'Server error' }));
            } finally {
                endTimer();
            }
        });

        ws.on('close', () => {
            if (currentDocId && rooms.has(currentDocId)) {
                rooms.get(currentDocId).delete(ws);
                if (rooms.get(currentDocId).size === 0) {
                    rooms.delete(currentDocId);
                }
            }
        });
    });
}

module.exports = {
    setupWebSocket
};
