const WebSocket = require('ws');
const http = require('http');

async function createDoc() {
    return new Promise((resolve) => {
        const data = JSON.stringify({ name: "ws_test.yaml", content: "apiVersion: v1" });
        const req = http.request({ hostname: 'localhost', port: 8080, path: '/api/v1/documents', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
            let body = ''; res.on('data', c => body += c); res.on('end', () => resolve(JSON.parse(body).id));
        });
        req.write(data); req.end();
    });
}

(async () => {
    const docId = await createDoc();
    const wsA = new WebSocket('ws://localhost:8080/ws');
    const wsB = new WebSocket('ws://localhost:8080/ws');

    let openCount = 0;
    const onOpen = () => {
        openCount++;
        if (openCount === 2) {
            wsA.send(JSON.stringify({ document_id: docId, user_id: 'a0000000-0000-0000-0000-000000000001', revision: 1, operation: { type: 'insert', position: 14, value: '\nkind: Pod' } }));
            wsB.send(JSON.stringify({ document_id: docId, user_id: 'b0000000-0000-0000-0000-000000000002', revision: 1, operation: { type: 'insert', position: 14, value: '\nmetadata:' } }));
        }
    };
    wsA.on('open', onOpen); wsB.on('open', onOpen);

    let receivedMsg = 0;
    const onMsg = (msg) => {
        console.log('Received:', msg.toString());
        receivedMsg++;
        if (receivedMsg === 4) {
            wsA.close(); wsB.close();
            console.log("WebSocket test complete.");
        }
    };
    wsA.on('message', onMsg); wsB.on('message', onMsg);
})();
