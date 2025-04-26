const path = require('path');
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

// Generate a unique file name with a timestamp
const getTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

class Recorder {
    constructor() {
        this.browser = null;
        this.page = null;
        this.totalSize = 0;
        this.outputWebM = null;
        this.writeStream = null;
        this.progressCallback = null;
        this.errorCallback = null;
        this.BASE_TIMEOUT = 120000;
        this.currentStep = 0;
        this.totalSteps = 5; // Total number of main steps in the process
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Start with initialization step
            this.currentStep = 0;
            this.updateProgress('Preparing browser launch...', 0);

            // Pre-launch configuration
            this.isInitialized = true;
            this.updateProgress('Browser configuration ready', 100);
            
            // Move to next step immediately
            this.currentStep = 1;
            return Promise.resolve();
        } catch (error) {
            this.isInitialized = false;
            if (this.errorCallback) {
                this.errorCallback(error.message);
            }
            throw error;
        }
    }

    updateProgress(message, stepProgress = 0, additionalData = {}) {
        if (this.progressCallback) {
            const baseProgress = (this.currentStep / this.totalSteps) * 100;
            const stepContribution = (1 / this.totalSteps) * stepProgress;
            const totalProgress = Math.min(Math.round(baseProgress + stepContribution), 100);

            this.progressCallback('progress', {
                message,
                step: this.currentStep,
                totalSteps: this.totalSteps,
                progress: totalProgress,
                ...additionalData
            });
        }
    }

    setCallbacks(progressCallback, errorCallback) {
        this.progressCallback = progressCallback;
        this.errorCallback = errorCallback;
    }

    async startRecording(meetingUrl) {
        try {
            // Initialize recorder
            await this.initialize();

            // Launch browser in parallel with other setup
            this.updateProgress('Setting up browser...', 0);
            const browserPromise = puppeteer.launch({
                protocolTimeout: this.BASE_TIMEOUT,
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--use-fake-ui-for-media-stream',
                    '--disable-audio-output'
                ]
            });

            // Do any other initialization work here while browser launches
            this.updateProgress('Setting up browser...', 30);

            // Wait for browser to be ready
            this.browser = await browserPromise;
            this.updateProgress('Browser ready', 100);

            // Step 2: Setup page and handlers
            this.currentStep = 2;
            this.updateProgress('Setting up page...', 0);
            this.page = await this.browser.newPage();
            this.setupPageHandlers();
            this.updateProgress('Page setup complete', 100);

            // Step 3: Access meeting
            this.currentStep = 3;
            this.updateProgress('Accessing the meeting...', 0);
            await this.page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 0 });
            this.updateProgress('Meeting page loaded', 50);
            await new Promise(resolve => setTimeout(resolve, 5000));
            this.updateProgress('Meeting access complete', 100);

            // Step 4: Setup recording
            this.currentStep = 4;
            this.updateProgress('Initializing recording...', 0);
            await this.setupRecording();
            this.updateProgress('Recording setup complete', 100);

            // Step 5: Start monitoring
            this.currentStep = 5;
            this.updateProgress('Starting recording monitor...', 0);
            this.startRecordingMonitor();
            this.updateProgress('Recording in progress', 100);

        } catch (error) {
            if (this.errorCallback) this.errorCallback(error.message);
            await this.stopRecording();
            throw error;
        }
    }

    setupPageHandlers() {
        // Console logging
        this.page.on('console', msg => console.log('Browser console:', msg.text()));
        
        // Error handling
        this.page.on('error', err => {
            console.error('Page error:', err);
            this.stopRecording();
        });

        // Process termination handling
        process.on('SIGTERM', async () => {
            console.log('\\nReceived SIGTERM');
            await this.stopRecording();
        });
    }

    async setupRecording() {
        // Your existing recording setup code here
        // (Moved from record_meeting.js)
        // This includes the video playback setup, MediaRecorder setup, etc.
    }

    startRecordingMonitor() {
        const interval = 1000;
        setInterval(async () => {
            try {
                // Check video status
                const videoEnded = await this.page.evaluate(() => {
                    const videoElement = document.querySelector('video');
                    return videoElement && videoElement.ended;
                });

                if (videoEnded) {
                    if (this.progressCallback) this.progressCallback('Video playback has ended. Stopping recording...');
                    await this.stopRecording();
                }

                // Check connection
                const isConnected = await this.page.evaluate(() => navigator.onLine);
                if (!isConnected) {
                    if (this.progressCallback) this.progressCallback('Connection lost. Stopping recording...');
                    await this.stopRecording();
                }

                // Update progress
                const progress = await this.page.evaluate(() => {
                    const video = document.querySelector('video');
                    return video ? {
                        currentTime: video.currentTime,
                        duration: video.duration
                    } : null;
                });

                if (progress && this.progressCallback) {
                    this.progressCallback('progress', progress);
                }

            } catch (err) {
                if (this.errorCallback) this.errorCallback(err.message);
                await this.stopRecording();
            }
        }, interval);
    }

    async stopRecording() {
        if (this.progressCallback) this.progressCallback("Stopping recording...");
        try {
            if (this.page) {
                await this.page.evaluate(() => {
                    if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
                        window.mediaRecorder.stop();
                    }
                });
            }

            if (this.writeStream) {
                this.writeStream.end();
            }

            if (this.browser) {
                await this.browser.close();
            }

            if (this.progressCallback) this.progressCallback("Recording stopped and saved successfully.");
        } catch (error) {
            if (this.errorCallback) this.errorCallback(error.message);
        }
    }
}

module.exports = Recorder;
