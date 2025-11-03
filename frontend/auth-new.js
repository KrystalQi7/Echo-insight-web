// Echo Insight - 新的注册登录逻辑（邮箱密码优先）

(function() {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $all = (selector) => document.querySelectorAll(selector);
  
  function notify(message) {
    if (window.notify) {
      window.notify(message);
    } else {
      alert(message);
    }
  }

  async function api(url, options = {}) {
    const token = localStorage.getItem('ei_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers }
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  // 临时存储注册信息
  let pendingRegistration = null;

  // 邮箱格式验证
  function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // 显示输入框错误状态
  function showInputError(input, message) {
    input.classList.add('error');
    
    // 移除旧的错误提示
    const oldError = input.parentElement.querySelector('.error-message');
    if (oldError) oldError.remove();
    
    // 添加新的错误提示
    if (message) {
      const errorMsg = document.createElement('span');
      errorMsg.className = 'error-message';
      errorMsg.textContent = message;
      input.parentElement.appendChild(errorMsg);
    }
  }

  // 清除输入框错误状态
  function clearInputError(input) {
    input.classList.remove('error');
    const errorMsg = input.parentElement.querySelector('.error-message');
    if (errorMsg) errorMsg.remove();
  }

  // ============== 登录/注册表单 ==============
  function initAuthForm() {
    const form = $('#authForm');
    const emailInput = $('#authEmail');
    const passwordInput = $('#authPassword');
    
    if (!form) return;

    // 监听输入框变化，清除错误状态
    if (emailInput) {
      emailInput.addEventListener('input', () => clearInputError(emailInput));
    }
    if (passwordInput) {
      passwordInput.addEventListener('input', () => clearInputError(passwordInput));
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = emailInput?.value?.trim();
      const password = passwordInput?.value?.trim();
      const btn = $('#authSubmitBtn');

      // 清除所有错误状态
      if (emailInput) clearInputError(emailInput);
      if (passwordInput) clearInputError(passwordInput);

      // 验证邮箱格式
      if (!email) {
        showInputError(emailInput, '请输入邮箱');
        return;
      }
      
      if (!validateEmail(email)) {
        showInputError(emailInput, '请输入有效的电子邮件地址');
        return;
      }

      // 验证密码
      if (!password) {
        showInputError(passwordInput, '请输入密码');
        return;
      }

      if (password.length < 6) {
        showInputError(passwordInput, '密码至少需要6位');
        return;
      }

      btn.disabled = true;
      btn.querySelector('span').textContent = '处理中...';

      try {
        // 先尝试登录（老用户）
        try {
          const loginData = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
          });

          // 登录成功
          localStorage.setItem('ei_token', loginData.token);
          localStorage.setItem('ei_user', JSON.stringify(loginData.user));
          notify('登录成功');
          
          // 清理状态
          if (window.clearUserState) {
            window.clearUserState();
          }
          
          // 跳转到主应用
          if (window.showPage) {
            window.showPage('main-app');
          }
          if (window.loadDailyDrawInfo) {
            window.loadDailyDrawInfo();
          }
          
          return;
        } catch (loginError) {
          // 区分"用户不存在"和"密码错误"
          const errorMsg = loginError.message || '';
          
          // 如果是密码错误（用户已存在但密码不对），直接提示不进入注册流程
          if (errorMsg.includes('密码错误') || errorMsg.includes('密码不正确') || errorMsg.includes('password')) {
            showInputError(passwordInput, '密码错误');
            throw new Error('邮箱或密码不正确');
          }
          
          // 如果明确提示"用户不存在"，则进入注册流程
          if (errorMsg.includes('用户不存在') || errorMsg.includes('不存在')) {
            console.log('用户不存在，进入注册流程');
            
            // 保存注册信息
            pendingRegistration = { email, password };
            
            // 发送验证码
            await api('/api/auth/request-otp', {
              method: 'POST',
              body: JSON.stringify({ email })
            });
            
            // 显示邮箱验证页面
            showEmailVerification(email);
            return;
          }
          
          // 其他错误（如网络错误、服务器错误等），直接抛出
          throw loginError;
        }
      } catch (error) {
        notify(error.message || '操作失败');
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = '登录 / 注册';
      }
    });
  }

  // ============== 显示邮箱验证页面 ==============
  function showEmailVerification(email) {
    // 隐藏登录表单
    $('#authForm').style.display = 'none';
    
    // 显示验证页面（使用邮箱验证独立页面）
    if (window.showPage) {
      window.showPage('email-verification');
    }
    
    // 设置邮箱显示
    const emailDisplay = $('#verifyEmailDisplay');
    if (emailDisplay) {
      emailDisplay.textContent = email;
    }
    
    // 聚焦第一个输入框
    const firstInput = document.querySelector('.otp-digit');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 300);
    }
    
    // 启动倒计时
    startResendCountdown();
  }

  // ============== 6位数字输入框逻辑 ==============
  function initOtpInputs() {
    const inputs = $all('.otp-digit');
    if (!inputs.length) return;

    inputs.forEach((input, index) => {
      // 输入事件
      input.addEventListener('input', (e) => {
        const value = e.target.value;
        
        // 只允许数字
        if (!/^\d*$/.test(value)) {
          e.target.value = '';
          return;
        }

        // 添加填充样式
        if (value) {
          input.classList.add('filled');
          
          // 自动跳转到下一个输入框
          if (index < inputs.length - 1) {
            inputs[index + 1].focus();
          } else {
            // 最后一个输入框，自动验证
            setTimeout(() => {
              const code = getOtpCode();
              if (code.length === 6) {
                verifyEmailCode();
              }
            }, 100);
          }
        } else {
          input.classList.remove('filled');
        }
      });

      // 退格键处理
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          inputs[index - 1].focus();
        }
      });

      // 粘贴处理
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text').trim();
        
        // 只处理6位数字
        if (/^\d{6}$/.test(pasteData)) {
          pasteData.split('').forEach((char, i) => {
            if (inputs[i]) {
              inputs[i].value = char;
              inputs[i].classList.add('filled');
            }
          });
          
          // 聚焦最后一个
          inputs[5].focus();
          
          // 自动验证
          setTimeout(() => verifyEmailCode(), 100);
        }
      });
    });
  }

  // 获取6位验证码
  function getOtpCode() {
    const inputs = $all('.otp-digit');
    return Array.from(inputs).map(input => input.value).join('');
  }

  // 清空验证码输入
  function clearOtpInputs() {
    const inputs = $all('.otp-digit');
    inputs.forEach(input => {
      input.value = '';
      input.classList.remove('filled');
    });
    if (inputs[0]) inputs[0].focus();
  }

  // ============== 验证邮箱代码 ==============
  window.verifyEmailCode = async function() {
    if (!pendingRegistration) {
      notify('注册信息丢失，请返回重试');
      return;
    }

    const code = getOtpCode();
    if (code.length !== 6) {
      notify('请输入完整的6位验证码');
      return;
    }

    try {
      // 验证邮箱并注册
      const data = await api('/api/auth/register-with-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: pendingRegistration.email,
          password: pendingRegistration.password,
          code: code
        })
      });

      localStorage.setItem('ei_token', data.token);
      localStorage.setItem('ei_user', JSON.stringify(data.user));
      notify('注册成功');
      
      // 清理状态
      pendingRegistration = null;
      if (window.clearUserState) {
        window.clearUserState();
      }
      
      // 跳转到 MBTI 选择（新用户）
      if (window.showMbtiSelectionPage) {
        window.showMbtiSelectionPage(true); // 新用户，不能跳过
      } else if (window.showPage) {
        window.showPage('mbti-selection');
      }
      
    } catch (error) {
      notify(error.message || '验证失败');
      clearOtpInputs();
    }
  };

  // ============== 重发验证码 ==============
  let resendTimer = null;

  function startResendCountdown() {
    const btn = $('#resendCodeBtn');
    const countdown = $('#resendCountdown');
    if (!btn || !countdown) return;

    let seconds = 60;
    btn.disabled = true;
    
    resendTimer = setInterval(() => {
      seconds--;
      countdown.textContent = `${seconds}s`;
      
      if (seconds <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        countdown.textContent = '重新发送';
      }
    }, 1000);
  }

  function initResendCode() {
    const btn = $('#resendCodeBtn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      if (!pendingRegistration) {
        notify('请先输入邮箱和密码');
        return;
      }

      try {
        await api('/api/auth/request-otp', {
          method: 'POST',
          body: JSON.stringify({ email: pendingRegistration.email })
        });
        
        notify('验证码已重新发送');
        clearOtpInputs();
        startResendCountdown();
      } catch (error) {
        notify(error.message || '发送失败');
      }
    });
  }

  // ============== 忘记密码 ==============
  function initForgotPassword() {
    const link = $('#forgotPasswordLink');
    
    if (!link) return;

    // 显示忘记密码页面
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      if (window.showPage) {
        window.showPage('forgot-password');
      }
    });

    // 返回登录按钮
    const backBtn = $('#backToLoginBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (window.showPage) {
          window.showPage('auth');
        }
      });
    }

    // 发送重置验证码
    const sendBtn = $('#sendResetCodeBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const email = $('#resetEmail')?.value?.trim();
        if (!email) {
          notify('请输入邮箱');
          return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = '发送中...';

        try {
          await api('/api/auth/request-otp', {
            method: 'POST',
            body: JSON.stringify({ email })
          });
          
          notify('验证码已发送');
          
          // 60秒倒计时
          let countdown = 60;
          const timer = setInterval(() => {
            countdown--;
            sendBtn.textContent = `重新发送(${countdown})`;
            if (countdown <= 0) {
              clearInterval(timer);
              sendBtn.disabled = false;
              sendBtn.textContent = '发送验证码';
            }
          }, 1000);
        } catch (error) {
          notify(error.message || '发送失败');
          sendBtn.disabled = false;
          sendBtn.textContent = '发送验证码';
        }
      });
    }

    // 提交重置密码
    const form = $('#resetPasswordForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = $('#resetEmail')?.value?.trim();
      const code = $('#resetCode')?.value?.trim();
      const newPassword = $('#newPassword')?.value?.trim();
      const btn = form.querySelector('button[type="submit"]');

      if (!email || !code || !newPassword) {
        notify('请填写完整信息');
        return;
      }

      if (newPassword.length < 6) {
        notify('密码至少需要6位');
        return;
      }

      btn.disabled = true;
      btn.querySelector('span').textContent = '重置中...';

      try {
        await api('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email, code, newPassword })
        });
        
          notify('密码重置成功，请登录');
          
          // 返回登录页面
          if (window.showPage) {
            window.showPage('auth');
          }
          
          // 清空表单
          $('#resetEmail').value = '';
          $('#resetCode').value = '';
          $('#newPassword').value = '';
          
        } catch (error) {
          notify(error.message || '重置失败');
        } finally {
          btn.disabled = false;
          btn.querySelector('span').textContent = '重置密码';
        }
      });
    }
  }

  // ============== 返回登录页 ==============
  window.backToAuth = function() {
    pendingRegistration = null;

    if (window.showPage) {
      window.showPage('auth');
    }

    const authForm = $('#authForm');
    if (authForm) {
      authForm.style.display = 'block';
      if (typeof authForm.reset === 'function') {
        authForm.reset();
      }
    }

    const submitBtn = $('#authSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = false;
      const label = submitBtn.querySelector('span');
      if (label) label.textContent = '登录 / 注册';
    }

    const resendBtn = $('#resendCodeBtn');
    const countdown = $('#resendCountdown');
    if (resendBtn) {
      resendBtn.disabled = true;
    }
    if (countdown) {
      countdown.textContent = '60s';
    }
    if (resendTimer) {
      clearInterval(resendTimer);
      resendTimer = null;
    }

    // 清空验证码输入
    clearOtpInputs();
  };

  // ============== 初始化 ==============
  function init() {
    initAuthForm();
    initOtpInputs();
    initResendCode();
    initForgotPassword();
  }

  // DOM加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

