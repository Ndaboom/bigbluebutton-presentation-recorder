const fs = require('fs');
const path = require('path');

function isExecutable(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
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

    const ffmpegPath = candidates.find((candidate) => candidate && isExecutable(candidate));
    if (!ffmpegPath) {
        throw new Error(
            'FFmpeg executable not found. Install dependencies with npm install, install ffmpeg, or set FFMPEG_PATH to the ffmpeg binary.'
        );
    }

    return ffmpegPath;
}

module.exports = {
    resolveFFmpegPath
};
