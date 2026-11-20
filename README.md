# cf-tunnel-relay

第二出口：给 Cloudflare Worker 连不到的站点（ChatGPT / Claude / X / Discord 等）做代理。

Cloudflare 不允许 Worker 连接 Cloudflare 自家网络上的站点，所以把这些站点交给一台非 Cloudflare 的机器出口。

## 部署（Render 免费版，约 3 分钟）

1. 打开 https://dashboard.render.com/ ，用 GitHub 账号登录
2. 点 **New +** → **Blueprint**
3. 选择本仓库 `cf-tunnel-relay`
4. 在环境变量里填 `TUNNEL_TOKEN`（随便一串足够长的随机字符串，例如 32 位十六进制）
5. 点 **Apply**，等状态变成 **Live**
6. 复制服务地址，形如 `https://xxxx.onrender.com`

## 验证

```
curl https://xxxx.onrender.com/health
→ {"relay":"ok","uptime":12}
```

## 接到客户端

把地址和 token 填进客户端目录的 `relay.json`：

```json
{
  "url": "wss://xxxx.onrender.com",
  "token": "你设置的 TUNNEL_TOKEN",
  "domains": ["chatgpt.com","openai.com","oaistatic.com","oaiusercontent.com",
              "claude.ai","anthropic.com","x.com","twitter.com"]
}
```

客户端会自动把 matches 这些域名的流量切到第二出口，其余仍走 Cloudflare。

## 注意

- Render 免费实例闲置 15 分钟会休眠，首次访问需等 30-60 秒唤醒
- 本服务是 token 鉴权的通用 TCP 转发，请勿公开 token
- 协议与 Cloudflare Worker 版本一致：`wss://<host>/t?token=&host=&port=`
