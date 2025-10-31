# Echo Insight - Supabase 数据库配置

## 项目概述

Echo Insight 是一个基于MBTI的心理探索应用，使用Supabase作为后端数据库。本文档说明了数据库表结构和配置信息。

## 数据库连接信息

- **项目URL**: https://klwfdawtiigivtiwinqr.supabase.co
- **匿名密钥**: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsd2ZkYXd0aWlnaXZ0aXdpbnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzcyNjYsImV4cCI6MjA3NzAxMzI2Nn0.glhK9EtrNz50mTBbEhsioqKqm24zLFt4HhN2VW8Aaks

## 数据表结构

### 1. 用户表 (users)
存储用户基本信息和MBTI类型
```sql
- id: UUID (主键)
- username: VARCHAR(100) (唯一)
- email: VARCHAR(255) (唯一)
- password: TEXT
- mbti_type: VARCHAR(10)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### 2. MBTI类型表 (mbti_types)
存储16种MBTI类型的详细信息
```sql
- id: SERIAL (主键)
- type_code: VARCHAR(10) (唯一)
- type_name: VARCHAR(50)
- description: TEXT
- traits: TEXT
- created_at: TIMESTAMP
```

### 3. 卡牌表 (cards)
存储心理探索卡牌
```sql
- id: SERIAL (主键)
- title: TEXT
- content: TEXT
- category: TEXT
- card_type: TEXT (默认: '情绪类')
- mbti_type: VARCHAR(10)
- is_starter: INTEGER (默认: 0)
- mood_tags: TEXT
- created_at: TIMESTAMP
```

### 4. 心情记录表 (mood_records)
存储用户心情数据
```sql
- id: SERIAL (主键)
- user_id: UUID (外键 -> users.id)
- overall_mood: TEXT
- energy_level: TEXT
- concerns: TEXT
- recorded_at: TIMESTAMP
```

### 5. 卡牌抽取记录表 (card_draws)
存储用户抽卡历史
```sql
- id: SERIAL (主键)
- user_id: UUID (外键 -> users.id)
- card_id: INTEGER (外键 -> cards.id)
- user_response: TEXT
- response_length: INTEGER (默认: 0)
- drawn_at: TIMESTAMP
- is_edited: INTEGER (默认: 0)
- edit_count: INTEGER (默认: 0)
- last_edited_at: TIMESTAMP
```

### 6. 用户进度表 (user_progress)
存储用户等级和经验
```sql
- id: SERIAL (主键)
- user_id: UUID (外键 -> users.id)
- level: INTEGER (默认: 1)
- experience_points: INTEGER (默认: 0)
- consecutive_days: INTEGER (默认: 0)
- last_activity_date: DATE
- unlocked_categories: TEXT
- starter_passed: INTEGER (默认: 0)
- starter_score: INTEGER (默认: 0)
- starter_actions_done: INTEGER (默认: 0)
- starter_days: INTEGER (默认: 0)
```

### 7. 事件表 (events)
存储用户行为事件
```sql
- id: SERIAL (主键)
- user_id: UUID (外键 -> users.id)
- type: TEXT
- payload: TEXT
- created_at: TIMESTAMP
```

### 8. 每日抽卡表 (daily_draws)
管理每日抽卡次数
```sql
- id: SERIAL (主键)
- user_id: UUID (外键 -> users.id)
- draw_date: DATE
- draw_count: INTEGER (默认: 0)
- max_draws: INTEGER (默认: 3)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

## 安全策略 (RLS)

所有用户相关表都启用了行级安全策略 (RLS)，确保用户只能访问自己的数据：

- **用户表**: 用户只能查看和更新自己的资料
- **心情记录表**: 用户只能访问自己的心情记录
- **卡牌抽取记录表**: 用户只能访问自己的抽卡历史
- **用户进度表**: 用户只能访问自己的进度信息
- **事件表**: 用户只能访问自己的事件记录
- **每日抽卡表**: 用户只能访问自己的每日抽卡记录

公共表（MBTI类型和卡牌）允许所有用户读取。

## 索引优化

为了提高查询性能，创建了以下索引：

- `users`: 基于 email 和 username 的唯一索引
- `mood_records`: 基于 user_id 和 recorded_at 的索引
- `card_draws`: 基于 user_id, card_id 和 drawn_at 的索引
- `user_progress`: 基于 user_id 和 level 的索引
- `events`: 基于 user_id, type 和 created_at 的索引
- `daily_draws`: 基于 user_id 和 draw_date 的索引

## 触发器

- **更新时间触发器**: 自动更新 `updated_at` 字段
- **用户表**: 更新时自动设置 `updated_at`
- **每日抽卡表**: 更新时自动设置 `updated_at`

## 使用说明

1. **连接数据库**: 使用提供的项目URL和匿名密钥连接Supabase
2. **认证**: 使用Supabase Auth进行用户认证
3. **数据访问**: 通过Supabase客户端库访问数据，RLS会自动处理权限控制
4. **实时功能**: 可以利用Supabase的实时功能监听数据变化

## 迁移历史

所有表结构已通过Supabase MCP工具自动创建，包括：
- 表结构创建
- 索引创建
- 外键约束设置
- RLS策略配置
- 触发器设置

## 注意事项

1. 所有用户相关表都有外键约束，删除用户时会级联删除相关数据
2. RLS策略确保数据安全，用户只能访问自己的数据
3. 每日抽卡表有唯一约束，每个用户每天只能有一条记录
4. 所有时间戳都使用UTC时区
