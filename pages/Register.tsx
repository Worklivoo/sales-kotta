import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, Lock, Mail, Phone, ShieldCheck, User2 } from 'lucide-react';

const ACCESS_PASSWORD = import.meta.env.VITE_REGISTER_ACCESS_PASSWORD || '';

interface FormData {
  nomeResponsavel: string;
  emailResponsavel: string;
  telefoneResponsavel: string;
  nomeEmpresa: string;
  cnpj: string;
  senhaConta: string;
}

const INITIAL_FORM: FormData = {
  nomeResponsavel: '',
  emailResponsavel: '',
  telefoneResponsavel: '',
  nomeEmpresa: '',
  cnpj: '',
  senhaConta: '',
};

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
    setAccessError('Acesso negado.');
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
      const response = await fetch('/api/register-company', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessPassword,
          nomeResponsavel: formData.nomeResponsavel,
          emailResponsavel: formData.emailResponsavel,
          telefoneResponsavel: formData.telefoneResponsavel,
          nomeEmpresa: formData.nomeEmpresa,
          cnpj: formData.cnpj,
          senhaConta: formData.senhaConta,
        }),
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(responseBody?.error || 'Nao foi possivel concluir o cadastro.');
      }

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
    <div className="flex min-h-screen w-full items-center justify-center bg-paper p-6 font-sans">
      <div
        className={`w-full rounded-card border border-line-soft bg-card px-8 py-10 sm:py-12 ${
          isUnlocked ? 'max-w-[860px] sm:px-12' : 'max-w-[520px] sm:px-10'
        }`}
        style={{ boxShadow: '0 24px 70px -30px rgba(20,20,20,.35)' }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-8 h-16 w-16 overflow-hidden rounded-panel">
            <img
              src="/logo-worklivoo-fundo-preto.png"
              alt="Worklivoo"
              className="h-full w-full object-cover"
            />
          </div>

          <h1 className="text-[28px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
            {isUnlocked ? 'Cadastrar Empresa' : 'Área Restrita'}
          </h1>
          <p className="mt-2 text-[14px] text-muted" style={{ fontWeight: 500 }}>
            {isUnlocked
              ? 'Preencha os dados para criar o acesso inicial da empresa'
              : 'Digite a chave de acesso para continuar'}
          </p>
        </div>

        {!isUnlocked ? (
          <form onSubmit={handleAccessSubmit} className="mt-10">
            <div className="relative">
              <Lock
                size={18}
                className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted-soft"
              />
              <input
                type="password"
                value={accessPassword}
                onChange={(event) => setAccessPassword(event.target.value)}
                placeholder="Senha de acesso"
                className="h-14 w-full rounded-pill border border-line bg-paper pl-14 pr-5 text-[14px] text-ink outline-none transition-colors focus:border-ink/25"
                style={{ fontWeight: 500, transitionDuration: '.22s' }}
                autoComplete="off"
              />
            </div>

            {accessError ? (
              <p className="mt-4 text-[13px] text-red-600" style={{ fontWeight: 600 }}>
                {accessError}
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-lime text-[14px] text-ink transition-opacity hover:opacity-90"
              style={{ fontWeight: 800 }}
            >
              Acessar Painel
              <ArrowRight size={18} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="mt-10 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative">
                <User2
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-soft"
                />
                <input
                  type="text"
                  value={formData.nomeResponsavel}
                  onChange={handleInputChange('nomeResponsavel')}
                  placeholder="Nome do responsável"
                  className="h-12 w-full rounded-tile border border-line bg-paper pl-11 pr-4 text-[13px] text-ink outline-none transition-colors focus:border-ink/25"
                  style={{ fontWeight: 500, transitionDuration: '.22s' }}
                  required
                />
              </div>

              <div className="relative">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-soft"
                />
                <input
                  type="email"
                  value={formData.emailResponsavel}
                  onChange={handleInputChange('emailResponsavel')}
                  placeholder="E-mail do responsável"
                  className="h-12 w-full rounded-tile border border-line bg-paper pl-11 pr-4 text-[13px] text-ink outline-none transition-colors focus:border-ink/25"
                  style={{ fontWeight: 500, transitionDuration: '.22s' }}
                  required
                />
              </div>

              <div className="relative">
                <Phone
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-soft"
                />
                <input
                  type="text"
                  value={formData.telefoneResponsavel}
                  onChange={handleInputChange('telefoneResponsavel')}
                  placeholder="Telefone do responsável"
                  className="h-12 w-full rounded-tile border border-line bg-paper pl-11 pr-4 text-[13px] text-ink outline-none transition-colors focus:border-ink/25"
                  style={{ fontWeight: 500, transitionDuration: '.22s' }}
                  required
                  inputMode="tel"
                />
              </div>

              <div className="relative">
                <Building2
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-soft"
                />
                <input
                  type="text"
                  value={formData.nomeEmpresa}
                  onChange={handleInputChange('nomeEmpresa')}
                  placeholder="Nome da empresa"
                  className="h-12 w-full rounded-tile border border-line bg-paper pl-11 pr-4 text-[13px] text-ink outline-none transition-colors focus:border-ink/25"
                  style={{ fontWeight: 500, transitionDuration: '.22s' }}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative">
                <Building2
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-soft"
                />
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={handleInputChange('cnpj')}
                  placeholder="CNPJ da empresa"
                  className="h-12 w-full rounded-tile border border-line bg-paper pl-11 pr-4 text-[13px] text-ink outline-none transition-colors focus:border-ink/25"
                  style={{ fontWeight: 500, transitionDuration: '.22s' }}
                  required
                  inputMode="numeric"
                />
              </div>

              <div className="relative">
                <ShieldCheck
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-soft"
                />
                <input
                  type="password"
                  value={formData.senhaConta}
                  onChange={handleInputChange('senhaConta')}
                  placeholder="Senha da conta"
                  className="h-12 w-full rounded-tile border border-line bg-paper pl-11 pr-4 text-[13px] text-ink outline-none transition-colors focus:border-ink/25"
                  style={{ fontWeight: 500, transitionDuration: '.22s' }}
                  required
                  minLength={6}
                />
              </div>
            </div>

            {formError ? (
              <div className="rounded-tile border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600" style={{ fontWeight: 600 }}>
                {formError}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-tile border border-lime bg-lime/15 px-4 py-3 text-[13px] text-ink" style={{ fontWeight: 600 }}>
                {successMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || !!successMessage}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-lime text-[14px] text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontWeight: 800 }}
            >
              {isSubmitting ? 'Cadastrando...' : 'Criar Cadastro'}
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        <div className="mt-8 border-t border-line-soft pt-6 text-center text-[12px] leading-6 text-muted-soft" style={{ fontWeight: 500 }}>
          <p>Protegido por criptografia de ponta a ponta.</p>
          <p>Sales Kotta</p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
