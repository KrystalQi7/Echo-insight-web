// Supabase 配置文件
const SUPABASE_URL = 'https://klwfdawtiigivtiwinqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsd2ZkYXd0aWlnaXZ0aXdpbnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzcyNjYsImV4cCI6MjA3NzAxMzI2Nn0.glhK9EtrNz50mTBbEhsioqKqm24zLFt4HhN2VW8Aaks';

// 导出配置
module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY
};

// 如果使用ES6模块
export { SUPABASE_URL, SUPABASE_ANON_KEY };
