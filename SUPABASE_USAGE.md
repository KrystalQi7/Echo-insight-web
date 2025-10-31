# Echo Insight - Supabase 使用指南

## 概述

Echo Insight 项目已成功配置 Supabase 作为后端数据库，替代了原有的 SQLite 数据库。本文档说明如何使用 Supabase 进行开发。

## 数据库连接信息

- **项目URL**: https://klwfdawtiigivtiwinqr.supabase.co
- **匿名密钥**: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsd2ZkYXd0aWlnaXZ0aXdpbnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzcyNjYsImV4cCI6MjA3NzAxMzI2Nn0.glhK9EtrNz50mTBbEhsioqKqm24zLFt4HhN2VW8Aaks

## 已创建的数据表

### 1. 用户表 (users)
- 存储用户基本信息和MBTI类型
- 支持用户认证和授权

### 2. MBTI类型表 (mbti_types)
- 包含16种MBTI类型的完整信息
- 已预填充所有MBTI类型数据

### 3. 卡牌表 (cards)
- 存储心理探索卡牌
- 支持按分类、MBTI类型筛选

### 4. 心情记录表 (mood_records)
- 记录用户的心情状态
- 包含情绪、能量水平等信息

### 5. 卡牌抽取记录表 (card_draws)
- 记录用户抽卡历史
- 支持用户回答和编辑

### 6. 用户进度表 (user_progress)
- 跟踪用户等级和经验
- 记录连续天数和起始包进度

### 7. 事件表 (events)
- 记录用户行为事件
- 用于分析和统计

### 8. 每日抽卡表 (daily_draws)
- 管理每日抽卡次数限制
- 支持每日重置功能

## 安全配置

### 行级安全策略 (RLS)
所有用户相关表都启用了RLS，确保：
- 用户只能访问自己的数据
- 公共表（MBTI类型、卡牌）允许所有用户读取
- 数据安全得到保障

### 性能优化
- 所有RLS策略已优化，避免重复计算
- 创建了必要的索引提高查询性能
- 函数搜索路径已修复

## 使用方法

### 1. 安装 Supabase 客户端

```bash
npm install @supabase/supabase-js
```

### 2. 配置客户端

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://klwfdawtiigivtiwinqr.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsd2ZkYXd0aWlnaXZ0aXdpbnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzcyNjYsImV4cCI6MjA3NzAxMzI2Nn0.glhK9EtrNz50mTBbEhsioqKqm24zLFt4HhN2VW8Aaks'

const supabase = createClient(supabaseUrl, supabaseKey)
```

### 3. 基本操作示例

#### 用户认证
```javascript
// 用户注册
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123'
})

// 用户登录
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})
```

#### 数据查询
```javascript
// 获取MBTI类型列表
const { data: mbtiTypes, error } = await supabase
  .from('mbti_types')
  .select('*')

// 获取用户的心情记录
const { data: moodRecords, error } = await supabase
  .from('mood_records')
  .select('*')
  .eq('user_id', userId)
```

#### 数据插入
```javascript
// 记录用户心情
const { data, error } = await supabase
  .from('mood_records')
  .insert({
    user_id: userId,
    overall_mood: '平静',
    energy_level: '中等',
    concerns: JSON.stringify(['工作', '健康'])
  })
```

### 4. 实时功能

```javascript
// 监听数据变化
const subscription = supabase
  .channel('card_draws')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'card_draws' },
    (payload) => {
      console.log('新的抽卡记录:', payload.new)
    }
  )
  .subscribe()
```

## 迁移说明

### 从 SQLite 迁移到 Supabase

1. **数据迁移**: 需要将现有SQLite数据迁移到Supabase
2. **API更新**: 将原有的SQLite查询替换为Supabase客户端调用
3. **认证系统**: 使用Supabase Auth替代自定义JWT认证
4. **实时功能**: 利用Supabase的实时功能替代轮询

### 主要变化

- **数据库**: SQLite → PostgreSQL (Supabase)
- **认证**: 自定义JWT → Supabase Auth
- **查询**: SQL → Supabase客户端API
- **实时**: 轮询 → Supabase实时订阅

## 开发建议

1. **类型安全**: 使用生成的TypeScript类型定义
2. **错误处理**: 始终检查Supabase操作的错误
3. **性能优化**: 利用索引和查询优化
4. **安全**: 依赖RLS策略保护数据
5. **测试**: 在开发环境中测试所有功能

## 监控和维护

- 使用Supabase Dashboard监控数据库性能
- 定期检查安全建议和性能建议
- 监控API使用量和成本
- 备份重要数据

## 支持

如有问题，请参考：
- [Supabase 官方文档](https://supabase.com/docs)
- [Supabase JavaScript 客户端文档](https://supabase.com/docs/reference/javascript)
- 项目中的 `SUPABASE_SETUP.md` 文件
