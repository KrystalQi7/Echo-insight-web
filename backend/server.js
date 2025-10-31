const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

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

// 数据库初始化（固定到 backend 目录，避免工作目录变化导致新建空库）
const db = new sqlite3.Database(path.join(__dirname, 'echo_insight.db'), (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功');
    // 设置UTF-8编码
    db.run("PRAGMA encoding = 'UTF-8'");
  }
});

// 初始化数据库表
db.serialize(() => {
  // 用户表
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    mbti_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // MBTI类型表
  db.run(`CREATE TABLE IF NOT EXISTS mbti_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_code TEXT UNIQUE NOT NULL,
    type_name TEXT NOT NULL,
    description TEXT NOT NULL,
    traits TEXT NOT NULL
  )`);

  // 卡牌表（用于固定卡牌包：title=名称+emoji，content=通用象征解读，category='fixed'，mood_tags=以逗号分隔的关键词）
  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    card_type TEXT DEFAULT '情绪类',
    mbti_type TEXT,
    is_starter INTEGER DEFAULT 0,
    mood_tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 用户心情记录表
  db.run(`CREATE TABLE IF NOT EXISTS mood_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    overall_mood TEXT NOT NULL,
    energy_level TEXT NOT NULL,
    concerns TEXT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 用户卡牌抽取记录表
  db.run(`CREATE TABLE IF NOT EXISTS card_draws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    card_id INTEGER NOT NULL,
    user_response TEXT,
    response_length INTEGER DEFAULT 0,
    drawn_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_edited INTEGER DEFAULT 0,
    edit_count INTEGER DEFAULT 0,
    last_edited_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (card_id) REFERENCES cards (id)
  )`);

  // 用户进度表
  db.run(`CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    experience_points INTEGER DEFAULT 0,
    consecutive_days INTEGER DEFAULT 0,
    last_activity_date DATE,
    unlocked_categories TEXT,
    starter_passed INTEGER DEFAULT 0,
    starter_score INTEGER DEFAULT 0,
    starter_actions_done INTEGER DEFAULT 0,
    starter_days INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 创建每日翻卡次数统计表
  db.run(`CREATE TABLE IF NOT EXISTS daily_draws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    draw_date DATE NOT NULL,
    draw_count INTEGER DEFAULT 0,
    max_draws INTEGER DEFAULT 3,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, draw_date)
  )`);
});

// 启动时自检与初始化（MBTI类型与固定卡牌包）
function ensureBootstrap() {
  // MBTI 类型
  db.get('SELECT COUNT(*) AS c FROM mbti_types', (err, row) => {
    const c = row?.c || 0;
    if (c === 0) {
      console.log('[BOOT] 初始化 MBTI 类型');
      const mbtiTypes = [
        ['INTJ','建筑师','富有想象力和战略性的思想家，一切皆在计划之中。','独立、坚定、雄心勃勃、好奇、洞察力强'],
        ['INTP','思想家','具有创新精神的发明家，对知识有着止不住的渴望。','好奇、灵活、有创造力、客观、逻辑性强'],
        ['ENTJ','指挥官','大胆，富有想象力，意志强烈的领导者，总能找到或创造解决方法。','大胆、意志坚强、意志坚定、自信、魅力'],
        ['ENTP','辩论家','聪明好奇的思想家，不会放弃任何智力挑战。','聪明好奇、思维敏捷、激励他人、精力充沛'],
        ['INFJ','提倡者','安静而神秘，同时鼓舞人心的理想主义者。','创造性、洞察力、原则性、热情、利他'],
        ['INFP','调停者','富有诗意，善良且利他主义，总是热切地想要帮助正当理由。','理想主义、好奇、灵活、忠诚、适应性强'],
        ['ENFJ','主人公','富有魅力，鼓舞人心的领导者，有着迷人的魅力。','魅力、利他、天生的领导者、激情、利他'],
        ['ENFP','竞选者','热情，有创造力，社交能力强，总是能找到微笑的理由。','热情、创造性、社交能力强、自由精神、热情'],
        ['ISTJ','物流师','实用和注重事实，可靠性无可争议。','诚实、直接、意志坚强、尽职、冷静'],
        ['ISFJ','守护者','非常专注和温暖的守护者，时刻准备着保护爱着的人们。','支持、可靠、耐心、想象力、观察力'],
        ['ESTJ','总经理','出色的管理者，在管理事情或人员方面无与伦比。','奉献、坚强、意志坚强、诚实、忠诚'],
        ['ESFJ','执政官','极有同情心，社会性强，总是热心帮助他人。','支持、可靠、耐心、想象力、观察力'],
        ['ISTP','鉴赏家','大胆而实际的实验家，擅长使用各种工具。','大胆、实用、直接、自发、理性'],
        ['ISFP','探险家','灵活有魅力的艺术家，时刻准备着探索新的可能性。','灵活、迷人、敏感、好奇、热情'],
        ['ESTP','企业家','聪明，精力充沛，善于感知，真正享受生活。','大胆、理性、实用、原创、洞察力'],
        ['ESFP','娱乐家','自发的，精力充沛，热情的表演者。','大胆、原创、美学、表演、实用']
      ];
      const stmt = db.prepare('INSERT OR IGNORE INTO mbti_types (type_code, type_name, description, traits) VALUES (?, ?, ?, ?)');
      mbtiTypes.forEach(r => stmt.run(r[0], r[1], r[2], r[3]));
      stmt.finalize();
    }
  });

  // 固定卡牌包
  db.get("SELECT COUNT(*) AS c FROM cards WHERE category='fixed'", (err, row) => {
    const c = row?.c || 0;
    if (c === 0) {
      console.log('[BOOT] 导入固定卡牌包');
      try {
        // 直接调用内部解析函数
        const fp = path.join(__dirname, '../固定卡牌包');
        const raw = fs.readFileSync(fp, 'utf8');
        const lines = raw.split(/\r?\n/);
        const items = [];
        let current = null;
        let currentCategory = '情绪类';
        const flush = () => { 
          if (current && current.title && current.keywords && current.meaning) {
            items.push({ ...current, category: currentCategory }); 
          } 
          current = null; 
        };
        for (const ln of lines) {
          const line = ln.trim();
          if (line.includes('情绪类')) { currentCategory = '情绪类'; }
          else if (line.includes('成长类')) { currentCategory = '成长类'; }
          else if (line.includes('关系类')) { currentCategory = '关系类'; }
          else if (line.includes('自我力量类')) { currentCategory = '自我力量类'; }
          else if (/^\d+\.\d+/.test(line)) { 
            flush(); 
            current = { title: line.replace(/^\d+\.\d+/, '').trim(), keywords: '', meaning: '' }; 
          }
          else if (line.startsWith('关键词：')) { 
            if (!current) current = { title: '未命名', keywords: '', meaning: '' }; 
            current.keywords = line.replace('关键词：', '').trim(); 
          }
          else if (line.startsWith('解读：')) { 
            if (!current) current = { title: '未命名', keywords: '', meaning: '' }; 
            current.meaning = line.replace('解读：', '').trim(); 
          }
        }
        flush();
        if (items.length > 0) {
          const stmt = db.prepare('INSERT INTO cards (title, content, category, card_type, mbti_type, is_starter, mood_tags) VALUES (?, ?, ?, ?, NULL, 0, ?)');
          items.forEach(it => stmt.run(it.title, it.meaning, it.category, it.category, it.keywords));
          stmt.finalize();
        } else {
          // 兜底内置固定卡
          const fallback = [
            { title: '孤独 🌙', keywords: '独处,内省,连接', meaning: '孤独是你与自己深度对话的契机。' },
            { title: '焦虑 🌊', keywords: '紧张,未知,压力', meaning: '焦虑提醒你关注内心的焦点和未解决问题。' },
            { title: '勇气 🌟', keywords: '突破,初尝,内在力量', meaning: '迈出第一步，即便很小，也能唤醒力量。' },
            { title: '创造力 🎨', keywords: '想象,实践,新奇', meaning: '以你独特的方式与世界互动，激活新的可能。' },
            { title: '平静 🌿', keywords: '安稳,接纳,休息', meaning: '当下的安全与舒适，是修复的时刻。' }
          ];
          const stmt = db.prepare('INSERT INTO cards (title, content, category, mbti_type, is_starter, mood_tags) VALUES (?, ?, ?, NULL, 0, ?)');
          fallback.forEach(it => stmt.run(it.title, it.meaning, 'fixed', it.keywords));
          stmt.finalize();
        }
      } catch (e) {
        console.warn('[BOOT] 固定卡牌包导入失败：', e.message);
      }
    }
  });
}

ensureBootstrap();

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
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    
    db.get(
      'SELECT draw_count, max_draws FROM daily_draws WHERE user_id = ? AND draw_date = ?',
      [userId, today],
      (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({ draw_count: row.draw_count, max_draws: row.max_draws });
        } else {
          // 如果今天还没有记录，创建一条
          db.run(
            'INSERT INTO daily_draws (user_id, draw_date, draw_count, max_draws) VALUES (?, ?, 0, 3)',
            [userId, today],
            function(insertErr) {
              if (insertErr) {
                reject(insertErr);
              } else {
                resolve({ draw_count: 0, max_draws: 3 });
              }
            }
          );
        }
      }
    );
  });
}

// 增加今日翻卡次数（带并发检查）
async function incrementTodayDrawCount(userId) {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0];
    
    // 先检查当前次数
    db.get(
      'SELECT draw_count, max_draws FROM daily_draws WHERE user_id = ? AND draw_date = ?',
      [userId, today],
      (err, row) => {
        if (err) {
          return reject(err);
        }
        
        if (row && row.draw_count >= row.max_draws) {
          return reject(new Error('DRAW_LIMIT_EXCEEDED'));
        }
        
        // 使用 UPSERT 进行原子性更新
        db.run(
          `INSERT INTO daily_draws (user_id, draw_date, draw_count, max_draws, updated_at) 
           VALUES (?, ?, 1, 3, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, draw_date) 
           DO UPDATE SET draw_count = draw_count + 1, updated_at = CURRENT_TIMESTAMP
           WHERE draw_count < max_draws`,
          [userId, today],
          function(err) {
            if (err) {
              reject(err);
            } else if (this.changes === 0) {
              // 如果没有更新任何行，说明已达到限制
              reject(new Error('DRAW_LIMIT_EXCEEDED'));
            } else {
              resolve();
            }
          }
        );
      }
    );
  });
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
    db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: '数据库错误' });
      }
      
      if (row) {
        return res.status(400).json({ error: '用户名或邮箱已存在' });
      }

      // 加密密码
      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = uuidv4();

      // 创建用户
      db.run('INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)', 
        [userId, username, email, hashedPassword], function(err) {
          if (err) {
            return res.status(500).json({ error: '创建用户失败' });
          }

          // 创建用户进度记录
          db.run('INSERT INTO user_progress (user_id) VALUES (?)', [userId]);

          const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '24h' });
          res.json({ 
            message: '注册成功', 
            token,
            user: { id: userId, username, email }
          });
        });
    });
  } catch (error) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 用户登录
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '邮箱和密码都是必填项' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: '数据库错误' });
    }

    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ 
      message: '登录成功', 
      token,
      user: { id: user.id, username: user.username, email: user.email, mbti_type: user.mbti_type }
    });
  });
});

// 获取MBTI类型列表
app.get('/api/mbti-types', (req, res) => {
  db.all('SELECT * FROM mbti_types ORDER BY type_code', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取MBTI类型失败' });
    }
    res.json(rows);
  });
});

// 更新用户MBTI类型
app.put('/api/user/mbti', authenticateToken, (req, res) => {
  const { mbti_type } = req.body;
  const userId = req.user.userId;

  db.run('UPDATE users SET mbti_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
    [mbti_type, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: '更新MBTI类型失败' });
      }
      res.json({ message: 'MBTI类型更新成功', mbti_type });
    });
});

// 记录用户心情
app.post('/api/mood', authenticateToken, (req, res) => {
  const { overall_mood, energy_level, concerns } = req.body;
  const userId = req.user.userId;

  db.run('INSERT INTO mood_records (user_id, overall_mood, energy_level, concerns) VALUES (?, ?, ?, ?)',
    [userId, overall_mood, energy_level, JSON.stringify(concerns)], function(err) {
      if (err) {
        return res.status(500).json({ error: '记录心情失败' });
      }
      res.json({ message: '心情记录成功', id: this.lastID });
    });
});

// 抽取卡牌
// 抽取固定卡牌（从固定卡牌池随机，未来可按关键词/心情权重）
app.post('/api/cards/draw', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { mood_tags } = req.body;

  try {
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

    let query = "SELECT * FROM cards WHERE category IN ('情绪类', '成长类', '关系类', '自我力量类')";
    const params = [];
    if (mood_tags && mood_tags.length > 0) {
      query += ' AND (mood_tags IS NULL OR mood_tags LIKE ?)';
      params.push(`%${mood_tags[0]}%`);
    }
    query += ' ORDER BY RANDOM() LIMIT 1';
    
    db.get(query, params, async (qerr, card) => {
      if (qerr) return res.status(500).json({ error: '抽取卡牌失败' });
      if (!card) return res.status(404).json({ error: '没有找到合适的卡牌' });
      
      // 记录抽卡（不检查重复，重复检查在记录时进行）
      db.run('INSERT OR IGNORE INTO card_draws (user_id, card_id) VALUES (?, ?)', [userId, card.id], async (err) => {
        if (err) return res.status(500).json({ error: '记录抽卡失败' });

        try {
          // 增加今日翻卡次数（内部已有并发控制）
          await incrementTodayDrawCount(userId);
          
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
        } catch (incrementErr) {
          console.error('更新翻卡次数失败:', incrementErr);
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
          // 其他错误：即使次数更新失败，也返回卡牌（不影响用户体验）
          updateConsecutiveDays(userId);
          addExperience(userId, 10, '抽卡');
          res.json(card);
        }
      });
    });
  } catch (error) {
    console.error('翻卡次数检查失败:', error);
    return res.status(500).json({ error: '翻卡次数检查失败' });
  }
});

// 提交卡牌回答
app.post('/api/cards/:cardId/response', authenticateToken, (req, res) => {
  const { cardId } = req.params;
  const { response } = req.body;
  const userId = req.user.userId;

  const respLen = (response || '').trim().length;
  console.log(`[API] 保存回答: userId=${userId}, cardId=${cardId}, responseLength=${respLen}, response="${response}"`);
  
  // 先检查是否存在记录（仅取最新的一条抽卡记录）
  db.get('SELECT id FROM card_draws WHERE user_id = ? AND card_id = ? ORDER BY id DESC LIMIT 1', [userId, cardId], (err, row) => {
    if (err) {
      console.error('[API] 检查记录失败:', err);
      return res.status(500).json({ error: '检查记录失败' });
    }
    
    if (!row) {
      console.warn(`[API] 没有找到抽卡记录: userId=${userId}, cardId=${cardId}`);
      return res.status(404).json({ error: '没有找到对应的抽卡记录，请先抽卡' });
    }
    
    console.log(`[API] 找到记录: id=${row.id}`);
    
    db.run('UPDATE card_draws SET user_response = ?, response_length = ? WHERE id = ?',
      [response, respLen, row.id], function(err) {
      if (err) {
        console.error('[API] 保存回答失败:', err);
        return res.status(500).json({ error: '保存回答失败' });
      }
      
      if (this.changes === 0) {
        console.warn(`[API] 没有找到匹配的记录: userId=${userId}, cardId=${cardId}`);
        return res.status(404).json({ error: '没有找到对应的抽卡记录' });
      }
      
      console.log(`[API] 回答保存成功: userId=${userId}, cardId=${cardId}, changes=${this.changes}`);
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
    });
  });
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
function addExperience(userId, xpAmount, reason = '') {
  db.get('SELECT * FROM user_progress WHERE user_id = ?', [userId], (err, progress) => {
    if (err) return;
    
    const currentXP = progress ? progress.experience_points : 0;
    const currentLevel = progress ? progress.level : 1;
    const newXP = currentXP + xpAmount;
    const newLevel = calculateLevel(newXP);
    
    if (!progress) {
      // 创建新的进度记录
      db.run(`INSERT INTO user_progress (user_id, level, experience_points, consecutive_days, last_activity_date) 
              VALUES (?, ?, ?, 1, ?)`, [userId, newLevel, newXP, new Date().toISOString().split('T')[0]]);
    } else {
      // 更新经验值和等级
      db.run(`UPDATE user_progress SET experience_points = ?, level = ? WHERE user_id = ?`,
        [newXP, newLevel, userId]);
    }
    
    // 记录经验值获得事件
    db.run(`INSERT INTO events (user_id, type, payload) VALUES (?, 'xp_gained', ?)`,
      [userId, JSON.stringify({ amount: xpAmount, reason, newXP, newLevel })]);
  });
}

// 更新用户连续天数
function updateConsecutiveDays(userId) {
  // 使用本地时间，避免时区问题
  const now = new Date();
  const today = now.getFullYear() + '-' + 
                String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                String(now.getDate()).padStart(2, '0');
  
  db.get('SELECT * FROM user_progress WHERE user_id = ?', [userId], (err, progress) => {
    if (err) return;
    
    if (!progress) {
      // 创建新的进度记录
      db.run(`INSERT INTO user_progress (user_id, level, experience_points, consecutive_days, last_activity_date) 
              VALUES (?, 1, 0, 1, ?)`, [userId, today]);
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
      db.run(`UPDATE user_progress SET consecutive_days = ?, last_activity_date = ? WHERE user_id = ?`,
        [newConsecutiveDays, today, userId]);
    }
  });
}

// 获取用户进度
app.get('/api/user/progress', authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.get('SELECT * FROM user_progress WHERE user_id = ?', [userId], (err, progress) => {
    if (err) {
      return res.status(500).json({ error: '获取进度失败' });
    }
    res.json(progress || { level: 1, experience_points: 0, consecutive_days: 0, starter_passed: 0, starter_score: 0 });
  });
});

// 获取今日翻卡次数信息
app.get('/api/user/daily-draws', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
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
app.get('/api/user/history', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const { card_type } = req.query; // 支持按分类筛选

  let query = `WITH ranked AS (
            SELECT cd.*, c.title, c.content, c.category,
                   ROW_NUMBER() OVER (PARTITION BY cd.card_id ORDER BY cd.drawn_at DESC) AS rn
            FROM card_draws cd
            JOIN cards c ON cd.card_id = c.id
            WHERE cd.user_id = ?`;
  
  const params = [userId];
  if (card_type && card_type !== '全部') {
    query += ' AND c.category = ?';
    params.push(card_type);
  }
  
  query += `)
          SELECT * FROM ranked WHERE rn=1
          ORDER BY drawn_at DESC
          LIMIT 50`;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: '获取历史记录失败' });
    }
    res.json(rows);
  });
});

// 删除用户历史记录
app.delete('/api/user/history/:drawId', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const drawId = parseInt(req.params.drawId); // 确保转换为整数
  
  console.log(`[API] 删除请求: userId=${userId}, drawId=${drawId} (类型: ${typeof drawId})`);
  
  // 先查询记录是否存在
  db.get('SELECT id, user_id FROM card_draws WHERE id = ?', [drawId], (err, record) => {
    if (err) {
      console.error('[API] 查询记录失败:', err);
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
    db.run(
      'DELETE FROM card_draws WHERE id = ? AND user_id = ?',
      [drawId, userId],
      function(err) {
        if (err) {
          console.error('[API] 删除历史记录错误:', err);
          return res.status(500).json({ error: '删除失败' });
        }
        
        console.log(`[API] 删除成功: drawId=${drawId}, changes=${this.changes}`);
        res.json({ success: true, message: '删除成功' });
      }
    );
  });
});

// 获取用户信息（用于验证token）
app.get('/api/user/info', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  
  db.get('SELECT id, username, email, mbti_type FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
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
  });
});

// 初始化数据
app.post('/api/init-data', (req, res) => {
  // 插入MBTI类型数据
  const mbtiTypes = [
    { code: 'INTJ', name: '建筑师', description: '富有想象力和战略性的思想家，一切皆在计划之中。', traits: '独立、坚定、雄心勃勃、好奇、洞察力强' },
    { code: 'INTP', name: '思想家', description: '具有创新精神的发明家，对知识有着止不住的渴望。', traits: '好奇、灵活、有创造力、客观、逻辑性强' },
    { code: 'ENTJ', name: '指挥官', description: '大胆，富有想象力，意志强烈的领导者，总能找到或创造解决方法。', traits: '大胆、意志坚强、意志坚定、自信、魅力' },
    { code: 'ENTP', name: '辩论家', description: '聪明好奇的思想家，不会放弃任何智力挑战。', traits: '聪明好奇、思维敏捷、激励他人、精力充沛' },
    { code: 'INFJ', name: '提倡者', description: '安静而神秘，同时鼓舞人心的理想主义者。', traits: '创造性、洞察力、原则性、热情、利他' },
    { code: 'INFP', name: '调停者', description: '富有诗意，善良且利他主义，总是热切地想要帮助正当理由。', traits: '理想主义、好奇、灵活、忠诚、适应性强' },
    { code: 'ENFJ', name: '主人公', description: '富有魅力，鼓舞人心的领导者，有着迷人的魅力。', traits: '魅力、利他、天生的领导者、激情、利他' },
    { code: 'ENFP', name: '竞选者', description: '热情，有创造力，社交能力强，总是能找到微笑的理由。', traits: '热情、创造性、社交能力强、自由精神、热情' },
    { code: 'ISTJ', name: '物流师', description: '实用和注重事实，可靠性无可争议。', traits: '诚实、直接、意志坚强、尽职、冷静' },
    { code: 'ISFJ', name: '守护者', description: '非常专注和温暖的守护者，时刻准备着保护爱着的人们。', traits: '支持、可靠、耐心、想象力、观察力' },
    { code: 'ESTJ', name: '总经理', description: '出色的管理者，在管理事情或人员方面无与伦比。', traits: '奉献、坚强、意志坚强、诚实、忠诚' },
    { code: 'ESFJ', name: '执政官', description: '极有同情心，社会性强，总是热心帮助他人。', traits: '支持、可靠、耐心、想象力、观察力' },
    { code: 'ISTP', name: '鉴赏家', description: '大胆而实际的实验家，擅长使用各种工具。', traits: '大胆、实用、直接、自发、理性' },
    { code: 'ISFP', name: '探险家', description: '灵活有魅力的艺术家，时刻准备着探索新的可能性。', traits: '灵活、迷人、敏感、好奇、热情' },
    { code: 'ESTP', name: '企业家', description: '聪明，精力充沛，善于感知，真正享受生活。', traits: '大胆、理性、实用、原创、洞察力' },
    { code: 'ESFP', name: '娱乐家', description: '自发的，精力充沛，热情的表演者 - 生活在他们周围永远不会无聊。', traits: '大胆、原创、美学、表演、实用' }
  ];

  mbtiTypes.forEach(type => {
    db.run('INSERT OR IGNORE INTO mbti_types (type_code, type_name, description, traits) VALUES (?, ?, ?, ?)',
      [type.code, type.name, type.description, type.traits]);
  });

  // 插入示例卡牌数据
  const sampleCards = [
    { title: '价值观探索', content: '最近有什么事物深深触动了你的价值观或信念？', category: '反思卡', mbti_type: 'INFP', mood_tags: '平静,思考' },
    { title: '理想世界', content: '描述一个你理想中的世界是什么样子的。', category: '启发卡', mbti_type: 'INFP', mood_tags: '兴奋,有动力' },
    { title: '和谐与需求', content: '你是否曾为了保持和谐而忽略了自己的需求？事后感受如何？', category: '情感卡', mbti_type: 'INFP', mood_tags: '焦虑,低落' },
    { title: '今日情绪', content: '今天你注意到的主要情绪是什么？', category: '观察卡', mbti_type: null, mood_tags: '平静,焦虑,低落,兴奋,无聊,压力' },
    { title: '能量管理', content: '你今天的能量感受如何？是什么影响了你的能量水平？', category: '行动卡', mbti_type: null, mood_tags: '疲惫,有动力' },
    { title: '内心对话', content: '如果你能和过去的自己对话，你会说什么？', category: '反思卡', mbti_type: null, mood_tags: '思考,平静' }
  ];

  sampleCards.forEach(card => {
    db.run('INSERT OR IGNORE INTO cards (title, content, category, mbti_type, mood_tags) VALUES (?, ?, ?, ?, ?)',
      [card.title, card.content, card.category, card.mbti_type, card.mood_tags]);
  });

  res.json({ message: '数据初始化完成' });
});

// 管理：加载固定卡牌包（从根目录文件“固定卡牌包”导入到cards表，category='fixed'）
app.post('/api/admin/load-fixed-packs', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../固定卡牌包');
    const raw = fs.readFileSync(filePath, 'utf8');
    // 解析简易格式：按段落读取“名称 emoji”、“关键词：...”、“解读：...”
    const lines = raw.split(/\r?\n/);
    const items = [];
    let current = null;
    const flush = () => {
      if (current && current.title && current.keywords && current.meaning) {
        items.push({ ...current });
      }
      current = null;
    };
    for (const ln of lines) {
      const line = ln.trim();
      if (/^\d+\.\d+/.test(line)) {
        flush();
        current = { title: line.replace(/^\d+\.\d+/, '').trim(), keywords: '', meaning: '' };
      } else if (line.startsWith('关键词：')) {
        if (!current) current = { title: '未命名', keywords: '', meaning: '' };
        current.keywords = line.replace('关键词：', '').trim();
      } else if (line.startsWith('解读：')) {
        if (!current) current = { title: '未命名', keywords: '', meaning: '' };
        current.meaning = line.replace('解读：', '').trim();
      } else if (line.startsWith('提问：')) {
        // 忽略（反面内容由大模型生成）
      }
    }
    flush();

    // 兜底：若未解析到任何条目，尝试按“关键词/解读”段落粗解析
    if (items.length === 0) {
      const blocks = raw.split(/\n\n+/);
      blocks.forEach(b => {
        const tMatch = b.match(/^(\d+\.\d+\s*[^\n]+)/m);
        const kMatch = b.match(/关键词：([^\n]+)/);
        const mMatch = b.match(/解读：([^\n]+)/);
        if (tMatch && kMatch && mMatch) {
          items.push({ title: tMatch[1].replace(/^\d+\.\d+/, '').trim(), keywords: kMatch[1].trim(), meaning: mMatch[1].trim() });
        }
      });
    }

    let inserted = 0;
    const stmt = db.prepare('INSERT INTO cards (title, content, category, mbti_type, is_starter, mood_tags) VALUES (?, ?, ?, NULL, 0, ?)');
    items.forEach(it => {
      stmt.run(it.title, it.meaning, 'fixed', it.keywords, function(err){ /* ignore per-row error */ });
      inserted += 1;
    });
    stmt.finalize(() => {
      res.json({ message: '固定卡牌包已导入', count: inserted });
    });
  } catch (e) {
    res.status(500).json({ error: '导入失败', detail: String(e.message || e) });
  }
});

// 管理：将所有带 mbti_type 的卡片标记为起始包（快速启用权重抽卡）
app.post('/api/admin/mark-starter', (req, res) => {
  db.run('UPDATE cards SET is_starter = 1 WHERE mbti_type IS NOT NULL', [], function(err){
    if (err) return res.status(500).json({ error: '标记失败' });
    res.json({ message: '已标记起始包卡牌', affected: this.changes });
  });
});

// 事件埋点
app.post('/api/events', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const { type, payload } = req.body || {};
  if (!type) return res.status(400).json({ error: '缺少事件类型' });
  db.run('INSERT INTO events (user_id, type, payload) VALUES (?, ?, ?)', [userId, type, JSON.stringify(payload || {})], function(err){
    if (err) return res.status(500).json({ error: '记录事件失败' });
    res.json({ id: this.lastID });
  });
});

// 聚合用户历史数据和特征提取
async function aggregateUserContext(userId) {
  return new Promise((resolve) => {
    // 获取用户基本信息和进度
    db.get('SELECT mbti_type FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) return resolve({});
      
      db.get('SELECT consecutive_days FROM user_progress WHERE user_id = ?', [userId], (err2, progress) => {
        if (err2) return resolve({});
        
        const context = {
          user_profile: {
            mbti: user?.mbti_type || 'UNKNOWN',
            streak_days: progress?.consecutive_days || 0
          },
          recent_mood: { days: 7, trend: 'neutral', top: [] },
          recent_threads: [],
          user_phrases: []
        };
        
        // 获取近7天心情记录
        db.all(`SELECT overall_mood, energy_level, recorded_at 
                FROM mood_records 
                WHERE user_id = ? AND recorded_at >= datetime('now', '-7 days')
                ORDER BY recorded_at DESC LIMIT 10`, [userId], (err3, moods) => {
          
          if (moods && moods.length > 0) {
            // 分析心情趋势
            const moodCounts = {};
            moods.forEach(m => {
              moodCounts[m.overall_mood] = (moodCounts[m.overall_mood] || 0) + 1;
            });
            context.recent_mood.top = Object.keys(moodCounts)
              .sort((a,b) => moodCounts[b] - moodCounts[a])
              .slice(0, 2);
            
            // 简单趋势分析（最近vs之前）
            if (moods.length >= 4) {
              const recent = moods.slice(0, 2);
              const earlier = moods.slice(-2);
              const positiveScore = m => (['平静','兴奋'].includes(m.overall_mood) ? 1 : 0);
              const recentScore = recent.reduce((sum, m) => sum + positiveScore(m), 0);
              const earlierScore = earlier.reduce((sum, m) => sum + positiveScore(m), 0);
              context.recent_mood.trend = recentScore > earlierScore ? 'slightly_up' : 
                                        recentScore < earlierScore ? 'slightly_down' : 'stable';
            }
          }
          
          // 获取近10条卡牌抽取记录（包含回答）
          db.all(`SELECT cd.drawn_at, cd.user_response, cd.response_length, c.title, c.category
                  FROM card_draws cd 
                  JOIN cards c ON cd.card_id = c.id
                  WHERE cd.user_id = ? AND cd.drawn_at >= datetime('now', '-14 days')
                  ORDER BY cd.drawn_at DESC LIMIT 10`, [userId], (err4, draws) => {
            
            if (draws && draws.length > 0) {
              // 提取主题线索
              const topicCounts = {};
              const recentPhrases = [];
              
              draws.forEach(draw => {
                // 统计主题出现频率
                if (draw.category) {
                  topicCounts[draw.category] = (topicCounts[draw.category] || 0) + 1;
                }
                
                // 提取用户短语（从回答中）
                if (draw.user_response && draw.user_response.length > 5) {
                  // 隐私保护：脱敏处理
                  let phrase = draw.user_response.substring(0, 20).trim();
                  // 移除敏感信息
                  phrase = phrase.replace(/\d{11}|\d{3}-\d{4}-\d{4}|\d{4}-\d{2}-\d{2}/g, '[日期/电话]');
                  phrase = phrase.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[邮箱]');
                  phrase = phrase.replace(/[一二三四五六七八九十]\d*[年月日号]/g, '[某天]');
                  
                  if (phrase.length >= 5) {
                    recentPhrases.push(`"${phrase}"`);
                  }
                }
              });
              
              // 构建主题线索
              Object.keys(topicCounts).forEach(topic => {
                const recentDraw = draws.find(d => d.category === topic);
                if (recentDraw) {
                  const daysDiff = Math.floor((new Date() - new Date(recentDraw.drawn_at)) / (1000 * 60 * 60 * 24));
                  const hasAction = recentDraw.response_length > 20;
                  
                  // 脱敏evidence
                  let evidence = "无回答";
                  if (recentDraw.user_response) {
                    evidence = recentDraw.user_response.substring(0, 30);
                    // 隐私保护处理
                    evidence = evidence.replace(/\d{11}|\d{3}-\d{4}-\d{4}|\d{4}-\d{2}-\d{2}/g, '[日期/电话]');
                    evidence = evidence.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[邮箱]');
                    evidence = evidence.replace(/[一二三四五六七八九十]\d*[年月日号]/g, '[某天]');
                  }
                  
                  context.recent_threads.push({
                    topic: topic,
                    last_action: hasAction ? "已完成" : "未完成",
                    evidence: evidence,
                    last_seen: `${daysDiff}d`
                  });
                }
              });
              
              // 取最新的用户短语（最多3条）
              context.user_phrases = recentPhrases.slice(0, 3);
            }
            
            resolve(context);
          });
        });
      });
    });
  });
}

// 动态反面生成（占位：本地模板，根据 prompt微调 + 用户属性 生成）
app.post('/api/cards/:cardId/generate-back', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { cardId } = req.params;
  const { mood, historyBrief } = req.body || {};
  
  // 聚合用户上下文
  const userContext = await aggregateUserContext(userId);

  db.get('SELECT title, content, mood_tags FROM cards WHERE id=?', [cardId], (err, card) => {
    if (err || !card) return res.status(404).json({ error: '卡牌不存在' });
    db.get('SELECT mbti_type FROM users WHERE id=?', [userId], (e2, user) => {
      const mbti = user?.mbti_type || 'UNKNOWN';
      const kw = (card.mood_tags || '').split(',').map(s=>s.trim()).filter(Boolean).slice(0,3).join(' · ');
      const title = card.title;
      const meaning = card.content;
      const promptGuide = (()=>{ try { return fs.readFileSync(path.join(__dirname, '../prompt微调'), 'utf8'); } catch(_) { return ''; } })();

      const provider = (process.env.MODEL_PROVIDER || 'dashscope').toLowerCase();
      const model = process.env.QWEN_MODEL || 'qwen-plus';

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
   - B. 微反思：≤2分钟、轻量的思考或梳理活动

### 严格输出格式
必须按照以下格式输出，不要给多余解释：

**引导提问**
- [问题1]
- [问题2]

**行动建议**
A. [具体微行动：≤3分钟，包含场景/对象/时长，零成本可做]
B. [轻量反思：≤2分钟，具体问题或简单结构化思考]

### 关键要求
1. 行动建议必须恰好2条，格式为"A."和"B."开头
2. A类微行动要求：
   - 时长≤3分钟，零成本或成本≤10元
   - 必须包含：具体场景（阳台/厨房/桌面）+ 具体对象（落叶/小物件/纸笔）+ 具体动作（拼/摆/写）
   - 禁止模糊词："做一件...相关的小事/观察/尝试/探索"
3. B类微反思要求：
   - 时长≤2分钟，可立即完成的思考活动
   - 具体结构：三词总结/一句比喻/列举N件事/用X描述Y
   - 避免抽象："思考并记录/梳理感受"
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
      const buildUserPrompt = () => {
        // 生成历史摘要
        let historyBrief = '';
        if (userContext.recent_threads && userContext.recent_threads.length > 0) {
          historyBrief = userContext.recent_threads.map(t => 
            `${t.topic}(${t.last_seen}前,${t.last_action}):${t.evidence}`
          ).join('；');
        }
        
        // 构建完整的用户prompt
        const basicInfo = `卡牌：${title}\n关键词：${kw}\n象征解读：${meaning}`;
        const userInfo = `用户信息：MBTI=${mbti}；连续天数=${userContext.user_profile?.streak_days || 0}；情绪=${mood||''}`;
        const contextInfo = userContext.recent_threads.length > 0 ? 
          `\n\n个性化上下文：\n${JSON.stringify(userContext, null, 2)}` : '';
        
        return `${basicInfo}\n${userInfo}${contextInfo}`;
      };

      // 确保A/B格式的行动建议
      const ensureABFormat = (actions, mbtiType, cardTitle) => {
        const result = [];
        const labels = ['A', 'B'];
        
        // 处理现有actions，确保格式正确
        for (let i = 0; i < 2; i++) {
          const action = actions[i];
          const label = labels[i];
          
          if (action && action.trim()) {
            const text = action.trim();
            // 如果已有A./B.前缀，保持原样；否则添加
            const hasPrefix = /^[AB]\.\s*/.test(text);
            const content = hasPrefix ? text : `${label}. ${text}`;
            result.push(content);
          } else {
            // 没有对应的action，使用兜底内容
            result.push(getDefaultABAction(label, mbtiType, cardTitle));
          }
        }
        
        return result;
      };
      
      // 获取默认A/B行动建议
      const getDefaultABAction = (type, mbtiType, cardTitle) => {
        const defaults = {
          'A': {
            'INTJ': `A. 写下关于「${cardTitle}」的3个具体想法，选择最可行的一个（3分钟）。`,
            'INFP': `A. 用彩笔在纸上画出「${cardTitle}」的颜色感受（3分钟）。`,
            'ENFP': `A. 给朋友发一条关于「${cardTitle}」的语音消息（2分钟）。`,
            'ISTJ': `A. 在笔记本上列出与「${cardTitle}」相关的3个具体计划（3分钟）。`,
            'ESFJ': `A. 给家人/朋友做一件体现「${cardTitle}」的小事（3分钟）。`
          },
          'B': {
            'INTJ': `B. 用三个词总结「${cardTitle}」对你长期目标的影响。`,
            'INFP': `B. 完成这句话："${cardTitle}让我想起了______，因为______"。`,
            'ENFP': `B. 想象如果「${cardTitle}」是一个人，TA会对你说什么？`,
            'ISTJ': `B. 回忆过去成功体现「${cardTitle}」的3个具体时刻。`,
            'ESFJ': `B. 思考「${cardTitle}」如何帮助身边重要的人，写下一句话。`
          }
        };
        
        // 如果有对应的MBTI默认值，使用它；否则使用通用默认值
        if (defaults[type] && defaults[type][mbtiType]) {
          return defaults[type][mbtiType];
        }
        
        // 通用默认值
        return type === 'A' 
          ? `A. 在桌面摆放3个小物件代表「${cardTitle}」，拍照记录（2分钟）。`
          : `B. 用一句话描述「${cardTitle}」此刻给你的感受。`;
      };

      // 根据MBTI类型提供具体的行动建议
      const getMbtiSpecificActions = (mbtiType, cardTitle) => {
          const baseActions = {
            'INTJ': [
              `写下关于「${cardTitle}」的3个具体想法，然后选择其中一个制定实施计划`,
              `花15分钟独自思考这个主题对你长期目标的影响，并记录核心洞察`
            ],
            'INTP': [
              `从3个不同角度分析「${cardTitle}」，写下每个角度的核心逻辑`,
              `找一个相关的理论或概念，用它来解释你对这个主题的理解`
            ],
            'ENTJ': [
              `制定一个关于「${cardTitle}」的30天行动计划，包含具体的里程碑`,
              `与2-3个人讨论这个主题，收集他们的观点并整合成行动策略`
            ],
            'ENTP': [
              `用10分钟头脑风暴「${cardTitle}」的10种不同可能性，然后选择最有趣的一个去尝试`,
              `与不同背景的朋友讨论这个主题，记录下最意外的观点`
            ],
            'INFJ': [
              `写一篇关于「${cardTitle}」的个人反思，探索它与你价值观的联系`,
              `设计一个小仪式或象征性行动来体现这个主题的意义`
            ],
            'INFP': [
              `用艺术形式（绘画、写诗、音乐）表达你对「${cardTitle}」的感受`,
              `给一个你信任的朋友写一封关于这个主题的真心话信件（不一定要发出）`
            ],
            'ENFJ': [
              `思考如何用「${cardTitle}」这个主题帮助身边的一个朋友，并付诸行动`,
              `组织一次小型讨论，邀请朋友们分享他们对这个主题的看法`
            ],
            'ENFP': [
              `与朋友分享你对「${cardTitle}」的想法，并邀请他们也分享自己的体验`,
              `用10分钟时间头脑风暴这个主题能带来的所有可能性，写在便利贴上`
            ],
            'ISTJ': [
              `制定一个关于「${cardTitle}」的具体3步行动计划，并设定完成时间`,
              `回顾过去类似经历，写下3个实用的应对策略`
            ],
            'ISFJ': [
              `思考「${cardTitle}」如何影响你关心的人，为其中一人做一件贴心的小事`,
              `写下这个主题在你生活中的具体体现，并制定改善计划`
            ],
            'ESTJ': [
              `制定一个关于「${cardTitle}」的详细行动清单，包含时间节点和成功指标`,
              `与团队或家人讨论如何将这个主题应用到共同目标中`
            ],
            'ESFJ': [
              `询问3个重要的人他们如何看待「${cardTitle}」这个主题`,
              `为身边的人做一件与「${cardTitle}」相关的小事，观察他们的反应`
            ],
            'ISTP': [
              `找一个与「${cardTitle}」相关的具体技能或工具，花30分钟去学习或实践`,
              `用手工制作一个小物件来象征这个主题的意义`
            ],
            'ISFP': [
              `用摄影、绘画或音乐等方式记录你对「${cardTitle}」的即时感受`,
              `在自然环境中独处20分钟，思考这个主题对你的个人意义`
            ],
            'ESTP': [
              `立即尝试一个与「${cardTitle}」相关的新活动或体验`,
              `与朋友一起做一件能体现这个主题的实际行动`
            ],
            'ESFP': [
              `用视频或照片记录你今天如何体现「${cardTitle}」这个主题`,
              `与朋友分享一个关于这个主题的个人故事，并听听他们的故事`
            ]
          };
          
          // 如果有具体的MBTI类型，使用对应建议；否则使用通用建议
          if (baseActions[mbtiType]) {
            return baseActions[mbtiType];
          }
          
          // 通用具体行动建议
          return [
            `设置手机提醒，在今天的3个不同时刻停下来问自己：我现在对「${cardTitle}」的感受是什么？`,
            `选择一个具体的小物件（石头、叶子、笔等）作为今天的「${cardTitle}」象征，放在显眼位置提醒自己`
          ];
        };

      const fallback = () => {
        const questions = [
          `这张卡牌想告诉你什么？此刻最触动你的点是什么？`,
          `如果把这张卡当作一个小提醒，你今天愿意观察/尝试的一个情境是什么？`
        ];
        
        // 使用A/B格式的兜底建议
        const actions = [
          getDefaultABAction('A', mbti, title),
          getDefaultABAction('B', mbti, title)
        ];
        
        return { questions, actions, provider: 'fallback' };
      };

      const respond = (payload) => {
        res.json({
          mbti,
          mood,
          card: { id: Number(cardId), title, meaning, keywords: kw },
          questions: payload.questions,
          actions: payload.actions,
          provider: payload.provider
        });
      };

      if (provider === 'dashscope' && process.env.DASHSCOPE_API_KEY && fetch) {
        // 动态 import 以避免未安装时报错
        (async () => {
          try {
            const sys = buildSystemPrompt();
            const usr = buildUserPrompt();
            console.log(`[Qwen] Calling API with model: ${model}`);
            
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
              return respond(fallback());
            }
            
            const data = await resp.json();
            console.log(`[Qwen] API response:`, data);
            
            const text = data?.choices?.[0]?.message?.content || '';
            if (!text) {
              console.warn('[Qwen] Empty response from API');
              return respond(fallback());
            }
            
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
                        console.log(`[Qwen] 收集到${label}类行动:`, cleanLine);
                        if (actions.length >= 2) {
                          inActions = false;
                        }
                      }
                    }
                  }
                }
              }
              
              console.log('[Qwen] 解析结果:', { questions, actions });
              
              // 限制数量：提问最多2条，行动建议最多2条
              return { 
                questions: questions.slice(0, 2), 
                actions: actions.slice(0, 2) 
              };
            };
            
            const { questions: qs, actions: acts } = parseQwenResponse(text);
            
            if (qs.length > 0) {
              console.log(`[Qwen] Generated ${qs.length} questions, ${acts.length} actions`);
              // 确保A/B两条行动建议
              const validatedActions = ensureABFormat(acts, mbti, title);
              return respond({ 
                questions: qs.slice(0, 2), 
                actions: validatedActions, 
                provider: 'dashscope:'+model 
              });
            }
            
            console.warn('[Qwen] No valid questions found in response');
            return respond(fallback());
          } catch (e) {
            console.error('[Qwen] API call failed:', e.message);
            return respond(fallback());
          }
        })();
        return;
      }

      // 无可用模型时回退
      return respond(fallback());
    });
  });
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

// 调试端点：统计A/B行动建议比例
app.get('/api/debug/action-stats', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 1000;
  
  db.all(
    `SELECT payload, created_at FROM events 
     WHERE type = 'action_selected' 
     ORDER BY created_at DESC 
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        console.error('获取事件失败:', err);
        return res.status(500).json({ error: '获取统计数据失败' });
      }
      
      const stats = {
        total: rows?.length || 0,
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
      
      rows?.forEach((event, index) => {
        try {
          const payload = JSON.parse(event.payload);
          
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
    }
  );
});

// 计算并更新起始关卡评分
app.post('/api/starter/recalculate', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  db.get('SELECT COUNT(*) AS cnt, SUM(CASE WHEN response_length>20 THEN 1 ELSE 0 END) AS qual FROM card_draws cd JOIN cards c ON cd.card_id=c.id WHERE cd.user_id=? AND IFNULL(c.is_starter,0)=1', [userId], (err, row) => {
    if (err) return res.status(500).json({ error: '统计失败' });
    const count = row?.cnt || 0;
    const qual = row?.qual || 0;
    // 互动分（每张10，最多40）
    const interact = Math.min(4, count) * 10;
    // 质量分（>20字计4，最多20）
    const quality = Math.min(5, qual) * 4;
    // 行动分：以事件中 action_confirm 计（简化：读取events表）
    db.get("SELECT COUNT(*) AS acts FROM events WHERE user_id=? AND type='action_confirm'", [userId], (e2, r2) => {
      const acts = r2?.acts || 0;
      const actionScore = Math.min(2, acts) * 10;
      // 回访分：是否存在次日回访
      db.get("SELECT COUNT(*) AS rv FROM events WHERE user_id=? AND type='return_next_day'", [userId], (e3, r3) => {
        const revisit = (r3?.rv || 0) > 0 ? 15 : 0;
        // 个人中心查看
        db.get("SELECT COUNT(*) AS pc FROM events WHERE user_id=? AND type='visit_personal_center'", [userId], (e4, r4) => {
          const pc = (r4?.pc || 0) > 0 ? 5 : 0;
          const score = interact + quality + actionScore + revisit + pc;
          const passed = score >= 60 ? 1 : 0;
          db.run('INSERT INTO user_progress (user_id, starter_passed, starter_score) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET starter_passed=?, starter_score=?',
            [userId, passed, score, passed, score], function(e5){
              if (e5) return res.status(500).json({ error: '更新评分失败' });
              res.json({ score, passed });
            });
        });
      });
    });
  });
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 提供前端页面（必须在所有API路由之后）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 每日重置翻卡次数的定时任务
function setupDailyReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0); // 设置为明天凌晨00:00:00

  const msUntilMidnight = tomorrow.getTime() - now.getTime();

  console.log(`[EchoInsight] 距离下次重置翻卡次数还有 ${Math.round(msUntilMidnight / 1000 / 60)} 分钟`);

  // 设置首次重置的定时器
  setTimeout(() => {
    resetDailyDrawCounts();
    
    // 设置每24小时重复执行
    setInterval(() => {
      resetDailyDrawCounts();
    }, 24 * 60 * 60 * 1000); // 24小时
  }, msUntilMidnight);
}

// 重置所有用户的每日翻卡次数
function resetDailyDrawCounts() {
  // 删除7天前的记录（保留最近7天的记录用于统计）
  const keepDays = 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  db.run('DELETE FROM daily_draws WHERE draw_date < ?', [cutoffStr], (err) => {
    if (err) {
      console.error('[EchoInsight] 清理旧翻卡记录失败:', err);
    } else {
      console.log(`[EchoInsight] 已清理 ${cutoffStr} 之前的翻卡记录`);
    }
  });

  console.log('[EchoInsight] 每日翻卡次数已重置（新的一天开始）');
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`Echo Insight 服务器运行在端口 ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 查看应用`);
  
  // 启动每日重置定时任务
  setupDailyReset();
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  db.close((err) => {
    if (err) {
      console.error('关闭数据库时出错:', err.message);
    } else {
      console.log('数据库连接已关闭');
    }
    process.exit(0);
  });
});
