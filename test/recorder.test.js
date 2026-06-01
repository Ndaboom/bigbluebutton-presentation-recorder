const test = require('node:test');
const assert = require('node:assert/strict');
const Recorder = require('../src/lib/recorder');
const { formatDuration, parseFfmpegTimestamp } = require('../src/lib/recorder');

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
