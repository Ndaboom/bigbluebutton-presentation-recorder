export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { recordingId } = req.query;

    // Ensure client store exists
    if (!global.progressClients) {
        global.progressClients = new Set();
    }

    // Prepare SSE response
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    req.socket.setKeepAlive(true);
    res.flushHeaders?.();

    const client = {
        res,
        recordingId: recordingId || null,
        heartbeat: null
    };

    const send = (payload) => {
        try {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch (error) {
            console.error('SSE write error:', error);
        }
    };

    // Send initial confirmation
    send({ type: 'connected', recordingId: recordingId || null });

    // Heartbeat to keep connection alive in proxies
    client.heartbeat = setInterval(() => {
        try {
            res.write(':keepalive\n\n');
        } catch (error) {
            clearInterval(client.heartbeat);
        }
    }, 15000);

    global.progressClients.add(client);

    const removeClient = () => {
        if (client.heartbeat) {
            clearInterval(client.heartbeat);
        }
        if (global.progressClients) {
            global.progressClients.delete(client);
        }
    };

    req.on('close', removeClient);
    req.on('end', removeClient);
}
