const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const fs = require('fs');

// Generate a unique file name with a timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // Replace invalid filename characters
const OUTPUT_VIDEO = `meeting_${timestamp}.mp4`;

const MEETING_URL = "https://meet.evoludata.com/playback/presentation/2.3/fe160481181ac21284041480383a64a0c8255047-1742902798408";

(async () => {
    const browser = await puppeteer.launch({
        headless: false, // Use headless: true with Xvfb if necessary
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log("Accessing the meeting...");
    await page.goto(MEETING_URL, { waitUntil: 'networkidle2', timeout: 0 }); // Wait for the page to load

    await new Promise(resolve => setTimeout(resolve, 5000)); // Allow content to load

    console.log("Waiting for the user to start playback...");
    let isPlaying = await page.evaluate(() => {
        const playButton = document.querySelector('button[aria-label="Play"]'); // Adjust selector as needed
        if (playButton) {
            playButton.click();
            return true;
        }
        return false;
    });

    while (!isPlaying) {
        console.log("The video is not playing. Please play the video manually.");
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
        isPlaying = await page.evaluate(() => {
            const videoElement = document.querySelector('video'); // Adjust selector if needed
            return videoElement && !videoElement.paused; // Check if the video is playing
        });
    }

    console.log("The video is now playing. Retrieving video duration...");
    const videoDuration = await page.evaluate(() => {
        const durationElement = document.querySelector('.vjs-duration-display'); // Adjust selector as needed
        if (durationElement) {
            const durationText = durationElement.textContent.trim(); // Get the duration text (e.g., "13:31")
            const [minutes, seconds] = durationText.split(':').map(Number); // Split into minutes and seconds
            return (minutes * 60) + seconds; // Convert to total seconds
        }
        return null;
    });

    if (!videoDuration) {
        console.error("Unable to retrieve video duration. Exiting...");
        await browser.close();
        return;
    }

    const recordingDuration = Math.ceil(videoDuration * 1000); // Convert to milliseconds
    console.log(`Video duration: ${Math.floor(videoDuration / 60)}m ${Math.floor(videoDuration % 60)}s`);
    console.log(`Recording duration set to ${recordingDuration / 1000}s.`);

    console.log("Starting recording...");
    const ffmpegCmd = [
        '-y', // Overwrite existing files without prompting
        '-f', 'x11grab',
        '-video_size', '1920x1080',
        '-i', ':0.0', // Ensure the browser window is focused
        '-f', 'pulse',
        '-i', 'default',
        '-framerate', '30',
        '-codec:v', 'mpeg4', // Use mpeg4 encoder
        '-q:v', '5', // Adjust quality (lower is better, 1-31 scale)
        OUTPUT_VIDEO
    ];
    const ffmpegProcess = spawn('ffmpeg', ffmpegCmd);

    // Log ffmpeg output to the console
    ffmpegProcess.stdout.on('data', (data) => {
        console.log(`ffmpeg stdout: ${data}`);
    });

    ffmpegProcess.stderr.on('data', (data) => {
        console.error(`ffmpeg stderr: ${data}`);
    });

    ffmpegProcess.on('error', (err) => {
        console.error(`ffmpeg process error: ${err.message}`);
    });

    ffmpegProcess.on('close', (code) => {
        console.log(`ffmpeg process exited with code ${code}`);
    });

    // Log progress every 10 seconds
    const interval = 10000; // 10 seconds
    let elapsed = 0;

    const progressInterval = setInterval(async () => {
        elapsed += interval;
        const remaining = recordingDuration - elapsed;
        const remainingMinutes = Math.floor(remaining / 60000);
        const remainingSeconds = Math.floor((remaining % 60000) / 1000);
        console.log(`Recording in progress... ${Math.floor(elapsed / 1000)}s elapsed. Remaining: ${remainingMinutes}m ${remainingSeconds}s.`);

        // Check for connection loss
        const isConnected = await page.evaluate(() => navigator.onLine);
        if (!isConnected) {
            console.log("Connection lost. Waiting for reconnection...");
            while (!(await page.evaluate(() => navigator.onLine))) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
            }
            console.log("Reconnected. Resuming recording...");
        }

        if (elapsed >= recordingDuration) {
            clearInterval(progressInterval);
        }
    }, interval);

    // Wait for the recording duration
    await new Promise(resolve => setTimeout(resolve, recordingDuration));

    console.log("Stopping recording...");
    ffmpegProcess.kill('SIGINT');

    await browser.close();
})();

