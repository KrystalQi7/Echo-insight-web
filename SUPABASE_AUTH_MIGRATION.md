# Supabase Auth 迁移指南

## 概述

本指南将帮助你从自定义 OTP 系统迁移到 Supabase Auth，获得以下优势：
- ✅ **完全免费**的邮件发送服务
- ✅ **无需域名验证**
- ✅ 可发送到**任意邮箱**
- ✅ 更安全可靠的认证系统

---

## 迁移步骤

### 步骤1：在 Supabase Dashboard 启用 Email OTP

1. **登录 Supabase Dashboard**
   - 访问：https://supabase.com/dashboard
   - 选择项目：klwfdawtiigivtiwinqr

2. **进入 Authentication 设置**
   - 左侧菜单 → "Authentication"
   - 点击 "Providers" 标签

3. **配置 Email Provider**
   - 找到 "Email" 选项
   - **启用** "Enable Email provider"
   - **启用** "Enable Email OTP"
   - **关闭** "Confirm email" （我们只用 OTP，不需要确认链接）

4. **自定义邮件模板（可选）**
   - 点击 "Email Templates"
   - 编辑 "Magic Link" 模板
   - 自定义邮件内容和样式

5. **保存配置**

### 步骤2：重启服务器

```bash
# 停止旧服务器
ps aux | grep "node.*server-supabase" | grep -v grep | awk '{print $2}' | xargs kill

# 启动新服务器
cd backend
../node-v20.10.0-darwin-x64/bin/node server-supabase.js > server.log 2>&1 &
```

### 步骤3：测试验证码登录

1. 打开浏览器：http://localhost:3000
2. 输入任意邮箱（可以是任何邮箱！）
3. 点击"获取验证码"
4. 检查邮箱，应该会收到来自 Supabase 的验证码
5. 输入验证码登录

---

## 技术变更说明

### 后端 API 变更

#### **申请验证码**
```javascript
// 旧方式（自定义）
- 自己生成验证码
- 存储到 auth_otps 表
- 使用 Resend 发送邮件

// 新方式（Supabase Auth）
+ 使用 supabase.auth.signInWithOtp()
+ Supabase 自动发送邮件
+ 无需自己管理验证码表
```

#### **验证登录**
```javascript
// 旧方式（自定义）
- 从 auth_otps 表查询
- 验证 SHA256 哈希
- 手动创建用户
- 生成 JWT token

// 新方式（Supabase Auth）
+ 使用 supabase.auth.verifyOtp()
+ Supabase 自动验证
+ 自动创建 auth.users
+ 同步到 public.users 表
+ 生成 JWT token（兼容原有系统）
```

### 数据库变更

#### **不再需要的表**
- ❌ `auth_otps` 表（可以保留或删除）

#### **Supabase 自动管理**
- ✅ `auth.users` 表（Supabase Auth 系统表）
- ✅ 验证码存储和过期管理
- ✅ 邮件发送队列

#### **我们继续使用**
- ✅ `public.users` 表（业务数据）
- ✅ 其他业务表不变

---

## 费用对比

### **旧方案（Resend）**
- Resend 免费版：只能发给注册邮箱
- Resend 付费版：$20/月
- 需要验证域名：$10-15/年（域名费用）
- **总计**：$240-255/年

### **新方案（Supabase Auth）**
- Supabase 免费版：每月 50,000 封邮件
- 无需域名
- **总计**：$0/年 🎉

---

## App Store 上架费用说明

### **必须支付**
- **Apple Developer Program**：$99/年（约 ¥700/年）
  - 这是上架 App Store 的唯一必须费用
  - 包含 TestFlight 测试
  - 无法避免

### **可选支付**
- Supabase Pro：$25/月（如果免费版不够用）
- App 内购买/订阅：App Store 抽成 30%

### **总成本估算（第一年）**

#### **最小方案（推荐）**
- Apple Developer：$99/年
- Supabase：免费版
- **总计**：$99/年 ≈ ¥700/年

#### **完整方案（规模化后）**
- Apple Developer：$99/年
- Supabase Pro：$300/年
- **总计**：$399/年 ≈ ¥2800/年

---

## 邮件配置对比

### **发送到任意邮箱的方案**

| 方案 | 免费额度 | 超额费用 | 需要域名 | 推荐度 |
|------|----------|----------|----------|--------|
| **Supabase Auth** | 50,000/月 | 免费 | ❌ | ⭐⭐⭐⭐⭐ |
| Resend 付费版 | 3,000/月 | $20/月 | ✅ | ⭐⭐⭐ |
| 阿里云邮件推送 | 200/月 | ¥0.1/封 | ✅ | ⭐⭐ |
| SendGrid | 100/月 | $19.95/月 | ✅ | ⭐⭐ |

**结论**：Supabase Auth 是 App 版本的最佳选择！

---

## 下一步

1. ✅ 后端代码已更新
2. ⏳ 在 Supabase Dashboard 启用 Email OTP
3. ⏳ 测试验证码功能
4. ⏳ 准备上架 App Store

完成 Supabase 配置后，就可以免费发送验证码到任意邮箱了！🚀

