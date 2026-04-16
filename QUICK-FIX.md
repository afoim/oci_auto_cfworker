# 快速修复 401 认证错误

你遇到的错误：
```
❌ Worker error: Failed to list instances: 401 {"code" : "NotAuthenticated","message" : "The required information to complete authentication was not provided or was incorrect."}
```

这说明私钥已经上传成功，但是认证信息有问题。

## 立即修复步骤

### 步骤 1：创建 .dev.vars 文件进行本地测试

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，从你的原始文件中复制配置：

```bash
# 从 config 文件复制
OCI_USER=ocid1.user.oc1..xxxxxx
OCI_FINGERPRINT=xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx
OCI_TENANCY=ocid1.tenancy.oc1..xxxxxx
OCI_REGION=ap-singapore-1

# 从 oci_private_key.pem 复制（完整内容，包括 BEGIN 和 END 行）
OCI_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
...
-----END PRIVATE KEY-----"

# 从 oci_auto.py 复制
OCPUS=4
INSTANCE_DISPLAY_NAME=ubuntu-sg-oci-worker
COMPARTMENT_ID=ocid1.tenancy.oc1..xxxxxx
AVAILABILITY_DOMAIN=rhNU:AP-SINGAPORE-1-AD-1
IMAGE_ID=ocid1.image.oc1.ap-singapore-1.xxxxxx
SUBNET_ID=ocid1.subnet.oc1.ap-singapore-1.xxxxxx
SSH_PUBLIC_KEY=ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC...

# Telegram（可选）
TELEGRAM_BOT_API=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

### 步骤 2：本地测试认证

```bash
npm run test-auth
```

这会：
- 检查所有配置是否正确
- 验证私钥格式
- 测试 OCI API 认证
- 列出现有实例

如果测试成功，你会看到：
```
✅ Authentication successful!
📦 Found X instance(s):
  - instance-name (VM.Standard.A1.Flex) - RUNNING
```

### 步骤 3：根据测试结果修复

#### 如果显示 "RSA format detected"

你的私钥需要转换：

```bash
bash scripts/convert-key.sh oci_private_key.pem
```

然后更新 `.dev.vars` 中的 `OCI_PRIVATE_KEY`，使用 `oci_private_key_pkcs8.pem` 的内容。

再次测试：
```bash
npm run test-auth
```

#### 如果显示 "Authentication failed"

检查这些值是否正确：

1. **验证 fingerprint**：
   ```bash
   openssl rsa -pubout -outform DER -in oci_private_key.pem | openssl md5 -c
   ```
   输出应该与你的 `OCI_FINGERPRINT` 完全一致。

2. **验证 user OCID**：
   登录 OCI Console → Profile → User Settings → 复制 OCID

3. **验证 tenancy OCID**：
   OCI Console → Administration → Tenancy Details → 复制 OCID

### 步骤 4：上传到 Cloudflare

本地测试成功后，上传正确的配置到 Cloudflare：

```bash
# 如果转换了私钥，使用转换后的
cat oci_private_key_pkcs8.pem | wrangler secret put OCI_PRIVATE_KEY

# 或者使用原始私钥（如果格式正确）
cat oci_private_key.pem | wrangler secret put OCI_PRIVATE_KEY

# 确认其他配置
wrangler secret put OCI_USER
wrangler secret put OCI_FINGERPRINT
wrangler secret put OCI_TENANCY
wrangler secret put COMPARTMENT_ID
wrangler secret put AVAILABILITY_DOMAIN
wrangler secret put IMAGE_ID
wrangler secret put SUBNET_ID
wrangler secret put SSH_PUBLIC_KEY
```

### 步骤 5：重新部署

```bash
npm run deploy
```

### 步骤 6：验证

```bash
npm run tail
```

等待 1 分钟看 Cron 触发，或者访问你的 Worker URL 手动触发。

## 常见问题

### Q: fingerprint 格式是什么？

A: 应该是 16 组用冒号分隔的十六进制数，例如：
```
a1:b2:c3:d4:e5:f6:g7:h8:i9:j0:k1:l2:m3:n4:o5:p6
```

### Q: 如何获取正确的 fingerprint？

A: 从你的私钥计算：
```bash
openssl rsa -pubout -outform DER -in oci_private_key.pem | openssl md5 -c
```

或者从 OCI Console 获取：
Profile → API Keys → 查看你的 API Key 的 Fingerprint

### Q: user OCID 和 tenancy OCID 有什么区别？

A: 
- **user OCID**: 你的用户账号 ID，格式：`ocid1.user.oc1..xxxxxx`
- **tenancy OCID**: 你的租户 ID，格式：`ocid1.tenancy.oc1..xxxxxx`

两者都可以在 OCI Console 中找到。

### Q: 私钥必须是 PKCS#8 格式吗？

A: 是的！Cloudflare Workers 的 Web Crypto API 只支持 PKCS#8 格式。

检查你的私钥：
```bash
head -1 oci_private_key.pem
```

- `-----BEGIN PRIVATE KEY-----` → ✅ PKCS#8，可以直接使用
- `-----BEGIN RSA PRIVATE KEY-----` → ❌ RSA 格式，需要转换

转换命令：
```bash
bash scripts/convert-key.sh oci_private_key.pem
```

## 调试技巧

### 查看详细日志

部署后查看实时日志：
```bash
wrangler tail --format pretty
```

### 手动触发测试

访问你的 Worker URL（不要等 Cron）：
```
https://oci-auto-worker.your-subdomain.workers.dev
```

### 验证 Secrets 已设置

```bash
wrangler secret list
```

应该看到所有 11 个 secret。

### 对比原始 Python 脚本

确保原始 Python 脚本能正常工作：
```bash
python oci_auto.py
```

如果 Python 脚本也失败，说明配置本身有问题，需要先修复配置。

## 还是不行？

如果以上步骤都试过了还是不行，请提供：

1. `npm run test-auth` 的完整输出
2. `npm run tail` 的完整错误日志
3. 确认原始 Python 脚本是否能正常工作

我会帮你进一步诊断问题。
