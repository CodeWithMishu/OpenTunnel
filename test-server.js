const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>OpenTunnel Test Server</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
        }
        .container {
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        h1 { font-size: 3em; margin-bottom: 10px; }
        p { font-size: 1.2em; opacity: 0.9; }
        .info { font-family: monospace; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 OpenTunnel Test Server</h1>
        <p>Your tunnel is working!</p>
        <div class="info">
            <p>Method: ${req.method}</p>
            <p>URL: ${req.url}</p>
            <p>Time: ${new Date().toLocaleString()}</p>
        </div>
        <p>This local server is now accessible from anywhere via OpenTunnel!</p>
    </div>
</body>
</html>
    `);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Test server running on http://localhost:${PORT}`);
    console.log('Now press F5 in VS Code to test OpenTunnel!');
});