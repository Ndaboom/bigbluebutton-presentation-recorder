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
    if (!global.progressClients) {
        return;
    }

    global.progressClients.forEach(client => {
        const { res, recordingId } = client;
        try {
            if (recordingId && data.recordingId && recordingId !== data.recordingId) {
                return;
            }
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
            console.error('Failed to broadcast progress:', error);
            if (client.heartbeat) {
                clearInterval(client.heartbeat);
            }
            global.progressClients.delete(client);
        }
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
            (type, data = {}) => {
                broadcastProgress({ recordingId, type, ...data });
                if (type === 'complete') {
                    global.activeRecorders.delete(recordingId);
                }
            },
            (error) => {
                const message = typeof error === 'string' ? error : error?.message || 'Recording failed';
                console.error('Recording error:', message);
                broadcastProgress({ 
                    recordingId,
                    type: 'error', 
                    message
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
                    recordingId,
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
