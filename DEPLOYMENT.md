# 部署指南

## 快速开始

### 1. 安装 Node.js 和 npm

确保已安装 Node.js 18+ 和 npm。

### 2. 安装项目依赖

```bash
npm install
```

### 3. 准备配置信息

从你的原始 Python 项目中收集以下信息：

#### 从 `config` 文件获取：
- `user` → `OCI_USER`
- `fingerprint` → `OCI_FINGERPRINT`  
- `tenancy` → `OCI_TENANCY`
- `region` → `OCI_REGION`

#### 从 `oci_auto.py` 获取：
- `compartment_id` → `COMPARTMENT_ID`
- `domain` → `AVAILABILITY_DOMAIN`
- `image_id` → `IMAGE_ID`
- `subnet_id` → `SUBNET_ID`
- `ssh_key` → `SSH_PUBLIC_KEY`
- `bot_api` → `TELEGRAM_BOT_API`
- `chat_id` → `TELEGRAM_CHAT_ID`

#### 私钥文件：
- `oci_private_key.pem` → `OCI_PRIVATE_KEY`

### 4. 本地测试（可选）

创建 `.dev.vars` 文件用于本地测试：

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars` 填入你的实际配置，然后运行：

```bash
npm run dev
```

访问 `http://localhost:8787` 测试。

### 5. 登录 Cloudflare

```bash
npx wrangler login
```

这会打开浏览器让你登录 Cloudflare 账户。

### 6. 设置生产环境 Secrets

**重要：** 敏感信息必须通过 `wrangler secret` 命令设置，不要直接写在 `wrangler.toml` 中！

```bash
# OCI 认证
wrangler secret put OCI_USER
wrangler secret put OCI_FINGERPRINT
wrangler secret put OCI_TENANCY

# OCI 私钥（最重要！）
# 方法 1: 直接粘贴
wrangler secret put OCI_PRIVATE_KEY
# 然后粘贴完整的 PEM 内容（包括 BEGIN 和 END 行）

# 方法 2: 从文件读取（推荐）
cat oci_private_key.pem | wrangler secret put OCI_PRIVATE_KEY

# 实例配置
wrangler secret put COMPARTMENT_ID
wrangler secret put AVAILABILITY_DOMAIN
wrangler secret put IMAGE_ID
wrangler secret put SUBNET_ID
wrangler secret put SSH_PUBLIC_KEY

# Telegram（可选）
wrangler secret put TELEGRAM_BOT_API
wrangler secret put TELEGRAM_CHAT_ID
```

### 7. 编辑 wrangler.toml

确认 `wrangler.toml` 中的公开配置正确：

```toml
[vars]
OCI_REGION = "ap-singapore-1"  # 改成你的区域
OCPUS = "4"                     # 改成你需要的 OCPU 数
INSTANCE_DISPLAY_NAME = "ubuntu-sg-oci-worker"  # 改成你的实例名
```

### 8. 部署

```bash
npm run deploy
```

部署成功后会显示 Worker URL，例如：
```
https://oci-auto-worker.your-subdomain.workers.dev
```

### 9. 验证部署

#### 方法 1: 手动触发
访问你的 Worker URL，会立即执行一次创建尝试。

#### 方法 2: 查看日志
```bash
npm run tail
```

等待 1 分钟，观察 Cron 触发的日志输出。

#### 方法 3: Cloudflare Dashboard
1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages
3. 点击你的 Worker
4. 查看 "Logs" 标签

### 10. 监控运行状态

在 Cloudflare Dashboard 中可以看到：
- 请求次数（每分钟 1 次）
- 执行时间
- 错误率
- 日志输出

## 私钥格式说明

Cloudflare Workers 需要 **PKCS#8** 格式的私钥（`-----BEGIN PRIVATE KEY-----`）。

如果你的私钥是 RSA 格式（`-----BEGIN RSA PRIVATE KEY-----`），需要转换：

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in oci_private_key.pem \
  -out oci_private_key_pkcs8.pem
```

然后使用转换后的 `oci_private_key_pkcs8.pem`。

## Cron 配置说明

默认每分钟触发一次：

```toml
[triggers]
crons = ["* * * * *"]
```

Cron 表达式格式：`分 时 日 月 星期`

常用配置：
- `* * * * *` - 每分钟
- `*/2 * * * *` - 每 2 分钟
- `*/5 * * * *` - 每 5 分钟
- `0 * * * *` - 每小时整点
- `0 */2 * * *` - 每 2 小时
- `0 0 * * *` - 每天午夜

## 更新 Secrets

如果需要更新某个 Secret：

```bash
wrangler secret put SECRET_NAME
```

输入新值即可覆盖。

## 删除 Secrets

```bash
wrangler secret delete SECRET_NAME
```

## 查看已设置的 Secrets

```bash
wrangler secret list
```

注意：只能看到 Secret 名称，看不到值（这是安全设计）。

## 故障排查

### 1. 认证失败

检查：
- `OCI_USER`、`OCI_FINGERPRINT`、`OCI_TENANCY` 是否正确
- 私钥格式是否为 PKCS#8
- 私钥是否完整（包括 BEGIN 和 END 行）

### 2. 找不到资源

检查：
- `COMPARTMENT_ID`、`IMAGE_ID`、`SUBNET_ID` 是否正确
- `AVAILABILITY_DOMAIN` 格式是否正确
- `OCI_REGION` 是否匹配

### 3. Telegram 通知不工作

检查：
- Bot Token 是否正确
- Chat ID 是否正确
- 是否已经和 Bot 发起过对话（发送 `/start`）

### 4. Cron 没有触发

- 等待至少 1 分钟
- 检查 Cloudflare Dashboard 的 Cron Triggers 页面
- 查看 Worker 日志

### 5. 查看详细错误

```bash
wrangler tail --format pretty
```

实时查看所有日志输出。

## 成本说明

Cloudflare Workers 免费版限额：
- 每天 100,000 次请求
- 每次执行 10ms CPU 时间
- 每次执行 128MB 内存

按每分钟 1 次计算：
- 每天 1,440 次请求
- 远低于免费限额，完全够用

## 安全建议

1. ✅ 使用 `wrangler secret` 存储敏感信息
2. ✅ 不要将 `.dev.vars` 提交到 Git
3. ✅ 定期轮换 API 密钥
4. ✅ 限制 OCI 用户权限（最小权限原则）
5. ✅ 监控 Worker 日志，及时发现异常

## 卸载

如果不再需要：

```bash
wrangler delete
```

这会删除 Worker，但不会删除 Secrets（需要手动删除）。
