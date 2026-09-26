const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Recorder = require('../src/lib/recorder');
const {
    assertSupportedRuntimeArchitecture,
    formatDuration,
    isAppleSiliconHostUsingIntelNode,
    parseFfmpegTimestamp
} = require('../src/lib/recorder');

test('Recorder starts with expected recording state', () => {
    const recorder = new Recorder();

    assert.equal(recorder.browser, null);
    assert.equal(recorder.page, null);
    assert.equal(recorder.totalSize, 0);
    assert.equal(recorder.isInitialized, false);
    assert.equal(recorder.captureStrategy, 'captureStream');
    assert.equal(recorder.lastPlaybackTime, 0);
    assert.equal(recorder.maxPlaybackStallMs, 5 * 60 * 1000);
});

test('parseFfmpegTimestamp converts FFmpeg timestamps to seconds', () => {
    assert.equal(parseFfmpegTimestamp('00:00:05.50'), 5.5);
    assert.equal(parseFfmpegTimestamp('00:02:03.00'), 123);
    assert.equal(parseFfmpegTimestamp('01:00:00.00'), 3600);
    assert.equal(parseFfmpegTimestamp('bad-value'), null);
});

test('formatDuration renders short ETA values for progress messages', () => {
    assert.equal(formatDuration(null), 'calculating');
    assert.equal(formatDuration(4.1), '5s');
    assert.equal(formatDuration(65.2), '1m 6s');
});

test('architecture check detects Intel Node on an Apple Silicon host', () => {
    const options = {
        platform: 'darwin',
        architecture: 'x64',
        readSystemValue: () => '1\n'
    };

    assert.equal(isAppleSiliconHostUsingIntelNode(options), true);
    assert.throws(
        () => assertSupportedRuntimeArchitecture(options),
        /Intel \(x64\) build of Node\.js/
    );
});

test('architecture check accepts a native ARM64 Node runtime', () => {
    const options = {
        platform: 'darwin',
        architecture: 'arm64',
        readSystemValue: () => '1\n'
    };

    assert.equal(isAppleSiliconHostUsingIntelNode(options), false);
    assert.doesNotThrow(() => assertSupportedRuntimeArchitecture(options));
});

test('architecture check does not restrict Linux or Windows', () => {
    for (const platform of ['linux', 'win32']) {
        const options = {
            platform,
            architecture: 'x64',
            readSystemValue: () => {
                throw new Error('macOS system detection must not run');
            }
        };

        assert.equal(isAppleSiliconHostUsingIntelNode(options), false);
        assert.doesNotThrow(() => assertSupportedRuntimeArchitecture(options));
    }
});

test('getRecoverableWebMPath returns only a non-empty recording file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbb-recovery-test-'));
    const webmPath = path.join(tempDir, 'recording.webm');
    const recorder = new Recorder();
    recorder.outputWebM = webmPath;

    try {
        assert.equal(recorder.getRecoverableWebMPath(), null);
        fs.writeFileSync(webmPath, '');
        assert.equal(recorder.getRecoverableWebMPath(), null);
        fs.writeFileSync(webmPath, 'recoverable recording data');
        assert.equal(recorder.getRecoverableWebMPath(), webmPath);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
