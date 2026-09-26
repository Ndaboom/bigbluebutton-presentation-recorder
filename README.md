# BigBlueButton Presentation Recorder/Exporter

![Screenshot of the BigBlueButton presentation recorder UI](Screenshot%202025-09-26%20at%201.18.55%E2%80%AFAM.png)

A Node.js tool for capturing BigBlueButton meeting playback sessions and exporting their video and audio as MP4 files.

## Why Use This Tool?

- **Progressive Recording**: Writes small chunks to disk instead of retaining the complete recording in memory
- **High Quality**: Produces high-quality MP4 files with H.264 video and AAC audio
- **Resource Efficient**: Progressive saving and smart memory management
- **User-Friendly**: Simple setup and automatic operation
- **Cross-Platform**: Supports Windows, macOS, and Linux where Node.js, Puppeteer, and `ffmpeg-static` provide compatible binaries

## Key Features

- **Advanced Export Engine**:
  - Single-file WebM recording with progressive saving
  - Efficient chunk management for large recordings
  - Real-time progress tracking and status updates
  - Automatic video playback detection

- **Professional Media Processing**:
  - High-quality H.264/AAC encoding
  - Optimized FFmpeg settings for reliable MP4 export
  - Fast start optimization for streaming
  - Audio and video conversion in a single FFmpeg operation

- **Robust Error Handling**:
  - Playback-stall and conversion-error detection
  - Automatic cleanup after successful conversion
  - WebM preservation when recording or conversion fails
  - Detailed logging for troubleshooting
  - Graceful process termination

- **Resource Management**:
  - Efficient memory usage with streaming writes
  - Proper file handle management
  - Automatic resource cleanup after successful exports
  - Process timeout protection

## Requirements

- Node.js 20.9 or higher
- npm

The recorder supports Windows, macOS, and Linux on architectures supported by Node.js, Puppeteer, and `ffmpeg-static`. Install dependencies on the target computer so npm selects the correct native browser and FFmpeg binaries for that operating system and architecture.

`npm install` installs the application runtime dependencies, including Puppeteer's managed browser and the bundled FFmpeg binary used for MP4 conversion. If you prefer a system FFmpeg binary, set `FFMPEG_PATH` to its executable path.

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/ndaboom/bigbluebutton-presentation-recorder.git
   cd bigbluebutton-presentation-recorder
   ```

2. Install dependencies from the lockfile:
   ```bash
   npm ci
   ```

## Usage

### Web UI mode

1. Install dependencies if you have not already:
   ```bash
   npm ci
   ```
2. Start the Next.js development server:
   ```bash
   npm run dev
   ```
3. Open your browser to the URL shown in the terminal (default http://localhost:3000), paste a BigBlueButton recording link, and follow progress directly in the UI.

### Console mode

1. Run the recorder in console mode:
   ```bash
   npm run record
   ```

2. The tool will:
   - Ask you for the meeting playback URL
   - Open the recording in a headless browser
   - Start playback automatically
   - Show real-time progress
   - Convert/export the final MP4 file under `public/exports`

### Convert an existing WebM

If recording completed but MP4 conversion failed, convert the preserved WebM without replaying the meeting:

```bash
npm run record -- --convert temp_chunks/recording_TIMESTAMP.webm
```

The MP4 is written beside the input file by default. Choose another destination with:

```bash
npm run record -- --convert temp_chunks/recording_TIMESTAMP.webm --output public/exports/recovered-meeting.mp4
```

Replace `TIMESTAMP` with the value printed by the recorder. The source WebM is never deleted by conversion-only mode. Recording mode also preserves a non-empty `temp_chunks/recording_<timestamp>.webm` whenever recording or MP4 conversion fails and prints its exact path in the error message.

## Output

The recorder generates:

- High-quality MP4 file with H.264 video and AAC audio
- Video normalized to 30 frames per second
- Filename format: `meeting_YYYY-MM-DDTHH-mm-ss-mmmZ.mp4`
- Output directory: `public/exports`
- Progress updates in the console

## Progress Reporting

The tool provides detailed progress information:

- Real-time recording progress with percentage
- Chunk sizes and total data recorded
- FFmpeg conversion progress with percent and ETA when available
- Detailed status messages for each step

## Troubleshooting

### Common Issues

1. **Video Not Playing**
   - The tool will automatically retry playback
   - Check if the meeting URL is accessible
   - Ensure you have proper permissions to view the recording

2. **FFmpeg Errors**
   - Run `npm ci` to reinstall the bundled FFmpeg binary
   - Or set `FFMPEG_PATH` to a system FFmpeg executable
   - Check available disk space
   - Ensure write permissions in `public/exports`

3. **Memory Issues**
   - The tool progressively writes recording chunks to disk to reduce memory use
   - Keep enough free disk space for both the intermediate WebM and final MP4
   - Temporary WebM files are removed after successful conversion and preserved after failures

4. **Chrome launch timeout on Apple Silicon**
   - Check the Node.js architecture with `node -p "process.arch"`
   - On an Apple Silicon Mac, the result must be `arm64`, not `x64`
   - If it prints `x64`, start a native shell with `arch -arm64 zsh`, install or select an ARM64 Node.js build, and run `npm ci` again so Puppeteer installs the matching browser

5. **Browser audio or microphone permission prompt**
   - The recorder requests browser-tab capture with audio through `getDisplayMedia()`
   - Some browser or operating-system dialogs describe this broadly as audio or microphone access
   - The recorder does not call `getUserMedia()` to capture the physical microphone
   - If tab capture is unavailable, it attempts direct capture from the playback video element

The recorder prints diagnostic and progress messages by default; no debug environment variable is required.

### Tests

Run the test suite with:
```bash
npm test
```

## Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a pull request

## License

Distributed under the MIT License. See [License.txt](License.txt) for more information.

---
Happy recording!
