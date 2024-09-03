const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const WebSocket = require('ws');

const app = express();
const upload = multer({ dest: 'uploads/' });
const wss = new WebSocket.Server({ noServer: true });

app.use(express.static('public'));

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error('Error sending file:', err);
            res.status(500).send('Internal Server Error');
        }
    });
});


// Handle JSON file upload
app.post('/upload', upload.single('jsonFile'), (req, res) => {
    const filePath = path.join(__dirname, req.file.path);
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const gitWorker = fork('gitworker.js');

    gitWorker.on('message', (message) => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });

        if (message.status === 'done') {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    });

    gitWorker.send(jsonData);
});

// Handle WebSocket upgrades
app.server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is running on port ${app.server.address().port}`);
});

app.server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
