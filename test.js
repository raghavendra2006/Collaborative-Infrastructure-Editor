const http = require('http');


async function testApi() {
    return new Promise((resolve) => {
        const data = JSON.stringify({
            name: "valid.yaml",
            content: "apiVersion: v1\nkind: Pod\nmetadata:\n  name: valid\n"
        });

        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: '/api/v1/documents',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const doc = JSON.parse(body);
                console.log('Doc Created:', doc);
                resolve(doc.id);
            });
        });
        req.write(data);
        req.end();
    });
}

async function testCommit(id) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: `/api/v1/documents/${id}/commit`,
            method: 'POST'
        }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                console.log('Commit Result:', JSON.parse(body));
                resolve();
            });
        });
        req.end();
    });
}

function testMetrics() {
    return new Promise((resolve) => {
        http.get('http://localhost:8080/metrics', (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                console.log('Metrics snippet:', body.split('\\n').filter(l => l.includes('total') || l.includes('latency') || l.includes('snapshot')).slice(0, 5));
                resolve();
            });
        });
    });
}

async function run() {
    const id = await testApi();
    await testCommit(id);
    await testMetrics();
}

run();
