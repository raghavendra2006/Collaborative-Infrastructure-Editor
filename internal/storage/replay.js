const repo = require('./repository');
const { applyOperation } = require('../ot/operations');

async function reconstructDocument(documentId, targetRevision = null) {
    const snapshot = await repo.getLatestSnapshot(documentId);

    let content = "";
    let baseRevision = 0;

    if (snapshot) {
        if (targetRevision === null || snapshot.revision <= targetRevision) {
            content = snapshot.content;
            baseRevision = snapshot.revision;
        }
    }

    const minRevision = baseRevision + 1;
    const operations = await repo.getOperations(documentId, minRevision);

    let currentRevision = baseRevision;
    for (const row of operations) {
        if (targetRevision !== null && row.revision > targetRevision) {
            break;
        }
        content = applyOperation(content, row.operation_payload);
        currentRevision = row.revision;
    }

    return { content, revision: currentRevision };
}

module.exports = {
    reconstructDocument
};
