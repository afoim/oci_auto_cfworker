# 更新日志

## 2026-04-16 - v1.0.0 正式版

### ✅ 修复
- 修复 OCI API 认证问题（401 错误）
- 根据 OCI Python SDK 实现了正确的签名逻辑：
  - 修正头部签名顺序：`date, (request-target), host`
  - 添加 POST 请求必需的 `x-content-sha256` 头部
  - 添加 `content-length` 和 `content-type` 到签名头部

### 🔇 优化 Telegram 通知
- **只在成功创建实例时发送 Telegram 通知**
- 其他情况（容量不足、配置错误等）只记录到 Worker 日志
- 减少对 Telegram Bot 的打扰

### 📊 日志改进
- 详细的 6 步执行流程日志
- 私钥格式自动检测
- 签名过程完整记录
- 便于调试和监控

### ⚙️ 功能
- ✅ 每分钟自动尝试创建 OCI ARM 实例
- ✅ 检查免费层资源限额（4 OCPUs / 24 GB）
- ✅ 避免重复实例名称
- ✅ 容量不足时自动重试
- ✅ 成功时发送 Telegram 通知

## 部署

```bash
# 部署到 Cloudflare
wrangler deploy

# 查看实时日志
wrangler tail
```

## 监控

- Cloudflare Dashboard → Workers & Pages → oci-auto-worker → Logs
- 每分钟执行一次，查看日志了解运行状态
- 成功创建实例时会收到 Telegram 通知

## 注意事项

- Worker 会持续运行，直到成功创建实例
- 容量不足（500 错误）是正常现象，会自动重试
- 如需停止，删除 Cron 触发器或删除 Worker
