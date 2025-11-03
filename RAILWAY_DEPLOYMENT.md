# Railway + Vercel 部署指南

## 🎯 部署架构

- **后端**：Railway（Node.js 服务）
- **前端**：Vercel（静态托管）
- **数据库**：Supabase（PostgreSQL）

**优势：**
- ✅ 完全不需要绑定银行卡
- ✅ 配置简单，10 分钟完成
- ✅ 自动部署，推送即更新
- ✅ 免费额度充足

---

## 📋 第一步：部署后端到 Railway

### 1.1 注册登录 Railway

1. 打开浏览器访问：**https://railway.app**
2. 点击右上角 **"Login"** 按钮
3. 选择 **"Login with GitHub"**
4. 授权 Railway 访问你的 GitHub 仓库
5. **无需绑卡，直接进入 Dashboard**

### 1.2 创建新项目

1. 在 Railway Dashboard，点击 **"New Project"** 按钮
2. 选择 **"Deploy from GitHub repo"**
3. 在弹出的仓库列表中找到 **"Echo-insight-web"**
4. 点击仓库名称

**如果看不到仓库：**
- 点击 "Configure GitHub App"
- 授权 Railway 访问 Echo-insight-web 仓库
- 返回并刷新

### 1.3 Railway 自动部署

点击仓库后，Railway 会：
- ✅ 自动检测 Node.js 项目
- ✅ 自动运行 `npm install`
- ✅ 开始构建部署

**第一次会失败（正常），因为缺少环境变量。**

### 1.4 添加环境变量

#### 进入变量设置：
1. 点击你的服务（可能显示红色或部署失败）
2. 点击顶部的 **"Variables"** 标签

#### 添加必需的环境变量：

点击 **"New Variable"** 按钮，逐个添加：

| Variable | Value | 说明 |
|----------|-------|------|
| `NODE_ENV` | `production` | 生产环境标识 |
| `JWT_SECRET` | 见下方生成方法 | JWT 加密密钥 |
| `SUPABASE_URL` | `https://klwfdawtiigivtiwinqr.supabase.co` | Supabase 地址 |
| `SUPABASE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsd2ZkYXd0aWlnaXZ0aXdpbnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzcyNjYsImV4cCI6MjA3NzAxMzI2Nn0.glhK9EtrNz50mTBbEhsioqKqm24zLFt4HhN2VW8Aaks` | Supabase 公钥 |

**可选变量（AI 功能）：**

| Variable | Value |
|----------|-------|
| `DASHSCOPE_API_KEY` | 你的千问密钥（没有可不填） |
| `MODEL_PROVIDER` | `dashscope` |
| `QWEN_MODEL` | `qwen-plus` |

#### 生成 JWT_SECRET：

**方法：使用浏览器 Console**
1. 在任意网页按 `F12` 打开开发者工具
2. 切换到 **"Console"** 标签
3. 粘贴以下代码并按回车：
```javascript
Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('')
```
4. 复制输出的 64 位字符串

### 1.5 配置启动命令

1. 点击 **"Settings"** 标签
2. 向下滚动找到 **"Deploy"** 部分
3. 在 **"Custom Start Command"** 输入框填入：
```
node backend/server-supabase.js
```
4. 点击保存（或自动保存）

### 1.6 触发重新部署

1. 点击 **"Deployments"** 标签
2. Railway 会自动检测到变量更新并重新部署
3. 或点击右上角 **"Deploy"** 按钮手动触发
4. 等待 2-3 分钟，看到绿色 ✓ 说明成功

### 1.7 生成公网域名

1. 点击 **"Settings"** 标签
2. 向下滚动到 **"Networking"** 或 **"Domains"** 部分
3. 点击 **"Generate Domain"** 按钮
4. Railway 会生成一个域名，类似：
   ```
   https://echo-insight-web-production.up.railway.app
   ```
5. **复制这个完整 URL（包括 https://）**
6. **保存到记事本，马上要用！**

### 1.8 测试后端

在浏览器访问：
```
https://你的railway域名/api/health
```

应该返回：
```json
{"status":"ok","timestamp":"2025-11-03T..."}
```

如果返回正常，说明**后端部署成功！** ✅

---

## 📋 第二步：更新前端配置（需要手动操作）

### 2.1 修改前端代码

**打开文件：** `frontend/script.js`

**找到第 9 行：**
```javascript
return 'https://RAILWAY_BACKEND_URL_PLACEHOLDER';
```

**改为你实际的 Railway 后端 URL：**
```javascript
return 'https://echo-insight-web-production.up.railway.app';
```

（把域名改成你在步骤 1.7 复制的实际域名）

### 2.2 推送更新到 GitHub

在终端执行：
```bash
cd /Users/krystal/Documents/工作相关/能力提升/Cursor/echo-insight-web

git add .

git commit -m "配置Railway后端域名"

git push
```

---

## 📋 第三步：部署前端到 Vercel

### 3.1 登录 Vercel

1. 访问：**https://vercel.com**
2. 点击右上角 **"Sign Up"**（或 "Login"）
3. 选择 **"Continue with GitHub"**
4. 授权 Vercel 访问 GitHub

### 3.2 导入项目

1. 点击 **"Add New..."** → **"Project"**
2. 在 **"Import Git Repository"** 列表找到 **"Echo-insight-web"**
3. 点击 **"Import"**

### 3.3 配置项目（重要！）

**关键配置：**

| 字段 | 值 | 说明 |
|------|---|------|
| **Framework Preset** | `Other` | 选择其他 |
| **Root Directory** | 点击 **Edit** → 选择 `frontend` | ⚠️ 必须设置！ |
| **Build Command** | 留空（或 `# No build needed`） | 无需构建 |
| **Output Directory** | `.` | 当前目录 |
| **Install Command** | 留空 | 无需安装 |

**最关键：Root Directory 必须设置为 `frontend`！**

### 3.4 部署

1. 确认配置无误
2. 点击 **"Deploy"** 按钮
3. 等待 1-2 分钟
4. 看到 **"Congratulations!"** 说明成功

### 3.5 获取前端域名

- Vercel 会显示你的域名，类似：
  ```
  https://echo-insight-web.vercel.app
  ```
- 或 `https://echo-insight-web-krystalqi7.vercel.app`

### 3.6 测试前端

访问前端域名，应该看到：
- ✅ 登录页面正常显示
- ✅ 样式加载正常

---

## 📋 第四步：完整功能测试

### 测试清单：

1. **访问前端** → `https://你的vercel域名`
2. **注册账号** → 输入邮箱密码 → 应该收到验证码
3. **验证邮箱** → 输入验证码 → 注册成功
4. **设置 MBTI** → 选择类型
5. **抽取卡牌** → 点击抽卡 → 应该能抽到卡
6. **保存回答** → 记录想法 → 保存成功
7. **查看历史** → 个人中心 → 能看到记录

如果所有功能都正常，**部署完成！** 🎉

---

## ✅ 部署成功检查清单

| 项目 | 状态 |
|------|------|
| Railway 后端显示 "Active" | ✅ |
| 访问 `/api/health` 返回 OK | ✅ |
| Vercel 前端部署成功 | ✅ |
| 前端页面正常显示 | ✅ |
| 注册登录功能正常 | ✅ |
| 抽卡功能正常 | ✅ |
| 保存回答功能正常 | ✅ |

---

## 🎯 现在开始部署

### 立即操作：

**第 1 步 - 访问 Railway：**
打开浏览器 → https://railway.app → Login with GitHub

**第 2 步 - 创建项目：**
New Project → Deploy from GitHub repo → Echo-insight-web

**第 3 步 - 添加环境变量：**
Variables 标签 → 添加上面表格中的变量

**第 4 步 - 生成域名：**
Settings → Generate Domain → 复制 URL

**第 5 步 - 告诉我后端 URL：**
把复制的 Railway 域名发给我，我帮你更新前端配置

---

开始操作吧！遇到任何问题随时告诉我。我会一步步指导你完成！
