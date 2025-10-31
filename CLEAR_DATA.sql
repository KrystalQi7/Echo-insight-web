-- 清空所有用户数据
-- 在 Supabase Dashboard -> SQL Editor 中执行

-- 1. 清空 users 表（保留表结构）
TRUNCATE TABLE users RESTART IDENTITY CASCADE;

-- 2. 清空相关表（如果有外键关联）
-- TRUNCATE TABLE user_settings RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE profiles RESTART IDENTITY CASCADE;

-- 3. 清空 MBTI 选择记录（如果有单独的表）
-- TRUNCATE TABLE mbti_selections RESTART IDENTITY CASCADE;

-- 执行完毕后，所有用户数据都已清空
-- auth.users 你已经在 Dashboard 中删除了
-- 现在 public.users 也清空了

SELECT 'All user data cleared!' as status;

