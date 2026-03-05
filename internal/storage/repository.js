const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function createDocument(name, initialContent) {
    const documentId = uuidv4();
    const userId = uuidv4(); // Generate a generic user

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO documents (id, name, created_at) VALUES ($1, $2, NOW())`,
            [documentId, name]
        );

        const opId = uuidv4();
        const payload = { type: 'insert', position: 0, value: initialContent };

        await client.query(
            `INSERT INTO operations (id, document_id, user_id, revision, operation_payload, vector_clock, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [opId, documentId, userId, 1, payload, JSON.stringify({})]
        );

        await client.query('COMMIT');
        return { id: documentId, name, createdAt: new Date() };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function getDocument(id) {
    const { rows } = await pool.query(`SELECT * FROM documents WHERE id = $1`, [id]);
    return rows[0];
}

async function getOperations(documentId, minRevision) {
    const { rows } = await pool.query(
        `SELECT * FROM operations WHERE document_id = $1 AND revision >= $2 ORDER BY revision ASC`,
        [documentId, minRevision]
    );
    return rows;
}

async function saveOperation(documentId, userId, revision, payload, vectorClock = {}, clientOverride = null) {
    const client = clientOverride || pool;
    const id = uuidv4();

    const { rows } = await client.query(
        `INSERT INTO operations (id, document_id, user_id, revision, operation_payload, vector_clock, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
        [id, documentId, userId, revision, payload, JSON.stringify(vectorClock)]
    );
    return rows[0];
}

async function updateOperationValidationStatus(documentId, revision, status) {
    await pool.query(
        `UPDATE operations SET validation_status = $1 WHERE document_id = $2 AND revision = $3`,
        [status, documentId, revision]
    );
}

async function updateAllPendingOperationsStatus(documentId, maxRevision, status) {
    await pool.query(
        `UPDATE operations SET validation_status = $1 WHERE document_id = $2 AND revision <= $3 AND validation_status = 'pending'`,
        [status, documentId, maxRevision]
    );
}

async function saveSnapshot(documentId, revision, content) {
    await pool.query(
        `INSERT INTO snapshots (document_id, revision, content, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (document_id, revision) DO UPDATE SET content = $3, created_at = NOW()`,
        [documentId, revision, content]
    );
}

async function getLatestSnapshot(documentId) {
    const { rows } = await pool.query(
        `SELECT * FROM snapshots WHERE document_id = $1 ORDER BY revision DESC LIMIT 1`,
        [documentId]
    );
    return rows[0];
}

module.exports = {
    pool,
    createDocument,
    getDocument,
    getOperations,
    saveOperation,
    updateOperationValidationStatus,
    updateAllPendingOperationsStatus,
    saveSnapshot,
    getLatestSnapshot
};
