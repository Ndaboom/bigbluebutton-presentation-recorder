export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Initialize progress clients set if it doesn't exist
    if (!global.progressClients) {
        global.progressClients = new Set();
    }

    // Send initial connection confirmation
    res.write('data: ' + JSON.stringify({ type: 'connected' }) + '\n\n');

    // Add this client to the clients set
    global.progressClients.add(res);

    // Remove client when connection is closed
    req.on('close', () => {
        if (global.progressClients) {
            global.progressClients.delete(res);
        }
    });
}
