const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function isExecutable(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function isUsableFFmpeg(filePath) {
    if (!isExecutable(filePath)) return false;

    const result = spawnSync(filePath, ['-version'], {
        stdio: 'ignore',
        timeout: 5000,
        windowsHide: true
    });
    return !result.error && result.status === 0;
}

function resolveFFmpegPath() {
    const candidates = [];

    if (process.env.FFMPEG_PATH) {
        candidates.push(process.env.FFMPEG_PATH);
    }

    try {
        const ffmpegStaticPath = require('ffmpeg-static');
        if (ffmpegStaticPath) {
            candidates.push(ffmpegStaticPath);
        }
    } catch {
        // Optional dependency fallback; continue checking system locations.
    }

    const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const entry of pathEntries) {
        candidates.push(path.join(entry, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
    }

    candidates.push(
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/snap/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg'
    );

    const ffmpegPath = candidates.find((candidate) => candidate && isUsableFFmpeg(candidate));
    if (!ffmpegPath) {
        throw new Error(
            'A working FFmpeg executable was not found. Reinstall dependencies with npm install, install ffmpeg, or set FFMPEG_PATH to a valid ffmpeg binary.'
        );
    }

    return ffmpegPath;
}

module.exports = {
    isUsableFFmpeg,
    resolveFFmpegPath
};
