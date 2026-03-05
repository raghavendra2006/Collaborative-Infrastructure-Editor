const express = require('express');
const http = require('http');
const { setupRoutes } = require('../../internal/api/routes');
const { setupWebSocket } = require('../../internal/api/ws_handler');

const port = process.env.APP_PORT || 8080;

const app = express();
app.use(express.json());

setupRoutes(app);

const server = http.createServer(app);

setupWebSocket(server);

server.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
