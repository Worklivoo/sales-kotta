import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ClipboardCheck,
  Crown,
  Database,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Pencil,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Split,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ImportarPlanilhaModal from '../../components/ImportarPlanilhaModal';

type BudgetMode = 'AUTO' | 'SEMI';
type QuoteRuleLevel = 'OBRIGATORIO' | 'DESEJAVEL';

interface MemberAccountRecord {
  membro_id: string;
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  status: string | null;
  cargo: string | null;
  modo_orcamento: BudgetMode | null;
  orcamento_novos_clientes: boolean | null;
  canal_email: Record<string, unknown> | null;
}

interface AccountFormState {
  nome: string;
  telefone: string;
}

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

interface PasswordVisibilityState {
  currentPassword: boolean;
  newPassword: boolean;
  confirmNewPassword: boolean;
}

interface QuoteRuleValue {
  ativo: boolean;
  nivel: QuoteRuleLevel;
  descricao: string;
  created_at?: string | null;
}

interface QuoteRuleItem extends QuoteRuleValue {
  name: string;
  createdAt: string;
}

interface QuoteRuleFormState {
  originalName: string;
  name: string;
  nivel: QuoteRuleLevel;
  descricao: string;
}

interface CompanyPlanRecord {
  plano: string | null;
  plano_ciclo: string | null;
  valor_mensal: number | string | null;
  plano_status: string | null;
  enviar_proposta: boolean | null;
  regras_cotacao: unknown;
  integracao_produtos: Record<string, unknown> | null;
  integracao_clientes: Record<string, unknown> | null;
}

const generalShortcutItems = [
  {
    label: 'Alterar senha',
    icon: KeyRound,
    action: 'change-password',
  },
  {
    label: 'Visualizar termos',
    icon: FileText,
    action: 'view-terms',
  },
] as const;

const SHOW_TERMS_SHORTCUT = false;
const SHOW_USER_PLAN_SECTION = false;

const QUOTE_RULE_LEVEL_OPTIONS: QuoteRuleLevel[] = ['OBRIGATORIO', 'DESEJAVEL'];

const PROTECTED_QUOTE_RULE_KEYS: readonly string[] = ['Item'];

const isProtectedQuoteRule = (ruleName: string) =>
  PROTECTED_QUOTE_RULE_KEYS.includes(ruleName.trim());

const splitQuoteRulesByProtection = (rules: QuoteRuleItem[]) =>
  rules.reduce<{ protectedRules: QuoteRuleItem[]; visibleRules: QuoteRuleItem[] }>(
    (accumulator, rule) => {
      if (isProtectedQuoteRule(rule.name)) {
        accumulator.protectedRules.push(rule);
      } else {
        accumulator.visibleRules.push(rule);
      }

      return accumulator;
    },
    { protectedRules: [], visibleRules: [] },
  );

const formatBudgetModeLabel = (value: BudgetMode | null) => {
  if (value === 'SEMI') {
    return 'Semi-automático';
  }

  if (value === 'AUTO') {
    return 'Automático';
  }

  return '-';
};

const formatMemberStatusLabel = (value: string | null) => {
  if (value === 'ATIVO') {
    return 'Ativado';
  }

  if (value === 'INATIVO') {
    return 'Desativado';
  }

  return '-';
};

const formatEnumLabel = (value: string | null) => {
  if (!value) {
    return '-';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatCurrency = (value: number | string | null) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const numericValue = typeof value === 'number' ? value : Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(numericValue);
};

const formatPhone = (value: string | null) => {
  if (!value) {
    return '-';
  }

  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return value;
};

const normalizePhoneDigits = (value: string) => {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 11);
};

const formatPhoneInput = (value: string) => {
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

const createEmptyQuoteRuleForm = (): QuoteRuleFormState => ({
  originalName: '',
  name: '',
  nivel: 'OBRIGATORIO',
  descricao: '',
});

const isQuoteRuleLevel = (value: unknown): value is QuoteRuleLevel =>
  value === 'OBRIGATORIO' || value === 'DESEJAVEL';

const createFallbackQuoteRuleCreatedAt = (index: number) => new Date(index).toISOString();

const sortQuoteRules = (rules: QuoteRuleItem[]) =>
  [...rules].sort((left, right) => {
    const leftTimestamp = Date.parse(left.createdAt);
    const rightTimestamp = Date.parse(right.createdAt);

    if (!Number.isNaN(leftTimestamp) && !Number.isNaN(rightTimestamp) && leftTimestamp !== rightTimestamp) {
      return leftTimestamp - rightTimestamp;
    }

    return left.name.localeCompare(right.name, 'pt-BR');
  });

const parseQuoteRules = (value: unknown): QuoteRuleItem[] => {
  if (!value) {
    return [];
  }

  let rawValue = value;

  if (typeof rawValue === 'string') {
    try {
      rawValue = JSON.parse(rawValue);
    } catch {
      return [];
    }
  }

  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return [];
  }

  const mappedRules = Object.entries(rawValue as Record<string, unknown>)
    .map(([name, ruleConfig], index) => {
      if (!ruleConfig || typeof ruleConfig !== 'object' || Array.isArray(ruleConfig)) {
        return null;
      }

      const typedRuleConfig = ruleConfig as Record<string, unknown>;
      const createdAt =
        typeof typedRuleConfig.created_at === 'string' && !Number.isNaN(Date.parse(typedRuleConfig.created_at))
          ? typedRuleConfig.created_at
          : createFallbackQuoteRuleCreatedAt(index);

      return {
        name,
        ativo: typeof typedRuleConfig.ativo === 'boolean' ? typedRuleConfig.ativo : true,
        nivel: isQuoteRuleLevel(typedRuleConfig.nivel) ? typedRuleConfig.nivel : 'OBRIGATORIO',
        descricao:
          typeof typedRuleConfig.descricao === 'string' ? typedRuleConfig.descricao : '',
        createdAt,
      } satisfies QuoteRuleItem;
    })
    .filter((rule): rule is QuoteRuleItem => Boolean(rule));

  return sortQuoteRules(mappedRules);
};

const serializeQuoteRules = (rules: QuoteRuleItem[]) =>
  rules.reduce<Record<string, QuoteRuleValue>>((accumulator, rule) => {
    const trimmedName = rule.name.trim();

    if (!trimmedName) {
      return accumulator;
    }

    accumulator[trimmedName] = {
      ativo: rule.ativo,
      nivel: rule.nivel,
      descricao: rule.descricao.trim(),
      created_at: rule.createdAt,
    };

    return accumulator;
  }, {});

const GeralTab: React.FC = () => {
  const [memberAccount, setMemberAccount] = useState<MemberAccountRecord | null>(null);
  const [isAccountLoading, setIsAccountLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountSaveError, setAccountSaveError] = useState<string | null>(null);
  const [accountSaveSuccess, setAccountSaveSuccess] = useState<string | null>(null);
  const [companyPlan, setCompanyPlan] = useState<CompanyPlanRecord | null>(null);
  const [isImportProdutosOpen, setIsImportProdutosOpen] = useState(false);
  const [isImportClientesOpen, setIsImportClientesOpen] = useState(false);
  const [recarregarEmpresa, setRecarregarEmpresa] = useState(0);
  const [isCompanyPlanLoading, setIsCompanyPlanLoading] = useState(false);
  const [companyPlanError, setCompanyPlanError] = useState<string | null>(null);
  const [isQuoteRulesModalOpen, setIsQuoteRulesModalOpen] = useState(false);
  const [isQuoteRuleEditorModalOpen, setIsQuoteRuleEditorModalOpen] = useState(false);
  const [quoteRulesDraft, setQuoteRulesDraft] = useState<QuoteRuleItem[]>([]);
  const [quoteRuleForm, setQuoteRuleForm] = useState<QuoteRuleFormState>(createEmptyQuoteRuleForm());
  const [isSavingQuoteRules, setIsSavingQuoteRules] = useState(false);
  const [quoteRulesError, setQuoteRulesError] = useState<string | null>(null);
  const [isSavingBudgetMode, setIsSavingBudgetMode] = useState(false);
  const [budgetModeError, setBudgetModeError] = useState<string | null>(null);
  const [isSavingNewClientsBudget, setIsSavingNewClientsBudget] = useState(false);
  const [newClientsBudgetError, setNewClientsBudgetError] = useState<string | null>(null);
  const [isSavingSendProposal, setIsSavingSendProposal] = useState(false);
  const [sendProposalError, setSendProposalError] = useState<string | null>(null);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSaveError, setPasswordSaveError] = useState<string | null>(null);
  const [passwordSaveSuccess, setPasswordSaveSuccess] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormState>({
    nome: '',
    telefone: '',
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [passwordVisibility, setPasswordVisibility] = useState<PasswordVisibilityState>({
    currentPassword: false,
    newPassword: false,
    confirmNewPassword: false,
  });
  const isAdminMember = memberAccount?.cargo === 'ADMIN';

  useEffect(() => {
    let isMounted = true;

    const loadMemberAccount = async () => {
      setIsAccountLoading(true);
      setAccountError(null);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user?.id) {
          throw new Error('Não foi possível identificar o usuário autenticado.');
        }

        const { data, error } = await supabase
          .from('sales_membros_v2')
          .select(
            'membro_id, empresa_id, nome, email, telefone, status, cargo, modo_orcamento, orcamento_novos_clientes, canal_email',
          )
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setMemberAccount((data as MemberAccountRecord | null) ?? null);
      } catch (error: any) {
        console.error('Erro ao carregar dados da conta:', error);

        if (!isMounted) {
          return;
        }

        setMemberAccount(null);
        setAccountError(error?.message || 'Não foi possível carregar os dados da conta.');
      } finally {
        if (isMounted) {
          setIsAccountLoading(false);
        }
      }
    };

    loadMemberAccount();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadCompanyPlan = async () => {
      if (!isAdminMember || !memberAccount?.empresa_id) {
        setCompanyPlan(null);
        setCompanyPlanError(null);
        setIsCompanyPlanLoading(false);
        return;
      }

      setIsCompanyPlanLoading(true);
      setCompanyPlanError(null);

      try {
        const { data, error } = await supabase
          .from('sales_empresas_v2')
          .select(
            'plano, plano_ciclo, valor_mensal, plano_status, enviar_proposta, regras_cotacao, integracao_produtos, integracao_clientes',
          )
          .eq('empresa_id', memberAccount.empresa_id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setCompanyPlan((data as CompanyPlanRecord | null) ?? null);
      } catch (error: any) {
        console.error('Erro ao carregar dados do plano:', error);

        if (!isMounted) {
          return;
        }

        setCompanyPlan(null);
        setCompanyPlanError(error?.message || 'Não foi possível carregar os dados do plano.');
      } finally {
        if (isMounted) {
          setIsCompanyPlanLoading(false);
        }
      }
    };

    loadCompanyPlan();

    return () => {
      isMounted = false;
    };
  }, [isAdminMember, memberAccount?.empresa_id, recarregarEmpresa]);

  const memberStatusLabel = formatMemberStatusLabel(memberAccount?.status || null);
  const memberStatusClassName =
    memberAccount?.status === 'ATIVO'
      ? 'border-lime bg-lime/15 text-ink'
      : 'border-line bg-card text-muted';
  const memberName = memberAccount?.nome?.trim() || '-';
  const memberEmail = memberAccount?.email?.trim() || '-';
  const memberPhone = formatPhone(memberAccount?.telefone || null);
  const memberId = memberAccount?.membro_id?.trim() || '-';
  const memberIntegrationEmail =
    (typeof memberAccount?.canal_email?.email_integracao === 'string'
      ? (memberAccount.canal_email.email_integracao as string).trim()
      : '') || '-';
  const memberBudgetMode = memberAccount?.modo_orcamento ?? null;
  const isAutomaticBudgetMode = memberBudgetMode === 'AUTO';
  const budgetModeLabel = formatBudgetModeLabel(memberBudgetMode);
  const allowBudgetForNewClients = memberAccount?.orcamento_novos_clientes === true;
  const newClientsBudgetLabel = allowBudgetForNewClients ? 'Ativado' : 'Desativado';
  const newClientsBudgetStatusClassName = allowBudgetForNewClients
    ? 'border-lime bg-lime/15 text-ink'
    : 'border-line bg-paper text-muted';
  const isSendProposalEnabled = companyPlan?.enviar_proposta === true;
  const sendProposalLabel = isSendProposalEnabled ? 'Ativado' : 'Desativado';
  const sendProposalStatusClassName = isSendProposalEnabled
    ? 'border-lime bg-lime/15 text-ink'
    : 'border-line bg-paper text-muted';
  const companyPlanName = companyPlan?.plano?.trim() || '-';
  const companyPlanCycle = formatEnumLabel(companyPlan?.plano_ciclo || null);
  const companyPlanPrice = formatCurrency(companyPlan?.valor_mensal ?? null);
  const companyPlanStatus = formatEnumLabel(companyPlan?.plano_status || null);
  const companySourceType =
    typeof companyPlan?.integracao_produtos?.tipo === 'string'
      ? (companyPlan.integracao_produtos.tipo as string)
      : null;
  const companySourceLink =
    (typeof companyPlan?.integracao_produtos?.url === 'string'
      ? (companyPlan.integracao_produtos.url as string).trim()
      : '') || '';
  const companySourceArquivo =
    typeof companyPlan?.integracao_produtos?.nome_arquivo === 'string'
      ? (companyPlan.integracao_produtos.nome_arquivo as string)
      : '';
  const companySourceImportadoEm = (() => {
    const bruto = companyPlan?.integracao_produtos?.importado_em;
    if (typeof bruto !== 'string') return '';
    const data = new Date(bruto);
    return Number.isNaN(data.getTime())
      ? ''
      : data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  })();
  const companySourceStatusLabel = companySourceType ? formatEnumLabel(companySourceType) : '-';
  const hasCompanySourceConfigured = Boolean(companySourceType) || Boolean(companySourceLink);
  const companyClientSourceLink =
    (typeof companyPlan?.integracao_clientes?.url === 'string'
      ? (companyPlan.integracao_clientes.url as string).trim()
      : '') || '';
  const hasCompanyClientSourceConfigured = Boolean(companyClientSourceLink) || Boolean(companyPlan?.integracao_clientes?.tipo);
  const companyClientSourceTipo =
    typeof companyPlan?.integracao_clientes?.tipo === 'string'
      ? (companyPlan.integracao_clientes.tipo as string)
      : '';
  const companyClientSourceArquivo =
    typeof companyPlan?.integracao_clientes?.nome_arquivo === 'string'
      ? (companyPlan.integracao_clientes.nome_arquivo as string)
      : '';
  const companyClientSourceImportadoEm = (() => {
    const bruto = companyPlan?.integracao_clientes?.importado_em;
    if (typeof bruto !== 'string') return '';
    const data = new Date(bruto);
    return Number.isNaN(data.getTime())
      ? ''
      : data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  })();
  const companyClientSourceStatusLabel = companyClientSourceTipo
    ? formatEnumLabel(companyClientSourceTipo)
    : hasCompanyClientSourceConfigured
      ? 'API'
      : '-';
  const companyQuoteRules = useMemo(
    () => parseQuoteRules(companyPlan?.regras_cotacao),
    [companyPlan?.regras_cotacao],
  );
  const splitCompanyQuoteRules = useMemo(
    () => splitQuoteRulesByProtection(companyQuoteRules),
    [companyQuoteRules],
  );
  const protectedCompanyQuoteRules = splitCompanyQuoteRules.protectedRules;
  const visibleCompanyQuoteRules = splitCompanyQuoteRules.visibleRules;
  const activeVisibleCompanyQuoteRules = useMemo(
    () => visibleCompanyQuoteRules.filter((rule) => rule.ativo),
    [visibleCompanyQuoteRules],
  );
  const quoteRulesPreview = activeVisibleCompanyQuoteRules.slice(0, 3);
  const isEditingQuoteRule = Boolean(quoteRuleForm.originalName);
  const hasQuoteRulesChanges =
    JSON.stringify(serializeQuoteRules(sortQuoteRules(visibleCompanyQuoteRules))) !==
    JSON.stringify(serializeQuoteRules(sortQuoteRules(quoteRulesDraft)));
  const companyPlanStatusClassName =
    companyPlan?.plano_status === 'ATIVO'
      ? 'border-lime bg-lime/15 text-ink'
      : companyPlan?.plano_status === 'EM_ATRASO'
        ? 'border-orange-200 bg-orange-50 text-orange-700'
        : 'border-line bg-card text-muted';

  const handleStartEditingAccount = () => {
    setAccountSaveError(null);
    setAccountSaveSuccess(null);
    setAccountForm({
      nome: memberAccount?.nome?.trim() || '',
      telefone: formatPhoneInput(memberAccount?.telefone || ''),
    });
    setIsEditingAccount(true);
  };

  const handleAccountInputChange =
    (field: keyof AccountFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue = field === 'telefone' ? formatPhoneInput(rawValue) : rawValue;

      setAccountForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
    };

  const handleSaveAccount = async () => {
    if (!memberAccount?.membro_id) {
      setAccountSaveError('Não foi possível identificar o usuário para salvar.');
      return;
    }

    const normalizedName = accountForm.nome.trim();
    const normalizedPhoneDigits = normalizePhoneDigits(accountForm.telefone);

    if (!normalizedName) {
      setAccountSaveError('Informe o nome do usuário.');
      return;
    }

    if (normalizedPhoneDigits.length < 10 || normalizedPhoneDigits.length > 11) {
      setAccountSaveError('Informe um telefone válido com DDD.');
      return;
    }

    setIsSavingAccount(true);
    setAccountSaveError(null);
    setAccountSaveSuccess(null);

    try {
      const telefone = `55${normalizedPhoneDigits}`;
      const { error } = await supabase
        .from('sales_membros_v2')
        .update({
          nome: normalizedName,
          telefone,
        })
        .eq('membro_id', memberAccount.membro_id);

      if (error) {
        throw error;
      }

      setMemberAccount((current) =>
        current
          ? {
              ...current,
              nome: normalizedName,
              telefone,
            }
          : current,
      );
      setIsEditingAccount(false);
      setAccountSaveSuccess('Dados da conta atualizados com sucesso.');
    } catch (error: any) {
      console.error('Erro ao salvar dados da conta:', error);
      setAccountSaveError(error?.message || 'Não foi possível salvar os dados da conta.');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleToggleBudgetMode = async () => {
    if (!memberAccount?.membro_id) {
      setBudgetModeError('Não foi possível identificar o usuário para atualizar o modo.');
      return;
    }

    const nextMode: BudgetMode = memberAccount.modo_orcamento === 'AUTO' ? 'SEMI' : 'AUTO';

    setIsSavingBudgetMode(true);
    setBudgetModeError(null);

    try {
      const { error } = await supabase
        .from('sales_membros_v2')
        .update({
          modo_orcamento: nextMode,
        })
        .eq('membro_id', memberAccount.membro_id);

      if (error) {
        throw error;
      }

      setMemberAccount((current) =>
        current
          ? {
              ...current,
              modo_orcamento: nextMode,
            }
          : current,
      );
    } catch (error: any) {
      console.error('Erro ao atualizar modo do orçamento:', error);
      setBudgetModeError(error?.message || 'Não foi possível atualizar o modo do orçamento.');
    } finally {
      setIsSavingBudgetMode(false);
    }
  };

  const handleToggleNewClientsBudget = async () => {
    if (!memberAccount?.membro_id) {
      setNewClientsBudgetError('Não foi possível identificar o usuário para atualizar a configuração.');
      return;
    }

    const nextValue = !(memberAccount.orcamento_novos_clientes === true);

    setIsSavingNewClientsBudget(true);
    setNewClientsBudgetError(null);

    try {
      const { error } = await supabase
        .from('sales_membros_v2')
        .update({
          orcamento_novos_clientes: nextValue,
        })
        .eq('membro_id', memberAccount.membro_id);

      if (error) {
        throw error;
      }

      setMemberAccount((current) =>
        current
          ? {
              ...current,
              orcamento_novos_clientes: nextValue,
            }
          : current,
      );
    } catch (error: any) {
      console.error('Erro ao atualizar orçamento para novos clientes:', error);
      setNewClientsBudgetError(
        error?.message || 'Não foi possível atualizar o orçamento para novos clientes.',
      );
    } finally {
      setIsSavingNewClientsBudget(false);
    }
  };

  const handleToggleSendProposal = async () => {
    if (!memberAccount?.empresa_id) {
      setSendProposalError('Não foi possível identificar a empresa para atualizar a configuração.');
      return;
    }

    const nextValue = !(companyPlan?.enviar_proposta === true);

    setIsSavingSendProposal(true);
    setSendProposalError(null);

    try {
      const { error } = await supabase
        .from('sales_empresas_v2')
        .update({
          enviar_proposta: nextValue,
        })
        .eq('empresa_id', memberAccount.empresa_id);

      if (error) {
        throw error;
      }

      setCompanyPlan((current) =>
        current
          ? {
              ...current,
              enviar_proposta: nextValue,
            }
          : current,
      );
    } catch (error: any) {
      console.error('Erro ao atualizar envio da proposta:', error);
      setSendProposalError(error?.message || 'Não foi possível atualizar o envio da proposta.');
    } finally {
      setIsSavingSendProposal(false);
    }
  };

  const handleOpenChangePasswordModal = () => {
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    });
    setPasswordVisibility({
      currentPassword: false,
      newPassword: false,
      confirmNewPassword: false,
    });
    setPasswordSaveError(null);
    setPasswordSaveSuccess(null);
    setIsChangePasswordModalOpen(true);
  };

  const handleCloseChangePasswordModal = () => {
    setIsChangePasswordModalOpen(false);
  };

  const handlePasswordInputChange =
    (field: keyof PasswordFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;

      setPasswordForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
    };

  const handleOpenTermsModal = () => {
    setIsTermsModalOpen(true);
  };

  const handleCloseTermsModal = () => {
    setIsTermsModalOpen(false);
  };

  const handleOpenQuoteRulesModal = () => {
    setQuoteRulesDraft(sortQuoteRules(visibleCompanyQuoteRules));
    setQuoteRuleForm(createEmptyQuoteRuleForm());
    setQuoteRulesError(null);
    setIsQuoteRuleEditorModalOpen(false);
    setIsQuoteRulesModalOpen(true);
  };

  const handleCloseQuoteRulesModal = () => {
    setIsQuoteRuleEditorModalOpen(false);
    setIsQuoteRulesModalOpen(false);
  };

  const handleOpenQuoteRuleEditorModal = () => {
    setQuoteRulesError(null);
    setIsQuoteRuleEditorModalOpen(true);
  };

  const handleCloseQuoteRuleEditorModal = () => {
    setQuoteRuleForm(createEmptyQuoteRuleForm());
    setQuoteRulesError(null);
    setIsQuoteRuleEditorModalOpen(false);
  };

  const handleQuoteRuleFormChange =
    (field: keyof QuoteRuleFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const rawValue = event.target.value;
      const nextValue = field === 'descricao' ? rawValue.slice(0, 100) : rawValue;

      setQuoteRuleForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
    };

  const handleResetQuoteRuleForm = () => {
    setQuoteRuleForm(createEmptyQuoteRuleForm());
    setQuoteRulesError(null);
  };

  const handleSelectQuoteRuleForEdit = (rule: QuoteRuleItem) => {
    setQuoteRuleForm({
      originalName: rule.name,
      name: rule.name,
      nivel: rule.nivel,
      descricao: rule.descricao,
    });
    setQuoteRulesError(null);
    setIsQuoteRuleEditorModalOpen(true);
  };

  const handleUpsertQuoteRule = () => {
    const trimmedName = quoteRuleForm.name.trim();
    const trimmedDescription = quoteRuleForm.descricao.trim();

    if (!trimmedName) {
      setQuoteRulesError('Informe o nome da regra.');
      return;
    }

    if (!trimmedDescription) {
      setQuoteRulesError('Informe a descricao da regra.');
      return;
    }

    if (trimmedDescription.length > 100) {
      setQuoteRulesError('A descricao deve ter no maximo 100 caracteres.');
      return;
    }

    if (isProtectedQuoteRule(trimmedName)) {
      setQuoteRulesError('Ja existe uma regra interna com esse nome.');
      return;
    }

    const hasDuplicateRule = quoteRulesDraft.some(
      (rule) =>
        rule.name.toLowerCase() === trimmedName.toLowerCase() &&
        rule.name.toLowerCase() !== quoteRuleForm.originalName.toLowerCase(),
    );

    if (hasDuplicateRule) {
      setQuoteRulesError('Ja existe uma regra com esse nome.');
      return;
    }

    const currentRule = quoteRulesDraft.find((rule) => rule.name === quoteRuleForm.originalName);
    const nextRule: QuoteRuleItem = {
      name: trimmedName,
      nivel: quoteRuleForm.nivel,
      descricao: trimmedDescription,
      ativo: currentRule?.ativo ?? true,
      createdAt: currentRule?.createdAt ?? new Date().toISOString(),
    };

    const nextRules = currentRule
      ? quoteRulesDraft.map((rule) => (rule.name === currentRule.name ? nextRule : rule))
      : [...quoteRulesDraft, nextRule];

    setQuoteRulesDraft(sortQuoteRules(nextRules));
    setQuoteRuleForm(createEmptyQuoteRuleForm());
    setQuoteRulesError(null);
    setIsQuoteRuleEditorModalOpen(false);
  };

  const handleToggleQuoteRuleActive = (ruleName: string) => {
    if (isProtectedQuoteRule(ruleName)) {
      return;
    }

    setQuoteRulesDraft((currentRules) =>
      sortQuoteRules(
        currentRules.map((rule) =>
          rule.name === ruleName
            ? {
                ...rule,
                ativo: !rule.ativo,
              }
            : rule,
        ),
      ),
    );
    setQuoteRulesError(null);
  };

  const handleDeleteQuoteRule = (ruleName: string) => {
    if (isProtectedQuoteRule(ruleName)) {
      return;
    }

    setQuoteRulesDraft((currentRules) =>
      sortQuoteRules(currentRules.filter((rule) => rule.name !== ruleName)),
    );

    if (quoteRuleForm.originalName === ruleName) {
      setQuoteRuleForm(createEmptyQuoteRuleForm());
      setIsQuoteRuleEditorModalOpen(false);
    }

    setQuoteRulesError(null);
  };

  const handleSaveQuoteRules = async () => {
    if (!memberAccount?.empresa_id) {
      setQuoteRulesError('Não foi possível identificar a empresa para salvar as regras.');
      return;
    }

    setIsSavingQuoteRules(true);
    setQuoteRulesError(null);

    try {
      const serializedProtectedRules = serializeQuoteRules(protectedCompanyQuoteRules);
      const serializedVisibleRules = serializeQuoteRules(quoteRulesDraft);
      const protectedKeys = Object.keys(serializedProtectedRules);

      if (protectedKeys.length > 0) {
        const hasAllProtectedKeys = protectedKeys.every(
          (protectedKey) => protectedKey in serializedVisibleRules,
        );

        if (hasAllProtectedKeys) {
          throw new Error(
            'Nao foi possivel salvar as regras de cotacao devido a um conflito com regras internas.',
          );
        }
      }

      const serializedRules: Record<string, QuoteRuleValue> = {
        ...serializedProtectedRules,
        ...serializedVisibleRules,
      };

      const missingProtectedRules = protectedKeys.some(
        (protectedKey) => !(protectedKey in serializedRules),
      );

      if (missingProtectedRules) {
        throw new Error('Nao foi possivel preservar as regras internas de cotacao.');
      }

      const { error } = await supabase
        .from('sales_empresas_v2')
        .update({
          regras_cotacao: serializedRules,
        })
        .eq('empresa_id', memberAccount.empresa_id);

      if (error) {
        throw error;
      }

      setCompanyPlan((current) =>
        current
          ? {
              ...current,
              regras_cotacao: serializedRules,
            }
          : current,
      );
      setIsQuoteRulesModalOpen(false);
      setQuoteRuleForm(createEmptyQuoteRuleForm());
    } catch (error: any) {
      console.error('Erro ao salvar regras de cotação:', error);
      setQuoteRulesError(error?.message || 'Não foi possível salvar as regras de cotação.');
    } finally {
      setIsSavingQuoteRules(false);
    }
  };

  const handleTogglePasswordVisibility = (field: keyof PasswordVisibilityState) => {
    setPasswordVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const handleSavePassword = async () => {
    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmNewPassword = passwordForm.confirmNewPassword.trim();

    if (!currentPassword) {
      setPasswordSaveError('Informe sua senha atual.');
      setPasswordSaveSuccess(null);
      return;
    }

    if (!newPassword) {
      setPasswordSaveError('Informe a nova senha.');
      setPasswordSaveSuccess(null);
      return;
    }

    if (newPassword.length < 6) {
      setPasswordSaveError('A nova senha deve ter pelo menos 6 caracteres.');
      setPasswordSaveSuccess(null);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordSaveError('A confirmação da nova senha não confere.');
      setPasswordSaveSuccess(null);
      return;
    }

    setIsSavingPassword(true);
    setPasswordSaveError(null);
    setPasswordSaveSuccess(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user?.email) {
        throw new Error('Não foi possível identificar o e-mail do usuário autenticado.');
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (reauthError) {
        throw new Error('A senha atual informada está incorreta.');
      }

      const { error: updatePasswordError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updatePasswordError) {
        throw updatePasswordError;
      }

      setPasswordSaveSuccess('Senha atualizada com sucesso.');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      });
      setPasswordVisibility({
        currentPassword: false,
        newPassword: false,
        confirmNewPassword: false,
      });

      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (error: any) {
      console.error('Erro ao atualizar senha:', error);
      setPasswordSaveError(error?.message || 'Não foi possível atualizar a senha.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-panel border border-line-soft bg-paper p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-tile bg-card text-muted shadow-sm">
                  <Settings2 size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-ink">Conta</h2>
                  <p className="mt-1 text-xs leading-5 text-muted">Informações do seu usuário</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-pill border px-2.5 py-1 text-[11px] font-semibold ${memberStatusClassName}`}
                >
                  {isAccountLoading ? 'Carregando...' : memberStatusLabel}
                </span>

                {!isAccountLoading && !accountError && !isEditingAccount ? (
                  <button
                    type="button"
                    onClick={handleStartEditingAccount}
                    className="flex h-8 w-8 items-center justify-center rounded-tile bg-card text-muted shadow-sm transition-colors hover:bg-paper hover:text-ink"
                    aria-label="Editar conta"
                  >
                    <Pencil size={14} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-panel border border-line-soft bg-card p-4">
              {accountError ? (
                <div className="rounded-tile border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {accountError}
                </div>
              ) : null}

              {accountSaveError ? (
                <div className="rounded-tile border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {accountSaveError}
                </div>
              ) : null}

              {accountSaveSuccess ? (
                <div className="rounded-tile border border-lime bg-lime/15 px-3 py-2 text-xs font-medium text-ink">
                  {accountSaveSuccess}
                </div>
              ) : null}

              <div>
                <p className="text-[11px] font-medium text-muted-soft">Nome do usuário</p>
                {isEditingAccount ? (
                  <input
                    type="text"
                    value={accountForm.nome}
                    onChange={handleAccountInputChange('nome')}
                    className="mt-2 w-full rounded-tile border border-line bg-paper px-3 py-2.5 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                    placeholder="Digite o nome do usuário"
                  />
                ) : (
                  <p className="mt-1 text-lg font-semibold text-ink">
                    {isAccountLoading ? 'Carregando...' : memberName}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium text-muted-soft">E-mail do usuário</p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  {isAccountLoading ? 'Carregando...' : memberEmail}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-muted-soft">Telefone</p>
                {isEditingAccount ? (
                  <input
                    type="text"
                    value={accountForm.telefone}
                    onChange={handleAccountInputChange('telefone')}
                    className="mt-2 w-full rounded-tile border border-line bg-paper px-3 py-2.5 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                    placeholder="(11) 99999-9999"
                  />
                ) : (
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {isAccountLoading ? 'Carregando...' : memberPhone}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium text-muted-soft">ID do usuário</p>
                <p className="mt-1 break-all text-[11px] font-medium text-muted-soft">
                  {isAccountLoading ? 'Carregando...' : memberId}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-muted-soft">E-mail de integração</p>
                <p className="mt-1 break-all text-[11px] font-medium text-muted-soft">
                  {isAccountLoading ? 'Carregando...' : memberIntegrationEmail}
                </p>
              </div>

              {isEditingAccount ? (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleSaveAccount}
                    disabled={isSavingAccount}
                    className="inline-flex items-center gap-2 rounded-tile bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Check size={15} />
                    {isSavingAccount ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {isAdminMember && SHOW_USER_PLAN_SECTION ? (
            <div className="rounded-panel border border-line-soft bg-paper p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-tile bg-card text-muted shadow-sm">
                    <Crown size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Plano do usuário</h2>
                  </div>
                </div>

                <span
                  className={`rounded-pill border px-2.5 py-1 text-[11px] font-semibold ${companyPlanStatusClassName}`}
                >
                  {isCompanyPlanLoading ? 'Carregando...' : companyPlanStatus}
                </span>
              </div>

              <div className="space-y-3 rounded-panel border border-line-soft bg-card p-4">
                {companyPlanError ? (
                  <div className="rounded-tile border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                    {companyPlanError}
                  </div>
                ) : null}

                <div>
                  <p className="text-[11px] font-medium text-muted-soft">Plano</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {isCompanyPlanLoading ? 'Carregando...' : companyPlanName}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium text-muted-soft">Ciclo</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {isCompanyPlanLoading ? 'Carregando...' : companyPlanCycle}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-muted-soft">Valor mensal</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {isCompanyPlanLoading ? 'Carregando...' : companyPlanPrice}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-1 px-1">
            {generalShortcutItems
              .filter((item) => SHOW_TERMS_SHORTCUT || item.action !== 'view-terms')
              .map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={
                    item.action === 'change-password'
                      ? handleOpenChangePasswordModal
                      : item.action === 'view-terms'
                        ? handleOpenTermsModal
                        : undefined
                  }
                  className="flex w-full items-center gap-3 rounded-tile px-2 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-4">
          {isAdminMember ? (
            <div className="rounded-panel border border-line-soft bg-paper p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3 max-lg:flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-tile bg-card text-muted shadow-sm">
                    <ClipboardCheck size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Regras de Cotação</h3>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      Defina as informações obrigatórias e desejáveis que o KOTTA IA deve solicitar ao cliente antes de gerar qualquer cotação.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenQuoteRulesModal}
                  className="rounded-tile bg-card px-4 py-2 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-paper"
                >
                  Editar
                </button>
              </div>

              <div className="space-y-4 rounded-panel border border-line-soft bg-card px-4 py-4">
                {quoteRulesPreview.length > 0 ? (
                  <div className="space-y-2">
                    {quoteRulesPreview.map((rule) => (
                      <div
                        key={rule.name}
                        className="rounded-panel border border-line-soft bg-paper px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">{rule.name}</p>
                            <p className="mt-1 text-xs leading-5 text-muted">{rule.descricao}</p>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span
                              className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${
                                rule.nivel === 'OBRIGATORIO'
                                  ? 'bg-lime text-ink'
                                  : 'bg-card text-muted'
                              }`}
                            >
                              {formatEnumLabel(rule.nivel)}
                            </span>
                            <span
                              className={`rounded-pill border px-2.5 py-1 text-[11px] font-semibold ${
                                rule.ativo
                                  ? 'border-lime bg-lime/15 text-ink'
                                  : 'border-line bg-card text-muted'
                              }`}
                            >
                              {rule.ativo ? 'Ativa' : 'Desativada'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-panel border border-dashed border-line bg-paper px-4 py-6 text-center">
                    <p className="text-sm font-medium text-muted">Nenhuma regra configurada ainda.</p>
                    <p className="mt-1 text-xs text-muted-soft">
                      Crie regras para orientar o KOTTA IA sobre quais informações solicitar.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-panel border border-line-soft bg-paper p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-tile bg-card text-muted shadow-sm">
                <Split size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Modo do Orçamento</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
                  Defina se o KOTTA IA pode enviar o orçamento automaticamente ao cliente ou se ele sempre
                  deve passar por aprovação humana.
                </p>
              </div>
            </div>

            {budgetModeError ? (
              <div className="mb-4 rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {budgetModeError}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-panel border border-line-soft bg-card px-4 py-4">
              <div>
                <p className="text-xs font-medium text-muted-soft">Modo atual</p>
                <span
                  className={`mt-2 inline-flex rounded-pill border px-3 py-1 text-[11px] font-semibold ${
                    memberBudgetMode === 'AUTO'
                      ? 'border-lime bg-lime/15 text-ink'
                      : 'border-line bg-paper text-muted'
                  }`}
                >
                  {isAccountLoading ? 'Carregando...' : budgetModeLabel}
                </span>
                <p className="mt-3 max-w-xl text-xs leading-5 text-muted">
                  {isAccountLoading
                    ? 'Carregando configuração do modo de orçamento.'
                    : isAutomaticBudgetMode
                      ? 'No modo automático, a IA monta e envia o orçamento ao cliente sem aprovação humana, salvo quando houver alguma dúvida.'
                      : 'No modo semi-automático, a IA monta o orçamento e sempre direciona para um humano realizar a aprovação.'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isAutomaticBudgetMode}
                aria-label="Alternar modo do orçamento"
                onClick={handleToggleBudgetMode}
                disabled={isAccountLoading || isSavingBudgetMode || Boolean(accountError)}
                className={`flex h-6 w-11 items-center rounded-pill px-1 transition-colors ${
                  isAutomaticBudgetMode ? 'bg-lime' : 'bg-stone'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div
                  className={`h-4 w-4 rounded-pill bg-card shadow-sm transition-transform ${
                    isAutomaticBudgetMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-panel border border-line-soft bg-paper p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-tile bg-card text-muted shadow-sm">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Orçamento para Novos Clientes</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
                  Defina se o KOTTA IA pode montar orçamentos para clientes que ainda não existem na base.
                </p>
              </div>
            </div>

            {newClientsBudgetError ? (
              <div className="mb-4 rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {newClientsBudgetError}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-panel border border-line-soft bg-card px-4 py-4">
              <div>
                <p className="text-xs font-medium text-muted-soft">Status atual</p>
                <span
                  className={`mt-2 inline-flex rounded-pill border px-3 py-1 text-[11px] font-semibold ${newClientsBudgetStatusClassName}`}
                >
                  {isAccountLoading ? 'Carregando...' : newClientsBudgetLabel}
                </span>
                <p className="mt-3 max-w-xl text-xs leading-5 text-muted">
                  {isAccountLoading
                    ? 'Carregando configuração de orçamento para novos clientes.'
                    : allowBudgetForNewClients
                      ? 'Quando ativado, a IA pode montar o orçamento para clientes novos mesmo sem cadastro prévio na base.'
                      : 'Quando desativado, a IA não realiza o orçamento para clientes novos e direciona o atendimento para aprovação humana.'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={allowBudgetForNewClients}
                aria-label="Alternar orçamento para novos clientes"
                onClick={handleToggleNewClientsBudget}
                disabled={isAccountLoading || isSavingNewClientsBudget || Boolean(accountError)}
                className={`flex h-6 w-11 items-center rounded-pill px-1 transition-colors ${
                  allowBudgetForNewClients ? 'bg-lime' : 'bg-stone'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div
                  className={`h-4 w-4 rounded-pill bg-card shadow-sm transition-transform ${
                    allowBudgetForNewClients ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {isAdminMember ? (
            <div className="rounded-panel border border-line-soft bg-paper p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-tile bg-card text-muted shadow-sm">
                    <Database size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Fonte de Dados - Produtos</h3>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      De onde o KOTTA IA busca os produtos da sua empresa.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsImportProdutosOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-panel border border-line bg-card px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink/25"
                >
                  <Pencil size={13} />
                  Editar
                </button>
              </div>

              <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-soft">Configuração atual</p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {isCompanyPlanLoading
                        ? 'Carregando...'
                        : hasCompanySourceConfigured
                          ? companySourceStatusLabel
                          : 'Nenhuma fonte configurada'}
                    </p>
                  </div>

                  {companySourceType === 'PLANILHA' ? (
                    <div>
                      <p className="text-[11px] font-medium text-muted-soft">Arquivo</p>
                      <p className="mt-1 break-all text-xs leading-5 text-muted">
                        {companySourceArquivo || '-'}
                        {companySourceImportadoEm ? ` · importado em ${companySourceImportadoEm}` : ''}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[11px] font-medium text-muted-soft">URL</p>
                      <p className="mt-1 break-all text-xs leading-5 text-muted">
                        {companySourceLink || '-'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {isAdminMember ? (
            <div className="rounded-panel border border-line-soft bg-paper p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-tile bg-card text-muted shadow-sm">
                    <Database size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Fonte de Dados - Clientes</h3>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      De onde o KOTTA IA reconhece quem está pedindo a cotação.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsImportClientesOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-panel border border-line bg-card px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink/25"
                >
                  <Pencil size={13} />
                  Editar
                </button>
              </div>

              <div className="rounded-panel border border-line-soft bg-card px-4 py-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-soft">Configuração atual</p>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {isCompanyPlanLoading
                        ? 'Carregando...'
                        : hasCompanyClientSourceConfigured
                          ? companyClientSourceStatusLabel
                          : 'Nenhuma fonte configurada'}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-muted-soft">
                      {companyClientSourceTipo === 'PLANILHA' ? 'Arquivo' : 'URL'}
                    </p>
                    <p className="mt-1 break-all text-xs leading-5 text-muted">
                      {companyClientSourceTipo === 'PLANILHA'
                        ? `${companyClientSourceArquivo || '-'}${companyClientSourceImportadoEm ? ` · importado em ${companyClientSourceImportadoEm}` : ''}`
                        : companyClientSourceLink || '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {isQuoteRulesModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="absolute inset-0" aria-hidden="true" onClick={handleCloseQuoteRulesModal} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regras-cotacao-modal-title"
            className="relative z-10 flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-card border border-line-soft bg-card shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft px-6 py-5 max-lg:px-4 max-lg:py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-lime/20 text-ink">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2
                    id="regras-cotacao-modal-title"
                    className="text-base font-semibold tracking-tight text-ink"
                  >
                    Regras de Cotação
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                    Configure quais informações o KOTTA IA deve solicitar ao cliente para validar uma cotação
                    antes de avançar no atendimento.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCloseQuoteRulesModal}
                  className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper"
                >
                  Fechar
                </button>
                {hasQuoteRulesChanges ? (
                  <button
                    type="button"
                    onClick={handleSaveQuoteRules}
                    disabled={isSavingQuoteRules}
                    className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={16} />
                    {isSavingQuoteRules ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                ) : null}
              </div>
            </div>

            {quoteRulesError && !isQuoteRuleEditorModalOpen ? (
              <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm font-medium text-red-600">
                {quoteRulesError}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto bg-paper px-6 py-5 max-lg:px-4 max-lg:py-4">
              <div className="mx-auto w-full max-w-4xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Regras atuais</p>
                    <p className="mt-1 text-xs text-muted">
                      {quoteRulesDraft.length} regra(s) cadastrada(s),{' '}
                      {quoteRulesDraft.filter((rule) => rule.ativo).length} ativa(s)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleResetQuoteRuleForm();
                      handleOpenQuoteRuleEditorModal();
                    }}
                    className="inline-flex items-center gap-2 rounded-panel bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-paper"
                  >
                    <Plus size={15} />
                    Nova regra
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {quoteRulesDraft.length > 0 ? (
                    quoteRulesDraft.map((rule) => (
                      <div
                        key={rule.name}
                        className="rounded-card border border-line-soft bg-card p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
                      >
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-ink">{rule.name}</p>
                                <span
                                  className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${
                                    rule.nivel === 'OBRIGATORIO'
                                      ? 'bg-lime text-ink'
                                      : 'bg-paper text-muted'
                                  }`}
                                >
                                  {formatEnumLabel(rule.nivel)}
                                </span>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-muted">{rule.descricao}</p>
                            </div>

                            <div className="flex min-w-[140px] items-center justify-between gap-3 rounded-panel border border-line-soft bg-paper px-3 py-2">
                              <div>
                                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                                  Status
                                </p>
                                <p className="mt-1 text-xs font-semibold text-ink">
                                  {rule.ativo ? 'Ativa' : 'Desativada'}
                                </p>
                              </div>

                              <button
                                type="button"
                                role="switch"
                                aria-checked={rule.ativo}
                                aria-label={`Alternar status da regra ${rule.name}`}
                                onClick={() => handleToggleQuoteRuleActive(rule.name)}
                                className={`flex h-6 w-11 items-center rounded-pill px-1 transition-colors ${
                                  rule.ativo ? 'bg-lime' : 'bg-stone'
                                }`}
                              >
                                <div
                                  className={`h-4 w-4 rounded-pill bg-card shadow-sm transition-transform ${
                                    rule.ativo ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-4">
                            <button
                              type="button"
                              onClick={() => handleSelectQuoteRuleForEdit(rule)}
                              className="rounded-panel bg-paper px-3 py-2 text-xs font-semibold text-muted transition-colors hover:bg-stone hover:text-ink"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuoteRule(rule.name)}
                              className="inline-flex items-center gap-2 rounded-panel bg-[#FFF1F1] px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-[#FFE5E5]"
                            >
                              <Trash2 size={14} />
                              Excluir
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-card border border-dashed border-line bg-card px-6 py-10 text-center">
                      <p className="text-sm font-semibold text-ink">Nenhuma regra cadastrada</p>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        Crie a primeira regra para orientar o KOTTA IA sobre o que deve ser solicitado ao
                        cliente na etapa de cotação.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isQuoteRuleEditorModalOpen ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 px-4 py-6">
                <div
                  className="absolute inset-0"
                  aria-hidden="true"
                  onClick={handleCloseQuoteRuleEditorModal}
                />

                <div className="relative z-10 w-full max-w-lg rounded-card border border-line-soft bg-card p-6 max-lg:p-4 shadow-[0_30px_90px_rgba(15,23,42,0.18)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {isEditingQuoteRule ? 'Editar regra' : 'Nova regra'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        Toda nova regra começa como ativa e passa a orientar a IA após salvar as
                        alterações.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCloseQuoteRuleEditorModal}
                      className="flex h-9 w-9 items-center justify-center rounded-panel bg-paper text-muted transition-colors hover:bg-stone hover:text-ink"
                      aria-label="Fechar edição da regra"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    {quoteRulesError ? (
                      <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {quoteRulesError}
                      </div>
                    ) : null}

                    <div>
                      <label
                        htmlFor="quote-rule-name"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                      >
                        Nome da regra
                      </label>
                      <input
                        id="quote-rule-name"
                        type="text"
                        value={quoteRuleForm.name}
                        onChange={handleQuoteRuleFormChange('name')}
                        className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                        placeholder="Ex.: CNPJ, CEP de entrega, Indústria"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="quote-rule-level"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                      >
                        Nível
                      </label>
                      <select
                        id="quote-rule-level"
                        value={quoteRuleForm.nivel}
                        onChange={handleQuoteRuleFormChange('nivel')}
                        className="mt-2 w-full rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                      >
                        {QUOTE_RULE_LEVEL_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {formatEnumLabel(option)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="quote-rule-description"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                      >
                        Descrição
                      </label>
                      <textarea
                        id="quote-rule-description"
                        value={quoteRuleForm.descricao}
                        onChange={handleQuoteRuleFormChange('descricao')}
                        rows={5}
                        maxLength={100}
                        className="mt-2 w-full resize-none rounded-panel border border-line bg-card px-4 py-3 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                        placeholder="Explique para o KOTTA IA qual informação ele deve solicitar ao cliente e por que isso é necessário."
                      />
                      <div className="mt-2 text-right text-[11px] font-medium text-muted-soft">
                        {quoteRuleForm.descricao.length}/100
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleCloseQuoteRuleEditorModal}
                        className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleUpsertQuoteRule}
                        className="inline-flex items-center gap-2 rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
                      >
                        <Plus size={15} />
                        {isEditingQuoteRule ? 'Atualizar regra' : 'Adicionar regra'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isChangePasswordModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={handleCloseChangePasswordModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="alterar-senha-modal-title"
            className="relative z-10 w-full max-w-md rounded-card border border-line-soft bg-card p-6 max-lg:p-4 shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-paper text-muted">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h2
                    id="alterar-senha-modal-title"
                    className="text-base font-semibold tracking-tight text-ink"
                  >
                    Alterar senha
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    Informe sua senha atual e defina uma nova senha para a conta.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseChangePasswordModal}
                className="rounded-tile bg-paper px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-stone hover:text-ink"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-4">
              {passwordSaveError ? (
                <div className="rounded-panel border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {passwordSaveError}
                </div>
              ) : null}

              {passwordSaveSuccess ? (
                <div className="rounded-panel border border-lime bg-lime/15 px-4 py-3 text-sm font-medium text-ink">
                  {passwordSaveSuccess}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="current-password"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Senha atual
                </label>
                <div className="relative mt-2">
                  <input
                    id="current-password"
                    type={passwordVisibility.currentPassword ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordInputChange('currentPassword')}
                    className="w-full rounded-panel border border-line bg-paper px-4 py-3 pr-12 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                    placeholder="Digite sua senha atual"
                  />
                  <button
                    type="button"
                    onClick={() => handleTogglePasswordVisibility('currentPassword')}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-soft transition-colors hover:text-ink"
                    aria-label={
                      passwordVisibility.currentPassword ? 'Ocultar senha atual' : 'Mostrar senha atual'
                    }
                  >
                    {passwordVisibility.currentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Nova senha
                </label>
                <div className="relative mt-2">
                  <input
                    id="new-password"
                    type={passwordVisibility.newPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={handlePasswordInputChange('newPassword')}
                    className="w-full rounded-panel border border-line bg-paper px-4 py-3 pr-12 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                    placeholder="Digite a nova senha"
                  />
                  <button
                    type="button"
                    onClick={() => handleTogglePasswordVisibility('newPassword')}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-soft transition-colors hover:text-ink"
                    aria-label={
                      passwordVisibility.newPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'
                    }
                  >
                    {passwordVisibility.newPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft"
                >
                  Confirmar nova senha
                </label>
                <div className="relative mt-2">
                  <input
                    id="confirm-new-password"
                    type={passwordVisibility.confirmNewPassword ? 'text' : 'password'}
                    value={passwordForm.confirmNewPassword}
                    onChange={handlePasswordInputChange('confirmNewPassword')}
                    className="w-full rounded-panel border border-line bg-paper px-4 py-3 pr-12 text-sm font-medium text-ink outline-none transition-colors focus:border-ink/25"
                    placeholder="Confirme a nova senha"
                  />
                  <button
                    type="button"
                    onClick={() => handleTogglePasswordVisibility('confirmNewPassword')}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-soft transition-colors hover:text-ink"
                    aria-label={
                      passwordVisibility.confirmNewPassword
                        ? 'Ocultar confirmação da nova senha'
                        : 'Mostrar confirmação da nova senha'
                    }
                  >
                    {passwordVisibility.confirmNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseChangePasswordModal}
                className="rounded-panel border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-paper"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePassword}
                disabled={isSavingPassword}
                className="rounded-panel bg-lime px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingPassword ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTermsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="absolute inset-0" aria-hidden="true" onClick={handleCloseTermsModal} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="termos-modal-title"
            className="relative z-10 flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-card border border-line-soft bg-card shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5 max-lg:flex-col max-lg:items-stretch max-lg:px-4 max-lg:py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-paper text-muted">
                  <FileText size={18} />
                </div>
                <div>
                  <h2
                    id="termos-modal-title"
                    className="text-base font-semibold tracking-tight text-ink"
                  >
                    Termos de Uso
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    Visualize os termos completos de uso da empresa.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseTermsModal}
                className="rounded-tile bg-paper px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-stone hover:text-ink"
              >
                Fechar
              </button>
            </div>

            <div className="min-h-0 flex-1 bg-paper p-3">
              <iframe
                src="/termos-de-uso.html"
                title="Termos de Uso"
                className="h-full w-full rounded-panel border border-line-soft bg-card"
              />
            </div>
          </div>
        </div>
      ) : null}

      <ImportarPlanilhaModal
        tipo="produtos"
        aberto={isImportProdutosOpen}
        aoFechar={() => setIsImportProdutosOpen(false)}
        aoConcluir={() => setRecarregarEmpresa((n) => n + 1)}
      />

      <ImportarPlanilhaModal
        tipo="clientes"
        aberto={isImportClientesOpen}
        aoFechar={() => setIsImportClientesOpen(false)}
        aoConcluir={() => setRecarregarEmpresa((n) => n + 1)}
      />
    </>
  );
};

export default GeralTab;
