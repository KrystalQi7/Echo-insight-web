# Echo Insight 环境变量配置指南

## 📋 配置清单

### 必需配置

#### 1. JWT_SECRET
- **用途**：JWT令牌签名密钥
- **示例**：`JWT_SECRET=your-super-secret-jwt-key-change-in-production`
- **生成方法**：
  ```bash
  # 生成随机密钥
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- **安全建议**：生产环境必须使用强随机字符串（至少32字符）

#### 2. OTP_PEPPER
- **用途**：验证码哈希盐值
- **示例**：`OTP_PEPPER=your-otp-pepper-change-in-production`
- **生成方法**：同JWT_SECRET
- **安全建议**：必须与JWT_SECRET不同

---

### 可选配置（推荐生产环境配置）

#### 3. 邮件服务 - Resend（推荐）

**Resend** 是一个简单易用的邮件API服务，注册即送免费额度。

- **官网**：https://resend.com
- **注册**：免费账户每月3000封邮件
- **配置**：
  ```bash
  RESEND_API_KEY=re_xxxxxxxxxxxxx
  MAIL_FROM=no-reply@yourdomain.com
  ```
- **使用场景**：发送验证码邮件

#### 4. Qwen AI（可选）

- **用途**：AI生成个性化卡牌内容
- **配置**：
  ```bash
  DASHSCOPE_API_KEY=your-qwen-api-key
  ```
- **获取**：https://dashscope.console.aliyun.com/

#### 5. 端口配置

```bash
PORT=3000
```

---

## 🚀 快速开始

### 1. 创建环境变量文件

在项目根目录创建 `.env` 文件：

```bash
cd Cursor/echo-insight-app
touch .env
```

### 2. 填入配置

**开发环境最小配置**：
```bash
# 开发环境（验证码仅输出到控制台）
JWT_SECRET=dev-jwt-secret-please-change-in-production
OTP_PEPPER=dev-otp-pepper-please-change-in-production
PORT=3000
```

**生产环境完整配置**：
```bash
# 生产环境
JWT_SECRET=生成的强随机密钥
OTP_PEPPER=生成的强随机密钥
PORT=3000

# 邮件服务
RESEND_API_KEY=re_xxxxxxxxxxxxx
MAIL_FROM=no-reply@yourdomain.com

# AI服务（可选）
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxx
```

### 3. 验证配置

启动服务器后检查：
```bash
./node-v20.10.0-darwin-x64/bin/node backend/server-supabase.js
```

如果看到：
```
✓ Server running on port 3000
✓ Environment variables loaded
```

说明配置成功！

---

## 📧 验证码发送说明

### 开发环境

**默认行为**：验证码只输出到控制台

当用户请求验证码时，控制台会显示：
```
========== 📧 验证码邮件 ==========
收件人: user@example.com
主题: Echo Insight 登录验证码
内容: 验证码：123456
===================================
```

**优点**：
- 无需配置邮件服务
- 方便本地开发测试
- 零成本

### 生产环境

**配置邮件服务后**：验证码真实发送到用户邮箱

**推荐方案：Resend**

1. 注册Resend账号：https://resend.com
2. 创建API密钥
3. 验证发件域名（或使用Resend提供的测试域名）
4. 在`.env`中配置：
   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   MAIL_FROM=no-reply@yourdomain.com
   ```

**替代方案：使用SMTP**

如果你想使用其他邮件服务（如Gmail, SendGrid等），需要修改 `backend/server-supabase.js` 中的 `sendEmail` 函数，使用nodemailer等库。

---

## 🔐 安全建议

### 生产环境必做

1. **强随机密钥**
   - JWT_SECRET至少64字符
   - OTP_PEPPER至少64字符
   - 两者必须不同

2. **环境变量隔离**
   - `.env`文件已在`.gitignore`中
   - 不要将`.env`提交到Git
   - 不要在代码中硬编码密钥

3. **定期轮换**
   - 建议每3-6个月轮换JWT_SECRET
   - 轮换时需要让所有用户重新登录

4. **HTTPS**
   - 生产环境必须启用HTTPS
   - 可使用Cloudflare/Nginx反向代理

### Supabase数据库安全

1. **RLS（Row Level Security）**
   - 建议启用行级安全策略
   - 限制auth_otps表的访问权限

2. **API密钥管理**
   - 当前使用的是anon key（公开密钥）
   - 生产环境考虑使用service_role key（后端专用）

3. **定期清理**
   - 定期删除过期的验证码记录
   - 可设置Supabase定时任务

---

## 📝 配置检查清单

上线前请确认：

- [ ] JWT_SECRET已更换为强随机字符串
- [ ] OTP_PEPPER已更换为强随机字符串
- [ ] 邮件服务已配置（RESEND_API_KEY + MAIL_FROM）
- [ ] 邮件发送测试通过
- [ ] .env文件未提交到Git
- [ ] HTTPS已启用
- [ ] Supabase数据库表已创建
- [ ] Supabase RLS策略已配置（可选）

---

## 🆘 常见问题

### Q: 验证码收不到？

**开发环境**：
- 检查控制台是否输出了验证码
- 验证码在控制台显示，不会真实发送

**生产环境**：
- 检查RESEND_API_KEY是否正确
- 检查MAIL_FROM域名是否已验证
- 查看控制台是否有错误日志
- 检查垃圾邮件箱

### Q: 如何测试验证码功能？

**本地测试**：
1. 启动服务器
2. 打开 http://localhost:3000
3. 输入邮箱，点击"获取验证码"
4. 从控制台复制验证码
5. 输入验证码登录

**线上测试**：
1. 使用真实邮箱测试
2. 检查邮件送达情况
3. 测试验证码有效期（10分钟）
4. 测试频控（1小时5次）

### Q: 如何禁用验证码功能？

不推荐禁用，但如果必须：
1. 在前端将"验证码登录"tab隐藏
2. 默认显示"密码登录"tab
3. 用户仍可通过密码登录

---

## 📚 相关文档

- [Supabase数据表创建](./backend/supabase-auth-otps.sql)
- [后端API文档](./API_DOCUMENTATION.md)
- [部署指南](./DEPLOYMENT.md)

---

**最后更新**：2025-01-15

