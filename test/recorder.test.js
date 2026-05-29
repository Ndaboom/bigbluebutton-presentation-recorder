const test = require('node:test');
const assert = require('node:assert/strict');
const Recorder = require('../src/lib/recorder');

test('Recorder clamps playback rate from environment', () => {
    const previousRate = process.env.BBB_PLAYBACK_RATE;

    try {
        process.env.BBB_PLAYBACK_RATE = '4';
        assert.equal(new Recorder().playbackRate, 2);

        process.env.BBB_PLAYBACK_RATE = '0.1';
        assert.equal(new Recorder().playbackRate, 0.5);

        process.env.BBB_PLAYBACK_RATE = '1.75';
        assert.equal(new Recorder().playbackRate, 1.75);

        process.env.BBB_PLAYBACK_RATE = 'not-a-number';
        assert.equal(new Recorder().playbackRate, 1);
    } finally {
        if (previousRate === undefined) {
            delete process.env.BBB_PLAYBACK_RATE;
        } else {
            process.env.BBB_PLAYBACK_RATE = previousRate;
        }
    }
});

test('Recorder starts with expected recording state', () => {
    const recorder = new Recorder();

    assert.equal(recorder.browser, null);
    assert.equal(recorder.page, null);
    assert.equal(recorder.totalSize, 0);
    assert.equal(recorder.isInitialized, false);
    assert.equal(recorder.captureStrategy, 'captureStream');
});
