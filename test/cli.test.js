const test = require('node:test');
const assert = require('node:assert/strict');
const { formatBytes, isValidMeetingUrl, parseCliArgs } = require('../record_meeting');

test('formatBytes returns megabytes with one decimal place', () => {
    assert.equal(formatBytes(0), '0MB');
    assert.equal(formatBytes(-1), '0MB');
    assert.equal(formatBytes(Number.NaN), '0MB');
    assert.equal(formatBytes(1024 * 1024), '1.0MB');
    assert.equal(formatBytes(1536 * 1024), '1.5MB');
});

test('isValidMeetingUrl accepts only http and https URLs', () => {
    assert.equal(isValidMeetingUrl('https://example.com/playback'), true);
    assert.equal(isValidMeetingUrl('http://example.com/playback'), true);
    assert.equal(isValidMeetingUrl('ftp://example.com/playback'), false);
    assert.equal(isValidMeetingUrl('example.com/playback'), false);
    assert.equal(isValidMeetingUrl(''), false);
});

test('parseCliArgs accepts an existing WebM conversion request', () => {
    assert.deepEqual(
        parseCliArgs(['--convert', 'recording.webm', '--output', 'recording.mp4']),
        { convert: 'recording.webm', output: 'recording.mp4', help: false }
    );
    assert.deepEqual(
        parseCliArgs(['-c', 'recording.webm']),
        { convert: 'recording.webm', output: null, help: false }
    );
});

test('parseCliArgs rejects incomplete conversion options', () => {
    assert.throws(() => parseCliArgs(['--convert']), /requires a WebM file path/);
    assert.throws(() => parseCliArgs(['--convert', '--output', 'recording.mp4']), /requires a WebM file path/);
    assert.throws(() => parseCliArgs(['--output', 'recording.mp4']), /only be used with --convert/);
    assert.throws(() => parseCliArgs(['--convert', 'recording.webm', '--output']), /requires an MP4 file path/);
    assert.throws(() => parseCliArgs(['--unknown']), /Unknown option/);
});
