# BigBlueButton Presentation Recorder/Exporter

A robust and reliable Node.js tool for recording BigBlueButton meeting playback sessions. This tool automatically captures both video and audio from BigBlueButton recordings and exports them into high-quality MP4 files, perfect for archiving or sharing.

## Why Use This Tool?

- **Reliable Export**: Handles long recordings (2GB+) export without memory issues or timeouts
- **High Quality**: Produces high-quality MP4 files with H.264 video and AAC audio
- **Resource Efficient**: Progressive saving and smart memory management
- **User-Friendly**: Simple setup and automatic operation
- **Cross-Platform**: Works on any system that supports Node.js

## Key Features

- **Advanced Export Engine**:
  - Single-file WebM recording with progressive saving
  - Efficient chunk management for large recordings
  - Real-time progress tracking and status updates
  - Automatic video playback detection

- **Professional Media Processing**:
  - High-quality H.264/AAC encoding
  - Optimized FFmpeg settings for best quality
  - Fast start optimization for streaming
  - Proper audio/video synchronization

- **Robust Error Handling**:
  - Comprehensive error detection and recovery
  - Automatic cleanup of temporary files
  - Detailed logging for troubleshooting
  - Graceful process termination

- **Resource Management**:
  - Efficient memory usage with streaming writes
  - Proper file handle management
  - Automatic resource cleanup
  - Process timeout protection

## Requirements

- Node.js 14.x or higher
- FFmpeg installed and available in PATH
- Chrome or Chromium browser

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/ndaboom/bigbluebutton-presentation-recorder.git
   cd bigbluebutton-presentation-recorder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Edit `record_meeting.js` and set your meeting URL:
   ```javascript
   const MEETING_URL = "your-bbb-recording-url";
   ```

2. Run the recorder:
   ```bash
   node record_meeting.js
   ```

3. The tool will:
   - Open the recording in a headless browser
   - Start playback automatically
   - Show real-time progress
   - Convert/Export the final MP4 file in the current directory

## Output

The recorder generates:
- High-quality MP4 file with H.264 video and AAC audio
- Filename format: `meeting_YYYY-MM-DDTHH-mm-ss-mmmZ.mp4`
- Progress updates in the console

## Progress Reporting:
The tool provides detailed progress information:
- Real-time recording progress with percentage
- Chunk sizes and total data recorded
- FFmpeg conversion progress
- Detailed status messages for each step

## Troubleshooting

### Common Issues

1. **Video Not Playing**
   - The tool will automatically retry playback
   - Check if the meeting URL is accessible
   - Ensure you have proper permissions to view the recording

2. **FFmpeg Errors**
   - Verify FFmpeg is installed and in PATH
   - Check available disk space
   - Ensure write permissions in output directory

3. **Memory Issues**
   - The tool uses progressive saving to handle large recordings
   - No special configuration needed for 2GB+ files
   - Temporary files are automatically cleaned up

### Debug Mode

For detailed logging, set the DEBUG environment variable:
```bash
DEBUG=1 node record_meeting.js
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Usage

This application provides two interfaces for recording BigBlueButton presentations:

### Web Interface (Not Recommended as its still in development)

1. Start the web server:
   ```bash
   npm install
   npm run dev
   ```

2. Open your browser and navigate to `http://localhost:3000`

3. Enter the BigBlueButton recording URL in the input field

4. Click "Start Recording" and monitor the progress

Features:
- Clean, modern user interface
- Real-time progress updates
- Visual progress bar
- Status notifications
- Error handling with user feedback

### Console Interface (Highly Recommended)

For command-line usage:

```bash
# Run the console version
node record_meeting.js
```

The script will:
1. Prompt for the BigBlueButton recording URL
2. Validate the URL
3. Start the recording process
4. Show progress in the console
5. Save the recording when complete

## Technical Details

### Architecture

- `src/lib/recorder.js`: Core recording logic
- `src/pages/`: Next.js web interface
  - `index.js`: Main UI page
  - `api/`: Backend endpoints
    - `record.js`: Recording control
    - `progress.js`: Progress monitoring

### Features

- Supports large recordings (2GB+)
- Efficient chunk-based recording
- Proper error handling and cleanup
- Cross-platform compatibility
- Real-time progress monitoring
- Automatic video format conversion

### Requirements

- Node.js 14+
- FFmpeg (for video processing)
- Modern web browser (for web interface)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---
Happy recording!