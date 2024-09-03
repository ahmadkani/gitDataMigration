const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');
const http = require('isomorphic-git/http/node');

async function processRepo(data, index, total) {
    const { filePath, repoUrl, username, password } = data;
    
    // Create a directory for each repository based on its URL or a unique identifier
    const repoName = path.basename(repoUrl, path.extname(repoUrl)); // Extract repo name from URL
    const dir = path.join(__dirname, 'uploads', repoName);

    // Ensure the directory exists
    fs.mkdirSync(dir, { recursive: true });

    process.send({ index, status: 'starting', message: `Starting processing for ${filePath}` });

    await git.init({ fs, dir });

    process.send({ index, status: 'info', message: 'Git repository initialized.' });

    // Read the file contents from the 'filesToUpload' directory
    const fullFilePath = path.join(__dirname, 'filesToUpload', filePath);
    const content = fs.readFileSync(fullFilePath, 'utf8');

    // Write the file to the repository directory
    const fileName = path.basename(filePath);
    const destFilePath = path.join(dir, fileName);
    fs.writeFileSync(destFilePath, content);

    process.send({ index, status: 'info', message: `${fileName} added to repository.` });

    await git.add({ fs, dir, filepath: fileName });

    process.send({ index, status: 'info', message: 'File added to git index.' });

    // Commit the file
    await git.commit({
        fs,
        dir,
        message: 'Initial commit',
        author: { name: username, email: `${username}@example.com` },
    });

    process.send({ index, status: 'info', message: 'Commit created.' });

    // Push to the remote repository
    await git.push({
        fs,
        dir,
        http,
        url: repoUrl,
        ref: 'master',
        onAuth: () => ({ username, password }),
        force: true,
    });

    process.send({ index, status: 'info', message: `Pushed to ${repoUrl}` });
    process.send({ index, status: 'done', message: `Processing complete for ${filePath}` });
}

process.on('message', async (jsonData) => {
    try {
        const total = jsonData.length;
        for (let i = 0; i < total; i++) {
            await processRepo(jsonData[i], i, total);
        }
        process.send({ status: 'done' });
    } catch (error) {
        process.send({ status: 'error', error: error.message });
        console.error('An error occurred:', error);
        console.error('Error stack trace:', error.stack);
    }
});
