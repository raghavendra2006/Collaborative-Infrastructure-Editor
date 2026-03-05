const express = require('express');
const repo = require('../storage/repository');
const { reconstructDocument } = require('../storage/replay');
const validationRunner = require('../../validation/runner');
const metrics = require('../metrics');

setInterval(async () => {
    try {
        const { rows } = await repo.pool.query('SELECT COUNT(*) FROM snapshots');
        metrics.snapshotCountGauge.set(parseInt(rows[0].count, 10));
    } catch (e) { }
}, 10000);

function setupRoutes(app) {
    app.get('/metrics', async (req, res) => {
        try {
            res.set('Content-Type', metrics.promClient.register.contentType);
            res.send(await metrics.promClient.register.metrics());
        } catch (e) {
            res.status(500).send(e.message);
        }
    });

    app.post('/api/v1/documents', async (req, res) => {
        try {
            const { name, content } = req.body;
            if (!name || content === undefined) {
                return res.status(400).json({ error: 'Name and content are required' });
            }
            const doc = await repo.createDocument(name, content);
            res.status(201).json(doc);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.post('/api/v1/documents/:id/commit', async (req, res) => {
        try {
            const { id } = req.params;
            const { content, revision } = await reconstructDocument(id);

            const result = await validationRunner.runValidation(content);

            const newStatus = result.success ? 'validated' : 'failed';
            await repo.updateAllPendingOperationsStatus(id, revision, newStatus);

            if (result.success) {
                res.status(200).json({ status: 'validated', validation_output: result.output });
            } else {
                metrics.validationFailuresCounter.inc();
                res.status(400).json({ status: 'failed', validation_output: result.output });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.post('/api/v1/documents/:id/rollback', async (req, res) => {
        try {
            const { id } = req.params;
            const { target_revision } = req.body;

            if (!target_revision && target_revision !== 0) {
                return res.status(400).json({ error: 'target_revision required' });
            }

            const current = await reconstructDocument(id);
            if (current.revision <= target_revision) {
                return res.status(400).json({ error: 'Target revision must be in the past' });
            }

            const target = await reconstructDocument(id, target_revision);

            let nextRev = current.revision + 1;
            let userId = '00000000-0000-4000-a000-000000000000'; // Special system user

            const client = await repo.pool.connect();
            try {
                await client.query('BEGIN');
                await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id]);

                let newRev = current.revision;
                if (current.content.length > 0) {
                    newRev++;
                    await repo.saveOperation(
                        id, userId, newRev,
                        { type: 'delete', position: 0, length: current.content.length },
                        {}, client
                    );
                }
                if (target.content.length > 0) {
                    newRev++;
                    await repo.saveOperation(
                        id, userId, newRev,
                        { type: 'insert', position: 0, value: target.content },
                        {}, client
                    );
                }
                await client.query('COMMIT');

                res.status(200).json({
                    document_id: id,
                    new_revision: newRev,
                    target_revision: target_revision
                });
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}

module.exports = {
    setupRoutes
};
