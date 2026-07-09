import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, Lock, Mail, Phone, ShieldCheck, User2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ACCESS_PASSWORD = 'Worklivoo2026@';

interface FormData {
  nomeResponsavel: string;
  emailResponsavel: string;
  telefoneResponsavel: string;
  nomeEmpresa: string;
  cnpj: string;
  senhaAcesso: string;
}

const INITIAL_FORM: FormData = {
  nomeResponsavel: '',
  emailResponsavel: '',
  telefoneResponsavel: '',
  nomeEmpresa: '',
  cnpj: '',
  senhaAcesso: '',
};

const normalizeRazaoSocial = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const normalizePhoneDigits = (value: string) => {
  let digits = onlyDigits(value);

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 11);
};

const formatCnpj = (value: string) => {
  const digits = onlyDigits(value).slice(0, 14);

  if (!digits) {
    return '';
  }

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 5) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }

  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }

  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const formatPhone = (value: string) => {
  const digits = normalizePhoneDigits(value);

  if (!digits) {
    return '';
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const RegisterPage: React.FC = () => {
  const [accessPassword, setAccessPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      window.location.href = '/';
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const handleAccessSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (accessPassword === ACCESS_PASSWORD) {
      setIsUnlocked(true);
      setAccessError('');
      return;
    }

    setIsUnlocked(false);
    setAccessError('Acesso negado');
  };

  const handleInputChange =
    (field: keyof FormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue =
        field === 'cnpj'
          ? formatCnpj(rawValue)
          : field === 'telefoneResponsavel'
            ? formatPhone(rawValue)
            : rawValue;

      setFormData((current) => ({
        ...current,
        [field]: nextValue,
      }));
    };

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const email = formData.emailResponsavel.trim().toLowerCase();
      const nomeResponsavel = formData.nomeResponsavel.trim();
      const telefoneDigits = normalizePhoneDigits(formData.telefoneResponsavel);
      const telefoneResponsavel = `55${telefoneDigits}`;
      const nomeEmpresa = formData.nomeEmpresa.trim();
      const cnpj = onlyDigits(formData.cnpj);
      const senhaAcesso = formData.senhaAcesso;

      const razaoSocial = normalizeRazaoSocial(nomeEmpresa);

      if (!razaoSocial) {
        throw new Error('Informe um nome de empresa valido.');
      }

      if (cnpj.length !== 14) {
        throw new Error('Informe um CNPJ valido.');
      }

      if (telefoneDigits.length < 10 || telefoneDigits.length > 11) {
        throw new Error('Informe um telefone valido com DDD.');
      }

      const {
        data: { user },
        error: signUpError,
      } = await supabase.auth.signUp({
        email,
        password: senhaAcesso,
      });

      if (signUpError) {
        throw signUpError;
      }

      if (!user?.id) {
        throw new Error('Nao foi possivel obter o ID do usuario criado.');
      }

      const empresaId = user.id;

      const { error: empresaError } = await supabase.from('sales_empresa').insert({
        empresa_id: empresaId,
        razao_social: razaoSocial,
        cnpj,
        nome_responsavel: nomeResponsavel,
        email_responsavel: email,
        telefone_responsavel: telefoneResponsavel,
      });

      if (empresaError) {
        throw empresaError;
      }

      const { error: membroError } = await supabase.from('sales_membros_empresa').insert({
        membro_id: empresaId,
        empresa_id: empresaId,
        nome: nomeResponsavel,
        email,
        telefone: telefoneResponsavel,
        cargo: 'ADMIN',
      });

      if (membroError) {
        throw membroError;
      }

      await supabase.auth.signOut();
      setFormData(INITIAL_FORM);
      setSuccessMessage('Cadastro realizado com sucesso. Redirecionando para o login...');
    } catch (error: any) {
      console.error('Erro ao cadastrar empresa:', error);
      setFormError(error?.message || 'Nao foi possivel concluir o cadastro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f3f3f3] flex items-center justify-center p-6">
      <div
        className={`w-full rounded-[28px] border border-black/5 bg-[#f8f8f8] px-8 py-10 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:py-12 ${
          isUnlocked ? 'max-w-[860px] sm:px-12' : 'max-w-[520px] sm:px-10'
        }`}
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-8 h-16 w-16 overflow-hidden rounded-2xl shadow-[0_10px_20px_rgba(0,0,0,0.08)]">
            <img
              src="/logo-worklivoo-fundo-preto.png"
              alt="Worklivoo"
              className="h-full w-full rounded-2xl object-cover"
            />
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
            {isUnlocked ? 'Cadastrar Empresa' : 'Area Restrita'}
          </h1>
          <p className="mt-3 text-lg text-slate-500">
            {isUnlocked
              ? 'Preencha os dados para criar o acesso inicial da empresa'
              : 'Digite a chave de acesso para continuar'}
          </p>
        </div>

        {!isUnlocked ? (
          <form onSubmit={handleAccessSubmit} className="mt-10">
            <div className="relative">
              <Lock
                size={20}
                className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="password"
                value={accessPassword}
                onChange={(event) => setAccessPassword(event.target.value)}
                placeholder="Senha de acesso"
                className="h-16 w-full rounded-2xl border border-slate-200 bg-[#f1f3f6] pl-14 pr-5 text-base text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                autoComplete="off"
              />
            </div>

            {accessError ? (
              <p className="mt-4 text-sm font-medium text-red-600">{accessError}</p>
            ) : null}

            <button
              type="submit"
              className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black text-base font-semibold text-white transition hover:bg-[#171717]"
            >
              Acessar Painel
              <ArrowRight size={18} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="mt-10 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="relative">
                <User2
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={formData.nomeResponsavel}
                  onChange={handleInputChange('nomeResponsavel')}
                  placeholder="Nome do Responsavel"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f1f3f6] pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                  required
                />
              </div>

              <div className="relative">
                <Mail
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="email"
                  value={formData.emailResponsavel}
                  onChange={handleInputChange('emailResponsavel')}
                  placeholder="Email do Responsavel"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f1f3f6] pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                  required
                />
              </div>

              <div className="relative">
                <Phone
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={formData.telefoneResponsavel}
                  onChange={handleInputChange('telefoneResponsavel')}
                  placeholder="Telefone do Responsavel"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f1f3f6] pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                  required
                  inputMode="tel"
                />
              </div>

              <div className="relative">
                <Building2
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={formData.nomeEmpresa}
                  onChange={handleInputChange('nomeEmpresa')}
                  placeholder="Nome da Empresa"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f1f3f6] pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                  required
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="relative">
                <Building2
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={handleInputChange('cnpj')}
                  placeholder="CNPJ da Empresa"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f1f3f6] pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                  required
                  inputMode="numeric"
                />
              </div>

              <div className="relative">
                <ShieldCheck
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="password"
                  value={formData.senhaAcesso}
                  onChange={handleInputChange('senhaAcesso')}
                  placeholder="Senha de Acesso"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f1f3f6] pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {formError ? (
              <p className="text-sm font-medium text-red-600">{formError}</p>
            ) : null}

            {successMessage ? (
              <p className="text-sm font-medium text-emerald-600">{successMessage}</p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || !!successMessage}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black text-base font-semibold text-white transition hover:bg-[#171717] disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? 'Cadastrando...' : 'Criar Cadastro'}
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        <div className="mt-8 border-t border-slate-200 pt-8 text-center text-sm leading-7 text-slate-400">
          <p>Protegido por criptografia de ponta a ponta.</p>
          <p>Sales Kotta</p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
