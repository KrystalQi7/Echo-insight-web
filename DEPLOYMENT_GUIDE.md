# Echo Insight 生产环境部署指南

## 架构说明

- **前端**：Vercel（静态托管）
- **后端**：Render（Node.js 服务）
- **数据库**：Supabase（PostgreSQL）

---

## 📋 部署步骤

### 第一步：部署后端到 Render

#### 1. 访问 Render
- 打开浏览器访问：https://render.com
- 点击 **"Get Started"**
- 选择 **"Sign in with GitHub"**
- 授权 Render 访问你的 GitHub 仓库

#### 2. 创建 Web Service
- 点击 **"New +"** → **"Web Service"**
- 在列表中找到 **"Echo-insight-web"** 仓库
- 点击 **"Connect"**

#### 3. 配置部署参数

| 字段 | 填写内容 |
|------|---------|
| Name | `echo-insight-backend` |
| Region | `Singapore` |
| Branch | `main` |
| Root Directory | 留空 |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node backend/server-supabase.js` |
| Instance Type | `Free` |

#### 4. 添加环境变量

点击 **"Advanced"** → **"Add Environment Variable"**：

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `JWT_SECRET` | 随机生成（见下方） |
| `SUPABASE_URL` | `https://klwfdawtiigivtiwinqr.supabase.co` |
| `SUPABASE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`（完整key见代码） |
| `DASHSCOPE_API_KEY` | 你的通义千问密钥（可选） |
| `MODEL_PROVIDER` | `dashscope` |
| `QWEN_MODEL` | `qwen-plus` |

**生成 JWT_SECRET：**
在本地终端执行：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
复制输出作为 JWT_SECRET 的值。

#### 5. 开始部署
- 点击 **"Create Web Service"**
- 等待 3-5 分钟部署完成
- 看到绿色 **"Live"** 标识说明成功
- **复制后端 URL**（类似 `https://echo-insight-backend.onrender.com`）
- **保存这个 URL，下一步要用！**

#### 6. 测试后端
访问：`https://你的后端域名.onrender.com/api/health`

应该返回：
```json
{"status":"ok","timestamp":"2025-11-03T..."}
```

---

### 第二步：更新前端配置

#### 1. 修改 frontend/script.js

**找到第 9 行**，把占位符替换为实际后端 URL：

```javascript
return 'https://你的实际后端域名.onrender.com';
```

例如：
```javascript
return 'https://echo-insight-backend.onrender.com';
```

#### 2. 提交并推送代码

在终端执行：
```bash
git add .
git commit -m "配置生产环境后端地址"
git push
```

---

### 第三步：部署前端到 Vercel

#### 1. 访问 Vercel
- 打开浏览器访问：https://vercel.com
- 点击 **"Sign Up"**
- 选择 **"Continue with GitHub"**
- 授权 Vercel 访问你的 GitHub 仓库

#### 2. 导入项目
- 点击 **"Add New..."** → **"Project"**
- 在列表中找到 **"Echo-insight-web"**
- 点击 **"Import"**

#### 3. 配置项目设置

| 字段 | 填写内容 |
|------|---------|
| Project Name | `echo-insight-web` |
| Framework Preset | `Other` |
| Root Directory | `frontend` ⚠️ 重要！ |
| Build Command | 留空 |
| Output Directory | `.` |
| Install Command | 留空 |

#### 4. 部署
- 点击 **"Deploy"** 按钮
- 等待 1-2 分钟
- 看到 **"Congratulations!"** 说明成功
- 复制前端域名（类似 `https://echo-insight-web.vercel.app`）

#### 5. 测试前端
- 访问前端域名
- 应该能看到登录页面
- 尝试注册/登录功能

---

### 第四步：更新后端 CORS（如果 Vercel 给了不同域名）

如果 Vercel 生成的域名不是 `echo-insight-web.vercel.app`，需要更新后端 CORS：

#### 1. 修改 backend/server-supabase.js 第 60 行

把实际的 Vercel 域名添加到 `allowedOrigins` 数组。

#### 2. 提交推送
```bash
git add backend/server-supabase.js
git commit -m "更新CORS允许的域名"
git push
```

Render 会自动重新部署后端。

---

## ✅ 部署完成验证

### 后端验证
访问：`https://你的后端域名.onrender.com/api/health`
```json
{"status":"ok","timestamp":"..."}
```

### 前端验证
访问：`https://你的前端域名.vercel.app`
- ✅ 看到登录页面
- ✅ 可以注册新账号
- ✅ 可以登录
- ✅ 可以抽卡
- ✅ 可以保存回答

---

## 🔧 故障排查

### 问题 1：前端无法连接后端
**检查：**
- 前端 `script.js` 的后端 URL 是否正确
- 后端 CORS 是否允许前端域名
- 浏览器开发者工具 Console 查看错误

### 问题 2：Render 部署失败
**查看 Logs：**
- Render Dashboard → 你的服务 → Logs
- 查看错误信息
- 常见原因：环境变量缺失、端口配置错误

### 问题 3：数据库连接失败
**检查：**
- Supabase URL 和 KEY 是否正确
- Supabase 项目是否激活
- 环境变量是否配置

---

## 📞 需要帮助？

遇到问题可以：
1. 查看 Render Logs（后端日志）
2. 查看 Vercel Logs（前端部署日志）
3. 浏览器 F12 → Console（前端错误）
4. 浏览器 F12 → Network（API 请求）

---

## 🎯 下一步优化

部署成功后可以：
- ✅ 配置自定义域名
- ✅ 设置 SSL 证书（自动）
- ✅ 配置 CDN 加速
- ✅ 添加监控和报警
- ✅ 设置数据库备份

