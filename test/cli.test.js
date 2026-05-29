const test = require('node:test');
const assert = require('node:assert/strict');
const { formatBytes, isValidMeetingUrl } = require('../record_meeting');

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
