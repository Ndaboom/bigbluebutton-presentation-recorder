const test = require('node:test');
const assert = require('node:assert/strict');
const Recorder = require('../src/lib/recorder');

test('Recorder starts with expected recording state', () => {
    const recorder = new Recorder();

    assert.equal(recorder.browser, null);
    assert.equal(recorder.page, null);
    assert.equal(recorder.totalSize, 0);
    assert.equal(recorder.isInitialized, false);
    assert.equal(recorder.captureStrategy, 'captureStream');
});
