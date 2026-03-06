const express = require('express');
const http = require('http');
const { setupRoutes } = require('../../internal/api/routes');
const { setupWebSocket } = require('../../internal/api/ws_handler');

const port = process.env.APP_PORT || 8080;

const app = express();
const cors = require('cors');
const path = require('path');

app.use(cors());
app.use(express.json());

// Serve static frontend files (like demo.html) from the root directory
app.use(express.static(path.join(__dirname, '../../')));

setupRoutes(app);

const server = http.createServer(app);

setupWebSocket(server);

server.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
