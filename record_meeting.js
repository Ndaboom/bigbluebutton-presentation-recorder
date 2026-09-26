const readline = require('readline');
const path = require('path');
const Recorder = require('./src/lib/recorder');

function parseCliArgs(args) {
    const options = { convert: null, output: null, help: false };

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--convert' || argument === '-c') {
            if (!args[index + 1] || args[index + 1].startsWith('-')) {
                throw new Error(`${argument} requires a WebM file path`);
            }
            options.convert = args[index + 1];
            index += 1;
        } else if (argument === '--output' || argument === '-o') {
            if (!args[index + 1] || args[index + 1].startsWith('-')) {
                throw new Error(`${argument} requires an MP4 file path`);
            }
            options.output = args[index + 1];
            index += 1;
        } else if (argument === '--help' || argument === '-h') {
            options.help = true;
        } else {
            throw new Error(`Unknown option: ${argument}`);
        }
    }

    if (options.output && !options.convert) {
        throw new Error('--output can only be used with --convert');
    }
    if (args.includes('--convert') && !options.convert) {
        throw new Error('--convert requires a WebM file path');
    }
    if (args.includes('-c') && !options.convert) {
        throw new Error('-c requires a WebM file path');
    }

    return options;
}

function printUsage() {
    console.log(`Usage:
  npm run record
  npm run record -- --convert <input.webm> [--output <output.mp4>]

Options:
  -c, --convert <path>  Convert an existing WebM without recording again
  -o, --output <path>   MP4 destination (defaults beside the input file)
  -h, --help            Show this help`);
}

function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function ask(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}

function isValidMeetingUrl(url) {
    return url.startsWith('http://') || url.startsWith('https://');
}

async function getMeetingUrl(rl) {
    while (true) {
        const url = await ask(rl, 'Enter the BigBlueButton recording URL: ');

        if (!url) {
            console.log('URL cannot be empty. Please try again.');
            continue;
        }

        if (!isValidMeetingUrl(url)) {
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
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }

    const recorder = new Recorder();
    const rl = options.convert ? null : createReadlineInterface();
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
        if (rl) rl.close();
        finishRecording();
    };

    if (!options.convert) {
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
    }

    try {
        if (options.convert) {
            const inputPath = path.resolve(options.convert);
            const outputPath = options.output ? path.resolve(options.output) : undefined;
            console.log(`Converting existing recording: ${inputPath}`);
            const convertedPath = await recorder.convertWebMFile(inputPath, outputPath);
            console.log(`Saved MP4: ${convertedPath}`);
            return;
        }

        const meetingUrl = await getMeetingUrl(rl);
        rl.close();

        console.log(`Starting recording for: ${meetingUrl}`);
        await recorder.startRecording(meetingUrl);
        await recordingFinished;
    } catch (error) {
        if (rl) rl.close();
        console.error(options.convert ? 'Conversion failed:' : 'Error during recording:', error.message);
        if (!options.convert) {
            await recorder.stopRecording({ error });
        }
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    formatBytes,
    isValidMeetingUrl,
    parseCliArgs
};
