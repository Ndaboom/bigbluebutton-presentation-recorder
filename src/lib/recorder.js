const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const BASE_TEMP_DIR = path.join(process.cwd(), 'temp_chunks');
const EXPORT_DIR = path.join(process.cwd(), 'public', 'exports');

const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const getTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Recorder {
    constructor() {
        this.browser = null;
        this.page = null;
        this.totalSize = 0;
        this.outputWebM = null;
        this.outputMP4 = null;
        this.publicDownloadUrl = null;
        this.writeStream = null;
        this.progressCallback = null;
        this.errorCallback = null;
        this.BASE_TIMEOUT = 120000;
        this.currentStep = 0;
        this.totalSteps = 6;
        this.isInitialized = false;
        this.monitorInterval = null;
        this.isStopping = false;
        this.lastChunkPromise = Promise.resolve();
        this.sessionId = null;
        const rateFromEnv = parseFloat(process.env.BBB_PLAYBACK_RATE || '1.0');
        this.playbackRate = Number.isFinite(rateFromEnv) && rateFromEnv > 0
            ? Math.min(2, Math.max(0.5, rateFromEnv))
            : 1.0;
        this.captureStrategy = 'captureStream';
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            this.currentStep = 0;
            this.updateProgress('Preparing recording environment...', 10);

            ensureDir(BASE_TEMP_DIR);
            ensureDir(EXPORT_DIR);

            this.sessionId = getTimestamp();
            this.outputWebM = path.join(BASE_TEMP_DIR, `recording_${this.sessionId}.webm`);
            this.outputMP4 = path.join(EXPORT_DIR, `meeting_${this.sessionId}.mp4`);
            this.publicDownloadUrl = `/exports/meeting_${this.sessionId}.mp4`;

            if (fs.existsSync(this.outputWebM)) fs.unlinkSync(this.outputWebM);
            if (fs.existsSync(this.outputMP4)) fs.unlinkSync(this.outputMP4);

            this.isInitialized = true;
            this.updateProgress('Environment ready', 100);
            this.currentStep = 1;
        } catch (error) {
            this.isInitialized = false;
            if (this.errorCallback) {
                this.errorCallback(error.message);
            }
            throw error;
        }
    }

    updateProgress(message, stepProgress = 0, additionalData = {}) {
        if (!this.progressCallback) return;

        const effectiveTotalSteps = this.totalSteps || 1;
        const baseProgress = (this.currentStep / effectiveTotalSteps) * 100;
        const stepContribution = (1 / effectiveTotalSteps) * stepProgress;
        const totalProgress = Math.min(Math.round(baseProgress + stepContribution), 100);

        this.progressCallback('progress', {
            message,
            step: this.currentStep,
            totalSteps: effectiveTotalSteps,
            progress: totalProgress,
            ...additionalData
        });
    }

    setCallbacks(progressCallback, errorCallback) {
        this.progressCallback = progressCallback;
        this.errorCallback = errorCallback;
    }

    async startRecording(meetingUrl) {
        try {
            await this.initialize();

            this.updateProgress('Launching browser...', 10);
            this.browser = await puppeteer.launch({
                protocolTimeout: this.BASE_TIMEOUT,
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--autoplay-policy=no-user-gesture-required',
                    '--use-fake-ui-for-media-stream',
                    '--enable-usermedia-screen-capturing',
                    '--allow-http-screen-capture',
                    '--auto-accept-this-tab-capture',
                    '--allow-running-insecure-content',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--enable-audio-autoplay',
                    '--disable-audio-output',
                    '--window-size=1920,1080'
                ]
            });
            this.updateProgress('Browser ready', 100);

            this.currentStep = 2;
            this.updateProgress('Preparing page...', 0);
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1280, height: 720 });
            await this.page.setDefaultTimeout(this.BASE_TIMEOUT);
            this.setupPageHandlers();
            this.updateProgress('Page prepared', 100);

            this.currentStep = 3;
            this.updateProgress('Accessing meeting...', 0);
            await this.page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 0 });
            await sleep(3000);
            await this.ensureVideoReady();
            await this.applyPlayerStyling();
            this.updateProgress('Meeting ready', 100);

            this.currentStep = 4;
            this.updateProgress('Configuring recorder...', 0);
            await this.setupRecording();
            this.updateProgress('Recorder configured', 100, {
                captureStrategy: this.captureStrategy,
                playbackRate: this.playbackRate
            });

            this.currentStep = 5;
            this.updateProgress('Recording started', 10, {
                captureStrategy: this.captureStrategy,
                playbackRate: this.playbackRate
            });
            this.startRecordingMonitor();
        } catch (error) {
            if (this.errorCallback) this.errorCallback(error.message);
            await this.stopRecording({ error });
            throw error;
        }
    }

    setupPageHandlers() {
        if (!this.page) return;

        this.page.on('console', (msg) => {
            const text = msg.text();
            if (text) {
                console.log('Browser console:', text);
            }
        });

        this.page.on('error', async (err) => {
            console.error('Page error:', err);
            if (this.errorCallback) this.errorCallback(err.message);
            await this.stopRecording({ error: err });
        });

        this.page.on('pageerror', async (err) => {
            console.error('Browser page error:', err);
            if (this.errorCallback) this.errorCallback(err.message);
            await this.stopRecording({ error: err });
        });
    }

    async ensureVideoReady() {
        if (!this.page) throw new Error('Browser page not available');

        await this.page.waitForSelector('video', { timeout: this.BASE_TIMEOUT });
        await this.page.waitForFunction(() => {
            const video = document.querySelector('video');
            return video && !Number.isNaN(video.duration) && video.readyState >= 2;
        }, { timeout: this.BASE_TIMEOUT });
    }

    async applyPlayerStyling() {
        if (!this.page) return;

        const styleContent = `
            body, html {
                background: #000 !important;
            }
            .top-bar, .bottom-bar, .control-bar {
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `;

        try {
            await this.page.addStyleTag({ content: styleContent });
        } catch (error) {
            console.warn('Failed to apply custom player styling:', error.message);
        }

        await this.page.evaluate(() => {
            const selectors = ['.top-bar', '.bottom-bar', '.control-bar'];
            selectors.forEach((selector) => {
                document.querySelectorAll(selector).forEach((el) => {
                    el.style.display = 'none';
                });
            });
        });
    }

    async setupRecording() {
        if (!this.page) throw new Error('Browser page not available');

        this.totalSize = 0;
        this.lastChunkPromise = Promise.resolve();
        this.writeStream = fs.createWriteStream(this.outputWebM);
        this.writeStream.on('error', (err) => {
            console.error('Write stream error:', err);
            if (this.errorCallback) this.errorCallback('Failed to write recording data');
        });

        await this.page.exposeFunction('saveChunk', async (chunkArray) => {
            if (!Array.isArray(chunkArray) || !this.writeStream) return false;

            const buffer = Buffer.from(chunkArray);
            this.lastChunkPromise = this.lastChunkPromise.then(() => new Promise((resolve, reject) => {
                this.writeStream.write(buffer, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            }));

            try {
                await this.lastChunkPromise;
            } catch (err) {
                console.error('Failed to persist recording chunk:', err);
                if (this.errorCallback) this.errorCallback('Failed to persist recording chunk');
                return false;
            }

            this.totalSize += buffer.length;

            if (this.progressCallback) {
                const recordedMB = (this.totalSize / (1024 * 1024)).toFixed(1);
                this.progressCallback('progress', {
                    message: `Captured ${recordedMB}MB of data`,
                    recordedBytes: this.totalSize,
                    step: this.currentStep,
                    totalSteps: this.totalSteps
                });
            }

            return true;
        });

        const recordingResult = await this.page.evaluate(async (desiredPlaybackRate) => {
            if (!window.__bbbRecorderInitialized) {
                window.__bbbRecorderInitialized = true;
            }

            const video = document.querySelector('video');
            if (!video) {
                throw new Error('Video element not found');
            }

            video.muted = false;
            video.volume = 1.0;

            if (video.readyState < 2) {
                await new Promise((resolve) => {
                    video.addEventListener('loadeddata', resolve, { once: true });
                });
            }

            try {
                await video.play();
            } catch (error) {
                console.warn('Automatic playback failed:', error);
            }

            if (desiredPlaybackRate && Number.isFinite(desiredPlaybackRate)) {
                try {
                    video.playbackRate = desiredPlaybackRate;
                } catch (err) {
                    console.warn('Failed to apply custom playback rate:', err);
                }
            }

            const tryCaptureStream = () => {
                if (video.captureStream) {
                    try {
                        return video.captureStream();
                    } catch (err) {
                        console.warn('captureStream failed:', err);
                        return null;
                    }
                }
                if (video.mozCaptureStream) {
                    try {
                        return video.mozCaptureStream();
                    } catch (err) {
                        console.warn('mozCaptureStream failed:', err);
                    }
                }
                return null;
            };

            let captureStream = null;
            let strategy = 'displayMedia';

            const ensureHasVideo = (stream) => stream && stream.getVideoTracks && stream.getVideoTracks().length;

            const requestDisplayMedia = async () => navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: { ideal: 60, max: 60 },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    displaySurface: 'browser'
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    channelCount: 2,
                    sampleRate: 48000,
                    sampleSize: 16
                }
            });

            try {
                captureStream = await requestDisplayMedia();
            } catch (err) {
                console.warn('getDisplayMedia failed, falling back to direct capture:', err);
            }

            if (!ensureHasVideo(captureStream)) {
                captureStream = tryCaptureStream();
                strategy = 'captureStream';
            }

            if (!ensureHasVideo(captureStream)) {
                throw new Error('Unable to capture playback stream');
            }

            const finalStream = new MediaStream();

            captureStream.getVideoTracks().forEach((track) => finalStream.addTrack(track));

            let audioAdded = false;
            const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

            if (AudioContextConstructor) {
                try {
                    const audioContext = new AudioContextConstructor();
                    if (audioContext.state === 'suspended') {
                        await audioContext.resume();
                    }

                    const destination = audioContext.createMediaStreamDestination();
                    const source = audioContext.createMediaElementSource(video);
                    source.connect(destination);
                    source.connect(audioContext.destination);

                    window.__bbbRecorderAudioContext = audioContext;
                    window.__bbbRecorderAudioSource = source;
                    window.__bbbRecorderAudioDestination = destination;

                    destination.stream.getAudioTracks().forEach((track) => {
                        finalStream.addTrack(track);
                        audioAdded = true;
                    });
                } catch (audioErr) {
                    console.warn('Failed to capture audio from media element:', audioErr);
                }
            }

            if (!audioAdded) {
                const audioTracks = captureStream.getAudioTracks ? captureStream.getAudioTracks() : [];
                audioTracks.forEach((track) => {
                    finalStream.addTrack(track);
                    audioAdded = true;
                });
            }

            window.mediaRecorder = new MediaRecorder(finalStream, {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: 8_000_000,
                audioBitsPerSecond: 256_000
            });

            window.__bbbRecorderStopPromise = new Promise((resolve, reject) => {
                window.mediaRecorder.onstop = () => resolve(true);
                window.mediaRecorder.onerror = (event) => reject(event.error || new Error('MediaRecorder error'));
            });

            window.mediaRecorder.ondataavailable = async (event) => {
                if (!event.data || !event.data.size) return;
                const uint8array = new Uint8Array(await event.data.arrayBuffer());
                try {
                    await window.saveChunk(Array.from(uint8array));
                } catch (error) {
                    console.error('Failed to forward recording chunk:', error);
                }
            };

            window.__bbbRecorderStream = captureStream;
            window.mediaRecorder.start(5000);
            return {
                started: true,
                strategy,
                playbackRate: video.playbackRate
            };
        }, this.playbackRate);

        if (!recordingResult?.started) {
            throw new Error('Failed to start recording');
        }

        this.captureStrategy = recordingResult.strategy || 'captureStream';

        this.updateProgress(
            this.captureStrategy === 'displayMedia'
                ? 'Recording via tab capture'
                : 'Recording via direct media capture',
            70,
            { captureStrategy: this.captureStrategy, playbackRate: recordingResult.playbackRate }
        );

        await this.ensureVideoPlaying();
    }

    async ensureVideoPlaying() {
        if (!this.page) return;

        const retries = 5;
        for (let attempt = 0; attempt < retries; attempt += 1) {
            const playing = await this.page.evaluate(async (desiredRate) => {
                const video = document.querySelector('video');
                if (!video) return false;

                const playButton = document.querySelector('button[aria-label="Play"]');
                if (playButton) {
                    playButton.click();
                }

                try {
                    await video.play();
                } catch (error) {
                    console.warn('Retrying playback after failure:', error);
                }

                if (desiredRate && Number.isFinite(desiredRate)) {
                    try {
                        video.playbackRate = desiredRate;
                    } catch (err) {
                        console.warn('Failed to apply playback rate during retry:', err);
                    }
                }
                video.muted = false;
                video.volume = 1.0;

                return !video.paused;
            }, this.playbackRate);

            if (playing) {
                return;
            }

            await sleep(2000);
        }

        throw new Error('Unable to start video playback automatically');
    }

    startRecordingMonitor() {
        if (!this.page) return;

        const interval = 5000;
        this.monitorInterval = setInterval(async () => {
            if (this.isStopping) return;

            try {
                const status = await this.page.evaluate(() => {
                    const video = document.querySelector('video');
                    if (!video) {
                        return null;
                    }

                    return {
                        currentTime: video.currentTime || 0,
                        duration: video.duration || 0,
                        ended: Boolean(video.ended)
                    };
                });

                if (!status) {
                    if (this.errorCallback) this.errorCallback('Video element disappeared');
                    await this.stopRecording({ error: new Error('Video element disappeared') });
                    return;
                }

                const { currentTime, duration, ended } = status;
                const playbackPercent = duration ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;

                if (this.progressCallback) {
                    this.progressCallback('progress', {
                        message: `Recording in progress (${playbackPercent}% of playback at ${this.playbackRate}x)`,
                        currentTime,
                        duration,
                        progress: Math.min(99, playbackPercent),
                        step: this.totalSteps - 1,
                        totalSteps: this.totalSteps,
                        captureStrategy: this.captureStrategy,
                        playbackRate: this.playbackRate
                    });
                }

                if (ended) {
                    await this.stopRecording({ reason: 'Video playback finished' });
                    return;
                }

                const isConnected = await this.page.evaluate(() => navigator.onLine);
                if (!isConnected) {
                    if (this.errorCallback) this.errorCallback('Network connection lost during recording');
                    await this.stopRecording({ error: new Error('Network connection lost during recording') });
                }
            } catch (error) {
                console.error('Monitor error:', error);
                if (this.errorCallback) this.errorCallback(error.message);
                await this.stopRecording({ error });
            }
        }, interval);
    }

    async stopRecording({ reason, error } = {}) {
        if (this.isStopping) return;
        this.isStopping = true;

        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        if (reason && this.progressCallback) {
            this.progressCallback('progress', {
                message: reason,
                step: this.totalSteps - 1,
                totalSteps: this.totalSteps,
                progress: 99
            });
        }

        try {
            if (this.page) {
                await this.page.evaluate(async () => {
                    if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
                        try {
                            if (window.__bbbRecorderStopPromise) {
                                window.mediaRecorder.stop();
                                await window.__bbbRecorderStopPromise;
                            } else {
                                window.mediaRecorder.stop();
                                await new Promise((resolve) => {
                                    window.mediaRecorder.onstop = () => resolve(true);
                                });
                            }
                        } catch (err) {
                            console.error('Failed to stop media recorder:', err);
                        }
                    }
                    if (window.__bbbRecorderStream) {
                        try {
                            window.__bbbRecorderStream.getTracks().forEach((track) => track.stop());
                        } catch (streamErr) {
                            console.warn('Failed to stop capture tracks:', streamErr);
                        }
                        window.__bbbRecorderStream = null;
                    }
                    if (window.__bbbRecorderAudioSource) {
                        try {
                            window.__bbbRecorderAudioSource.disconnect();
                        } catch (disconnectErr) {
                            console.warn('Failed to disconnect audio source:', disconnectErr);
                        }
                        window.__bbbRecorderAudioSource = null;
                    }
                    if (window.__bbbRecorderAudioDestination) {
                        window.__bbbRecorderAudioDestination = null;
                    }
                    if (window.__bbbRecorderAudioContext) {
                        try {
                            window.__bbbRecorderAudioContext.close();
                        } catch (ctxErr) {
                            console.warn('Failed to close audio context:', ctxErr);
                        }
                        window.__bbbRecorderAudioContext = null;
                    }
                });
            }
        } catch (stopError) {
            console.error('Error while stopping recorder:', stopError);
        }

        try {
            await this.lastChunkPromise;
        } catch (chunkError) {
            console.error('Error waiting for pending chunk writes:', chunkError);
        }

        if (this.writeStream) {
            await new Promise((resolve, reject) => {
                this.writeStream.end(() => resolve());
                this.writeStream.once('error', reject);
            }).catch((streamError) => {
                console.error('Error closing write stream:', streamError);
            });
            this.writeStream = null;
        }

        if (this.browser) {
            try {
                await this.browser.close();
            } catch (closeError) {
                console.error('Error closing browser:', closeError);
            }
        }
        this.browser = null;
        this.page = null;

        if (error) {
            if (this.errorCallback) this.errorCallback(error.message || String(error));
            this.cleanupTempFiles();
            return;
        }

        try {
            const outputPath = await this.convertToMP4();
            if (this.progressCallback) {
                this.progressCallback('complete', {
                    message: 'Recording completed successfully',
                    filePath: outputPath,
                    downloadUrl: this.publicDownloadUrl,
                    captureStrategy: this.captureStrategy,
                    playbackRate: this.playbackRate
                });
            }
        } catch (conversionError) {
            console.error('Conversion error:', conversionError);
            if (this.errorCallback) this.errorCallback(conversionError.message);
        } finally {
            this.cleanupTempFiles();
        }
    }

    async convertToMP4() {
        if (!this.outputWebM || !fs.existsSync(this.outputWebM)) {
            throw new Error('No recording data found to convert');
        }

        const stats = fs.statSync(this.outputWebM);
        if (!stats.size) {
            throw new Error('Recorded file is empty');
        }

        if (this.progressCallback) {
            this.progressCallback('progress', {
                message: 'Converting recording to MP4...'
            });
        }

        await new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-y',
                '-i', this.outputWebM,
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                this.outputMP4
            ];

            const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'ignore', 'pipe'] });

            let stderr = '';
            ffmpeg.stderr.on('data', (data) => {
                const message = data.toString();
                stderr += message;

                const timeMatch = message.match(/time=(\d+:\d+:\d+\.\d+)/);
                if (timeMatch && this.progressCallback) {
                    this.progressCallback('progress', {
                        message: `FFmpeg processing... ${timeMatch[1]}`
                    });
                }
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`FFmpeg error: ${err.message}`));
            });

            const fileSizeMB = stats.size / (1024 * 1024);
            const estimatedDurationMs = Math.max(this.BASE_TIMEOUT, fileSizeMB * 10000 * 5);
            const timeout = setTimeout(() => {
                try {
                    ffmpeg.kill('SIGKILL');
                } catch (killError) {
                    console.error('Failed to terminate FFmpeg:', killError);
                }
                reject(new Error('FFmpeg process timed out'));
            }, estimatedDurationMs);

            ffmpeg.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
                }
            });
        });

        return this.outputMP4;
    }

    cleanupTempFiles() {
        try {
            if (this.outputWebM && fs.existsSync(this.outputWebM)) {
                fs.unlinkSync(this.outputWebM);
            }
        } catch (error) {
            console.warn('Failed to remove temporary recording file:', error.message);
        }
    }
}

module.exports = Recorder;
