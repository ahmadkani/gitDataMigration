const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle JSON file upload
app.post('/upload', upload.single('jsonFile'), (req, res) => {
    const filePath = path.join(__dirname, req.file.path);
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const gitWorker = fork('gitworker.js');

    gitWorker.on('message', (message) => {
        if (message.status === 'done') {
            res.send('All files have been pushed to the respective repositories.');
        } else if (message.status === 'error') {
            res.status(500).send(`Error: ${message.error}`);
        }
    });

    gitWorker.send(jsonData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
