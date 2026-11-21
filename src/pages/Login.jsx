import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const CAPTCHA_SITE_KEY = import.meta.env.VITE_CAPTCHA_SITE_KEY;
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const loadTurnstile = () =>
  new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let s = document.querySelector(`script[src="${TURNSTILE_SRC}"]`);
    if (!s) {
      s = document.createElement('script');
      s.src = TURNSTILE_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener('load', () => resolve(window.turnstile));
    s.addEventListener('error', reject);
  });

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef(null);
  const widgetId = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !captchaRef.current) return;
        widgetId.current = turnstile.render(captchaRef.current, {
          sitekey: CAPTCHA_SITE_KEY,
          theme: 'dark',
          callback: (token) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken(''),
        });
      })
      .catch(() => setError('Gagal memuat CAPTCHA'));
    return () => {
      cancelled = true;
      if (widgetId.current != null && window.turnstile) window.turnstile.remove(widgetId.current);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.app_metadata?.role === 'admin') navigate('/dashboard', { replace: true });
    });
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!captchaToken) {
      setError('Silakan selesaikan CAPTCHA');
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

    if (authError) {
      setError(authError.message || 'Login failed');
      if (window.turnstile && widgetId.current != null) window.turnstile.reset(widgetId.current);
      setCaptchaToken('');
    } else if (data.user?.app_metadata?.role !== 'admin') {
      await supabase.auth.signOut();
      setError('Akun ini bukan admin');
    } else {
      navigate('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary px-6">
      <div className="max-w-md w-full bg-[#0e0f24]/90 p-8 sm:p-10 rounded-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_32px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md border border-white/10">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white-100">Admin Login</h2>
          <p className="text-secondary mt-2 text-sm">Masuk untuk mengelola konten</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-400 p-3 rounded-xl mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-secondary mb-2 text-sm">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/[0.04] text-white-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all border border-white/10"
              placeholder="Masukkan email"
              required
            />
          </div>
          <div>
            <label className="block text-secondary mb-2 text-sm">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/[0.04] text-white-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all border border-white/10"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="flex justify-center my-4">
            <div ref={captchaRef}></div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
        
        <div className="mt-8 text-center">
          <button onClick={() => navigate('/')} className="text-secondary hover:text-white-100 text-sm transition-colors">
            ← Kembali ke Website
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
