const readline = require('readline');
const Recorder = require('./src/lib/recorder');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}

async function getMeetingUrl() {
    while (true) {
        const url = await ask('Enter the BigBlueButton recording URL: ');

        if (!url) {
            console.log('URL cannot be empty. Please try again.');
            continue;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            console.log('Please enter a valid URL starting with http:// or https://');
            continue;
        }

        return url;
    }
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function main() {
    const recorder = new Recorder();
    let stopping = false;
    let finishRecording;
    const recordingFinished = new Promise((resolve) => {
        finishRecording = resolve;
    });

    recorder.setCallbacks(
        (event, data = {}) => {
            if (event === 'complete') {
                console.log(data.message || 'Recording completed successfully');
                if (data.filePath) console.log(`Saved MP4: ${data.filePath}`);
                if (data.downloadUrl) console.log(`Download path: ${data.downloadUrl}`);
                finishRecording();
                return;
            }

            if (data.recordedBytes) {
                console.log(`${data.message} (${formatBytes(data.recordedBytes)})`);
                return;
            }

            if (data.message) {
                console.log(data.message);
            }
        },
        (message) => {
            if (message) {
                console.error(`Recording error: ${message}`);
                process.exitCode = 1;
                finishRecording();
            }
        }
    );

    const stop = async (signal) => {
        if (stopping) return;
        stopping = true;
        console.log(`\nReceived ${signal}. Stopping recording...`);
        await recorder.stopRecording({ reason: 'Recording stopped by user' });
        rl.close();
        finishRecording();
    };

    process.once('SIGINT', () => {
        stop('SIGINT').catch((error) => {
            console.error('Failed to stop recording:', error.message);
            process.exitCode = 1;
        });
    });

    process.once('SIGTERM', () => {
        stop('SIGTERM').catch((error) => {
            console.error('Failed to stop recording:', error.message);
            process.exitCode = 1;
        });
    });

    try {
        const meetingUrl = await getMeetingUrl();
        rl.close();

        console.log(`Starting recording for: ${meetingUrl}`);
        await recorder.startRecording(meetingUrl);
        await recordingFinished;
    } catch (error) {
        rl.close();
        console.error('Error during recording:', error.message);
        await recorder.stopRecording({ error });
        process.exitCode = 1;
    }
}

main();
