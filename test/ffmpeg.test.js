const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveFFmpegPath } = require('../src/lib/ffmpeg');

test('resolveFFmpegPath prefers an executable FFMPEG_PATH', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbb-ffmpeg-test-'));
    const executablePath = path.join(tempDir, 'ffmpeg');
    const previousPath = process.env.FFMPEG_PATH;

    try {
        fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n');
        fs.chmodSync(executablePath, 0o755);

        process.env.FFMPEG_PATH = executablePath;
        assert.equal(resolveFFmpegPath(), executablePath);
    } finally {
        if (previousPath === undefined) {
            delete process.env.FFMPEG_PATH;
        } else {
            process.env.FFMPEG_PATH = previousPath;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('resolveFFmpegPath finds an executable bundled ffmpeg', () => {
    const previousPath = process.env.FFMPEG_PATH;

    try {
        delete process.env.FFMPEG_PATH;
        const ffmpegPath = resolveFFmpegPath();
        fs.accessSync(ffmpegPath, fs.constants.X_OK);
        assert.match(path.basename(ffmpegPath), /^ffmpeg(?:\.exe)?$/);
    } finally {
        if (previousPath !== undefined) {
            process.env.FFMPEG_PATH = previousPath;
        }
    }
});
