import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validateActiveMemberAccess } from '../lib/memberAccess';

interface LoginPageProps {
  initialError?: string | null;
}

const LoginPage: React.FC<LoginPageProps> = ({ initialError = null }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (!user?.id) {
        throw new Error('Nao foi possivel validar o usuario autenticado.');
      }

      const accessValidation = await validateActiveMemberAccess(user.id);

      if (!accessValidation.allowed) {
        await supabase.auth.signOut();
        setError(accessValidation.message);
        return;
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message === 'Invalid login credentials') {
        setError('E-mail ou senha incorretos. Tente novamente.');
      } else {
        setError(err.message || 'Falha ao fazer login. Verifique suas credenciais.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full overflow-y-auto bg-paper flex items-center justify-center p-6 md:p-12 font-sans">
      <div
        className="w-full max-w-[440px] bg-card rounded-card border border-line-soft p-8 md:p-12"
        style={{ boxShadow: '0 34px 64px -34px rgba(20,20,20,.45)' }}
      >
        <div className="flex flex-col items-center mb-10 space-y-5">
          <div className="w-16 h-16 bg-ink rounded-tile flex items-center justify-center overflow-hidden">
            <img
              src="/logo-worklivoo-fundo-preto.png"
              alt="Worklivoo"
              className="w-full h-full object-cover opacity-90"
            />
          </div>

          <div className="text-center space-y-1.5">
            <h1
              className="text-[23px] text-ink"
              style={{ fontWeight: 800, letterSpacing: '-.025em' }}
            >
              Bem-vindo de volta
            </h1>
            <p className="text-[13.5px] text-muted" style={{ fontWeight: 500 }}>
              Acesse o Sales Kotta com sua conta
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-tile bg-red-50 border border-red-100 flex items-start gap-3">
            <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" size={18} />
            <p className="text-[13px] text-red-600" style={{ fontWeight: 500 }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-[11.5px] text-muted mb-1.5"
              style={{ fontWeight: 700, letterSpacing: '.02em' }}
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              className="w-full h-[47px] bg-stone rounded-[10px] px-4 text-[14px] text-ink placeholder:text-muted-soft outline-none border transition-colors"
              style={{
                fontWeight: 500,
                borderColor: focusedField === 'email' ? 'var(--ink)' : 'transparent',
                transitionDuration: '.22s',
                transitionTimingFunction: 'var(--ease)',
              }}
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[11.5px] text-muted mb-1.5"
              style={{ fontWeight: 700, letterSpacing: '.02em' }}
            >
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                className="w-full h-[47px] bg-stone rounded-[10px] pl-4 pr-11 text-[14px] text-ink placeholder:text-muted-soft outline-none border transition-colors"
                style={{
                  fontWeight: 500,
                  borderColor: focusedField === 'password' ? 'var(--ink)' : 'transparent',
                  transitionDuration: '.22s',
                  transitionTimingFunction: 'var(--ease)',
                }}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-soft hover:text-ink transition-colors"
                style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group w-full mt-2 inline-flex items-center justify-center gap-[9px] h-[47px] rounded-[9px] text-[14px] text-ink bg-lime hover:bg-lime-deep hover:-translate-y-px disabled:opacity-70 disabled:hover:translate-y-0 relative overflow-hidden"
            style={{
              fontWeight: 700,
              transition: 'transform .22s var(--ease), background .22s var(--ease)',
            }}
          >
            <span
              className="inline-flex items-center gap-[9px] transition-opacity"
              style={{ opacity: isLoading ? 0 : 1, transitionDuration: '.22s' }}
            >
              Entrar
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-[3px]"
                style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
              />
            </span>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4.5 h-4.5 border-2 border-ink/20 border-t-ink rounded-full animate-spin" />
              </div>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
