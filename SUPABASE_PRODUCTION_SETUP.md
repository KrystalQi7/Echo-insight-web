# 🚀 Supabase 生产环境配置完整指南

## 📋 目录
1. [创建 Supabase 项目](#步骤-1创建-supabase-项目)
2. [初始化数据库](#步骤-2初始化数据库)
3. [配置邮件服务](#步骤-3配置邮件服务)
4. [获取配置信息](#步骤-4获取配置信息)
5. [配置后端环境变量](#步骤-5配置后端环境变量)
6. [部署与测试](#步骤-6部署与测试)
7. [常见问题](#常见问题)

---

## 步骤 1：创建 Supabase 项目

### 1.1 访问 Supabase 官网
```
https://supabase.com/
```

### 1.2 注册/登录账号
- 使用 GitHub/Google 账号登录（推荐）
- 或使用邮箱注册

### 1.3 创建新项目
1. 点击 **"New Project"**
2. 选择 Organization（或创建新的）
3. 填写项目信息：
   ```
   Project Name: echo-insight-prod
   Database Password: [设置强密码并保存到安全位置]
   Region: Northeast Asia (Tokyo) 或 Southeast Asia (Singapore)
   Pricing Plan: Free (可后续升级到 Pro)
   ```
4. 点击 **"Create new project"**
5. ⏱️ 等待 1-2 分钟项目初始化完成

---

## 步骤 2：初始化数据库

### 2.1 进入 SQL Editor
在 Supabase Dashboard:
1. 左侧菜单 → **SQL Editor**
2. 点击 **"New query"**

### 2.2 执行完整初始化脚本
复制以下完整 SQL 脚本并执行：

```sql
-- Echo Insight 完整数据库初始化脚本
-- 在 Supabase SQL Editor 中执行

-- ===== 1. 用户表 =====
create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  password text not null,
  mbti text,
  onboarding_completed boolean default false,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===== 2. 用户每日统计表 =====
create table if not exists user_daily_stats (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  date date not null,
  draw_count int default 0,
  max_draws int default 3,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- ===== 3. 情绪记录表 =====
create table if not exists mood_records (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  mood_score int not null,
  energy_level int not null,
  note text,
  created_at timestamptz default now()
);

-- ===== 4. 卡牌记录表 =====
create table if not exists cards (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  card_id text not null,
  title text not null,
  content jsonb not null,
  drawn_at timestamptz default now()
);

-- ===== 5. 用户进度表 =====
create table if not exists user_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  streak_days int default 0,
  total_reflections int default 0,
  total_cards_drawn int default 0,
  last_active_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===== 6. 事件追踪表 =====
create table if not exists events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  event_type text not null,
  event_data jsonb,
  created_at timestamptz default now()
);

-- ===== 7. 邮箱验证码表 =====
create table if not exists auth_otps (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used boolean not null default false,
  ip text,
  created_at timestamptz not null default now()
);

-- ===== 8. 创建索引（提升性能）=====
create index if not exists idx_user_daily_stats_user_date on user_daily_stats (user_id, date);
create index if not exists idx_mood_records_user_created on mood_records (user_id, created_at desc);
create index if not exists idx_cards_user_drawn on cards (user_id, drawn_at desc);
create index if not exists idx_events_user_type on events (user_id, event_type, created_at desc);
create index if not exists idx_auth_otps_email_created_at on auth_otps (email, created_at desc);
create index if not exists idx_auth_otps_expires_at on auth_otps (expires_at);

-- ===== 9. 添加表注释 =====
comment on table users is '用户基础信息表';
comment on table user_daily_stats is '用户每日统计表（抽卡次数等）';
comment on table mood_records is '情绪记录表';
comment on table cards is '用户抽到的卡牌记录';
comment on table user_progress is '用户进度与成就';
comment on table events is '用户行为事件追踪';
comment on table auth_otps is '邮箱验证码表，用于免密登录';

comment on column auth_otps.code_hash is 'SHA256(验证码+PEPPER)';
comment on column auth_otps.expires_at is '验证码过期时间（5分钟）';
comment on column auth_otps.attempts is '验证尝试次数（最多3次）';
comment on column auth_otps.used is '是否已使用';
```

### 2.3 验证表创建成功
1. 点击 **"Run"** (或按 `Ctrl+Enter`)
2. ✅ 看到 "Success. No rows returned" 表示成功
3. 左侧菜单 → **Table Editor** → 应该能看到 7 张表

---

## 步骤 3：配置邮件服务

### 方案 A：使用 Supabase 内置邮件（推荐简单场景）

#### 特点
- ✅ **零配置**：无需额外设置
- ✅ **自动 SPF/DKIM**：高送达率
- ⚠️ **免费版限制**：每天 3 封邮件（仅测试用）
- ✅ **Pro 版**：$25/月，无限邮件

#### 配置步骤
1. 左侧菜单 → **Authentication** → **Providers**
2. 确保 **Email** provider 已启用（默认启用）
3. （可选）左侧菜单 → **Authentication** → **Email Templates** → 自定义邮件模板

**自定义验证码邮件模板**：
```html
<h2>🎯 Echo Insight 验证码</h2>
<p>您的验证码是：</p>
<h1 style="font-size: 32px; letter-spacing: 5px; color: #4F46E5; font-family: monospace;">
  {{ .Token }}
</h1>
<p style="color: #666;">验证码有效期为 <strong>5 分钟</strong>。</p>
<p style="color: #999; font-size: 12px;">如果这不是您的操作，请忽略此邮件。</p>
```

#### 升级到 Pro 版（生产环境推荐）
1. 左侧菜单 → **Settings** → **Billing**
2. 选择 **Pro Plan** ($25/month)
3. 好处：
   - ✅ 无限邮件发送
   - ✅ 自定义邮件域名
   - ✅ 更高的数据库性能
   - ✅ 7 天自动备份

---

### 方案 B：使用自定义 SMTP（Gmail/Resend 等）

如果希望使用自己的邮件服务：

#### B.1 使用 Gmail SMTP
```bash
# .env 配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-service@gmail.com
SMTP_PASS=your-app-specific-password
MAIL_FROM=your-service@gmail.com
```

**获取 Gmail 应用专用密码**：
1. 访问 https://myaccount.google.com/security
2. 启用"两步验证"
3. 搜索"应用专用密码"
4. 生成密码并保存

#### B.2 使用 Resend
```bash
# .env 配置
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
MAIL_FROM=no-reply@yourdomain.com
```

**获取 Resend API Key**：
1. 访问 https://resend.com/
2. 注册账号（免费 100 封/天，$20/月 50k 封）
3. 添加并验证域名
4. 获取 API Key

---

## 步骤 4：获取配置信息

### 4.1 获取 Supabase API 密钥
1. 左侧菜单 → **Settings** → **API**
2. 复制以下信息：

```bash
# Project URL
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co

# anon/public key（前端可用）
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...

# service_role key（仅后端，保密！）
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
```

⚠️ **安全提示**：
- `service_role key` 拥有完全权限，**绝对不能泄露或提交到 Git**
- `anon key` 可以在前端使用（已有 RLS 保护）

### 4.2 生成 JWT_SECRET 和 OTP_PEPPER

在终端运行以下命令：

```bash
# 生成 JWT_SECRET（64字符）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 生成 OTP_PEPPER（32字符）
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

保存生成的随机字符串！

---

## 步骤 5：配置后端环境变量

### 5.1 创建 `.env` 文件
在项目根目录创建 `.env` 文件（不提交到 Git）：

```bash
# ===== Supabase 配置 =====
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_anon_key_here
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_service_role_key_here

# ===== JWT 配置 =====
JWT_SECRET=your_generated_64_character_hex_string_here

# ===== OTP 配置 =====
OTP_PEPPER=your_generated_32_character_hex_string_here

# ===== Qwen3 AI 配置 =====
QWEN_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
QWEN_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# ===== 邮件配置（根据选择的方案）=====

## 方案 A: Supabase 内置邮件（无需额外配置）
# 直接留空，代码会自动使用 Supabase Auth

## 方案 B: Gmail SMTP
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-service@gmail.com
# SMTP_PASS=your-app-specific-password
# MAIL_FROM=your-service@gmail.com

## 方案 C: Resend
# RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# MAIL_FROM=no-reply@yourdomain.com

# ===== 服务器配置 =====
PORT=3000
NODE_ENV=production
```

### 5.2 确保 `.env` 在 `.gitignore` 中

检查 `.gitignore` 文件包含：
```
.env
.env.local
.env.production
*.log
node_modules/
```

---

## 步骤 6：部署与测试

### 6.1 本地测试

```bash
# 1. 安装依赖（如果还没有）
cd /Users/krystal/Documents/工作相关/能力提升/Cursor/echo-insight-app
npm install

# 2. 启动 Supabase 服务器
node backend/server-supabase.js

# 3. 在浏览器访问
open http://localhost:3000
```

### 6.2 测试流程

#### 测试 1：用户注册（密码方式）
1. 打开 http://localhost:3000
2. 切换到"注册"标签
3. 输入邮箱和密码
4. 点击"注册"
5. ✅ 应该看到"注册成功"并自动跳转到引导页

#### 测试 2：用户登录（密码方式）
1. 在登录页输入刚注册的邮箱和密码
2. 点击"登录"
3. ✅ 应该成功登录到主应用

#### 测试 3：验证码登录（如配置了邮件）
1. 切换到"验证码登录"标签
2. 输入邮箱
3. 点击"获取验证码"
4. ✅ 检查邮箱收到验证码
5. 输入验证码，点击"登录"
6. ✅ 应该成功登录

#### 测试 4：抽卡功能
1. 登录后，完成 MBTI 引导
2. 记录当前情绪
3. 点击"开始抽卡"
4. ✅ 应该看到抽卡动画和卡牌内容

#### 测试 5：API 健康检查
```bash
# 检查服务器状态
curl http://localhost:3000/api/health

# 预期返回
{"status":"ok","database":"supabase"}
```

---

## 步骤 7：生产环境部署（可选）

### 方案 A：使用 Vercel 部署

```bash
# 1. 安装 Vercel CLI
npm install -g vercel

# 2. 登录 Vercel
vercel login

# 3. 部署项目
vercel

# 4. 在 Vercel Dashboard 配置环境变量
# 添加所有 .env 中的变量
```

### 方案 B：使用服务器部署（VPS/云主机）

```bash
# 1. 安装 PM2（进程管理器）
npm install -g pm2

# 2. 启动应用
pm2 start backend/server-supabase.js --name echo-insight

# 3. 开机自启
pm2 startup
pm2 save

# 4. 配置 Nginx 反向代理（可选）
# nginx.conf 配置示例
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 常见问题

### Q1: Supabase 免费版够用吗？

**免费版限制**：
- ✅ 500MB 数据库存储
- ✅ 1GB 文件存储
- ✅ 5GB 带宽/月
- ⚠️ 邮件：每天 3 封（仅测试）
- ⚠️ 项目暂停：7 天无活动会暂停

**适用场景**：
- ✅ 开发测试
- ✅ 小型项目（< 100 用户）
- ❌ 生产环境（推荐 Pro 版）

### Q2: 如何监控邮件发送状态？

**Supabase 内置邮件**：
1. 左侧菜单 → **Authentication** → **Users**
2. 查看用户邮箱验证状态

**自定义 SMTP**：
- Gmail: 查看"已发送"文件夹
- Resend: Dashboard 查看邮件日志

### Q3: 用户收不到验证码怎么办？

**排查步骤**：
1. ✅ 检查垃圾邮件箱
2. ✅ 检查邮箱地址拼写
3. ✅ 检查 Supabase 邮件配额（免费版限制）
4. ✅ 查看后端日志（`console.log` 输出）
5. ✅ 检查数据库 `auth_otps` 表是否有记录

**临时方案**：
在开发环境，可以使用密码登录绕过验证码

### Q4: 如何备份数据？

**方法 1：Supabase Dashboard**
1. 左侧菜单 → **Database** → **Backups**
2. 点击 "Download backup"

**方法 2：使用 pg_dump**
```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" > backup.sql
```

### Q5: 如何升级到 Pro 版？

1. 左侧菜单 → **Settings** → **Billing**
2. 选择 **Pro Plan** ($25/month)
3. 填写支付信息
4. 确认订阅

**Pro 版好处**：
- ✅ 无限邮件发送
- ✅ 8GB 数据库存储
- ✅ 100GB 文件存储
- ✅ 50GB 带宽/月
- ✅ 7 天自动备份
- ✅ 99.9% SLA

---

## 🎉 完成！

现在应该已经成功配置了 Supabase 生产环境！

**下一步**：
1. ✅ 完成本地测试
2. ✅ 配置域名（可选）
3. ✅ 部署到生产环境
4. ✅ 监控用户使用情况

**相关文档**：
- [ENV_CONFIG.md](./ENV_CONFIG.md) - 环境变量配置详解
- [PRODUCTION_READY.md](./PRODUCTION_READY.md) - 生产部署指南
- [Supabase 官方文档](https://supabase.com/docs)

---

**遇到问题？** 检查后端日志：
```bash
tail -f backend/server.log
# 或实时查看控制台输出
```

