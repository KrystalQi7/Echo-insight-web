const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// 导入 fetch (Node.js 18+ 内置，否则需要 node-fetch)
let fetch;
try {
  fetch = globalThis.fetch;
} catch (e) {
  try {
    fetch = require('node-fetch');
  } catch (e2) {
    console.warn('Fetch not available, Qwen integration will use fallback');
  }
}

// 轻量 .env 加载（避免额外依赖）
(() => {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      raw.split(/\r?\n/).forEach(line => {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^"|"$/g, '');
        }
      });
    }
  } catch (_) {}
})();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'echo-insight-secret-key';

// 验证码相关配置
const OTP_TTL_MIN = 10; // 验证码有效期（分钟）
const OTP_MAX_PER_HOUR = 5; // 每小时最多发送次数
const OTP_MAX_ATTEMPTS = 5; // 最多验证尝试次数
const OTP_PEPPER = process.env.OTP_PEPPER || 'otp_pepper_dev_change_in_production';
const crypto = require('crypto');

// Supabase 配置
const supabaseUrl = 'https://klwfdawtiigivtiwinqr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsd2ZkYXd0aWlnaXZ0aXdpbnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzcyNjYsImV4cCI6MjA3NzAxMzI2Nn0.glhK9EtrNz50mTBbEhsioqKqm24zLFt4HhN2VW8Aaks';
const supabase = createClient(supabaseUrl, supabaseKey);

// 中间件
app.use(cors());
// 明确处理所有预检请求，避免部分浏览器偶发失败
app.options('*', cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../frontend')));

// 设置API响应的UTF-8编码（只对API路由生效）
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// 简易请求日志
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// 认证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '访问令牌缺失' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '无效的访问令牌' });
    }
    req.user = user;
    next();
  });
};

// 获取今日翻卡次数
async function getTodayDrawCount(userId) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    
    const { data, error } = await supabase
      .from('daily_draws')
      .select('draw_count, max_draws')
      .eq('user_id', userId)
      .eq('draw_date', today)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }

    if (data) {
      return { draw_count: data.draw_count, max_draws: data.max_draws };
    } else {
      // 如果今天还没有记录，创建一条
      const { error: insertError } = await supabase
        .from('daily_draws')
        .insert({
          user_id: userId,
          draw_date: today,
          draw_count: 0,
          max_draws: 3
        });

      if (insertError) {
        throw insertError;
      }

      return { draw_count: 0, max_draws: 3 };
    }
  } catch (error) {
    console.error('获取今日翻卡次数失败:', error);
    throw error;
  }
}

// 增加今日翻卡次数（带并发检查）
async function incrementTodayDrawCount(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // 使用 Supabase RPC 来实现原子性增加（如果配置了）
    // 或者先获取当前次数并验证
    const { data: currentData, error: fetchError } = await supabase
      .from('daily_draws')
      .select('draw_count, max_draws')
      .eq('user_id', userId)
      .eq('draw_date', today)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (currentData) {
      // 在更新前再次检查次数限制（防止竞态条件）
      if (currentData.draw_count >= currentData.max_draws) {
        throw new Error('DRAW_LIMIT_EXCEEDED');
      }
      
      // 更新现有记录
      const { error: updateError } = await supabase
        .from('daily_draws')
        .update({ 
          draw_count: currentData.draw_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('draw_date', today)
        // 添加条件：只有当draw_count仍然小于max_draws时才更新（乐观锁）
        .eq('draw_count', currentData.draw_count);

      if (updateError) {
        throw updateError;
      }
    } else {
      // 创建新记录
      const { error: insertError } = await supabase
        .from('daily_draws')
        .insert({
          user_id: userId,
          draw_date: today,
          draw_count: 1,
          max_draws: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        throw insertError;
      }
    }
  } catch (error) {
    console.error('增加翻卡次数失败:', error);
    throw error;
  }
}

// 路由

// 用户注册
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱和密码都是必填项' });
    }

    // 检查用户是否已存在
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},username.eq.${username}`)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      return res.status(500).json({ error: '数据库错误' });
    }
    
    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // 创建用户
    const { error: createError } = await supabase
      .from('users')
      .insert({
        id: userId,
        username,
        email,
        password: hashedPassword
      });

    if (createError) {
      return res.status(500).json({ error: '创建用户失败' });
    }

    // 创建用户进度记录
    await supabase
      .from('user_progress')
      .insert({ user_id: userId });

    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ 
      message: '注册成功', 
      token,
      user: { id: userId, username, email }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 用户登录
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log(`🔐 登录请求: ${email}`);

    if (!email || !password) {
      console.log('❌ 缺少邮箱或密码');
      return res.status(400).json({ error: '邮箱和密码都是必填项' });
    }

    // 规范化邮箱（小写，去除空格）
    const normalizedEmail = email.trim().toLowerCase();
    console.log(`📧 规范化邮箱: "${normalizedEmail}"`);

    // 查询用户（使用 ilike 进行不区分大小写匹配，或先查询所有再过滤）
    // Supabase PostgREST 不支持 ilike，所以先查询后过滤
    const { data: users, error: listError } = await supabase
      .from('users')
      .select('*');

    if (listError) {
      console.error('❌ 数据库查询错误:', listError);
      return res.status(500).json({ error: '数据库错误: ' + listError.message });
    }

    console.log(`📊 数据库中共有 ${users?.length || 0} 个用户`);
    
    // 查找匹配的用户（不区分大小写）
    const user = users?.find(u => u.email?.toLowerCase() === normalizedEmail);

    if (!user) {
      console.log('❌ 用户不存在:', normalizedEmail);
      console.log('📋 数据库中的邮箱列表:', users?.map(u => u.email) || []);
      return res.status(401).json({ error: '用户不存在' });
    }

    console.log('✅ 找到用户:', user.email, 'ID:', user.id, '密码哈希存在:', !!user.password);

    // 检查密码哈希是否存在
    if (!user.password) {
      console.log('❌ 用户密码哈希不存在');
      return res.status(401).json({ error: '用户不存在' });
    }

    // 验证密码
    let validPassword = false;
    try {
      validPassword = await bcrypt.compare(password, user.password);
      console.log('🔑 密码验证结果:', validPassword);
    } catch (bcryptError) {
      console.error('❌ 密码比较错误:', bcryptError);
      return res.status(500).json({ error: '密码验证失败' });
    }

    if (!validPassword) {
      console.log('❌ 密码错误');
      return res.status(401).json({ error: '用户不存在' });
    }
    
    console.log('✅ 登录成功');

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ 
      message: '登录成功', 
      token,
      user: { id: user.id, username: user.username, email: user.email, mbti_type: user.mbti_type }
    });
  } catch (error) {
    console.error('❌ 登录异常:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ error: '服务器错误: ' + error.message });
  }
});

// ============== 验证码登录相关 API ==============

// 工具函数：SHA256 哈希
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// 工具函数：生成6位验证码
function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 工具函数：创建 auth_otps 表（简化版，只提示用户手动创建）
async function createAuthOtpsTable() {
  console.log(`
🚨 需要手动创建数据库表！

请登录 Supabase Dashboard：
1. 访问 https://supabase.com/dashboard
2. 选择项目：klwfdawtiigivtiwinqr
3. 进入 SQL Editor
4. 执行以下 SQL：

CREATE TABLE IF NOT EXISTS auth_otps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT false,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otps_email_created_at ON auth_otps (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_otps_expires_at ON auth_otps (expires_at);

执行完成后重试获取验证码。
  `);
  
  // 抛出错误，提示用户手动创建
  throw new Error('请先在 Supabase 中创建 auth_otps 表');
}

// 工具函数：生成简洁的验证码邮件HTML
function generateOtpEmailHtml(code) {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 60px 20px; text-align: center; background-color: #ffffff;">
  
  <h1 style="color: #7b61ff; font-size: 28px; font-weight: 600; margin: 0 0 40px 0;">
    Echo Insight
  </h1>
  
  <p style="color: #333333; font-size: 16px; margin: 0 0 30px 0; line-height: 1.5;">
    您的登录验证码是：
  </p>
  
  <div style="font-size: 48px; color: #7b61ff; font-weight: bold; letter-spacing: 8px; margin: 0 0 40px 0; font-family: 'Courier New', Courier, monospace;">
    ${code}
  </div>
  
  <p style="color: #666666; font-size: 14px; margin: 0 0 20px 0;">
    验证码有效期为 10 分钟。
  </p>
  
  <p style="color: #999999; font-size: 12px; margin: 0;">
    若非本人操作，请忽略此邮件。
  </p>
  
</div>
  `.trim();
}

// ============== 使用 Supabase Auth OTP（完全免费，发送到任意邮箱） ==============

// 申请验证码（使用 Supabase Auth 自动生成并发送）
app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: '请输入邮箱' });
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });

    console.log(`📧 使用 Supabase Auth 发送验证码到: ${email}`);

    // 使用 Supabase Auth 发送 OTP
    // Supabase 会自动生成验证码并发送邮件
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: true
      }
    });

    if (error) {
      console.error('Supabase Auth 发送失败:', error);
      
      if (error.message && error.message.includes('rate limit')) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      }
      
      return res.status(500).json({ error: error.message || '发送失败，请稍后再试' });
    }

    console.log(`✅ Supabase Auth OTP 发送成功: ${email}`);
    console.log(`📧 验证码已通过 Supabase 发送到邮箱`);
    
    res.json({ message: '验证码已发送，请查收邮箱' });
    
  } catch (e) {
    console.error('request-otp error:', e);
    res.status(500).json({ error: '发送失败，请稍后再试' });
  }
});

// 注册并验证邮箱（新用户：邮箱+密码+验证码）
app.post('/api/auth/register-with-otp', async (req, res) => {
  try {
    const { email, password, code } = req.body || {};
    if (!email || !password || !code) {
      return res.status(400).json({ error: '请提供完整信息' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少需要6位' });
    }

    console.log(`📝 注册验证: ${email}`);

    // 验证邮箱验证码（使用 Supabase Auth）
    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      email: email,
      token: code,
      type: 'email'
    });

    if (authError) {
      console.error('验证码验证失败:', authError);
      
      if (authError.message && authError.message.includes('expired')) {
        return res.status(400).json({ error: '验证码已过期，请重新获取' });
      }
      if (authError.message && (authError.message.includes('invalid') || authError.message.includes('Token'))) {
        return res.status(400).json({ error: '验证码错误' });
      }
      
      return res.status(400).json({ error: authError.message || '验证失败' });
    }

    console.log('✅ 邮箱验证成功');

    // 检查用户是否已存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: '该邮箱已注册，请直接登录' });
    }

    // 创建新用户
    const username = email.split('@')[0];
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({ 
        email, 
        username,
        password: hashedPassword
      })
      .select('*')
      .single();
      
    if (createError) {
      console.error('创建用户失败:', createError);
      return res.status(500).json({ error: '注册失败' });
    }

    console.log('✅ 新用户创建成功:', newUser.email);

    // 生成 JWT token
    const token = jwt.sign(
      { userId: newUser.id, username: newUser.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: '注册成功',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        mbti_type: newUser.mbti_type
      }
    });
  } catch (e) {
    console.error('register-with-otp error:', e);
    res.status(500).json({ error: '注册失败，请稍后再试' });
  }
});

// 重置密码（验证码验证）
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: '请提供完整信息' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '密码至少需要6位' });
    }

    console.log(`🔑 重置密码: ${email}`);

    // 验证邮箱验证码
    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      email: email,
      token: code,
      type: 'email'
    });

    if (authError) {
      console.error('验证码验证失败:', authError);
      
      if (authError.message && authError.message.includes('expired')) {
        return res.status(400).json({ error: '验证码已过期，请重新获取' });
      }
      if (authError.message && (authError.message.includes('invalid') || authError.message.includes('Token'))) {
        return res.status(400).json({ error: '验证码错误' });
      }
      
      return res.status(400).json({ error: authError.message || '验证失败' });
    }

    console.log('✅ 验证码验证成功');

    // 查找用户
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        password: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
      
    if (updateError) {
      console.error('更新密码失败:', updateError);
      return res.status(500).json({ error: '重置失败' });
    }

    console.log('✅ 密码重置成功:', email);

    res.json({ message: '密码重置成功' });
  } catch (e) {
    console.error('reset-password error:', e);
    res.status(500).json({ error: '重置失败，请稍后再试' });
  }
});

// 验证并登录（使用 Supabase Auth 验证）
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ error: '请输入邮箱和验证码' });
    }

    console.log(`🔐 使用 Supabase Auth 验证: ${email}`);

    // 使用 Supabase Auth 验证 OTP
    const { data: authData, error: authError } = await supabase.auth.verifyOtp({
      email: email,
      token: code,
      type: 'email'
    });

    if (authError) {
      console.error('Supabase Auth 验证失败:', authError);
      
      if (authError.message && authError.message.includes('expired')) {
        return res.status(400).json({ error: '验证码已过期，请重新获取' });
      }
      if (authError.message && (authError.message.includes('invalid') || authError.message.includes('Token'))) {
        return res.status(400).json({ error: '验证码错误' });
      }
      
      return res.status(400).json({ error: authError.message || '验证失败' });
    }

    console.log('✅ Supabase Auth 验证成功');

    // Supabase Auth 用户已创建在 auth.users 中
    const supabaseUser = authData.user;
    if (!supabaseUser) {
      return res.status(500).json({ error: '登录失败' });
    }

    // 在我们的 users 表中查找或创建用户
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (userErr && userErr.code !== 'PGRST116') {
      console.error('查询用户失败:', userErr);
      return res.status(500).json({ error: '服务器错误' });
    }

    let user = userRow;
    if (!user) {
      // 自动注册新用户（同步 auth.users 到 public.users）
      const username = email.split('@')[0];
      
      const { data: created, error: insUserErr } = await supabase
        .from('users')
        .insert({ 
          email, 
          username,
          password: '' // 验证码登录无需密码
        })
        .select('*')
        .single();
        
      if (insUserErr) {
        console.error('创建用户失败:', insUserErr);
        console.error('错误详情:', JSON.stringify(insUserErr, null, 2));
        return res.status(500).json({ error: '注册失败' });
      }
      user = created;
      console.log('✅ 新用户注册成功:', user.email);
    } else {
      console.log('✅ 用户已存在，直接登录:', user.email);
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name || user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        mbti_type: user.mbti_type
      }
    });
  } catch (e) {
    console.error('verify-otp error:', e);
    res.status(500).json({ error: '验证失败，请稍后再试' });
  }
});

// 更新用户资料（昵称/头像）
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { display_name, avatar_url } = req.body || {};
    
    if (!display_name && !avatar_url) {
      return res.status(400).json({ error: '请提供要更新的信息' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (display_name) updates.display_name = display_name;
    if (avatar_url) updates.avatar_url = avatar_url;

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.userId);
      
    if (error) {
      console.error('更新用户资料失败:', error);
      return res.status(500).json({ error: '更新失败' });
    }

    res.json({ message: '更新成功', updates });
  } catch (e) {
    console.error('update profile error:', e);
    res.status(500).json({ error: '更新失败' });
  }
});

// ============== 以下是原有API ==============

// 获取MBTI类型列表
app.get('/api/mbti-types', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mbti_types')
      .select('*')
      .order('type_code');

    if (error) {
      return res.status(500).json({ error: '获取MBTI类型失败' });
    }
    res.json(data);
  } catch (error) {
    console.error('获取MBTI类型错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 更新用户MBTI类型
app.put('/api/user/mbti', authenticateToken, async (req, res) => {
  try {
    const { mbti_type } = req.body;
    const userId = req.user.userId;

    const { error } = await supabase
      .from('users')
      .update({ 
        mbti_type,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      return res.status(500).json({ error: '更新MBTI类型失败' });
    }
    res.json({ message: 'MBTI类型更新成功', mbti_type });
  } catch (error) {
    console.error('更新MBTI类型错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 记录用户心情
app.post('/api/mood', authenticateToken, async (req, res) => {
  try {
    const { overall_mood, energy_level, concerns } = req.body;
    const userId = req.user.userId;

    const { data, error } = await supabase
      .from('mood_records')
      .insert({
        user_id: userId,
        overall_mood,
        energy_level,
        concerns: JSON.stringify(concerns)
      })
      .select('id')
      .single();

    if (error) {
      return res.status(500).json({ error: '记录心情失败' });
    }
    res.json({ message: '心情记录成功', id: data.id });
  } catch (error) {
    console.error('记录心情错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 抽取卡牌
app.post('/api/cards/draw', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { mood_tags } = req.body;

    // 检查今日翻卡次数
    const drawStats = await getTodayDrawCount(userId);
    
    if (drawStats.draw_count >= drawStats.max_draws) {
      return res.status(429).json({ 
        error: '今日翻卡次数已用完',
        draw_count: drawStats.draw_count,
        max_draws: drawStats.max_draws,
        remaining: 0,
        reset_info: '明日00:00重置'
      });
    }

    let query = supabase
      .from('cards')
      .select('*')
      .in('category', ['情绪类', '成长类', '关系类', '自我力量类']);

    if (mood_tags && mood_tags.length > 0) {
      query = query.or(`mood_tags.is.null,mood_tags.like.%${mood_tags[0]}%`);
    }

    const { data: cards, error: cardError } = await query;

    if (cardError) {
      return res.status(500).json({ error: '抽取卡牌失败' });
    }

    if (!cards || cards.length === 0) {
      return res.status(404).json({ error: '没有找到合适的卡牌' });
    }

    // 随机选择一张卡牌
    const card = cards[Math.floor(Math.random() * cards.length)];

    // 记录抽卡
    const { error: drawError } = await supabase
      .from('card_draws')
      .insert({
        user_id: userId,
        card_id: card.id
      });

    if (drawError) {
      return res.status(500).json({ error: '记录抽卡失败' });
    }

    // 增加今日翻卡次数（内部已有并发控制）
    try {
      await incrementTodayDrawCount(userId);
    } catch (incrementErr) {
      // 如果是次数限制错误，返回特定错误
      if (incrementErr.message === 'DRAW_LIMIT_EXCEEDED') {
        return res.status(429).json({ 
          error: '今日翻卡次数已用完',
          draw_count: drawStats.max_draws,
          max_draws: drawStats.max_draws,
          remaining: 0,
          reset_info: '明日00:00重置'
        });
      }
      // 其他错误继续抛出
      throw incrementErr;
    }
    
    // 更新连续天数和经验值
    updateConsecutiveDays(userId);
    addExperience(userId, 10, '抽卡');
    
    // 获取更新后的次数信息
    const updatedStats = await getTodayDrawCount(userId);
    
    res.json({
      ...card,
      daily_draw_info: {
        draw_count: updatedStats.draw_count,
        max_draws: updatedStats.max_draws,
        remaining: updatedStats.max_draws - updatedStats.draw_count
      }
    });
  } catch (error) {
    console.error('抽取卡牌错误:', error);
    res.status(500).json({ error: '抽取卡牌失败' });
  }
});

// 提交卡牌回答
app.post('/api/cards/:cardId/response', authenticateToken, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { response } = req.body;
    const userId = req.user.userId;

    const respLen = (response || '').trim().length;
    console.log(`[API] 保存回答: userId=${userId}, cardId=${cardId}, responseLength=${respLen}, response="${response}"`);
    
    // 先检查是否存在记录（仅取最新的一条抽卡记录）
    const { data: record, error: checkError } = await supabase
      .from('card_draws')
      .select('id')
      .eq('user_id', userId)
      .eq('card_id', cardId)
      .order('drawn_at', { ascending: false })
      .limit(1)
      .single();

    if (checkError) {
      console.error('[API] 检查记录失败:', checkError);
      return res.status(500).json({ error: '检查记录失败' });
    }
    
    if (!record) {
      console.warn(`[API] 没有找到抽卡记录: userId=${userId}, cardId=${cardId}`);
      return res.status(404).json({ error: '没有找到对应的抽卡记录，请先抽卡' });
    }
    
    console.log(`[API] 找到记录: id=${record.id}`);
    
    const { error: updateError } = await supabase
      .from('card_draws')
      .update({
        user_response: response,
        response_length: respLen
      })
      .eq('id', record.id);

    if (updateError) {
      console.error('[API] 保存回答失败:', updateError);
      return res.status(500).json({ error: '保存回答失败' });
    }
    
    console.log(`[API] 回答保存成功: userId=${userId}, cardId=${cardId}`);
    // 更新连续天数
    updateConsecutiveDays(userId);
    // 根据回答长度给予经验值
    let xpReward = 0;
    if (respLen > 0) {
      xpReward = Math.min(50, Math.floor(respLen / 10) + 10); // 基础10XP + 每10字符1XP，最多50XP
    }
    if (xpReward > 0) {
      addExperience(userId, xpReward, '记录回答');
    }
    res.json({ message: '回答保存成功', response_length: respLen, xp_gained: xpReward });
  } catch (error) {
    console.error('保存回答错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 计算等级所需经验值
function getRequiredXP(level) {
  return Math.floor(100 * Math.pow(1.2, level - 1));
}

// 计算等级
function calculateLevel(totalXP) {
  let level = 1;
  let requiredXP = 0;
  
  while (requiredXP <= totalXP) {
    level++;
    requiredXP += getRequiredXP(level);
  }
  
  return level - 1;
}

// 添加经验值
async function addExperience(userId, xpAmount, reason = '') {
  try {
    const { data: progress, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    const currentXP = progress ? progress.experience_points : 0;
    const currentLevel = progress ? progress.level : 1;
    const newXP = currentXP + xpAmount;
    const newLevel = calculateLevel(newXP);
    
    if (!progress || error?.code === 'PGRST116') {
      // 创建新的进度记录
      await supabase
        .from('user_progress')
        .insert({
          user_id: userId,
          level: newLevel,
          experience_points: newXP,
          consecutive_days: 1,
          last_activity_date: new Date().toISOString().split('T')[0]
        });
    } else {
      // 更新经验值和等级
      await supabase
        .from('user_progress')
        .update({
          experience_points: newXP,
          level: newLevel
        })
        .eq('user_id', userId);
    }
    
    // 记录经验值获得事件
    await supabase
      .from('events')
      .insert({
        user_id: userId,
        type: 'xp_gained',
        payload: JSON.stringify({ amount: xpAmount, reason, newXP, newLevel })
      });
  } catch (error) {
    console.error('添加经验值错误:', error);
  }
}

// 更新用户连续天数
async function updateConsecutiveDays(userId) {
  try {
    // 使用本地时间，避免时区问题
    const now = new Date();
    const today = now.getFullYear() + '-' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                  String(now.getDate()).padStart(2, '0');
    
    const { data: progress, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('获取用户进度错误:', error);
      return;
    }
    
    if (!progress) {
      // 创建新的进度记录
      await supabase
        .from('user_progress')
        .insert({
          user_id: userId,
          level: 1,
          experience_points: 0,
          consecutive_days: 1,
          last_activity_date: today
        });
    } else {
      const lastDate = progress.last_activity_date;
      let newConsecutiveDays = 1;
      
      if (lastDate) {
        const lastActivityDate = new Date(lastDate + 'T00:00:00');
        const todayDate = new Date(today + 'T00:00:00');
        const diffTime = todayDate - lastActivityDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          // 连续天数
          newConsecutiveDays = progress.consecutive_days + 1;
        } else if (diffDays > 1) {
          // 中断了，重新开始
          newConsecutiveDays = 1;
        } else if (diffDays === 0) {
          // 同一天，不更新
          return;
        }
      }
      
      // 更新连续天数和最后活动日期
      await supabase
        .from('user_progress')
        .update({
          consecutive_days: newConsecutiveDays,
          last_activity_date: today
        })
        .eq('user_id', userId);
    }
  } catch (error) {
    console.error('更新连续天数错误:', error);
  }
}

// 获取用户进度
app.get('/api/user/progress', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const { data: progress, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: '获取进度失败' });
    }
    res.json(progress || { level: 1, experience_points: 0, consecutive_days: 0, starter_passed: 0, starter_score: 0 });
  } catch (error) {
    console.error('获取用户进度错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取今日翻卡次数信息
app.get('/api/user/daily-draws', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const drawStats = await getTodayDrawCount(userId);
    res.json({
      draw_count: drawStats.draw_count,
      max_draws: drawStats.max_draws,
      remaining: drawStats.max_draws - drawStats.draw_count,
      can_draw: drawStats.draw_count < drawStats.max_draws
    });
  } catch (error) {
    console.error('获取翻卡次数失败:', error);
    res.status(500).json({ error: '获取翻卡次数失败' });
  }
});

// 获取用户历史记录
app.get('/api/user/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { card_type } = req.query; // 支持按分类筛选

    let query = supabase
      .from('card_draws')
      .select(`
        *,
        cards!inner(title, content, category)
      `)
      .eq('user_id', userId);

    if (card_type && card_type !== '全部') {
      query = query.eq('cards.category', card_type);
    }

    const { data, error } = await query
      .order('drawn_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: '获取历史记录失败' });
    }

    // 处理数据格式，去重（保留最新的记录）
    const uniqueRecords = [];
    const seenCards = new Set();
    
    for (const record of data) {
      if (!seenCards.has(record.card_id)) {
        seenCards.add(record.card_id);
        uniqueRecords.push({
          ...record,
          title: record.cards.title,
          content: record.cards.content,
          category: record.cards.category
        });
      }
    }

    res.json(uniqueRecords);
  } catch (error) {
    console.error('获取历史记录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除用户历史记录
app.delete('/api/user/history/:drawId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const drawId = parseInt(req.params.drawId); // 确保转换为整数
    
    console.log(`[API] 删除请求: userId=${userId}, drawId=${drawId} (类型: ${typeof drawId})`);
    
    // 先查询记录是否存在
    const { data: record, error: checkError } = await supabase
      .from('card_draws')
      .select('id, user_id')
      .eq('id', drawId)
      .single();

    if (checkError) {
      console.error('[API] 查询记录失败:', checkError);
      return res.status(500).json({ error: '查询记录失败' });
    }
    
    console.log(`[API] 查询结果:`, record);
    
    if (!record) {
      console.log(`[API] 记录不存在: drawId=${drawId}`);
      return res.status(404).json({ error: '记录不存在' });
    }
    
    if (record.user_id !== userId) {
      console.log(`[API] 用户ID不匹配: 记录属于=${record.user_id}, 请求用户=${userId}`);
      return res.status(403).json({ error: '无权限删除此记录' });
    }
    
    // 执行删除
    const { error: deleteError } = await supabase
      .from('card_draws')
      .delete()
      .eq('id', drawId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[API] 删除历史记录错误:', deleteError);
      return res.status(500).json({ error: '删除失败' });
    }
    
    console.log(`[API] 删除成功: drawId=${drawId}`);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除历史记录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户信息（用于验证token）
app.get('/api/user/info', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, mbti_type')
      .eq('id', userId)
      .single();

    if (error) {
      return res.status(500).json({ error: '获取用户信息失败' });
    }
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      mbti_type: user.mbti_type
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 事件埋点
app.post('/api/events', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type, payload } = req.body || {};
    if (!type) return res.status(400).json({ error: '缺少事件类型' });
    
    const { data, error } = await supabase
      .from('events')
      .insert({
        user_id: userId,
        type,
        payload: JSON.stringify(payload || {})
      })
      .select('id')
      .single();

    if (error) {
      return res.status(500).json({ error: '记录事件失败' });
    }
    res.json({ id: data.id });
  } catch (error) {
    console.error('记录事件错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 聚合用户上下文（Supabase版）
async function aggregateUserContext(userId) {
  try {
    const context = {
      user_profile: { mbti: 'UNKNOWN', streak_days: 0 },
      recent_mood: { days: 7, trend: 'neutral', top: [] },
      recent_threads: [],
      user_phrases: [],
      time_of_day: 'day',
      weekday: true
    };

    // 获取用户基本信息
    const { data: user } = await supabase
      .from('users')
      .select('mbti_type')
      .eq('id', userId)
      .single();

    if (user) {
      context.user_profile.mbti = user.mbti_type || 'UNKNOWN';
    }

    // 获取用户进度
    const { data: progress } = await supabase
      .from('user_progress')
      .select('consecutive_days')
      .eq('user_id', userId)
      .single();

    if (progress) {
      context.user_profile.streak_days = progress.consecutive_days || 0;
    }

    // 时间信息
    const now = new Date();
    const hour = now.getHours();
    context.time_of_day = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    context.weekday = now.getDay() >= 1 && now.getDay() <= 5;

    // 获取近7天心情记录
    const { data: moods } = await supabase
      .from('mood_records')
      .select('overall_mood, energy_level, recorded_at')
      .eq('user_id', userId)
      .gte('recorded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('recorded_at', { ascending: false })
      .limit(10);

    if (moods && moods.length > 0) {
      const moodCounts = {};
      moods.forEach(m => {
        moodCounts[m.overall_mood] = (moodCounts[m.overall_mood] || 0) + 1;
      });
      context.recent_mood.top = Object.keys(moodCounts)
        .sort((a, b) => moodCounts[b] - moodCounts[a])
        .slice(0, 2);
    }

    // 获取近14天抽卡记录
    const { data: draws } = await supabase
      .from('card_draws')
      .select(`
        drawn_at,
        user_response,
        response_length,
        cards!inner(title, category)
      `)
      .eq('user_id', userId)
      .gte('drawn_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('drawn_at', { ascending: false })
      .limit(10);

    if (draws && draws.length > 0) {
      const topicCounts = {};
      const recentPhrases = [];

      draws.forEach(draw => {
        const category = draw.cards?.category;
        if (category) {
          topicCounts[category] = (topicCounts[category] || 0) + 1;
        }

        if (draw.user_response && draw.user_response.length > 5) {
          let phrase = draw.user_response.substring(0, 20).trim();
          // 隐私保护
          phrase = phrase.replace(/\d{11}|\d{3}-\d{4}-\d{4}|\d{4}-\d{2}-\d{2}/g, '[日期]');
          phrase = phrase.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[邮箱]');
          if (phrase.length >= 5) {
            recentPhrases.push(`"${phrase}"`);
          }
        }
      });

      Object.keys(topicCounts).forEach(topic => {
        const recentDraw = draws.find(d => d.cards?.category === topic);
        if (recentDraw) {
          const daysDiff = Math.floor((Date.now() - new Date(recentDraw.drawn_at).getTime()) / (1000 * 60 * 60 * 24));
          const hasAction = recentDraw.response_length > 20;

          let evidence = "无回答";
          if (recentDraw.user_response) {
            evidence = recentDraw.user_response.substring(0, 30);
            evidence = evidence.replace(/\d{11}|\d{3}-\d{4}-\d{4}|\d{4}-\d{2}-\d{2}/g, '[日期]');
          }

          context.recent_threads.push({
            topic: topic,
            last_action: hasAction ? "已完成" : "未完成",
            evidence: evidence,
            last_seen: `${daysDiff}天前`
          });
        }
      });

      context.user_phrases = recentPhrases.slice(0, 3);
    }

    return context;
  } catch (error) {
    console.error('聚合用户上下文失败:', error);
    return {
      user_profile: { mbti: 'UNKNOWN', streak_days: 0 },
      recent_mood: { days: 7, trend: 'neutral', top: [] },
      recent_threads: [],
      user_phrases: [],
      time_of_day: 'day',
      weekday: true
    };
  }
}

// 生成卡牌背面内容
app.post('/api/cards/:cardId/generate-back', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { cardId } = req.params;
    const { mood, historyBrief } = req.body || {};
    
    // 聚合用户上下文
    const userContext = await aggregateUserContext(userId);
    
    // 获取卡牌信息
    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('title, content, mood_tags')
      .eq('id', cardId)
      .single();

    if (cardError || !card) {
      return res.status(404).json({ error: '卡牌不存在' });
    }

    // 获取用户MBTI信息
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('mbti_type')
      .eq('id', userId)
      .single();

    const mbti = user?.mbti_type || 'UNKNOWN';
    const title = card.title;
    
    // 根据MBTI类型生成个性化的引导问题
    const getDefaultQuestions = (mbtiType, cardTitle) => {
      const questionMap = {
        'INTJ': [
          `关于「${cardTitle}」，你觉得最需要深入分析的是哪个方面？`,
          `如果把「${cardTitle}」纳入你的长期规划，会产生什么影响？`
        ],
        'INTP': [
          `「${cardTitle}」背后的逻辑让你产生了什么新的想法？`,
          `你能从几个不同角度来解构「${cardTitle}」这个主题吗？`
        ],
        'ENTJ': [
          `针对「${cardTitle}」，你会制定什么样的行动计划？`,
          `「${cardTitle}」如何帮助你实现更大的目标？`
        ],
        'ENTP': [
          `「${cardTitle}」让你想到了哪些有趣的可能性？`,
          `如果用全新的方式看待「${cardTitle}」，会有什么发现？`
        ],
        'INFJ': [
          `「${cardTitle}」与你的价值观有什么深层联系？`,
          `这个主题想要传递给你怎样的意义？`
        ],
        'INFP': [
          `「${cardTitle}」唤起了你内心什么样的感受？`,
          `如果用诗或画来表达「${cardTitle}」，会是什么样子？`
        ],
        'ENFJ': [
          `「${cardTitle}」如何帮助你更好地关心身边的人？`,
          `这个主题能为你的人际关系带来什么启发？`
        ],
        'ENFP': [
          `「${cardTitle}」激发了你哪些充满热情的想法？`,
          `你想和谁分享关于「${cardTitle}」的感受？`
        ],
        'ISTJ': [
          `面对「${cardTitle}」，你会采取哪些实际步骤？`,
          `过去的经验如何帮助你更好理解「${cardTitle}」？`
        ],
        'ISFJ': [
          `「${cardTitle}」如何影响你关心的人？`,
          `你可以做什么让「${cardTitle}」在生活中更具体地体现？`
        ],
        'ESTJ': [
          `关于「${cardTitle}」，你会设定什么具体目标？`,
          `如何将「${cardTitle}」转化为可衡量的成果？`
        ],
        'ESFJ': [
          `「${cardTitle}」让你想为身边的人做些什么？`,
          `这个主题如何增进你与他人的连接？`
        ],
        'ISTP': [
          `针对「${cardTitle}」，有什么是你可以动手尝试的？`,
          `如何用实践来验证「${cardTitle}」的意义？`
        ],
        'ISFP': [
          `「${cardTitle}」给你带来了什么独特的感受？`,
          `你会用什么方式来表达对「${cardTitle}」的体验？`
        ],
        'ESTP': [
          `「${cardTitle}」让你想立即尝试什么？`,
          `如何把「${cardTitle}」变成一次有趣的体验？`
        ],
        'ESFP': [
          `「${cardTitle}」让你想和朋友分享什么？`,
          `如何让「${cardTitle}」成为今天的亮点？`
        ]
      };

      // 如果有对应的MBTI问题，使用它；否则使用通用问题
      if (questionMap[mbtiType]) {
        return questionMap[mbtiType];
      }

      // 通用问题
      return [
        `这张卡牌想告诉你什么？此刻最触动你的点是什么？`,
        `如果把这张卡当作一个小提醒，你今天愿意观察或尝试什么？`
      ];
    };

    // Qwen3 AI 生成逻辑
    const buildSystemPrompt = () => `你是一个温柔而富有洞察力的人生教练和心灵卡牌解读师。
你的目标不是预测未来，而是通过卡牌象征，帮助用户觉察当下的状态、理解内心的力量，并通过开放式提问和小行动建议，促进他们的自我探索与成长。

### 风格要求
- 语气：温和、包容、积极，避免评判和绝对化语言。
- 边界：你不是心理医生，不进行诊断或治疗；你是陪伴者与引导者。
- 原则：
  1. 卡牌象征与解读保持通用，不对用户下定论。
  2. 提问和行动建议结合用户的 MBTI 特质，进行温和的个性化引导。
  3. 提问必须是开放式、具体的，能帮助用户从不同角度思考。
  4. 行动建议必须小而可行，让用户能在生活中尝试。
  5. 始终强调"用户才是自己答案的拥有者"。

### 输出结构要求
1. **卡牌主题与象征（通用）**
   - 简洁的关键词（2-4个），用emoji点缀
   - 象征意义（1句话）

2. **轻度解读（通用）**
   - 2-3句话，从象征角度温和描述可能的内心状态
   - 保持模糊空间，让用户能自己投射

3. **个性化引导提问（基于用户MBTI）**
   - 至多 2 个问题
   - 风格需贴合用户 MBTI 特质
   - 例如：对 INFJ 更聚焦内心表达，对 ENTP 更聚焦外部行动

4. **个性化小行动建议（基于用户MBTI）**
   - 必须给出恰好2个建议，标注为A.和B.
   - A. 微行动：≤3分钟、可立即执行的具体行动
   - B. 长期计划+陪伴：1-3周的时间框架，结合用户历史数据的陪伴式建议

### 严格输出格式
必须按照以下格式输出，不要给多余解释：

**引导提问**
- [问题1]
- [问题2]

**行动建议**
A. [具体微行动：≤3分钟，包含场景/对象/时长，零成本可做]
B. [长期计划+陪伴：1-3周时间框架，结合用户历史数据的陪伴式建议]

### 关键要求
1. 行动建议必须恰好2条，格式为"A."和"B."开头
2. A类微行动要求：
   - 时长≤3分钟，零成本或成本≤10元
   - 必须包含：具体场景（阳台/厨房/桌面）+ 具体对象（落叶/小物件/纸笔）+ 具体动作（拼/摆/写）
   - 禁止模糊词："做一件...相关的小事/观察/尝试/探索"
3. B类长期计划+陪伴要求：
   - 时间框架：1-3周，让模型自选具体时长
   - 结合用户历史数据，提供个性化陪伴
   - 内容简洁但完整，避免"提示"类表述
   - 包含鼓励和支持性语言
4. 根据MBTI特质定制风格：
   - INTJ/INFJ: A类偏向独处制作，B类偏向深度分析
   - ENFP/ESFP: A类偏向表达分享，B类偏向情感探索
   - ISTJ/ISFJ: A类偏向实用整理，B类偏向经验回顾
5. 提问要自然、直接，不要提及技术性描述
6. 让内容感觉像智慧朋友的建议，不是系统分析

### 个性化连续性要求
1. 优先延续用户近期主题线索（recent_threads），帮助形成"连续性"体验
2. 若某线索已完成，引导到"下一小步"；若未完成，提供"推进"建议
3. 可轻度引用用户短语（≤8字），更推荐"意译"，不复述长段隐私
4. 问题与行动需围绕recent_threads中的topic之一；若多个，选择"最近且未完成"优先
5. 让用户"看到自己的进展"：在措辞中点明"延续/巩固/下一步"，但不评价
6. 若无历史数据(threads=0)，仍按卡牌主题通用生成

### A/B格式示例（创造力主题）
A. 在阳台用三片落叶拼出一个字母，拍照并起名"今天的色彩"（3分钟）。
B. 用三个词描述你现在的"创造力气味"，然后把其中一词改成动词。

### 严格避免的表述
- "做一件与XX相关的小事"
- "观察他们的反应"
- "花时间思考并记录"
- "尝试/探索/体验XX"

请严格遵循这个结构输出，不要给多余解释。`;

    const buildUserPrompt = (userContext, card, mbti, mood) => {
      // 生成历史摘要
      let historyBrief = '';
      if (userContext.recent_threads && userContext.recent_threads.length > 0) {
        historyBrief = userContext.recent_threads.map(t => 
          `${t.topic}(${t.last_seen}前,${t.last_action}):${t.evidence}`
        ).join('；');
      }
      
      const kw = (card.mood_tags || '').split(',').map(s=>s.trim()).filter(Boolean).slice(0,3).join(' · ');
      const title = card.title;
      const meaning = card.content;
      
      // 构建完整的用户prompt
      const basicInfo = `卡牌：${title}\n关键词：${kw}\n象征解读：${meaning}`;
      const userInfo = `用户信息：MBTI=${mbti}；连续天数=${userContext.user_profile?.streak_days || 0}；情绪=${mood||''}`;
      const contextInfo = userContext.recent_threads.length > 0 ? 
        `\n\n个性化上下文：\n${JSON.stringify(userContext, null, 2)}` : '';
      
      return `${basicInfo}\n${userInfo}${contextInfo}`;
    };

    // 解析Qwen按照prompt微调格式返回的结构化内容
    const parseQwenResponse = (text) => {
      console.log('[Qwen] 原始响应内容:', text);
      
      const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const questions = [];
      const actions = [];
      let inQuestions = false;
      let inActions = false;
      
      for (const line of lines) {
        console.log('[Qwen] 解析行:', line);
        
        // 检测问题部分 - 更精确的匹配
        if (line.includes('引导提问') || line.includes('**引导提问**') || line.match(/^\*\*?引导提问\*\*?/)) {
          inQuestions = true;
          inActions = false;
          console.log('[Qwen] 进入引导提问部分');
          continue;
        }
        
        // 检测行动部分 - 更精确的匹配
        if (line.includes('行动建议') || line.includes('**行动建议**') || line.match(/^\*\*?行动建议\*\*?/)) {
          inQuestions = false;
          inActions = true;
          console.log('[Qwen] 进入行动建议部分');
          continue;
        }
        
        // 检测其他标题，停止当前部分
        if (line.includes('**') && (line.includes('解读') || line.includes('主题') || line.includes('卡牌'))) {
          inQuestions = false;
          inActions = false;
          continue;
        }
        
        // 收集问题（以-开头的行）
        if (inQuestions && line.startsWith('-')) {
          const cleanLine = line.replace(/^-\s*/, '').trim();
          if (cleanLine && !/(基于.*关键词|在你的.*MBTI|MBTI.*视角|基于.*与关键词|做一个.*分钟)/.test(cleanLine)) {
            questions.push(cleanLine);
            console.log('[Qwen] 收集到问题:', cleanLine);
            if (questions.length >= 2) {
              inQuestions = false; // 停止收集问题
            }
          }
        }
        
        // 收集行动 - 优先识别A./B.格式
        if (inActions) {
          // 识别 A./B. 开头的行
          const abMatch = line.match(/^([AB])\.\s*(.+)/);
          if (abMatch) {
            const label = abMatch[1];
            const content = abMatch[2].trim();
            if (content && !/(基于.*关键词|在你的.*MBTI|做一个.*分钟.*最小行动|做一件.*相关的小事)/.test(content)) {
              actions.push(`${label}. ${content}`);
              console.log(`[Qwen] 收集到${label}类行动:`, content);
              if (actions.length >= 2) {
                inActions = false;
              }
            }
          }
          // 兼容原 "-" 格式，自动标注A/B
          else if (line.startsWith('-')) {
            const cleanLine = line.replace(/^-\s*/, '').trim();
            if (cleanLine && !/(基于.*关键词|在你的.*MBTI|做一个.*分钟.*最小行动|做一件.*相关的小事)/.test(cleanLine)) {
              const label = actions.length === 0 ? 'A' : (actions.length === 1 ? 'B' : '');
              if (label) {
                actions.push(`${label}. ${cleanLine}`);
                console.log(`[Qwen] 收集到${label}类行动(兼容):`, cleanLine);
                if (actions.length >= 2) {
                  inActions = false;
                }
              }
            }
          }
        }
      }
      
      console.log(`[Qwen] 解析结果: ${questions.length}个问题, ${actions.length}个行动`);
      return { questions, actions };
    };

    // 确保A/B格式的行动建议
    const ensureABFormat = (actions, mbtiType, cardTitle) => {
      const result = [];
      const labels = ['A', 'B'];
      
      for (let i = 0; i < 2; i++) {
        const label = labels[i];
        if (actions[i]) {
          // 确保格式正确
          const content = actions[i].replace(/^[AB]\.\s*/, '').trim();
          result.push(`${label}. ${content}`);
        } else {
          // 生成默认行动建议
          const defaultActions = {
            'A': `在桌面摆放3个小物件代表「${cardTitle}」，拍照记录（2分钟）。`,
            'B': `用一句话描述「${cardTitle}」此刻给你的感受。`
          };
          result.push(`${label}. ${defaultActions[label]}`);
        }
      }
      
      return result;
    };

    // 根据MBTI和用户上下文生成个性化的行动建议（备用模板）
    const getDefaultActions = (mbtiType, cardTitle, context) => {
      // 获取时段和场景信息
      const timeOfDay = context.time_of_day || 'day';
      const timeText = timeOfDay === 'morning' ? '早上' : timeOfDay === 'afternoon' ? '下午' : '晚上';
      const recentThreads = context.recent_threads || [];
      const hasHistory = recentThreads.length > 0;
      
      // A: 当下微行动（1-3分钟，具体可执行）
      const aActionMap = {
        'INTJ': `A. 在纸上写下关于「${cardTitle}」的3个关键词，然后圈出最重要的一个（2分钟）。`,
        'INTP': `A. 随手画一个简单的图示，表达「${cardTitle}」的内在逻辑（2分钟）。`,
        'ENTJ': `A. 打开手机备忘录，快速列出与「${cardTitle}」相关的2-3个可行动项（2分钟）。`,
        'ENTP': `A. 在你周围找3样东西，给它们起个与「${cardTitle}」相关的名字（2分钟）。`,
        'INFJ': `A. 闭眼30秒，感受「${cardTitle}」在你心里的位置，然后写下一句话（2分钟）。`,
        'INFP': `A. 用手边任意颜色的笔，在纸上画出「${cardTitle}」给你的感觉（2分钟）。`,
        'ENFJ': `A. 给一个你关心的人发一条简短消息，分享「${cardTitle}」带给你的感受（2分钟）。`,
        'ENFP': `A. 录一段30秒的语音，说说「${cardTitle}」让你想到了什么（1分钟）。`,
        'ISTJ': `A. 在笔记本上列一个与「${cardTitle}」相关的小清单，写3项就好（2分钟）。`,
        'ISFJ': `A. 整理桌面或周围的小物件，把它们按「重要-不重要」排列（3分钟）。`,
        'ESTJ': `A. 打开日历，标记一个与「${cardTitle}」相关的时间点或提醒（2分钟）。`,
        'ESFJ': `A. 想想谁可能需要「${cardTitle}」，给TA发条消息或打个招呼（2分钟）。`,
        'ISTP': `A. 找一个小物件（钥匙、笔、杯子），用它摆出一个造型拍照（2分钟）。`,
        'ISFP': `A. 用手机拍一张能代表「${cardTitle}」的照片，任何角度都可以（2分钟）。`,
        'ESTP': `A. 立刻做一个与「${cardTitle}」相关的小动作：伸展、走动、整理（2分钟）。`,
        'ESFP': `A. 拍一张自拍或周围环境的照片，配上「${cardTitle}」的标题（1分钟）。`
      };

      // B: 长期计划+陪伴（1-3周，结合历史数据）
      const bActionMap = {
        'INTJ': hasHistory 
          ? `B. 未来2周，每周花15分钟梳理一次「${cardTitle}」的进展和调整方向。你的分析能力会帮你看清路径，慢慢来就好。`
          : `B. 未来2周，每周2次、每次10分钟，思考「${cardTitle}」与你长期目标的联系。一步步来，你会找到答案。`,
        'INTP': hasHistory
          ? `B. 未来2周，每周记录3个与「${cardTitle}」相关的新想法或疑问。好奇心会带你走得更远，不用急。`
          : `B. 未来2周，每周花10分钟从不同角度分析「${cardTitle}」。你的思考是宝贵的，给自己时间。`,
        'ENTJ': hasHistory
          ? `B. 未来3周，每周设定一个与「${cardTitle}」相关的小目标并执行。你的执行力很强，记得也给自己留点空间。`
          : `B. 未来2周，每周制定1-2个与「${cardTitle}」相关的行动步骤。一周一小步就够了，你做得很好。`,
        'ENTP': hasHistory
          ? `B. 未来2周，每周尝试一种新的方式来探索「${cardTitle}」。你的创意值得被实践，慢慢尝试就好。`
          : `B. 未来2周，每周记录2-3个关于「${cardTitle}」的有趣想法。不用都做到，记录本身就很有价值。`,
        'INFJ': hasHistory
          ? `B. 未来3周，每周写一段关于「${cardTitle}」的感受日记。你的内在世界很丰富，慢慢展开就好。`
          : `B. 未来2周，每周花15分钟静静思考「${cardTitle}」对你的意义。给自己这段独处时间，它值得。`,
        'INFP': hasHistory
          ? `B. 未来2周，每周用任何方式（画画、写字、音乐）表达一次「${cardTitle}」的感受。你的表达是独特的，不用完美。`
          : `B. 未来2周，每周记录一次「${cardTitle}」带给你的情绪变化。感受本身就是答案，慢慢来。`,
        'ENFJ': hasHistory
          ? `B. 未来2周，每周与一个人分享「${cardTitle}」的话题或感受。你的关怀会带来连接，别忘了也关心自己。`
          : `B. 未来2周，每周想想「${cardTitle}」如何帮助你关心的人。你的温暖很珍贵，也要照顾好自己。`,
        'ENFP': hasHistory
          ? `B. 未来2周，每周尝试一个与「${cardTitle}」相关的小探索或分享。你的热情会点亮路，享受过程就好。`
          : `B. 未来2周，每周记录1-2个「${cardTitle}」带来的灵感或想法。你的想法很有价值，慢慢来。`,
        'ISTJ': hasHistory
          ? `B. 未来3周，每周完成一项与「${cardTitle}」相关的具体任务。你的稳定性是优势，记得也给自己弹性。`
          : `B. 未来2周，每周制定一个与「${cardTitle}」相关的小计划并尝试。一步步来就很好，你做得很稳。`,
        'ISFJ': hasHistory
          ? `B. 未来2周，每周做一件与「${cardTitle}」相关、能帮助他人的小事。你的细心很珍贵，也要照顾好自己。`
          : `B. 未来2周，每周想想「${cardTitle}」如何让生活更温暖，写下来。你的关怀很温柔，慢慢来。`,
        'ESTJ': hasHistory
          ? `B. 未来3周，每周检查一次「${cardTitle}」的进展并调整。你的目标感很强，记得也给自己休息时间。`
          : `B. 未来2周，每周设定一个与「${cardTitle}」相关的小目标。你的执行力很好，一周一个就够了。`,
        'ESFJ': hasHistory
          ? `B. 未来2周，每周通过「${cardTitle}」与一个人建立或加深连接。你的热情很美好，也要留些时间给自己。`
          : `B. 未来2周，每周想想「${cardTitle}」如何增进关系，做一件小事。你的用心很珍贵，慢慢来。`,
        'ISTP': hasHistory
          ? `B. 未来2周，每周动手尝试一次与「${cardTitle}」相关的小实验或制作。你的动手能力很强，享受过程就好。`
          : `B. 未来2周，每周用实践验证一次「${cardTitle}」的想法。你的实践力很棒，一周一次就够了。`,
        'ISFP': hasHistory
          ? `B. 未来2周，每周用任何方式记录一次「${cardTitle}」的感受（照片、画、文字）。你的感受力很独特，慢慢表达。`
          : `B. 未来2周，每周花10分钟体验「${cardTitle}」带来的感觉。你的感受很真实，给自己这段时间。`,
        'ESTP': hasHistory
          ? `B. 未来1周，每隔2天尝试一个与「${cardTitle}」相关的新行动。你的行动力很强，短期冲刺也很好。`
          : `B. 未来1周，每2-3天做一件与「${cardTitle}」相关的小事。你的效率很高，短期节奏更适合你。`,
        'ESFP': hasHistory
          ? `B. 未来1周，每天分享一次与「${cardTitle}」相关的小瞬间（照片、文字、语音）。你的表达很生动，享受就好。`
          : `B. 未来1周，每2天记录一次「${cardTitle}」带来的快乐时刻。你的活力很珍贵，短期更有趣。`
      };

      const aAction = aActionMap[mbtiType] || `A. 在你周围找3个小物件，把它们排成一个造型，拍张照片（2分钟）。`;
      const bAction = bActionMap[mbtiType] || (hasHistory 
        ? `B. 未来2周，每周花10分钟思考「${cardTitle}」对你的意义。你已经在路上了，慢慢来就好。`
        : `B. 未来2周，每周花10分钟记录「${cardTitle}」带给你的感受。给自己这段时间，它值得。`);

      return [aAction, bAction];
    };

    const getOldDefaultActions = (mbtiType, cardTitle) => {
      const actionMap = {
        'INTJ': [
          `A. 写下关于「${cardTitle}」的3个具体想法，选择最可行的一个（3分钟）。`,
          `B. 用三个词总结「${cardTitle}」对你长期目标的影响。`
        ],
        'INTP': [
          `A. 在纸上画出「${cardTitle}」的逻辑关系图（3分钟）。`,
          `B. 想一个能解释「${cardTitle}」的理论或概念，写下来。`
        ],
        'ENTJ': [
          `A. 列出与「${cardTitle}」相关的3个具体目标和时间节点（3分钟）。`,
          `B. 思考「${cardTitle}」如何帮助团队，写下一个关键行动。`
        ],
        'ENTP': [
          `A. 用5分钟头脑风暴「${cardTitle}」的10种可能性，记录下来。`,
          `B. 选择一个最有趣的想法，用一句话描述如何实现。`
        ],
        'INFJ': [
          `A. 写一段关于「${cardTitle}」的个人反思，探索内在意义（3分钟）。`,
          `B. 完成这句话："${cardTitle}让我想起了______，因为______"。`
        ],
        'INFP': [
          `A. 用彩笔在纸上画出「${cardTitle}」的颜色感受（3分钟）。`,
          `B. 想象如果「${cardTitle}」是一首歌，会是什么样的旋律？`
        ],
        'ENFJ': [
          `A. 给一位朋友发一条关于「${cardTitle}」的鼓励消息（2分钟）。`,
          `B. 思考「${cardTitle}」如何帮助身边重要的人，写下一句话。`
        ],
        'ENFP': [
          `A. 给朋友发一条关于「${cardTitle}」的语音消息（2分钟）。`,
          `B. 想象「${cardTitle}」会带来什么惊喜，写下3种可能。`
        ],
        'ISTJ': [
          `A. 在笔记本上列出与「${cardTitle}」相关的3个具体计划（3分钟）。`,
          `B. 回忆过去成功体现「${cardTitle}」的3个具体时刻。`
        ],
        'ISFJ': [
          `A. 为家人或朋友做一件体现「${cardTitle}」的小事（3分钟）。`,
          `B. 想一想「${cardTitle}」如何让生活更温暖，记录下来。`
        ],
        'ESTJ': [
          `A. 制定一个关于「${cardTitle}」的详细清单，包含时间节点（3分钟）。`,
          `B. 思考如何将「${cardTitle}」应用到团队目标中，写下关键点。`
        ],
        'ESFJ': [
          `A. 给家人或朋友做一件体现「${cardTitle}」的小事（3分钟）。`,
          `B. 想一想「${cardTitle}」如何增进你与他人的关系，写下来。`
        ],
        'ISTP': [
          `A. 找一个与「${cardTitle}」相关的小物件，动手改造它（3分钟）。`,
          `B. 思考如何用实践验证「${cardTitle}」，写下一个方案。`
        ],
        'ISFP': [
          `A. 用摄影或绘画记录你对「${cardTitle}」的即时感受（3分钟）。`,
          `B. 完成这句话："${cardTitle}让我想起了______的感觉"。`
        ],
        'ESTP': [
          `A. 立即尝试一个与「${cardTitle}」相关的新活动（3分钟）。`,
          `B. 想一想今天如何把「${cardTitle}」变成有趣的体验。`
        ],
        'ESFP': [
          `A. 用视频或照片记录你今天如何体现「${cardTitle}」（3分钟）。`,
          `B. 想一个关于「${cardTitle}」的故事，分享给朋友。`
        ]
      };

      // 如果有对应的MBTI行动，使用它；否则使用通用行动
      if (actionMap[mbtiType]) {
        return actionMap[mbtiType];
      }

      // 通用行动建议
      return [
        `A. 在桌面摆放3个小物件代表「${cardTitle}」，拍照记录（2分钟）。`,
        `B. 用一句话描述「${cardTitle}」此刻给你的感受。`
      ];
    };

    // 尝试使用 Qwen3 AI 生成
    const provider = (process.env.MODEL_PROVIDER || 'dashscope').toLowerCase();
    const model = process.env.QWEN_MODEL || 'qwen-plus';
    
    if (provider === 'dashscope' && process.env.DASHSCOPE_API_KEY && fetch) {
      try {
        console.log(`[Qwen] 开始AI生成，模型: ${model}`);
        
        const sys = buildSystemPrompt();
        const usr = buildUserPrompt(userContext, card, mbti, mood);
        console.log(`[Qwen] System prompt长度: ${sys.length}, User prompt长度: ${usr.length}`);
        
        const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [ { role: 'system', content: sys }, { role: 'user', content: usr } ],
            temperature: 0.7,
            max_tokens: 500
          })
        });
        
        if (!resp.ok) {
          console.error(`[Qwen] API error: ${resp.status} ${resp.statusText}`);
          throw new Error(`API error: ${resp.status}`);
        }
        
        const data = await resp.json();
        console.log(`[Qwen] API response:`, data);
        
        const text = data?.choices?.[0]?.message?.content || '';
        if (!text) {
          console.warn('[Qwen] Empty response from API');
          throw new Error('Empty response from API');
        }
        
        // 解析Qwen按照prompt微调格式返回的结构化内容
        const { questions: qs, actions: acts } = parseQwenResponse(text);
        
        if (qs.length > 0) {
          console.log(`[Qwen] Generated ${qs.length} questions, ${acts.length} actions`);
          // 确保A/B两条行动建议，并移除A/B标签
          const validatedActions = ensureABFormat(acts, mbti, title).map(action => 
            action.replace(/^[AB]\.\s*/, '')
          );
          
          res.json({
            mbti,
            mood,
            card: { id: Number(cardId), title, keywords: card.mood_tags },
            questions: qs.slice(0, 2),
            actions: validatedActions,
            provider: `dashscope:${model}`
          });
          return;
        }
        
        console.warn('[Qwen] No valid questions found in response, falling back to templates');
      } catch (e) {
        console.error('[Qwen] API call failed:', e.message);
        console.log('[Qwen] Falling back to template generation');
      }
    } else {
      console.log('[Qwen] AI not available, using template generation');
    }

    // 回退到模板生成
    const questions = getDefaultQuestions(mbti, title);
    const actions = getDefaultActions(mbti, title, userContext).map(action => 
      action.replace(/^[AB]\.\s*/, '')
    );

    res.json({
      mbti,
      mood,
      card: { id: Number(cardId), title, keywords: card.mood_tags },
      questions,
      actions,
      provider: 'template-fallback'
    });

  } catch (error) {
    console.error('生成背面内容错误:', error);
    res.status(500).json({ error: '生成背面内容失败' });
  }
});

// 调试端点：检查Qwen配置
app.get('/api/debug/qwen-config', authenticateToken, (req, res) => {
  const provider = (process.env.MODEL_PROVIDER || 'dashscope').toLowerCase();
  const model = process.env.QWEN_MODEL || 'qwen-plus';
  const hasApiKey = !!process.env.DASHSCOPE_API_KEY;
  const hasFetch = !!fetch;
  
  res.json({
    provider,
    model,
    hasApiKey: hasApiKey,
    hasFetch: hasFetch,
    apiKeyPrefix: hasApiKey ? process.env.DASHSCOPE_API_KEY.substring(0, 10) + '...' : 'none',
    status: (provider === 'dashscope' && hasApiKey && hasFetch) ? 'ready' : 'not_ready'
  });
});

// 调试端点：检查翻卡次数功能
app.get('/api/debug/draw-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];
    
    // 获取今日翻卡记录
    const { data: drawRecord, error: fetchError } = await supabase
      .from('daily_draws')
      .select('*')
      .eq('user_id', userId)
      .eq('draw_date', today)
      .single();
    
    // 获取今日抽卡记录
    const { data: cardDraws, error: cardDrawsError } = await supabase
      .from('card_draws')
      .select('id, card_id, drawn_at')
      .eq('user_id', userId)
      .gte('drawn_at', `${today}T00:00:00.000Z`)
      .lt('drawn_at', `${today}T23:59:59.999Z`);
    
    res.json({
      userId,
      today,
      drawRecord: drawRecord || null,
      cardDrawsCount: cardDraws?.length || 0,
      cardDraws: cardDraws || [],
      fetchError: fetchError?.message || null,
      cardDrawsError: cardDrawsError?.message || null,
      status: 'ok'
    });
  } catch (error) {
    console.error('翻卡次数调试失败:', error);
    res.status(500).json({ error: '翻卡次数调试失败', details: error.message });
  }
});

// 调试端点：统计A/B行动建议比例
app.get('/api/debug/action-stats', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 1000;
    
    // 获取最近的action_selected事件
    const { data, error } = await supabase
      .from('events')
      .select('payload, created_at')
      .eq('type', 'action_selected')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('获取事件失败:', error);
      return res.status(500).json({ error: '获取统计数据失败' });
    }
    
    const stats = {
      total: data?.length || 0,
      A_count: 0,
      B_count: 0,
      by_card: {},
      recent_samples: [],
      probability_stats: {
        avg_probabilityA: 0,
        min_probabilityA: 100,
        max_probabilityA: 0,
        samples_with_prob: 0
      }
    };
    
    let probabilitySum = 0;
    let probabilityCount = 0;
    
    data?.forEach((event, index) => {
      try {
        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        
        if (payload.actionType === 'A') stats.A_count++;
        if (payload.actionType === 'B') stats.B_count++;
        
        // 收集概率统计
        if (payload.probabilityA) {
          const prob = parseFloat(payload.probabilityA);
          probabilitySum += prob;
          probabilityCount++;
          stats.probability_stats.min_probabilityA = Math.min(stats.probability_stats.min_probabilityA, prob);
          stats.probability_stats.max_probabilityA = Math.max(stats.probability_stats.max_probabilityA, prob);
        }
        
        // 按卡牌统计
        const cardTitle = payload.cardTitle || 'unknown';
        if (!stats.by_card[cardTitle]) {
          stats.by_card[cardTitle] = { A: 0, B: 0 };
        }
        if (payload.actionType === 'A') stats.by_card[cardTitle].A++;
        if (payload.actionType === 'B') stats.by_card[cardTitle].B++;
        
        // 保存最近10个样本
        if (index < 10) {
          stats.recent_samples.push({
            actionType: payload.actionType,
            cardTitle: cardTitle,
            probabilityA: payload.probabilityA || 'N/A',
            timestamp: event.created_at
          });
        }
      } catch (e) {
        console.warn('解析事件payload失败:', e);
      }
    });
    
    stats.A_percentage = stats.total > 0 ? (stats.A_count / stats.total * 100).toFixed(2) : 0;
    stats.B_percentage = stats.total > 0 ? (stats.B_count / stats.total * 100).toFixed(2) : 0;
    stats.A_ratio = stats.total > 0 ? `${stats.A_count}:${stats.B_count}` : '0:0';
    
    // 计算平均概率
    if (probabilityCount > 0) {
      stats.probability_stats.avg_probabilityA = (probabilitySum / probabilityCount).toFixed(2);
      stats.probability_stats.samples_with_prob = probabilityCount;
    } else {
      stats.probability_stats.min_probabilityA = 0;
    }
    
    res.json(stats);
  } catch (error) {
    console.error('统计A/B比例失败:', error);
    res.status(500).json({ error: '统计失败', details: error.message });
  }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 提供前端页面（必须在所有API路由之后）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 启动服务器
// 清除所有用户数据（仅用于开发测试）
app.post('/api/dev/clear-all-users', async (req, res) => {
  try {
    console.log('[DEBUG] 清除所有用户数据...');
    
    // 删除所有用户数据（Supabase Auth）
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('[ERROR] 获取用户列表失败:', listError);
      return res.status(500).json({ error: '获取用户列表失败' });
    }
    
    // 删除每个认证用户
    for (const user of authUsers.users) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteError) {
        console.error(`[ERROR] 删除用户 ${user.email} 失败:`, deleteError);
      } else {
        console.log(`[INFO] 已删除认证用户: ${user.email}`);
      }
    }
    
    // 删除 users 表中的所有数据
    const { error: usersError } = await supabase
      .from('users')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // 删除所有（使用不可能的条件来删除全部）
    
    if (usersError) {
      console.error('[ERROR] 清除 users 表失败:', usersError);
    } else {
      console.log('[INFO] users 表已清空');
    }
    
    // 删除 events 表中的所有数据
    const { error: eventsError } = await supabase
      .from('events')
      .delete()
      .neq('id', 0);
    
    if (eventsError) {
      console.error('[ERROR] 清除 events 表失败:', eventsError);
    } else {
      console.log('[INFO] events 表已清空');
    }
    
    res.json({ 
      success: true, 
      message: '所有用户数据已清除',
      deletedAuthUsers: authUsers.users.length
    });
  } catch (error) {
    console.error('[ERROR] 清除数据失败:', error);
    res.status(500).json({ error: '清除数据失败: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Echo Insight 服务器运行在端口 ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 查看应用`);
  console.log('使用 Supabase 数据库');
  console.log('[DEV] 清除所有用户: POST /api/dev/clear-all-users');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  process.exit(0);
});
