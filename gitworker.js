const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');
const http = require('isomorphic-git/http/node');

async function processRepo(data) {
    const { filePath, repoUrl, username, password } = data;

    const dir = `/tmp/repo-${Date.now()}`;

    // Create a new directory for the git repository
    fs.mkdirSync(dir, { recursive: true });

    // Initialize a new git repository
    await git.init({ fs, dir });

    // Read the file contents from the 'filesToUpload' directory
    const fullFilePath = path.join(__dirname, 'filesToUpload', filePath);
    const content = fs.readFileSync(fullFilePath, 'utf8');

    // Write the file to the repository directory
    const fileName = path.basename(filePath);
    const destFilePath = path.join(dir, fileName);
    fs.writeFileSync(destFilePath, content);

    // Add the file to the git index
    await git.add({ fs, dir, filepath: fileName });

    // Commit the file
    await git.commit({
        fs,
        dir,
        message: 'Initial commit',
        author: { name: username, email: `${username}@example.com` },
    });

    // Push to the remote repository
    await git.push({
        fs,
        dir,
        http,
        url: repoUrl,
        ref: 'master',
        onAuth: () => ({ username, password }),
        force: true, // Necessary for pushing to an empty repository
    });
}

process.on('message', async (jsonData) => {
    try {
        for (const repoData of jsonData) {
            await processRepo(repoData);
        }
        process.send({ status: 'done' });
    } catch (error) {
        process.send({ status: 'error', error: error.message });
    }
});
