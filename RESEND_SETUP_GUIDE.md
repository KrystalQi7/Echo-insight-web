# 📧 Resend 邮件配置完整指南（5分钟完成）

## 🎯 快速开始

### 所需时间
- **总计**：5-10 分钟
- 第 1 步（注册）：2 分钟
- 第 2 步（获取 API Key）：1 分钟
- 第 3 步（配置）：1 分钟
- 第 4 步（测试）：1 分钟

---

## 📝 第 1 步：注册 Resend 账号

### 1.1 访问官网
```
https://resend.com/
```

### 1.2 注册账号

**方式 A：GitHub 登录（推荐）**
1. 点击页面右上角 **"Sign Up"** 按钮
2. 选择 **"Continue with GitHub"**
3. 授权 Resend 访问你的 GitHub 账号
4. ✅ 自动完成注册

**方式 B：邮箱注册**
1. 点击页面右上角 **"Sign Up"** 按钮
2. 输入你的邮箱地址
3. 检查邮箱，点击验证链接
4. 设置密码
5. ✅ 完成注册

### 1.3 登录 Dashboard
注册成功后会自动跳转到 Resend Dashboard

---

## 🔑 第 2 步：获取 API Key

### 2.1 进入 API Keys 页面

在 Resend Dashboard 中：
1. 左侧导航栏 → 点击 **"API Keys"**
2. 点击右上角蓝色按钮 **"Create API Key"**

### 2.2 填写 API Key 信息

在弹出的对话框中填写：

```
┌─────────────────────────────────────┐
│ Create API Key                      │
├─────────────────────────────────────┤
│                                     │
│ Name *                              │
│ ┌─────────────────────────────────┐ │
│ │ Echo Insight Production         │ │  ← 随便起个名字
│ └─────────────────────────────────┘ │
│                                     │
│ Permission *                        │
│ ◉ Sending access                   │  ← 选择这个
│ ○ Full access                      │
│                                     │
│ Domain (optional)                   │
│ ┌─────────────────────────────────┐ │
│ │ All domains                     │ │  ← 保持默认
│ └─────────────────────────────────┘ │
│                                     │
│         [Cancel]  [Create]          │
└─────────────────────────────────────┘
```

**字段说明**：
- **Name**：API Key 的名称，方便识别（如：`Echo Insight Production`）
- **Permission**：选择 **"Sending access"**（发送邮件权限）
- **Domain**：保持 **"All domains"** 即可

### 2.3 复制 API Key

1. 点击 **"Create"** 按钮
2. 会显示生成的 API Key（只显示一次！）：

```
┌─────────────────────────────────────┐
│ API Key Created                     │
├─────────────────────────────────────┤
│                                     │
│ Copy this key now. You won't be    │
│ able to see it again!               │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ re_123abc456def789ghi012jkl     │ │ ← 复制这个
│ │                         [Copy]  │ │
│ └─────────────────────────────────┘ │
│                                     │
│              [Done]                 │
└─────────────────────────────────────┘
```

3. **立即点击 "Copy" 按钮复制 API Key**
4. ⚠️ **重要**：API Key 格式为 `re_` 开头 + 约 30 个字符，只显示一次！

**示例**：
```
re_123abc456def789ghi012jkl345mno678pqr
```

### 2.4 保存 API Key

将复制的 API Key 保存到安全位置：
- 粘贴到记事本暂存
- 或直接进入下一步配置到 `.env` 文件

---

## ⚙️ 第 3 步：配置项目环境变量

### 3.1 打开项目目录

```bash
cd /Users/krystal/Documents/工作相关/能力提升/Cursor/echo-insight-app
```

### 3.2 编辑 .env 文件

**如果 .env 文件不存在**，创建它：
```bash
touch .env
```

**打开 .env 文件**，添加以下内容：

```bash
# ===== Resend 邮件配置 =====
RESEND_API_KEY=re_你刚才复制的API_Key粘贴到这里
MAIL_FROM=onboarding@resend.dev
```

**完整示例**：
```bash
# ===== Supabase 配置 =====
SUPABASE_URL=https://klwfdawtiigivtiwinqr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ===== JWT 配置 =====
JWT_SECRET=your_jwt_secret_here

# ===== OTP 配置 =====
OTP_PEPPER=your_otp_pepper_here

# ===== Resend 邮件配置 =====
RESEND_API_KEY=re_123abc456def789ghi012jkl345mno678pqr
MAIL_FROM=onboarding@resend.dev

# ===== Qwen3 AI 配置 =====
QWEN_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
QWEN_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

### 3.3 配置说明

#### `RESEND_API_KEY`
- **值**：刚才从 Resend Dashboard 复制的 API Key
- **格式**：`re_` 开头 + 30 个字符
- **示例**：`re_123abc456def789ghi012jkl345mno678pqr`

#### `MAIL_FROM`
- **值**：发件人邮箱地址
- **初期使用**：`onboarding@resend.dev`（Resend 提供的共享域名）
  - ✅ 无需配置，开箱即用
  - ✅ 完全免费
  - ⚠️ 送达率稍低（但足够使用）
- **有域名后**：`no-reply@yourdomain.com`（自己的域名）
  - ✅ 送达率更高
  - ✅ 更专业
  - ⚠️ 需要配置 DNS（见下文"进阶配置"）

**推荐配置**：
```bash
# 初期（无域名）
MAIL_FROM=onboarding@resend.dev

# 或使用其他 Resend 共享域名
MAIL_FROM=no-reply@resend.dev
MAIL_FROM=hello@resend.dev
```

### 3.4 保存文件

- 按 `Ctrl+S`（Windows/Linux）或 `Cmd+S`（macOS）保存
- 确保文件名为 `.env`（以点开头）

### 3.5 确保 .env 不被提交到 Git

检查 `.gitignore` 文件：

```bash
# 查看 .gitignore
cat .gitignore | grep .env

# 如果没有输出，添加以下行
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore
```

---

## ✅ 第 4 步：测试邮件发送

### 4.1 启动服务器

```bash
# 确保在项目目录
cd /Users/krystal/Documents/工作相关/能力提升/Cursor/echo-insight-app

# 启动服务器
node backend/server-supabase.js
```

**预期输出**：
```
[SERVER] Echo Insight backend running at http://localhost:3000
[SERVER] Using Supabase database
```

### 4.2 测试方式 A：使用浏览器（推荐）

#### 步骤 1：打开应用
在浏览器中访问：
```
http://localhost:3000
```

#### 步骤 2：切换到验证码登录
- 点击 **"验证码登录"** 标签

#### 步骤 3：输入邮箱并获取验证码
1. 输入你的真实邮箱地址（如 `your-email@gmail.com`）
2. 点击 **"获取验证码"** 按钮
3. ✅ 应该看到倒计时开始（60秒）

#### 步骤 4：检查邮箱
1. 打开你的邮箱
2. 查找来自 `onboarding@resend.dev` 的邮件
3. ⚠️ 如果没收到，检查 **垃圾邮件箱**

**邮件示例**：
```
From: onboarding@resend.dev
To: your-email@gmail.com
Subject: Echo Insight 登录验证码

────────────────────────────
Echo Insight

您的登录验证码是：

  123456

验证码有效期为 10 分钟。
若非本人操作，请忽略此邮件。
────────────────────────────
```

#### 步骤 5：输入验证码登录
1. 在浏览器中输入收到的 6 位验证码
2. （可选）输入昵称
3. 点击 **"登录"** 按钮
4. ✅ 应该成功登录到应用

---

### 4.3 测试方式 B：使用命令行

**在新的终端窗口运行**（保持服务器运行）：

```bash
# 测试请求验证码 API
curl -X POST http://localhost:3000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@gmail.com"}'
```

**预期响应**（成功）：
```json
{"message":"验证码已发送"}
```

**预期响应**（失败 - 邮箱格式错误）：
```json
{"error":"邮箱格式不正确"}
```

**查看服务器控制台**：
应该能看到类似输出：
```
[REQ] POST /api/auth/request-otp

========== 📧 验证码邮件 ==========
收件人: your-email@gmail.com
主题: Echo Insight 登录验证码
内容: 您的登录验证码是：123456
验证码有效期为 10 分钟。
===================================

✅ 邮件已通过 Resend 发送: your-email@gmail.com
```

---

### 4.4 检查 Resend Dashboard

1. 返回 Resend Dashboard
2. 左侧菜单 → **"Emails"**
3. 应该能看到刚才发送的邮件记录：

```
┌─────────────────────────────────────────────────────────┐
│ Emails                                                  │
├──────────────┬────────────────────┬───────────┬─────────┤
│ To           │ Subject            │ Status    │ Time    │
├──────────────┼────────────────────┼───────────┼─────────┤
│ your@emai... │ Echo Insight 登...│ ✅ Sent   │ Just... │
└──────────────┴────────────────────┴───────────┴─────────┘
```

**状态说明**：
- ✅ **Sent**（已发送）：邮件成功发送
- ⏳ **Sending**（发送中）：正在发送
- ✅ **Delivered**（已送达）：邮件已送达收件箱
- ❌ **Failed**（失败）：发送失败

点击任意邮件可以查看详细信息：
- 发送时间
- 收件人
- 邮件内容预览
- 送达状态
- 错误信息（如果失败）

---

## 🎉 完成！

如果你看到：
- ✅ 服务器控制台输出 "邮件已通过 Resend 发送"
- ✅ 邮箱收到验证码
- ✅ Resend Dashboard 显示 "Sent" 状态

**恭喜！邮件配置成功！** 🎊

---

## 🔍 故障排查

### 问题 1：收不到邮件

#### 可能原因 A：邮件在垃圾箱
**解决方案**：
1. 检查邮箱的 **垃圾邮件** 或 **推广邮件** 文件夹
2. 将 `onboarding@resend.dev` 添加到白名单/通讯录

#### 可能原因 B：API Key 配置错误
**检查步骤**：
1. 打开 `.env` 文件
2. 确认 `RESEND_API_KEY` 格式正确（`re_` 开头）
3. 确认没有多余的空格或引号
4. 重启服务器（`Ctrl+C` 停止，重新运行 `node backend/server-supabase.js`）

#### 可能原因 C：邮箱地址格式错误
**解决方案**：
- 确保邮箱格式正确：`user@example.com`
- 避免使用临时邮箱（可能被拒收）

#### 可能原因 D：Resend API 错误
**检查步骤**：
1. 查看服务器控制台是否有错误信息
2. 登录 Resend Dashboard → Emails，查看发送状态
3. 如果显示 "Failed"，点击查看详细错误信息

---

### 问题 2：服务器报错 "Email send failed"

#### 排查步骤
1. **检查 API Key 是否有效**
   - 登录 Resend Dashboard → API Keys
   - 确认 API Key 状态为 "Active"
   - 如果被删除或过期，重新创建

2. **检查网络连接**
   ```bash
   # 测试网络连通性
   curl https://api.resend.com/
   ```

3. **查看详细错误信息**
   - 服务器控制台会输出详细错误
   - 常见错误：
     - `401 Unauthorized`：API Key 无效
     - `403 Forbidden`：权限不足
     - `422 Unprocessable Entity`：请求参数错误

---

### 问题 3：提示 "验证码发送频率过快"

**原因**：为防止滥用，限制每小时最多发送 5 次验证码

**解决方案**：
- 等待 1 小时后重试
- 或修改 `backend/server-supabase.js` 中的 `OTP_MAX_PER_HOUR` 常量（开发环境）

---

### 问题 4：验证码过期

**原因**：验证码有效期为 10 分钟

**解决方案**：
- 重新点击"获取验证码"
- 或修改 `backend/server-supabase.js` 中的 `OTP_TTL_MIN` 常量（开发环境）

---

## 🚀 进阶配置：使用自定义域名（可选）

### 为什么使用自定义域名？

| 对比项 | 共享域名 | 自定义域名 |
|-------|---------|-----------|
| 送达率 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 专业度 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 配置难度 | ⭐（无需配置） | ⭐⭐⭐（需要配置 DNS） |
| 成本 | 免费 | 域名费用（约 $10/年） |

**推荐时机**：
- ✅ 用户规模 > 100
- ✅ 有正式域名
- ✅ 追求专业形象

---

### 配置步骤

#### 步骤 1：购买域名（如果没有）

推荐域名注册商：
- **Cloudflare**：约 $10/年，DNS 解析快
- **NameSilo**：约 $9/年，包含隐私保护
- **阿里云**：约 ¥50/年，国内访问快

#### 步骤 2：在 Resend 添加域名

1. Resend Dashboard → **Domains** → **Add Domain**
2. 输入域名：`yourdomain.com`
3. 点击 **"Add Domain"**

#### 步骤 3：配置 DNS 记录

Resend 会显示需要添加的 DNS 记录：

```
记录类型    名称                      值
────────    ────                      ────
TXT         @                         resend-verification=xxxxx
TXT         resend._domainkey         k=rsa; p=MIIBIjANBg...（很长）
MX          @                         feedback-smtp.resend.com
                                      优先级: 10
```

#### 步骤 4：在域名提供商添加记录

**Cloudflare 示例**：
1. 登录 Cloudflare
2. 选择域名 → DNS → Records
3. 点击 "Add record"
4. 逐条添加 Resend 提供的记录

**阿里云示例**：
1. 登录阿里云控制台
2. 域名 → 域名列表 → 解析
3. 添加记录
4. 逐条添加 Resend 提供的记录

#### 步骤 5：验证域名

1. 返回 Resend Dashboard
2. 点击 **"Verify Domain"**
3. ✅ 看到绿色 "Verified" 状态（可能需要等待几分钟）

#### 步骤 6：更新 .env 配置

```bash
# 修改 MAIL_FROM 为自己的域名
MAIL_FROM=no-reply@yourdomain.com

# 或其他名称
MAIL_FROM=noreply@yourdomain.com
MAIL_FROM=hello@yourdomain.com
MAIL_FROM=support@yourdomain.com
```

#### 步骤 7：重启服务器测试

```bash
# 停止服务器（Ctrl+C）
# 重新启动
node backend/server-supabase.js

# 测试发送
# 邮件现在会显示来自 no-reply@yourdomain.com
```

---

## 📊 免费额度监控

### 查看使用量

1. Resend Dashboard → **Usage**
2. 可以看到：
   - 今日已发送邮件数
   - 本月已发送邮件数
   - 免费额度剩余

**免费版限制**：
- 100 封/天
- 3,000 封/月

**超出后**：
- 需要升级到 Pro 版（$20/月）
- 或等待次日/次月重置

### 设置用量告警（推荐）

1. Dashboard → **Settings** → **Notifications**
2. 启用 "Usage alerts"
3. 设置阈值（如 80%）
4. ✅ 接近限额时会收到邮件通知

---

## 💰 升级到 Pro 版

### 什么时候升级？

- ✅ 免费额度不够用（> 100 封/天）
- ✅ 需要更高的送达率
- ✅ 需要技术支持

### 如何升级？

1. Dashboard → **Settings** → **Billing**
2. 点击 **"Upgrade to Pro"**
3. 填写支付信息（信用卡）
4. 确认订阅（$20/月）

**Pro 版好处**：
- ✅ 50,000 封/月（$20）
- ✅ 自定义域名（无限制）
- ✅ 邮件分析（打开率、点击率）
- ✅ 技术支持（邮件）
- ✅ 更高的发送速率

---

## 📚 相关文档

- [Resend 官方文档](https://resend.com/docs)
- [Resend API 参考](https://resend.com/docs/api-reference/emails/send-email)
- [EMAIL_SERVICE_GUIDE.md](./EMAIL_SERVICE_GUIDE.md) - 多服务对比
- [SUPABASE_PRODUCTION_SETUP.md](./SUPABASE_PRODUCTION_SETUP.md) - 完整部署
- [ENV_CONFIG.md](./ENV_CONFIG.md) - 环境变量详解

---

## 🆘 获取帮助

### 问题未解决？

1. **检查服务器日志**
   ```bash
   # 查看实时日志
   tail -f backend/server.log
   ```

2. **查看 Resend 状态页**
   ```
   https://status.resend.com/
   ```

3. **联系 Resend 支持**
   - Dashboard → Support → Send message
   - 或邮件：support@resend.com

4. **查看项目 Issues**
   - 如果是项目本身的问题，可以在项目仓库提 Issue

---

**配置完成！现在可以开始使用邮件验证码功能了！** 🚀

