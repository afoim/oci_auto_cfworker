# 故障排查指南

## 错误：atob() called with invalid base64-encoded data

这个错误表示私钥格式有问题。按以下步骤修复：

### 步骤 1：检查私钥格式

```bash
node scripts/check-private-key.js oci_private_key.pem
```

这会显示：
- 私钥格式（PKCS#8 还是 RSA）
- 是否加密
- Base64 内容是否有效
- 具体的修复建议

### 步骤 2：根据检查结果修复

#### 情况 A：私钥是 RSA 格式（BEGIN RSA PRIVATE KEY）

需要转换为 PKCS#8 格式：

```bash
# 方法 1：使用脚本（推荐）
bash scripts/convert-key.sh oci_private_key.pem

# 方法 2：手动转换
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in oci_private_key.pem \
  -out oci_private_key_pkcs8.pem
```

然后使用转换后的文件：

```bash
cat oci_private_key_pkcs8.pem | wrangler secret put OCI_PRIVATE_KEY
```

#### 情况 B：私钥是加密的（包含 ENCRYPTED）

需要先解密：

```bash
openssl rsa -in oci_private_key.pem -out oci_private_key_decrypted.pem
```

输入密码后，再转换为 PKCS#8：

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in oci_private_key_decrypted.pem \
  -out oci_private_key_pkcs8.pem
```

#### 情况 C：私钥包含非法字符

可能是复制粘贴时出错。重新从文件读取：

```bash
cat oci_private_key.pem | wrangler secret put OCI_PRIVATE_KEY
```

### 步骤 3：验证上传

上传后，重新部署并测试：

```bash
npm run deploy
```

访问你的 Worker URL 或查看日志：

```bash
npm run tail
```

## 其他常见错误

### 错误：401 Unauthorized

**原因：** OCI 认证信息不正确

**解决：**
1. 检查 `OCI_USER`、`OCI_FINGERPRINT`、`OCI_TENANCY` 是否正确
2. 确认私钥与 fingerprint 匹配：
   ```bash
   openssl rsa -pubout -outform DER -in oci_private_key.pem | openssl md5 -c
   ```
   输出应该与 `OCI_FINGERPRINT` 一致

### 错误：404 Not Found

**原因：** 资源 ID 不正确

**解决：**
1. 检查 `COMPARTMENT_ID`、`IMAGE_ID`、`SUBNET_ID` 是否正确
2. 确认 `OCI_REGION` 与资源所在区域一致
3. 确认 `AVAILABILITY_DOMAIN` 格式正确（例如：`rhNU:AP-SINGAPORE-1-AD-1`）

### 错误：500 Internal Error / Out of host capacity

**原因：** OCI 容量不足（这是正常的）

**解决：**
- 这不是错误！Worker 会每分钟自动重试
- 不会发送 Telegram 通知（避免刷屏）
- 等待 OCI 有容量时会自动创建成功

### 错误：Telegram 通知不工作

**原因：** Telegram 配置不正确

**解决：**
1. 确认已经和 Bot 发起过对话（发送 `/start`）
2. 获取正确的 Chat ID：
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
3. 重新设置 Secrets：
   ```bash
   wrangler secret put TELEGRAM_BOT_API
   wrangler secret put TELEGRAM_CHAT_ID
   ```

### 错误：Cron 没有触发

**原因：** Cron 配置问题或需要等待

**解决：**
1. 确认 `wrangler.toml` 中有 Cron 配置：
   ```toml
   [triggers]
   crons = ["* * * * *"]
   ```
2. 重新部署：
   ```bash
   npm run deploy
   ```
3. 等待至少 1 分钟
4. 在 Cloudflare Dashboard 查看 Cron Triggers 页面

## 调试技巧

### 1. 查看实时日志

```bash
npm run tail
```

或者带格式化：

```bash
wrangler tail --format pretty
```

### 2. 手动触发测试

访问你的 Worker URL（例如 `https://oci-auto-worker.your-subdomain.workers.dev`）

### 3. 查看已设置的 Secrets

```bash
wrangler secret list
```

### 4. 更新某个 Secret

```bash
wrangler secret put SECRET_NAME
```

### 5. 删除某个 Secret

```bash
wrangler secret delete SECRET_NAME
```

## 完整的重新设置流程

如果一切都不工作，从头开始：

```bash
# 1. 检查私钥
node scripts/check-private-key.js oci_private_key.pem

# 2. 如果需要，转换私钥
bash scripts/convert-key.sh oci_private_key.pem

# 3. 删除所有旧的 secrets
wrangler secret delete OCI_PRIVATE_KEY
# ... 删除其他 secrets

# 4. 重新设置所有 secrets
cat oci_private_key_pkcs8.pem | wrangler secret put OCI_PRIVATE_KEY
wrangler secret put OCI_USER
wrangler secret put OCI_FINGERPRINT
# ... 设置其他 secrets

# 5. 重新部署
npm run deploy

# 6. 查看日志
npm run tail
```

## 需要帮助？

如果以上方法都不能解决问题：

1. 运行 `node scripts/check-private-key.js oci_private_key.pem` 并分享输出
2. 运行 `wrangler tail` 并分享完整的错误日志
3. 确认你的 OCI 配置在原始 Python 脚本中是否能正常工作
