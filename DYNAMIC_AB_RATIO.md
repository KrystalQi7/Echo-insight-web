# 动态A/B行动建议比例策略

## 概述

系统现已实现基于用户上下文的动态A/B比例调整，取代原来的固定50/50分配。新策略能根据用户状态、时间、连续天数等因素智能调整，同时确保全局比例限制在40-60%的正常区间。

---

## 策略设计

### 基础概率
- **默认值：** 50% (pA = 0.5)
- **全局限制：** 40-60% (确保不会极端偏向某一类)

### 调整因素

#### 1. 新手激活期（连续天数 ≤ 3天）
- **调整：** pA + 10% → A类概率增加到60%
- **原因：** 新手更需要简单易行的微行动来建立习惯
- **A类特点：** ≤3分钟，立即可执行

#### 2. 低能量状态（心情：疲惫/焦虑/低落）
- **调整：** pA + 15% → A类概率增加到65%
- **原因：** 低能量时更适合轻量级行动，降低执行门槛
- **A类特点：** 零成本，具体场景，简单动作

#### 3. 晚间或周末（时间因素）
- **晚间：** 18:00后，pA - 10% → B类概率增加到60%
- **周末：** 周六/周日，pA - 10% → B类概率增加到60%
- **原因：** 有更多时间进行深度反思和长期规划
- **B类特点：** 1-3周时间框架，陪伴式建议

#### 4. 持续打卡（连续天数 > 3天）
- **调整：** pA - 10% → B类概率增加到60%
- **原因：** 已建立习惯，引导向深度探索发展
- **B类特点：** 结合历史数据，持续性计划

### 策略组合示例

| 场景 | 连续天数 | 时间 | 心情 | 基础pA | 调整 | 最终pA | A/B比例 |
|------|---------|------|------|--------|------|--------|---------|
| 新用户-工作日-早晨-正常 | 1天 | 10:00 | 平静 | 50% | +10% | **60%** | 60/40 |
| 新用户-晚间-低能量 | 2天 | 20:00 | 焦虑 | 50% | +10%+15%-10% | **65%** → **60%** (限制) | 60/40 |
| 老用户-工作日-早晨-正常 | 5天 | 10:00 | 平静 | 50% | -10% | **40%** | 40/60 |
| 老用户-周末-正常 | 7天 | 14:00 | 兴奋 | 50% | -10%-10% | **30%** → **40%** (限制) | 40/60 |
| 中等用户-晚间-低能量 | 3天 | 19:00 | 疲惫 | 50% | +15%-10% | **55%** | 55/45 |

---

## 技术实现

### 前端代码（frontend/script.js）

```javascript
// 计算A类行动建议的概率（动态调整，限制在40-60%区间）
function computeAProbability() {
  let pA = 0.5; // 基础概率50%
  
  try {
    // 获取用户进度数据
    const streakDays = parseInt($("#consecutiveDays")?.textContent) || 0;
    
    // 获取当前时间信息
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0=周日, 6=周六
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // 获取当前心情/能量（如果有选择）
    const selectedMoodChip = document.querySelector('.mood-chip.active');
    const mood = selectedMoodChip?.dataset?.noteMood || selectedMood || '';
    const isLowEnergy = ['疲惫', '焦虑', '低落'].includes(mood);
    
    // 策略1: 新手激活期（前3天）增加A类（简单易行动）
    if (streakDays <= 3) {
      pA += 0.1;
    }
    
    // 策略2: 低能量状态增加A类（微行动更容易完成）
    if (isLowEnergy) {
      pA += 0.15;
    }
    
    // 策略3: 晚间或周末增加B类（有时间反思）
    if (timeOfDay === 'evening' || isWeekend) {
      pA -= 0.1;
    }
    
    // 策略4: 连续打卡>3天，增加B类（引导深度探索）
    if (streakDays > 3) {
      pA -= 0.1;
    }
    
    // 全局限制：确保概率在40-60%区间
    pA = Math.min(0.6, Math.max(0.4, pA));
    
    console.log(`[EchoInsight] 计算A类概率: ${(pA * 100).toFixed(1)}% (连续${streakDays}天, ${timeOfDay}, 心情:${mood})`);
    
    return pA;
  } catch (e) {
    console.warn('[EchoInsight] 概率计算失败，使用默认50%:', e);
    return 0.5;
  }
}

// 在flipCard函数中使用
const pA = computeAProbability();
chosenIndex = Math.random() < pA ? 0 : 1;
```

### 埋点数据

每次选择行动建议时，记录以下数据：
```json
{
  "cardId": 123,
  "actionType": "A",
  "actionIndex": 0,
  "cardTitle": "孤独 🌙",
  "probabilityA": "55.0"  // 当时的A类概率
}
```

---

## 统计和监控

### 统计API

**端点：** `GET /api/debug/action-stats?limit=1000`

**返回数据示例：**
```json
{
  "total": 1000,
  "A_count": 542,
  "B_count": 458,
  "A_percentage": "54.20",
  "B_percentage": "45.80",
  "A_ratio": "542:458",
  "probability_stats": {
    "avg_probabilityA": "52.3",
    "min_probabilityA": 40.0,
    "max_probabilityA": 60.0,
    "samples_with_prob": 950
  },
  "by_card": {
    "孤独 🌙": { "A": 28, "B": 22 },
    "焦虑 🌊": { "A": 25, "B": 25 }
  },
  "recent_samples": [
    {
      "actionType": "A",
      "cardTitle": "孤独 🌙",
      "probabilityA": "55.0",
      "timestamp": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### 关键指标

1. **avg_probabilityA（平均A类概率）**
   - 理想值：48-52%（接近基准）
   - 如果偏离较大，说明某些因素影响显著

2. **min/max_probabilityA（概率范围）**
   - 应该严格在40-60%区间内
   - 如果超出，说明限制逻辑有问题

3. **A_percentage（实际A类比例）**
   - 应该接近avg_probabilityA
   - 样本量>200时，偏差应<5%

---

## 验证方法

### 1. 查看控制台日志

翻卡时会输出：
```
[EchoInsight] 计算A类概率: 55.0% (连续2天, evening, 心情:焦虑)
[EchoInsight] 已添加 1 个行动建议（索引: 0, 类型: A, 概率A:55.0%）
```

### 2. 访问统计端点

```bash
curl http://localhost:3000/api/debug/action-stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. 测试不同场景

| 测试场景 | 设置方法 | 预期pA |
|---------|---------|--------|
| 新用户早晨 | 连续1天 + 10:00 | 60% |
| 新用户晚间低能量 | 连续1天 + 20:00 + 焦虑 | 60% (限制) |
| 老用户早晨 | 连续5天 + 10:00 | 40% |
| 老用户周末 | 连续5天 + 周六 | 40% (限制) |

---

## 调优建议

### 如果A类比例过高（>55%）

可能原因：
1. 新用户占比高
2. 用户普遍低能量
3. 需要减少新手激活调整

**调整：**
```javascript
// 减少新手激活调整
if (streakDays <= 3) {
  pA += 0.05;  // 从0.1降到0.05
}
```

### 如果B类比例过高（>55%）

可能原因：
1. 老用户占比高
2. 晚间/周末使用较多
3. 需要减少持续打卡调整

**调整：**
```javascript
// 减少持续打卡调整
if (streakDays > 3) {
  pA -= 0.05;  // 从0.1降到0.05
}
```

### 如果想扩大调整范围

**修改全局限制：**
```javascript
// 当前：40-60%
pA = Math.min(0.6, Math.max(0.4, pA));

// 改为：30-70%（不推荐，可能过于极端）
pA = Math.min(0.7, Math.max(0.3, pA));
```

---

## 未来优化方向

### 1. 基于历史回答质量
- 最近两次回答字数>20且有行动确认 → B类+10%
- 连续无回答 → A类+10%

### 2. 基于卡牌类型
- 情绪类 → A类+5%（需要即时疏导）
- 成长类 → B类+5%（需要长期规划）

### 3. 机器学习优化
- 收集用户完成率数据
- 训练模型预测最佳比例
- 个性化调整策略

### 4. A/B测试
- 对照组：固定50/50
- 实验组：动态调整
- 观察留存率、回答率、action_confirm率

---

## 回滚方案

如果动态策略效果不佳，可以快速回滚到固定50/50：

```javascript
// 在computeAProbability函数中
function computeAProbability() {
  return 0.5;  // 直接返回50%
}
```

或者注释掉动态计算，使用固定值：

```javascript
// const pA = computeAProbability();
const pA = 0.5;  // 临时固定50/50
chosenIndex = Math.random() < pA ? 0 : 1;
```

---

## 总结

✅ **已实现：**
- 基于4个因素的动态概率计算
- 40-60%全局限制
- 完整的埋点和统计
- 实时监控和调试工具

✅ **优势：**
- 新手友好（更多微行动）
- 老用户深度（更多长期计划）
- 状态自适应（低能量更简单）
- 时间自适应（晚间更深度）

✅ **安全性：**
- 全局限制确保不会极端
- 默认回退到50%
- 完整的日志和监控

系统现在能够根据用户实际情况智能调整A/B比例，在保持灵活性的同时确保稳定性！

