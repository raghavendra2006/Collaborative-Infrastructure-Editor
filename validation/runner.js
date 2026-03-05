const { exec } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

async function runValidation(content) {
    const tmpDir = os.tmpdir();
    const filename = path.join(tmpDir, `validate-${uuidv4()}.yaml`);

    try {
        await fs.writeFile(filename, content);

        return new Promise((resolve) => {
            exec(`kubectl apply --dry-run=client -f ${filename}`, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        output: stderr || stdout || error.message
                    });
                } else {
                    resolve({
                        success: true,
                        output: stdout || stderr
                    });
                }
            });
        });
    } catch (err) {
        return {
            success: false,
            output: err.message
        };
    } finally {
        try {
            await fs.unlink(filename);
        } catch (e) { /* ignore cleanup error */ }
    }
}

module.exports = {
    runValidation
};
