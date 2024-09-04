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

    // Function to recursively add all files from a directory
    async function addFilesRecursively(sourceDir, destDir) {
        const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
            const sourcePath = path.join(sourceDir, entry.name);
            const destPath = path.join(destDir, entry.name);
            if (entry.isDirectory()) {
                // Create corresponding directory in the destination
                fs.mkdirSync(destPath, { recursive: true });
                // Recurse into the directory
                await addFilesRecursively(sourcePath, destPath);
            } else {
                // Read the file and write it to the destination directory
                const content = fs.readFileSync(sourcePath, 'utf8');
                fs.writeFileSync(destPath, content);
                // Add file to the git index
                await git.add({ fs, dir, filepath: path.relative(dir, destPath) });
                process.send({ index, status: 'info', message: `${path.relative(dir, destPath)} added to git index.` });
            }
        }
    }

    // Check if filePath is a directory
    const fullFilePath = path.join(__dirname, 'filesToUpload', filePath);
    const stat = fs.statSync(fullFilePath);

    if (stat.isDirectory()) {
        process.send({ index, status: 'info', message: `${filePath} is a directory. Processing all files inside.` });
        await addFilesRecursively(fullFilePath, dir);
    } else {
        // If it's a file, process it as usual
        const fileName = path.basename(filePath);
        const destFilePath = path.join(dir, fileName);
        const content = fs.readFileSync(fullFilePath, 'utf8');
        fs.writeFileSync(destFilePath, content);
        await git.add({ fs, dir, filepath: fileName });
        process.send({ index, status: 'info', message: `${fileName} added to git index.` });
    }

    // Commit all changes
    const commitId = await git.commit({
        fs,
        dir,
        message: 'Initial commit',
        author: { name: username, email: `${username}@example.com` },
    });

    process.send({ index, status: 'info', message: `Commit created with ID: ${commitId}` });

    try {
        // Attempt to push to the remote repository
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

    } catch (pushError) {
        
        console.error('Push failed:', pushError);

        // Clone the remote repository
        const cloneDir = path.join(__dirname, 'clones', repoName);

        // Ensure the clone directory exists
        fs.mkdirSync(cloneDir, { recursive: true });

        process.send({ index, status: 'info', message: `Cloning the repository from ${repoUrl}` });

        await git.clone({
            fs,
            http,
            dir: cloneDir,
            url: repoUrl,
            ref: 'master',
            singleBranch: true,
            depth: 1,
            onAuth: () => ({ username, password }),
        });

        process.send({ index, status: 'info', message: `Repository cloned to ${cloneDir}` });

        if (stat.isDirectory()) {
            // Write the directory to the cloned repository
            await addFilesRecursively(fullFilePath, cloneDir);
        } else {
            // Write the file to the cloned repository
            const cloneDestFilePath = path.join(cloneDir, path.basename(filePath));
            fs.writeFileSync(cloneDestFilePath, content);
            await git.add({ fs, dir: cloneDir, filepath: path.basename(filePath) });
        }

        process.send({ index, status: 'info', message: 'Files added to git index in cloned repo.' });

        // Commit the file in the cloned repository
        const cloneCommitId = await git.commit({
            fs,
            dir: cloneDir,
            message: 'Retry commit after failed push',
            author: { name: username, email: `${username}@example.com` },
        });

        process.send({ index, status: 'info', message: `Commit created in cloned repo with ID: ${cloneCommitId}` });

        // Attempt to push again from the cloned repository
        await git.push({
            fs,
            dir: cloneDir,
            http,
            url: repoUrl,
            ref: 'master',
            onAuth: () => ({ username, password }),
            force: true,
        });

        process.send({ index, status: 'info', message: `Pushed to ${repoUrl} from cloned repo` });
    }

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
