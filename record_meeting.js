const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Generate a unique file name with a timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // Replace invalid filename characters
const OUTPUT_VIDEO = `meeting_${timestamp}.mp4`;

// Configuration
const BASE_TIMEOUT = 300000; // 5 minutes base timeout
const MAX_PROCESSING_MULTIPLIER = 5; // Maximum multiplier for processing time vs video duration

// Create temp directory for chunks if it doesn't exist
const TEMP_DIR = path.join(process.cwd(), 'temp_chunks');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// Keep track of recording
let totalSize = 0;
let outputWebM = null;
let writeStream = null;

// Get meeting URL from user input
let MEETING_URL = "";

// Function to get meeting URL from user
async function getMeetingUrl() {
    return new Promise((resolve) => {
        rl.question('Enter the BigBlueButton recording URL: ', (url) => {
            if (!url.trim()) {
                console.log('URL cannot be empty. Please try again.');
                resolve(getMeetingUrl());
            } else if (!url.startsWith('http')) {
                console.log('Please enter a valid URL starting with http:// or https://');
                resolve(getMeetingUrl());
            } else {
                resolve(url.trim());
            }
        });
    });
}

// Function to gracefully stop recording and save the file
async function stopRecording(page, browser, isPartial = false) {
    console.log(`\n${isPartial ? 'Saving partial recording...' : 'Stopping recording...'}`);
    try {
        // Set longer timeout for protocol calls
        page.setDefaultTimeout(BASE_TIMEOUT);

        // Stop the media recorder if it's running
        const wasStopped = await page.evaluate(() => {
            if (window.mediaRecorder && window.mediaRecorder.state === 'recording') {
                window.mediaRecorder.stop();
                return true;
            }
            return false;
        });

        // Wait for final chunks if we stopped the recording
        if (wasStopped) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Use the chunks from Node.js context
        // Check if the output file exists and has content
        if (!fs.existsSync(outputWebM) || fs.statSync(outputWebM).size === 0) {
            throw new Error('No recording data found');
        }

        console.log('Processing recording...');

        // Close the write stream and wait for all data to be written
        writeStream.end();
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Convert WebM to MP4 using FFmpeg
        console.log('Converting to MP4...');
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', path.join(TEMP_DIR, 'output.webm'),
                '-c:v', 'libx264',     // Transcode video to H.264
                '-c:a', 'aac',         // Transcode audio to AAC
                '-preset', 'medium',    // Encoding preset (balance between speed/quality)
                '-crf', '23',          // Quality setting (23 is default, lower = better)
                '-movflags', '+faststart',  // Enable streaming
                OUTPUT_VIDEO
            ]);

            let ffmpegError = '';

            ffmpeg.stderr.on('data', (data) => {
                const message = data.toString();
                console.log(`FFmpeg: ${message}`);
                if (message.includes('Error')) {
                    ffmpegError += message;
                }
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`FFmpeg process error: ${error.message}`));
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log(`Successfully merged chunks into ${OUTPUT_VIDEO}`);
                    resolve();
                } else {
                    reject(new Error(`FFmpeg failed with code ${code}${ffmpegError ? ': ' + ffmpegError : ''}`));
                }
            });

            // Calculate timeout based on video duration
            const stats = fs.statSync(path.join(TEMP_DIR, 'output.webm'));
            const fileSizeInBytes = stats.size;
            // Estimate duration: assume 1MB ~= 10 seconds of video
            const estimatedDurationMs = (fileSizeInBytes / (1024 * 1024)) * 10000;
            // Allow processing time to be up to MAX_PROCESSING_MULTIPLIER times the video duration
            const processingTimeout = Math.max(
                BASE_TIMEOUT,
                estimatedDurationMs * MAX_PROCESSING_MULTIPLIER
            );
            console.log(`Setting FFmpeg timeout to ${Math.round(processingTimeout / 1000)} seconds based on file size`);

            // Add timeout to prevent hanging
            const timeoutId = setTimeout(() => {
                try {
                    ffmpeg.kill('SIGKILL');
                } catch (error) {
                    console.error('Error killing FFmpeg process:', error);
                }
                reject(new Error(`FFmpeg process timed out after ${Math.round(processingTimeout / 1000)} seconds`));
            }, processingTimeout);

            // Clear timeout when process finishes
            ffmpeg.on('close', () => {
                clearTimeout(timeoutId);
            });
        });

        // Clean up temp files
        console.log('Cleaning up temporary files...');
        try {
            // Close write stream first if it exists
            if (writeStream) {
                writeStream.end();
                await new Promise((resolve, reject) => {
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });
                writeStream = null; // Clear the reference
            }

            // Small delay to ensure file handles are released
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Clean up files and directory
            if (fs.existsSync(TEMP_DIR)) {
                const files = fs.readdirSync(TEMP_DIR);
                for (const file of files) {
                    fs.unlinkSync(path.join(TEMP_DIR, file));
                }
                fs.rmdirSync(TEMP_DIR);
            }

            console.log('Cleanup completed successfully');
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
        const existingFunction = await page.evaluate(() => window.saveRecordingData);
        if (!existingFunction) {
            // Set up handler for saving recording data
            await page.exposeFunction('saveRecordingData', async (base64Data) => {
                console.log('Receiving recording data...');
                try {
                    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
                    console.log(`Writing ${Math.round(buffer.length / 1024 / 1024)}MB to file...`);
                    const filename = isPartial ? `partial_recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm` : 'recorded.webm';
                    fs.writeFileSync(filename, buffer);
                    console.log(`${isPartial ? 'Partial recording' : 'Recording'} saved successfully as: ${filename}`);
                    return true;
                } catch (error) {
                    console.error('Error saving recording:', error);
                    throw error;
                }
            });
        }

        // Add message handler to page context
        await page.evaluateOnNewDocument(() => {
            if (!window.webkit) {
                window.webkit = {
                    messageHandlers: {
                        saveRecording: {
                            postMessage: async (base64Data) => {
                                try {
                                    await window.saveRecordingData(base64Data);
                                    if (window.saveCallback) window.saveCallback();
                                } catch (error) {
                                    console.error('Error in webkit message handler:', error);
                                    if (window.saveCallback) window.saveCallback(error);
                                }
                            }
                        }
                    }
                };
            }
        });

        // Create a promise that resolves when the browser saves the file
        const browserSavePromise = page.evaluate(() => {
            return new Promise((resolve, reject) => {
                if (!window.mediaRecorder) {
                    reject(new Error('MediaRecorder not found'));
                    return;
                }

                if (!window.recordingState.isRecording) {
                    reject(new Error('No active recording found'));
                    return;
                }

                // Set up save callback
                window.recordingState.saveCallback = (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                };

                // Stop the recording
                window.mediaRecorder.stop();
            });
        });

        // Wait for the browser to process and save the recording
        console.log('Waiting for recording to be saved...');
        await browserSavePromise;
        const webmPath = 'recorded.webm';

        // Convert WebM to MP4 using FFmpeg
        console.log('Converting WebM to MP4...');
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', webmPath,
                '-c:v', 'libx264',     // Use H.264 codec for video
                '-preset', 'slow',     // Better compression
                '-crf', '18',         // High quality (lower = better, 18-28 is good range)
                '-c:a', 'aac',        // Use AAC codec for audio
                '-b:a', '256k',       // Audio bitrate
                '-ar', '48000',       // Audio sample rate
                '-strict', 'experimental',
                '-movflags', '+faststart',  // Enable streaming
                OUTPUT_VIDEO
            ]);

            ffmpeg.stderr.on('data', (data) => {
                console.log(`FFmpeg: ${data}`);
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log('Conversion completed successfully');
                    // Delete the WebM file
                    fs.unlinkSync(webmPath);
                    resolve();
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`FFmpeg process error: ${err.message}`));
            });
        });
    } catch (error) {
        console.error('Error saving recording:', error.message);
    } finally {
        await browser.close();
    }
    process.exit(0);
}

(async () => {
    let browser;
    let page;

    try {
        // Get meeting URL from user
        MEETING_URL = await getMeetingUrl();
        console.log(`Starting recording for: ${MEETING_URL}\n`);
        browser = await puppeteer.launch({
            protocolTimeout: BASE_TIMEOUT,
            headless: 'new',
            ignoreDefaultArgs: ['--mute-audio'],
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--autoplay-policy=no-user-gesture-required',
                '--disable-web-security',
                '--allow-running-insecure-content',
                '--window-size=1920,1080',
                '--use-fake-ui-for-media-stream',
                '--enable-audio-autoplay',
                '--auto-accept-this-tab-capture',
                '--disable-features=IsolateOrigins,site-per-process',
                '--enable-experimental-web-platform-features',
                '--allow-file-access-from-files',
                '--enable-usermedia-screen-capturing',
                '--enable-usermedia-audio-capture'
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Set page zoom to fit content and adjust video player
        await page.evaluate(() => {
            // Reset any zoom
            document.body.style.zoom = '100%';

            // Add CSS to make the video fill the screen
            const style = document.createElement('style');
            style.textContent = `
                body, html {
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    overflow: hidden !important;
                }
                .video-js {
                    width: 100vw !important;
                    height: 100vh !important;
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    max-width: none !important;
                    max-height: none !important;
                }
                .video-js video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: contain !important;
                }
            `;
            document.head.appendChild(style);

            // Hide any unnecessary elements
            const hideElements = document.querySelectorAll('.top-bar, .bottom-bar, .control-bar');
            hideElements.forEach(el => {
                if (el) el.style.display = 'none';
            });
        });

        // Set up signal handlers for clean shutdown
        process.on('SIGINT', async () => {
            console.log('\nReceived SIGINT (Ctrl+C)');
            await stopRecording(page, browser);
        });

        process.on('SIGTERM', async () => {
            console.log('\nReceived SIGTERM');
            await stopRecording(page, browser);
        });

        console.log("Accessing the meeting...");
        await page.goto(MEETING_URL, { waitUntil: 'networkidle2', timeout: 0 }); // Wait for the page to load

        await new Promise(resolve => setTimeout(resolve, 5000)); // Allow content to load

        console.log("Setting up recording...");

        // Make sure the browser window is visible and focused
        await page.bringToFront();

        // Set a reasonable window size
        await page.setViewport({ width: 1280, height: 720 });

        // Inject the recording script
        await page.evaluate(() => {
            window.startRecording = async () => {
                try {
                    // Get the video element
                    const video = document.querySelector('video');
                    if (!video) throw new Error('Video element not found');

                    // Ensure video is playing and unmuted
                    video.muted = false;
                    video.volume = 1.0;
                    await video.play();

                    // Get both video and audio stream from the video element
                    const mediaStream = video.captureStream();

                    // Set up audio context with automatic start
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    if (audioContext.state === 'suspended') {
                        await audioContext.resume();
                    }
                    const destination = audioContext.createMediaStreamDestination();
                    const source = audioContext.createMediaElementSource(video);
                    source.connect(destination);
                    source.connect(audioContext.destination);

                    // Create a display capture for higher quality
                    const displayStream = await navigator.mediaDevices.getDisplayMedia({
                        video: {
                            width: 1920,
                            height: 1080,
                            displaySurface: 'browser',  // Prefer browser tabs
                            frameRate: 60,              // Higher frame rate
                            cursor: 'never'            // Hide cursor from recording
                        },
                        audio: {
                            autoGainControl: false,
                            echoCancellation: false,
                            noiseSuppression: false,
                            channelCount: 2,
                            sampleRate: 48000,         // High quality audio
                            sampleSize: 24             // 24-bit audio
                        },
                        preferCurrentTab: true,        // Prefer the current tab
                        selfBrowserSurface: 'include'  // Include the current tab
                    });

                    // Store recording state in window object so it persists
                    window.recordingState = {
                        chunks: [],
                        isRecording: false,
                        saveCallback: null
                    };

                    // Create and store the MediaRecorder
                    // Create final stream with video and audio
                    const finalStream = new MediaStream();

                    // Add video track from display stream
                    displayStream.getVideoTracks().forEach(track => {
                        finalStream.addTrack(track);
                    });

                    // Add audio track from audio context
                    destination.stream.getAudioTracks().forEach(track => {
                        finalStream.addTrack(track);
                    });

                        // Configure MediaRecorder with timeslice to handle long recordings
                    window.mediaRecorder = new MediaRecorder(finalStream, {
                    mimeType: 'video/webm;codecs=vp8,opus',
                    videoBitsPerSecond: 8000000,  // 8 Mbps video
                    audioBitsPerSecond: 256000,   // 256 Kbps audio
                    timeslice: 1000              // Get data every second
                });

                let firstChunk = true;
                window.mediaRecorder.ondataavailable = async (e) => {
                    if (e.data.size > 0) {
                        try {
                            const blob = e.data;
                            const buffer = await blob.arrayBuffer();
                            const uint8Array = new Uint8Array(buffer);
                            await window.saveChunk(Array.from(uint8Array), firstChunk);
                            firstChunk = false;
                        } catch (error) {
                            console.error('Error in ondataavailable:', error);
                        }
                    }
                };

                window.mediaRecorder.onstart = () => {
                    window.recordingState.isRecording = true;
                    console.log('Recording started');
                };

                mediaRecorder.onstop = async () => {
                    window.recordingState.isRecording = false;
                    if (recordedChunks && recordedChunks.length > 0) {
                        console.log(`Processing recording (${recordedChunks.length} chunks)...`);
                        const blob = new Blob(recordedChunks, { type: 'video/webm' });
                        console.log(`Total size: ${Math.round(blob.size / 1024 / 1024)}MB`);

                        try {
                            // Convert blob to base64 with timeout
                            const base64data = await new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                const timeout = setTimeout(() => {
                                    reader.abort();
                                    reject(new Error('Timeout: File reading took too long'));
                                }, 300000); // 5 minute timeout

                                reader.onloadend = () => {
                                    clearTimeout(timeout);
                                    if (reader.error) {
                                        reject(reader.error);
                                    } else if (!reader.result) {
                                        reject(new Error('No data was read'));
                                    } else {
                                        resolve(reader.result);
                                    }
                                };
                                reader.onerror = () => {
                                    clearTimeout(timeout);
                                    reject(reader.error || new Error('Failed to read file'));
                                };
                                reader.onabort = () => {
                                    clearTimeout(timeout);
                                    reject(new Error('File reading was aborted'));
                                };

                                try {
                                    reader.readAsDataURL(blob);
                                } catch (error) {
                                    clearTimeout(timeout);
                                    reject(error);
                                }
                            });

                            // Validate and send base64 data back to Node.js
                            if (!base64data || typeof base64data !== 'string') {
                                throw new Error('Invalid base64 data format');
                            }
                            await window.saveRecordingData(base64data);
                            console.log('Recording data sent to Node.js');

                            if (window.recordingState.saveCallback) {
                                window.recordingState.saveCallback();
                            }
                        } catch (error) {
                            console.error('Error processing recording:', error);
                            if (window.recordingState.saveCallback) {
                                window.recordingState.saveCallback(error);
                            }
                        }
                    } else {
                        if (window.recordingState.saveCallback) {
                            window.recordingState.saveCallback(new Error('No recording data available'));
                        }
                    }
                };

                // Request data every 100ms to ensure we don't lose anything
                // Start recording with chunks every 5 seconds for better handling of long recordings
                window.mediaRecorder.start(5000);
                return mediaRecorder;
            } catch (error) {
                console.error('Error starting recording:', error);
                throw error;
            }
        };
    });

    console.log('Starting automated recording process...');
    console.log('Recording device selected. Starting playback...');

    try {
        // Set up chunk saving function before starting recording
        // Create a single WebM file to store all chunks
        outputWebM = path.join(TEMP_DIR, 'output.webm');
        writeStream = fs.createWriteStream(outputWebM);

        await page.exposeFunction('saveChunk', async (array, isFirst) => {
            try {
                const buffer = Buffer.from(array);
                writeStream.write(buffer);
                totalSize += buffer.length;
                console.log(`Saved chunk: ${Math.round(buffer.length / 1024 / 1024)}MB (Total: ${Math.round(totalSize / 1024 / 1024)}MB)`);
                return true;
            } catch (error) {
                console.error('Error saving chunk:', error);
                throw error;
            }
        });

        await page.evaluate(() => {
            return window.startRecording();
        });
        console.log('Recording device selected. Starting playback...');
    } catch (error) {
        console.error('Failed to start recording:', error);
        throw error;
    }

    console.log("Starting video playback...");
    let isPlaying = await page.evaluate(() => {
        const playButton = document.querySelector('button[aria-label="Play"]');
        if (playButton) {
            playButton.click();
            return true;
        }
        return false;
    });

    while (!isPlaying) {
        console.log("The video is not playing. Please play the video manually.");
        await new Promise(resolve => setTimeout(resolve, 5000));
        isPlaying = await page.evaluate(() => {
            const videoElement = document.querySelector('video');
            return videoElement && !videoElement.paused;
        });
    }

    // Set playback speed to 1x (or adjust as needed)
    await page.evaluate(() => {
        const videoElement = document.querySelector('video');
        if (videoElement) {
            videoElement.playbackRate = 1.0;
            videoElement.volume = 1.0;
            videoElement.muted = false;
            console.log(`Playback speed set to ${videoElement.playbackRate}x`);
        }
    });

    console.log('Video is now playing at normal speed and being recorded with audio...');

    // Get total duration first
    const totalDuration = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video ? video.duration : 0;
    });

    // Log progress and check video status every 10 seconds
    const interval = 10000; // 10 seconds
    let elapsed = 0;

    const progressInterval = setInterval(async () => {
        try {
            elapsed += interval;
            const currentTime = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video ? video.currentTime : 0;
            });
            const progress = (currentTime / totalDuration * 100).toFixed(1);
            console.log(`Recording in progress... ${Math.floor(elapsed / 1000)}s elapsed. Progress: ${progress}%`);

            // Check if video has ended
            const videoEnded = await page.evaluate(() => {
                const videoElement = document.querySelector('video');
                return videoElement && videoElement.ended;
            });

            if (videoEnded) {
                console.log('Video playback has ended. Stopping recording...');
                clearInterval(progressInterval);
                await stopRecording(page, browser);
            }

            // Check for connection loss
            const isConnected = await page.evaluate(() => navigator.onLine);
            if (!isConnected) {
                console.log("Connection lost. Stopping recording...");
                clearInterval(progressInterval);
                await stopRecording(page, browser);
            }
        } catch (err) {
            console.error("Error during recording:", err.message);
            clearInterval(progressInterval);
            await stopRecording(page, browser);
        }
    }, interval);

    // Wait for the video to end or user interruption
    await new Promise(resolve => {});

    } catch (error) {
        console.error('Error during setup:', error.message);
        if (browser) await browser.close();
        process.exit(1);
    }
})();
