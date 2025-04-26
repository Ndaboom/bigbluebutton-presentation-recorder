import Recorder from '../../lib/recorder';

// Store active recorders
if (!global.activeRecorders) {
    global.activeRecorders = new Map();
}

// Initialize global state
if (!global.activeRecorders) {
    global.activeRecorders = new Map();
}

if (!global.progressClients) {
    global.progressClients = new Set();
}

function broadcastProgress(data) {
    global.progressClients.forEach(client => {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ message: 'URL is required' });
    }

    try {
        const recorder = new Recorder();
        const recordingId = Date.now().toString();
        
        // Store recorder instance
        global.activeRecorders.set(recordingId, recorder);
        
        // Set up progress and error callbacks before starting
        recorder.setCallbacks(
            (type, data) => {
                broadcastProgress({ type, ...data });
            },
            (error) => {
                console.error('Recording error:', error);
                broadcastProgress({ 
                    type: 'error', 
                    message: error 
                });
                global.activeRecorders.delete(recordingId);
            }
        );

        // Send response to client immediately
        res.status(200).json({ 
            message: 'Recording initiated', 
            recordingId 
        });

        // Start recording process in the background
        recorder.startRecording(url)
            .catch(error => {
                console.error('Recording error:', error);
                broadcastProgress({ 
                    type: 'error', 
                    message: error.message 
                });
                global.activeRecorders.delete(recordingId);
            });

    } catch (error) {
        console.error('Setup error:', error);
        broadcastProgress({ 
            type: 'error', 
            message: error.message 
        });
        res.status(500).json({ message: error.message });
    }
}
