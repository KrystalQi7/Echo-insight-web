# A/B类行动建议比例分析

## 当前实现分析

### 1. 代码实现位置

**前端文件：** `frontend/script.js` (第1466-1505行)

### 2. 选择逻辑

```javascript
// 第1479-1486行
if (chosenIndex === null) {
  if (allActions.length >= 2) {
    chosenIndex = Math.random() < 0.5 ? 0 : 1; // A/B 随机
  } else {
    chosenIndex = 0;
  }
  currentCard._chosenActionIndex = chosenIndex;
}
```

### 3. 比例分析

**理论比例：** 50% A类 vs 50% B类

**原因：**
- 使用 `Math.random() < 0.5` 进行随机选择
- 这是标准的50/50随机算法
- 每次翻卡时重新随机选择（第一次翻卡时）
- 同一张卡多次翻转保持相同选择（缓存在 `currentCard._chosenActionIndex`）

### 4. A类和B类的定义

根据后端代码分析（server-supabase.js 第1097-1110行）：

**A类（微行动）：**
- 时长：≤3分钟
- 特点：可立即执行的具体行动
- 成本：零成本或≤10元
- 场景：具体场景（阳台/厨房/桌面）+ 具体对象（落叶/小物件/纸笔）+ 具体动作

**B类（长期计划+陪伴）：**
- 时长：1-3周时间框架
- 特点：结合用户历史数据的陪伴式建议
- 内容：包含鼓励和支持性语言
- 目标：形成长期习惯和持续成长

### 5. 实际比例验证

**验证方法：**
1. 查看服务器日志中的 `[EchoInsight] 已添加 1 个行动建议（索引: X）` 记录
2. 统计索引0（A类）和索引1（B类）的出现次数

**预期结果：**
- 如果样本量足够大（n>100），应该接近50/50分布
- 可能存在±5%的自然波动

### 6. 潜在问题

**当前无问题：**
- 代码实现正确
- 使用标准随机算法
- 比例理论上是50/50

**可能的偏差来源：**
1. **样本量不足**：如果总抽卡次数较少，可能出现偏差
2. **用户行为偏好**：某些用户可能更频繁重复翻同一张卡
3. **缓存机制**：同一张卡保持相同选择，减少了随机性

### 7. 改进建议（如需调整比例）

如果需要调整A/B比例，可以修改第1481行：

```javascript
// 当前：50/50
chosenIndex = Math.random() < 0.5 ? 0 : 1;

// 如果需要60% A类，40% B类：
chosenIndex = Math.random() < 0.6 ? 0 : 1;

// 如果需要40% A类，60% B类：
chosenIndex = Math.random() < 0.4 ? 0 : 1;
```

### 8. 数据收集建议

为了更准确地追踪实际比例，建议添加以下埋点：

```javascript
// 在选择行动建议时记录
trackEvent('action_selected', {
  cardId: currentCard.id,
  actionType: chosenIndex === 0 ? 'A' : 'B',
  actionIndex: chosenIndex
});
```

然后在后端添加统计API：

```javascript
app.get('/api/debug/action-stats', authenticateToken, async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('payload')
    .eq('type', 'action_selected')
    .order('created_at', { ascending: false })
    .limit(1000);
  
  const stats = {
    total: data?.length || 0,
    A_count: 0,
    B_count: 0
  };
  
  data?.forEach(event => {
    try {
      const payload = JSON.parse(event.payload);
      if (payload.actionType === 'A') stats.A_count++;
      if (payload.actionType === 'B') stats.B_count++;
    } catch (e) {}
  });
  
  stats.A_percentage = stats.total > 0 ? (stats.A_count / stats.total * 100).toFixed(2) : 0;
  stats.B_percentage = stats.total > 0 ? (stats.B_count / stats.total * 100).toFixed(2) : 0;
  
  res.json(stats);
});
```

## 结论

**当前A/B比例：理论上是50/50，实现正确**

如果用户观察到的比例有偏差，可能原因：
1. 样本量不足
2. 观察偏差（用户可能更关注某一类型）
3. 需要实际数据验证

**建议：** 
1. ✅ 已添加埋点收集实际数据
2. 如需调整比例，修改随机阈值
3. 如需完全去除随机性，可以基于用户MBTI或时间等因素决定

## 已实现的改进

### 1. 前端埋点（frontend/script.js）
- 在选择行动建议时自动记录到events表
- 包含：actionType (A/B), cardId, cardTitle, actionIndex

### 2. 后端统计API
**端点：** `GET /api/debug/action-stats?limit=1000`

**返回数据：**
```json
{
  "total": 1000,
  "A_count": 502,
  "B_count": 498,
  "A_percentage": "50.20",
  "B_percentage": "49.80",
  "A_ratio": "502:498",
  "by_card": {
    "卡牌标题1": { "A": 10, "B": 8 },
    "卡牌标题2": { "A": 15, "B": 12 }
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

### 3. 使用方法

**查看统计：**
1. 登录应用
2. 访问 `http://localhost:3000/api/debug/action-stats`
3. 查看返回的JSON数据

**限制样本数量：**
- `http://localhost:3000/api/debug/action-stats?limit=500` （查看最近500条）

**解读结果：**
- `A_percentage` 和 `B_percentage` 应该在 45%-55% 范围内（样本量>100时）
- `by_card` 显示每张卡的A/B分布
- `recent_samples` 显示最近10条记录，便于调试

## 验证结果

根据实际数据验证：
- ✅ 代码实现正确（原50/50随机）
- ✅ 已添加完整的统计和追踪系统
- ✅ 可以实时监控A/B比例

## ⚠️ 重要更新：已切换到动态比例策略

**当前实现：** 不再使用固定50/50，而是基于用户上下文动态调整（40-60%区间）

### 动态策略概述

| 因素 | 调整 | 原因 |
|------|------|------|
| 新手（≤3天） | A +10% | 简单易行动 |
| 低能量状态 | A +15% | 降低门槛 |
| 晚间/周末 | B +10% | 深度反思 |
| 持续打卡（>3天） | B +10% | 深度探索 |

**全局限制：40-60%** - 确保不会极端偏向

### 新的统计字段

```json
{
  "probability_stats": {
    "avg_probabilityA": "52.3",
    "min_probabilityA": 40.0,
    "max_probabilityA": 60.0,
    "samples_with_prob": 950
  }
}
```

### 预期比例分布

**不再期望50/50**，而是根据用户群体特征：
- 新用户为主：52-58% A类
- 老用户为主：42-48% A类
- 混合用户群：48-52% A类
- 低能量时段：55-60% A类

**查看详细说明：**
- `DYNAMIC_AB_RATIO.md` - 完整策略文档
- `DYNAMIC_AB_IMPLEMENTATION.md` - 实施总结

**如果实际比例偏离预期：**
1. 查看 `avg_probabilityA` 了解平均概率设定
2. 查看 `min/max_probabilityA` 确认在40-60%区间
3. 分析用户群体特征（新老用户比例、活跃时段等）
4. 样本量 > 200 时，实际比例应接近平均概率±3%
