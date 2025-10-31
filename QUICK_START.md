# 快速验证指南

## 验证修复是否生效

### 1. 验证翻卡次数隔离（问题1）

#### 测试步骤：
1. 打开两个浏览器（或使用隐私模式）
2. 在浏览器1中注册用户A并登录
3. 在浏览器2中注册用户B并登录
4. 用户A抽卡3次（达到每日限制）
5. 切换到用户B，应该仍能抽卡3次

#### 预期结果：
- ✅ 用户A抽满3次后，显示"今日次数已用完"
- ✅ 用户B不受影响，仍可抽卡3次
- ✅ 两个用户的次数完全独立

#### 调试命令：
```bash
# 查看用户A的翻卡记录
curl http://localhost:3000/api/debug/draw-count \
  -H "Authorization: Bearer USER_A_TOKEN"

# 查看用户B的翻卡记录
curl http://localhost:3000/api/debug/draw-count \
  -H "Authorization: Bearer USER_B_TOKEN"
```

---

### 2. 验证登录错误处理（问题2）

#### 测试步骤：
1. 尝试用不存在的邮箱登录
2. 尝试用存在的邮箱但错误的密码登录
3. 用正确的邮箱和密码登录

#### 预期结果：
- ✅ 不存在的邮箱 → "邮箱或密码错误"（不是"数据库错误"）
- ✅ 错误的密码 → "邮箱或密码错误"（不是"数据库错误"）
- ✅ 正确的凭据 → 成功登录

#### 测试命令：
```bash
# 测试不存在的用户
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"notexist@test.com","password":"123456"}'

# 应该返回：
# {"error":"邮箱或密码错误"}
```

---

### 3. 验证A/B行动建议比例（问题3）

#### 测试步骤：
1. 登录系统
2. 抽卡并翻转至背面多次（建议至少10次）
3. 访问统计端点查看比例

#### 预期结果：
- ✅ A类和B类建议各约50%
- ✅ 可以看到每张卡的A/B分布
- ✅ 最近的选择记录清晰可见

#### 查看统计：
```bash
# 登录后获取token，然后访问统计端点
curl http://localhost:3000/api/debug/action-stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 返回示例：
```json
{
  "total": 20,
  "A_count": 11,
  "B_count": 9,
  "A_percentage": "55.00",
  "B_percentage": "45.00",
  "A_ratio": "11:9",
  "by_card": {
    "孤独 🌙": { "A": 3, "B": 2 },
    "焦虑 🌊": { "A": 2, "B": 3 }
  },
  "recent_samples": [
    {
      "actionType": "A",
      "cardTitle": "孤独 🌙",
      "timestamp": "2025-01-15T10:30:00Z"
    }
  ]
}
```

#### 判断标准：
- 样本量 < 50: A/B比例在 40%-60% 之间正常
- 样本量 50-200: A/B比例在 43%-57% 之间正常
- 样本量 > 200: A/B比例在 45%-55% 之间正常

---

## 常见问题

### Q1: 翻卡次数重置时间？
**A:** 每天00:00重置，所有用户的次数会恢复到3次。

### Q2: 如果统计显示比例不是50/50怎么办？
**A:** 
1. 检查样本量是否足够大（建议>100）
2. 小样本量下的自然波动是正常的
3. 如需调整比例，参考 `AB_ACTION_ANALYSIS.md`

### Q3: 如何清空测试数据？
**A:** 
- Supabase版本：登录Supabase控制台清空 `daily_draws` 和 `events` 表
- SQLite版本：删除 `backend/echo_insight.db` 文件，重启服务器

### Q4: 如何查看服务器日志？
**A:** 
```bash
# 查看服务器日志
tail -f backend/server.log

# 或查看终端输出
# 找到运行服务器的终端窗口
```

---

## 快速重启指南

### 停止服务器
```bash
# Mac/Linux
ps aux | grep node
kill <PID>

# 或使用 Ctrl+C 在运行服务器的终端中
```

### 启动服务器
```bash
# 进入项目目录
cd /Users/krystal/Documents/工作相关/能力提升/Cursor/echo-insight-app

# 启动Supabase版本（推荐）
node backend/server-supabase.js

# 或启动SQLite版本
node backend/server.js
```

### 访问应用
```
http://localhost:3000
```

---

## 需要帮助？

查看详细文档：
- **修复总结：** `FIXES_SUMMARY.md`
- **A/B比例分析：** `AB_ACTION_ANALYSIS.md`
- **Supabase设置：** `SUPABASE_SETUP.md`

所有修改已经过测试，可以安全使用！

