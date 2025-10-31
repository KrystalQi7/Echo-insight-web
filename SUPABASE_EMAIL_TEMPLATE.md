# Supabase 邮件模板配置指南

## ✅ 当前方案：纯 Supabase Auth OTP

已完全移除 Resend，使用 Supabase 内置邮件服务：
- ✅ 完全免费
- ✅ 发送到任意真实邮箱
- ✅ 每月 50,000 封

---

## 📧 Supabase 邮件模板配置

### 步骤1：进入邮件模板编辑

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目：`klwfdawtiigivtiwinqr`
3. 左侧菜单 → `Authentication` → `Emails` → `Templates`
4. 选择 **"Confirm signup"** 模板（不是 Magic Link）

### 步骤2：修改邮件主题

将 Subject 改为：
```
Echo Insight 登录验证码
```

### 步骤3：修改邮件正文

点击 `<> Source` 标签，将整个内容替换为：

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 60px 20px; text-align: center; background-color: #ffffff;">
  
  <h1 style="color: #7b61ff; font-size: 28px; font-weight: 600; margin: 0 0 40px 0;">
    Echo Insight
  </h1>
  
  <p style="color: #333333; font-size: 16px; margin: 0 0 30px 0; line-height: 1.5;">
    您的登录验证码是：
  </p>
  
  <div style="font-size: 48px; color: #7b61ff; font-weight: bold; letter-spacing: 8px; margin: 0 0 40px 0; font-family: 'Courier New', Courier, monospace;">
    {{ .Token }}
  </div>
  
  <p style="color: #666666; font-size: 14px; margin: 0 0 20px 0;">
    验证码有效期为 60 分钟。
  </p>
  
  <p style="color: #999999; font-size: 12px; margin: 0;">
    若非本人操作，请忽略此邮件。
  </p>
  
</div>
```

**关键点**：
- ⚠️ 使用 `{{ .Token }}` 显示验证码（不是 `{{ .Data.verification_code }}`）
- ⚠️ Supabase OTP 有效期默认是 60 分钟（不可自定义）

### 步骤4：保存模板

点击右上角的 "Save" 按钮

---

## 🎨 邮件样式效果

用户收到的邮件将显示为：

```
┌─────────────────────────┐
│                         │
│     Echo Insight        │  ← 紫色标题
│                         │
│   您的登录验证码是：     │  ← 黑色文字
│                         │
│      621568             │  ← 紫色大号验证码
│                         │
│  验证码有效期为 60 分钟。 │  ← 灰色小字
│                         │
│ 若非本人操作，请忽略此邮件。│ ← 更浅灰色
│                         │
└─────────────────────────┘
```

---

## 🧪 测试流程

配置完成后：

1. **测试任意邮箱**：
   - 输入任何真实邮箱（如 krystall009@163.com）
   - 点击"获取验证码"
   
2. **检查邮箱**：
   - 收到来自 Supabase 的邮件
   - 邮件主题：Echo Insight 登录验证码
   - 邮件内容：包含 6 位数字验证码

3. **输入验证码登录**：
   - 复制邮件中的验证码
   - 粘贴到输入框
   - 点击登录

---

## 💡 技术说明

### 验证码生成和验证
- **生成**：Supabase Auth 自动生成（6位数字）
- **发送**：Supabase 邮件服务（免费，无限制）
- **验证**：使用 `supabase.auth.verifyOtp()` 
- **存储**：Supabase 自动管理（auth.users 表）

### 用户管理
- **auth.users**：Supabase Auth 系统表（自动创建）
- **public.users**：我们的业务表（同步创建）
- **token**：自定义 JWT（24小时有效）

---

## ⚠️ 重要提醒

1. **邮件模板变量**：
   - ✅ 使用 `{{ .Token }}`（Supabase 生成的验证码）
   - ❌ 不要用 `{{ .ConfirmationURL }}`（确认链接）
   - ❌ 不要用 `{{ .Data.xxx }}`（自定义数据不支持）

2. **有效期**：
   - Supabase OTP 默认 60 分钟有效
   - 无法自定义为 10 分钟

3. **测试邮箱**：
   - 避免使用 `test@example.com` 等明显的假邮箱
   - Supabase 会验证邮箱真实性

---

## 🎯 总结

配置完成后：
- ✅ 完全免费发送到任意邮箱
- ✅ 简洁美观的邮件样式
- ✅ 无需域名验证
- ✅ 不依赖第三方邮件服务

**请在 Supabase Dashboard 中配置模板，然后测试！** 🚀

