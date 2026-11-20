/**
 * 第二出口 Relay —— 与 Cloudflare Worker 同协议（WS ↔ 裸 TCP）
 *
 * 部署到 Render / Koyeb / Hugging Face Spaces 等免费容器即可。
 * 用途：Cloudflare Worker 连不到 Cloudflare 自家网络上的站点（ChatGPT / Claude / X 等），
 *      由这台非 Cloudflare 的机器代为出口。
 *
 * 环境变量：
 *   TUNNEL_TOKEN  必填，访问凭证（与客户端一致）
 *   PORT          平台会注入，缺省 8080
 */
const http = require("http");
const net = require("net");
const crypto = require("crypto");

let WebSocketServer;
try {
  WebSocketServer = require("ws").WebSocketServer;
} catch (e) {
  // 本地调试回退
  WebSocketServer = require("/Users/Jelly/Desktop/BALE/node_modules/ws").WebSocketServer;
}

const TOKEN = (process.env.TUNNEL_TOKEN || (() => {
  try { return require("fs").readFileSync(__dirname + "/.relay-token", "utf8"); } catch (_) { return ""; }
})()).trim();
const PORT = Number(process.env.PORT || 8080);

const BLOCK = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./, /^169\.254\./, /^0\./,
  /\.local$/i, /\.internal$/i,
];
function hostAllowed(h) {
  if (!h) return false;
  const s = String(h).toLowerCase().replace(/\.$/, "");
  return !BLOCK.some((re) => re.test(s));
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ relay: "ok", uptime: Math.round(process.uptime()) }));
  }
  res.writeHead(404);
  res.end("relay: use websocket /t");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/t") return socket.destroy();
  if (url.searchParams.get("token") !== TOKEN) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req, url));
});

wss.on("connection", (ws, req, url) => {
  const host = url.searchParams.get("host") || "";
  const port = parseInt(url.searchParams.get("port") || "443", 10);

  if (!hostAllowed(host)) {
    try { ws.send(JSON.stringify({ tunnel_error: "host not allowed: " + host })); } catch (_) {}
    return ws.close();
  }

  const tcp = net.connect({ host, port });
  tcp.setNoDelay(true);
  let closed = false;

  const shutdown = (why, hard) => {
    if (closed) return;
    closed = true;
    try { ws.close(); } catch (_) {}
    try { hard ? tcp.destroy() : tcp.end(); } catch (_) {}
  };

  tcp.on("connect", () => {
    ws.on("message", (data, isBinary) => {
      if (closed) return;
      try { tcp.write(data); } catch (e) { shutdown("write", true); }
    });
  });

  tcp.on("data", (chunk) => {
    if (closed) return;
    try { ws.send(chunk, { binary: true }); } catch (e) { shutdown("send", true); }
  });

  tcp.on("end", () => shutdown("tcp_end"));
  tcp.on("error", (e) => {
    try { ws.send(JSON.stringify({ tunnel_error: String(e.message || e) })); } catch (_) {}
    shutdown("tcp_error", true);
  });
  ws.on("close", () => shutdown("ws_close"));
  ws.on("error", () => shutdown("ws_error", true));
});

server.listen(PORT, () => {
  console.log("relay listening on " + PORT + " (token " + (TOKEN ? "set" : "MISSING") + ")");
});
