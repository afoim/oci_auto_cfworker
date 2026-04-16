# OCI ARM Instance Auto-Creation Worker

Cloudflare Worker 版本的 OCI ARM 实例自动创建工具。每分钟通过 Cron 触发一次，自动尝试创建 Oracle Cloud 免费层 ARM 实例。

> 基于原始 Python 脚本改写，使用 Cloudflare Workers 实现，无需服务器即可 24/7 运行。

## 功能特性

- ✅ 每分钟自动尝试创建实例
- ✅ 检查现有实例，避免超出免费层限额（4 OCPUs / 24 GB RAM）
- ✅ Telegram 通知支持（仅成功时通知）
- ✅ 使用 OCI REST API（无需 SDK）
- ✅ 完整的 RSA-SHA256 签名认证
- ✅ 容量不足时静默重试，成功时发送通知
- ✅ 详细的日志输出便于调试

## 快速开始

### 前置要求

- Node.js 18+ 和 npm
- Cloudflare 账号（免费版即可）
- OCI 账号和 API 密钥
- （可选）Telegram Bot Token 和 Chat ID

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd oci_auto
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

编辑 `wrangler.toml` 中的公开配置：

```toml
[vars]
OCI_REGION = "ap-osaka-1"          # 你的 OCI 区域
OCPUS = "4"                         # 要创建的 OCPU 数量
INSTANCE_DISPLAY_NAME = "ubuntu-osaka-oci-worker"  # 实例显示名称
```

### 4. 设置敏感信息（Secrets）

登录 Cloudflare：

```bash
npx wrangler login
```

设置所有必需的 Secrets：

```bash
# OCI 认证信息
wrangler secret put OCI_USER
wrangler secret put OCI_FINGERPRINT
wrangler secret put OCI_TENANCY

# OCI 私钥（重要！必须是 PKCS#8 格式）
cat oci_private_key.pem | wrangler secret put OCI_PRIVATE_KEY

# 实例配置
wrangler secret put COMPARTMENT_ID
wrangler secret put AVAILABILITY_DOMAIN
wrangler secret put IMAGE_ID
wrangler secret put SUBNET_ID
wrangler secret put SSH_PUBLIC_KEY

# Telegram 通知（可选）
wrangler secret put TELEGRAM_BOT_API
wrangler secret put TELEGRAM_CHAT_ID
```

### 5. 部署

```bash
npm run deploy
```

### 6. 验证

查看实时日志：

```bash
npm run tail
```

或访问 Worker URL 手动触发测试。

## 配置说明

### 获取 OCI 配置信息

#### 从 OCI Console 获取：

1. **User OCID**: Profile → User Settings → OCID
2. **Tenancy OCID**: Administration → Tenancy Details → OCID
3. **Fingerprint**: Profile → API Keys → 你的 API Key 的 Fingerprint
4. **Compartment ID**: Identity → Compartments → 选择 Compartment → OCID
5. **Availability Domain**: 例如 `aVGj:AP-OSAKA-1-AD-1`
6. **Image ID**: Compute → Custom Images → 选择镜像 → OCID
7. **Subnet ID**: Networking → Virtual Cloud Networks → Subnets → OCID

#### 私钥格式要求：

必须是 **PKCS#8** 格式（`-----BEGIN PRIVATE KEY-----`）。

如果你的私钥是 RSA 格式（`-----BEGIN RSA PRIVATE KEY-----`），需要转换：

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in oci_private_key.pem \
  -out oci_private_key_pkcs8.pem
```

然后使用转换后的文件上传。

### Telegram 通知配置（可选）

1. 与 [@BotFather](https://t.me/BotFather) 创建 Bot，获取 API Token
2. 与你的 Bot 对话，发送 `/start`
3. 访问 `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` 获取 Chat ID
4. 或使用 [@get_id_bot](https://t.me/get_id_bot) 获取 Chat ID

## Cron 配置

默认每分钟触发一次：

```toml
[triggers]
crons = ["* * * * *"]
```

可以修改为其他频率：

- `*/2 * * * *` - 每 2 分钟
- `*/5 * * * *` - 每 5 分钟
- `0 * * * *` - 每小时

## 工作原理

1. 每分钟 Cron 触发 Worker
2. 检查当前账户中的 A1.Flex 实例
3. 验证是否超出免费层限额（4 OCPUs / 24 GB）
4. 尝试创建新实例
5. 如果容量不足（500 错误），静默等待下次触发
6. 如果成功，发送 Telegram 通知并停止（需手动删除 Worker 或禁用 Cron）

## 监控和日志

### 查看实时日志

```bash
npm run tail
```

### Cloudflare Dashboard

1. 登录 Cloudflare Dashboard
2. Workers & Pages → oci-auto-worker
3. Logs 标签查看历史日志

### 日志内容

- 环境变量验证
- 私钥格式检测
- 现有实例列表
- 资源限额检查
- API 请求和响应
- 签名生成过程

## 故障排查

### 私钥格式错误

运行检查脚本：

```bash
npm run check-key oci_private_key.pem
```

### 认证失败（401）

1. 验证 fingerprint 是否正确：
   ```bash
   openssl rsa -pubout -outform DER -in oci_private_key.pem | openssl md5 -c
   ```
2. 确认 User OCID 和 Tenancy OCID 正确
3. 确认私钥与 fingerprint 匹配

### 资源未找到（404）

1. 检查 Compartment ID 是否正确
2. 确认 OCI_REGION 与资源所在区域一致
3. 验证 Image ID 和 Subnet ID

### Telegram 通知不工作

1. 确认已与 Bot 发起对话（发送 `/start`）
2. 验证 Bot Token 和 Chat ID 正确
3. 检查 Bot 是否被封禁

详细故障排查请查看 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## 成本说明

Cloudflare Workers 免费版限额：

- 每天 100,000 次请求
- 每次执行 10ms CPU 时间
- 每次执行 128MB 内存

按每分钟 1 次计算：

- 每天 1,440 次请求
- 远低于免费限额，完全够用 ✅

## 安全建议

1. ✅ 使用 `wrangler secret` 存储敏感信息
2. ✅ 不要将 `.dev.vars` 或 `config` 文件提交到 Git
3. ✅ 定期轮换 API 密钥
4. ✅ 限制 OCI 用户权限（最小权限原则）
5. ✅ 监控 Worker 日志，及时发现异常

## 项目结构

```
oci_auto/
├── src/
│   └── index.ts           # Worker 主代码
├── scripts/
│   ├── check-private-key.js    # 私钥检查工具
│   ├── convert-key.sh          # 私钥转换脚本
│   └── test-oci-auth.js        # 本地认证测试
├── wrangler.toml          # Cloudflare Worker 配置
├── package.json           # 项目依赖
├── tsconfig.json          # TypeScript 配置
├── .gitignore             # Git 忽略文件
├── README.md              # 本文件
├── DEPLOYMENT.md          # 详细部署指南
├── TROUBLESHOOTING.md     # 故障排查指南
└── CHANGELOG.md           # 更新日志
```

## 常见问题

### Q: 成功创建实例后会自动停止吗？

A: 不会。Worker 会继续运行。你需要手动删除 Worker 或禁用 Cron 触发器。

### Q: 可以同时创建多个实例吗？

A: 可以。修改 `INSTANCE_DISPLAY_NAME` 和 `OCPUS` 配置，确保不超过免费层限额（总共 4 OCPUs / 24 GB）。

### Q: 如何停止 Worker？

A: 方法 1：删除 Worker
```bash
wrangler delete
```

方法 2：在 `wrangler.toml` 中注释掉 Cron 配置并重新部署

### Q: 支持哪些 OCI 区域？

A: 所有 OCI 区域都支持。修改 `wrangler.toml` 中的 `OCI_REGION` 即可。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT

## 致谢

- 基于原始 Python 脚本改写
- 参考 [OCI Python SDK](https://github.com/oracle/oci-python-sdk) 实现签名认证
- 使用 [Cloudflare Workers](https://workers.cloudflare.com/) 平台

