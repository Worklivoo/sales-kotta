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
    <div className="min-h-screen w-full bg-[#F6F6F6] flex items-center justify-center p-6 md:p-12 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-[#EBF57D]/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-gray-200/40 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[420px] bg-white rounded-[32px] p-8 md:p-12 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] relative z-10 transition-all duration-500 hover:shadow-[0_25px_70px_-12px_rgba(0,0,0,0.08)]">
        <div className="flex flex-col items-center mb-12 space-y-6">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg shadow-black/10 transition-transform duration-500 hover:scale-105">
            <img 
              src="/logo-worklivoo-fundo-preto.png" 
              alt="Worklivoo" 
              className="w-full h-full object-cover rounded-2xl opacity-90" 
            />
          </div>
          
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Bem-vindo de volta!</h1>
            <p className="text-sm text-gray-500 font-medium tracking-wide">
              Acesse o nosso sistema utilizando sua conta
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="group relative">
            <label 
              htmlFor="email" 
              className={`absolute left-0 transition-all duration-300 ease-out pointer-events-none ${
                focusedField === 'email' || email 
                  ? '-top-5 text-xs text-gray-500 font-medium' 
                  : 'top-3 text-gray-400 font-normal'
              }`}
            >
              Endereco de e-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              className="w-full bg-transparent border-b border-gray-200 py-3 text-gray-900 placeholder-transparent focus:outline-none focus:border-black transition-colors duration-300"
              placeholder="seu@email.com"
              required
            />
            <div 
              className={`absolute bottom-0 left-0 h-[1px] bg-black transition-all duration-500 ease-in-out ${
                focusedField === 'email' ? 'w-full' : 'w-0'
              }`} 
            />
          </div>

          <div className="group relative mt-8">
            <label 
              htmlFor="password" 
              className={`absolute left-0 transition-all duration-300 ease-out pointer-events-none ${
                focusedField === 'password' || password 
                  ? '-top-5 text-xs text-gray-500 font-medium' 
                  : 'top-3 text-gray-400 font-normal'
              }`}
            >
              Senha
            </label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              className="w-full bg-transparent border-b border-gray-200 py-3 text-gray-900 placeholder-transparent focus:outline-none focus:border-black transition-colors duration-300 pr-10"
              placeholder="••••••••"
              required
            />
            <div 
              className={`absolute bottom-0 left-0 h-[1px] bg-black transition-all duration-500 ease-in-out ${
                focusedField === 'password' ? 'w-full' : 'w-0'
              }`} 
            />
            
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-3 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
            >
              {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white h-14 rounded-xl font-medium tracking-wide flex items-center justify-center gap-2 group hover:bg-[#222] active:scale-[0.98] transition-all duration-300 shadow-xl shadow-black/5 overflow-hidden relative"
          >
            <span className={`transition-all duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
              Entrar
            </span>
            <ArrowRight 
              size={18} 
              className={`transition-all duration-300 transform ${
                isLoading ? 'translate-x-10 opacity-0' : 'group-hover:translate-x-1'
              }`} 
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </button>

        </form>
      </div>
    </div>
  );
};

export default LoginPage;
