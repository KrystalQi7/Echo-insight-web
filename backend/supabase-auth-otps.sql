-- Echo Insight 邮箱验证码登录表
-- 在 Supabase SQL Editor 中执行此脚本

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

-- 索引：提升查询性能
create index if not exists idx_auth_otps_email_created_at on auth_otps (email, created_at desc);
create index if not exists idx_auth_otps_expires_at on auth_otps (expires_at);

-- 可选：自动清理过期验证码的定时任务（保留最近7天）
-- DELETE FROM auth_otps WHERE created_at < now() - interval '7 days';

-- 添加 display_name 和 avatar_url 字段到 users 表（如果不存在）
alter table users add column if not exists display_name text;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists updated_at timestamptz default now();

-- 注释
comment on table auth_otps is '邮箱验证码表，用于免密登录';
comment on column auth_otps.code_hash is 'SHA256(验证码+PEPPER)';
comment on column auth_otps.expires_at is '验证码过期时间';
comment on column auth_otps.attempts is '尝试验证次数';
comment on column auth_otps.used is '是否已使用';

