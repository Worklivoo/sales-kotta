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
  Power,
  PowerOff,
  Save,
  Settings2,
  Sparkles,
  Split,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type BudgetMode = 'AUTO' | 'SEMI';
type ScrapperType = 'API' | 'XML' | 'HTML' | 'PLANILHA' | 'SITE';
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
}

interface QuoteRuleItem extends QuoteRuleValue {
  name: string;
}

interface QuoteRuleFormState {
  originalName: string;
  name: string;
  nivel: QuoteRuleLevel;
  descricao: string;
}

interface SourceDataFormState {
  scrapper_tipo: ScrapperType | null;
  scrapper_link: string;
  scrapper_body: string;
  scrapper_query: string;
  scrapper_headers: string;
}

interface CompanyPlanRecord {
  plano: string | null;
  plano_ciclo: string | null;
  valor_mensal: number | string | null;
  plano_status: string | null;
  regras_cotacao: unknown;
  scrapper_tipo: ScrapperType | null;
  scrapper_link: string | null;
  scrapper_body: unknown;
  scrapper_query: unknown;
  scrapper_headers: unknown;
  cliente_api_link: string | null;
  cliente_api_body: unknown;
  cliente_api_query: unknown;
  cliente_api_header: unknown;
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
const SCRAPPER_TYPE_OPTIONS: ScrapperType[] = ['API', 'XML', 'HTML', 'PLANILHA', 'SITE'];

const formatBudgetModeLabel = (value: BudgetMode | null) => {
  if (value === 'SEMI') {
    return 'Semi-automático';
  }

  if (value === 'AUTO') {
    return 'Automático';
  }

  return '-';
};

const formatJsonEditorValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

const parseOptionalJsonEditorValue = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return JSON.parse(trimmedValue);
};

const createSourceDataForm = (companyData?: CompanyPlanRecord | null): SourceDataFormState => ({
  scrapper_tipo: companyData?.scrapper_tipo ?? null,
  scrapper_link: companyData?.scrapper_link ?? '',
  scrapper_body: formatJsonEditorValue(companyData?.scrapper_body),
  scrapper_query: formatJsonEditorValue(companyData?.scrapper_query),
  scrapper_headers: formatJsonEditorValue(companyData?.scrapper_headers),
});

const createClientSourceDataForm = (companyData?: CompanyPlanRecord | null): SourceDataFormState => ({
  scrapper_tipo: 'API',
  scrapper_link: companyData?.cliente_api_link ?? '',
  scrapper_body: formatJsonEditorValue(companyData?.cliente_api_body),
  scrapper_query: formatJsonEditorValue(companyData?.cliente_api_query),
  scrapper_headers: formatJsonEditorValue(companyData?.cliente_api_header),
});

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

const sortQuoteRules = (rules: QuoteRuleItem[]) =>
  [...rules].sort((left, right) => {
    if (left.ativo !== right.ativo) {
      return left.ativo ? -1 : 1;
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
    .map(([name, ruleConfig]) => {
      if (!ruleConfig || typeof ruleConfig !== 'object' || Array.isArray(ruleConfig)) {
        return null;
      }

      const typedRuleConfig = ruleConfig as Record<string, unknown>;

      return {
        name,
        ativo: typeof typedRuleConfig.ativo === 'boolean' ? typedRuleConfig.ativo : true,
        nivel: isQuoteRuleLevel(typedRuleConfig.nivel) ? typedRuleConfig.nivel : 'OBRIGATORIO',
        descricao:
          typeof typedRuleConfig.descricao === 'string' ? typedRuleConfig.descricao : '',
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
  const [isCompanyPlanLoading, setIsCompanyPlanLoading] = useState(false);
  const [companyPlanError, setCompanyPlanError] = useState<string | null>(null);
  const [isQuoteRulesModalOpen, setIsQuoteRulesModalOpen] = useState(false);
  const [quoteRulesDraft, setQuoteRulesDraft] = useState<QuoteRuleItem[]>([]);
  const [quoteRuleForm, setQuoteRuleForm] = useState<QuoteRuleFormState>(createEmptyQuoteRuleForm());
  const [isSavingQuoteRules, setIsSavingQuoteRules] = useState(false);
  const [quoteRulesError, setQuoteRulesError] = useState<string | null>(null);
  const [isSavingBudgetMode, setIsSavingBudgetMode] = useState(false);
  const [budgetModeError, setBudgetModeError] = useState<string | null>(null);
  const [isSavingNewClientsBudget, setIsSavingNewClientsBudget] = useState(false);
  const [newClientsBudgetError, setNewClientsBudgetError] = useState<string | null>(null);
  const [isSourceDataModalOpen, setIsSourceDataModalOpen] = useState(false);
  const [sourceDataForm, setSourceDataForm] = useState<SourceDataFormState>(createSourceDataForm());
  const [sourceDataError, setSourceDataError] = useState<string | null>(null);
  const [isSavingSourceData, setIsSavingSourceData] = useState(false);
  const [isClientSourceDataModalOpen, setIsClientSourceDataModalOpen] = useState(false);
  const [clientSourceDataForm, setClientSourceDataForm] =
    useState<SourceDataFormState>(createClientSourceDataForm());
  const [clientSourceDataError, setClientSourceDataError] = useState<string | null>(null);
  const [isSavingClientSourceData, setIsSavingClientSourceData] = useState(false);
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
          .from('sales_membros_empresa')
          .select(
            'membro_id, empresa_id, nome, email, telefone, status, cargo, modo_orcamento, orcamento_novos_clientes',
          )
          .eq('membro_id', session.user.id)
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
          .from('sales_empresa')
          .select(
            'plano, plano_ciclo, valor_mensal, plano_status, regras_cotacao, scrapper_tipo, scrapper_link, scrapper_body, scrapper_query, scrapper_headers, cliente_api_link, cliente_api_body, cliente_api_query, cliente_api_header',
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
  }, [isAdminMember, memberAccount?.empresa_id]);

  const memberStatusLabel = formatMemberStatusLabel(memberAccount?.status || null);
  const memberStatusClassName =
    memberAccount?.status === 'ATIVO'
      ? 'border-[#EBF57D] bg-[#F8FBCF] text-gray-700'
      : 'border-black/10 bg-white text-gray-500';
  const memberName = memberAccount?.nome?.trim() || '-';
  const memberEmail = memberAccount?.email?.trim() || '-';
  const memberPhone = formatPhone(memberAccount?.telefone || null);
  const memberId = memberAccount?.membro_id?.trim() || '-';
  const memberBudgetMode = memberAccount?.modo_orcamento ?? null;
  const isAutomaticBudgetMode = memberBudgetMode === 'AUTO';
  const budgetModeLabel = formatBudgetModeLabel(memberBudgetMode);
  const allowBudgetForNewClients = memberAccount?.orcamento_novos_clientes === true;
  const newClientsBudgetLabel = allowBudgetForNewClients ? 'Ativado' : 'Desativado';
  const newClientsBudgetStatusClassName = allowBudgetForNewClients
    ? 'border-[#EBF57D] bg-[#F8FBCF] text-gray-700'
    : 'border-black/10 bg-[#FAFAFA] text-gray-600';
  const companyPlanName = companyPlan?.plano?.trim() || '-';
  const companyPlanCycle = formatEnumLabel(companyPlan?.plano_ciclo || null);
  const companyPlanPrice = formatCurrency(companyPlan?.valor_mensal ?? null);
  const companyPlanStatus = formatEnumLabel(companyPlan?.plano_status || null);
  const companySourceType = companyPlan?.scrapper_tipo ?? null;
  const companySourceLink = companyPlan?.scrapper_link?.trim() || '';
  const companySourceStatusLabel = companySourceType ? formatEnumLabel(companySourceType) : '-';
  const hasCompanySourceConfigured =
    Boolean(companySourceType) ||
    Boolean(companySourceLink) ||
    Boolean(companyPlan?.scrapper_body) ||
    Boolean(companyPlan?.scrapper_query) ||
    Boolean(companyPlan?.scrapper_headers);
  const companyClientSourceLink = companyPlan?.cliente_api_link?.trim() || '';
  const hasCompanyClientSourceConfigured =
    Boolean(companyClientSourceLink) ||
    Boolean(companyPlan?.cliente_api_body) ||
    Boolean(companyPlan?.cliente_api_query) ||
    Boolean(companyPlan?.cliente_api_header);
  const companyClientSourceStatusLabel = hasCompanyClientSourceConfigured ? 'API' : '-';
  const companyQuoteRules = useMemo(
    () => parseQuoteRules(companyPlan?.regras_cotacao),
    [companyPlan?.regras_cotacao],
  );
  const quoteRulesPreview = companyQuoteRules.slice(0, 3);
  const isEditingQuoteRule = Boolean(quoteRuleForm.originalName);
  const hasQuoteRulesChanges =
    JSON.stringify(serializeQuoteRules(sortQuoteRules(companyQuoteRules))) !==
    JSON.stringify(serializeQuoteRules(sortQuoteRules(quoteRulesDraft)));
  const companyPlanStatusClassName =
    companyPlan?.plano_status === 'ATIVO'
      ? 'border-[#EBF57D] bg-[#F8FBCF] text-gray-700'
      : companyPlan?.plano_status === 'EM_ATRASO'
        ? 'border-orange-200 bg-orange-50 text-orange-700'
        : 'border-black/10 bg-white text-gray-500';

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
        .from('sales_membros_empresa')
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
        .from('sales_membros_empresa')
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
        .from('sales_membros_empresa')
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
    setQuoteRulesDraft(companyQuoteRules);
    setQuoteRuleForm(createEmptyQuoteRuleForm());
    setQuoteRulesError(null);
    setIsQuoteRulesModalOpen(true);
  };

  const handleCloseQuoteRulesModal = () => {
    setIsQuoteRulesModalOpen(false);
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
    };

    const nextRules = currentRule
      ? quoteRulesDraft.map((rule) => (rule.name === currentRule.name ? nextRule : rule))
      : [...quoteRulesDraft, nextRule];

    setQuoteRulesDraft(sortQuoteRules(nextRules));
    setQuoteRuleForm(createEmptyQuoteRuleForm());
    setQuoteRulesError(null);
  };

  const handleToggleQuoteRuleActive = (ruleName: string) => {
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
    setQuoteRulesDraft((currentRules) =>
      sortQuoteRules(currentRules.filter((rule) => rule.name !== ruleName)),
    );

    if (quoteRuleForm.originalName === ruleName) {
      setQuoteRuleForm(createEmptyQuoteRuleForm());
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
      const serializedRules = serializeQuoteRules(quoteRulesDraft);
      const { error } = await supabase
        .from('sales_empresa')
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

  const handleOpenSourceDataModal = () => {
    setSourceDataForm(createSourceDataForm(companyPlan));
    setSourceDataError(null);
    setIsSourceDataModalOpen(true);
  };

  const handleCloseSourceDataModal = () => {
    setIsSourceDataModalOpen(false);
  };

  const handleOpenClientSourceDataModal = () => {
    setClientSourceDataForm(createClientSourceDataForm(companyPlan));
    setClientSourceDataError(null);
    setIsClientSourceDataModalOpen(true);
  };

  const handleCloseClientSourceDataModal = () => {
    setIsClientSourceDataModalOpen(false);
  };

  const handleSelectScrapperType = (type: ScrapperType) => {
    if (type !== 'API') {
      return;
    }

    setSourceDataForm((current) => ({
      ...current,
      scrapper_tipo: type,
    }));
    setSourceDataError(null);
  };

  const handleSourceDataInputChange =
    (
      field: keyof Pick<
        SourceDataFormState,
        'scrapper_link' | 'scrapper_body' | 'scrapper_query' | 'scrapper_headers'
      >,
    ) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;

      setSourceDataForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
      setSourceDataError(null);
    };

  const handleClientSourceDataInputChange =
    (
      field: keyof Pick<
        SourceDataFormState,
        'scrapper_link' | 'scrapper_body' | 'scrapper_query' | 'scrapper_headers'
      >,
    ) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;

      setClientSourceDataForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
      setClientSourceDataError(null);
    };

  const handleSaveSourceData = async () => {
    if (!memberAccount?.empresa_id) {
      setSourceDataError('Não foi possível identificar a empresa para salvar a fonte de dados.');
      return;
    }

    if (sourceDataForm.scrapper_tipo !== 'API') {
      setSourceDataError('Selecione a integracao API para configurar a fonte de dados.');
      return;
    }

    setIsSavingSourceData(true);
    setSourceDataError(null);

    try {
      const payload = {
        scrapper_tipo: sourceDataForm.scrapper_tipo,
        scrapper_link: sourceDataForm.scrapper_link.trim() || null,
        scrapper_body: parseOptionalJsonEditorValue(sourceDataForm.scrapper_body),
        scrapper_query: parseOptionalJsonEditorValue(sourceDataForm.scrapper_query),
        scrapper_headers: parseOptionalJsonEditorValue(sourceDataForm.scrapper_headers),
      };

      const { error } = await supabase
        .from('sales_empresa')
        .update(payload)
        .eq('empresa_id', memberAccount.empresa_id);

      if (error) {
        throw error;
      }

      setCompanyPlan((current) =>
        current
          ? {
              ...current,
              ...payload,
            }
          : current,
      );
      setIsSourceDataModalOpen(false);
    } catch (error: any) {
      console.error('Erro ao salvar fonte de dados:', error);
      if (error instanceof SyntaxError) {
        setSourceDataError('Body, Query e Header devem estar em JSON válido.');
      } else {
        setSourceDataError(error?.message || 'Não foi possível salvar a fonte de dados.');
      }
    } finally {
      setIsSavingSourceData(false);
    }
  };

  const handleSaveClientSourceData = async () => {
    if (!memberAccount?.empresa_id) {
      setClientSourceDataError(
        'Não foi possível identificar a empresa para salvar a fonte de dados.',
      );
      return;
    }

    if (clientSourceDataForm.scrapper_tipo !== 'API') {
      setClientSourceDataError('Selecione a integracao API para configurar a fonte de dados.');
      return;
    }

    setIsSavingClientSourceData(true);
    setClientSourceDataError(null);

    try {
      const payload = {
        cliente_api_link: clientSourceDataForm.scrapper_link.trim() || null,
        cliente_api_body: parseOptionalJsonEditorValue(clientSourceDataForm.scrapper_body),
        cliente_api_query: parseOptionalJsonEditorValue(clientSourceDataForm.scrapper_query),
        cliente_api_header: parseOptionalJsonEditorValue(clientSourceDataForm.scrapper_headers),
      };

      const { error } = await supabase
        .from('sales_empresa')
        .update(payload)
        .eq('empresa_id', memberAccount.empresa_id);

      if (error) {
        throw error;
      }

      setCompanyPlan((current) =>
        current
          ? {
              ...current,
              ...payload,
            }
          : current,
      );
      setIsClientSourceDataModalOpen(false);
    } catch (error: any) {
      console.error('Erro ao salvar fonte de dados de clientes:', error);
      if (error instanceof SyntaxError) {
        setClientSourceDataError('Body, Query e Header devem estar em JSON válido.');
      } else {
        setClientSourceDataError(error?.message || 'Não foi possível salvar a fonte de dados.');
      }
    } finally {
      setIsSavingClientSourceData(false);
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
          <div className="rounded-2xl border border-black/5 bg-[#FCFCFC] p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm">
                  <Settings2 size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Conta</h2>
                  <p className="mt-1 text-xs leading-5 text-gray-500">Informações do seu usuário</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${memberStatusClassName}`}
                >
                  {isAccountLoading ? 'Carregando...' : memberStatusLabel}
                </span>

                {!isAccountLoading && !accountError && !isEditingAccount ? (
                  <button
                    type="button"
                    onClick={handleStartEditingAccount}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-800"
                    aria-label="Editar conta"
                  >
                    <Pencil size={14} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-black/5 bg-white p-4">
              {accountError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {accountError}
                </div>
              ) : null}

              {accountSaveError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {accountSaveError}
                </div>
              ) : null}

              {accountSaveSuccess ? (
                <div className="rounded-xl border border-[#EBF57D] bg-[#F8FBCF] px-3 py-2 text-xs font-medium text-gray-700">
                  {accountSaveSuccess}
                </div>
              ) : null}

              <div>
                <p className="text-[11px] font-medium text-gray-400">Nome do usuário</p>
                {isEditingAccount ? (
                  <input
                    type="text"
                    value={accountForm.nome}
                    onChange={handleAccountInputChange('nome')}
                    className="mt-2 w-full rounded-xl border border-black/10 bg-[#FAFAFA] px-3 py-2.5 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                    placeholder="Digite o nome do usuário"
                  />
                ) : (
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {isAccountLoading ? 'Carregando...' : memberName}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium text-gray-400">E-mail do usuário</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {isAccountLoading ? 'Carregando...' : memberEmail}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-gray-400">Telefone</p>
                {isEditingAccount ? (
                  <input
                    type="text"
                    value={accountForm.telefone}
                    onChange={handleAccountInputChange('telefone')}
                    className="mt-2 w-full rounded-xl border border-black/10 bg-[#FAFAFA] px-3 py-2.5 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                    placeholder="(11) 99999-9999"
                  />
                ) : (
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {isAccountLoading ? 'Carregando...' : memberPhone}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium text-gray-400">ID do usuário</p>
                <p className="mt-1 break-all text-[11px] font-medium text-gray-400">
                  {isAccountLoading ? 'Carregando...' : memberId}
                </p>
              </div>

              {isEditingAccount ? (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleSaveAccount}
                    disabled={isSavingAccount}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Check size={15} />
                    {isSavingAccount ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {isAdminMember && SHOW_USER_PLAN_SECTION ? (
            <div className="rounded-2xl border border-black/5 bg-[#FCFCFC] p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm">
                    <Crown size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Plano do usuário</h2>
                  </div>
                </div>

                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${companyPlanStatusClassName}`}
                >
                  {isCompanyPlanLoading ? 'Carregando...' : companyPlanStatus}
                </span>
              </div>

              <div className="space-y-3 rounded-2xl border border-black/5 bg-white p-4">
                {companyPlanError ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                    {companyPlanError}
                  </div>
                ) : null}

                <div>
                  <p className="text-[11px] font-medium text-gray-400">Plano</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {isCompanyPlanLoading ? 'Carregando...' : companyPlanName}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium text-gray-400">Ciclo</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {isCompanyPlanLoading ? 'Carregando...' : companyPlanCycle}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-gray-400">Valor mensal</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
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
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium text-gray-500 transition-colors hover:bg-[#FAFAFA] hover:text-gray-800"
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
            <div className="rounded-2xl border border-black/5 bg-[#FCFCFC] p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm">
                    <ClipboardCheck size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Regras de Cotação</h3>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Defina as orientações que a IA deve seguir ao validar a cotação do cliente.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenQuoteRulesModal}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  Editar
                </button>
              </div>

              <div className="space-y-4 rounded-2xl border border-black/5 bg-white px-4 py-4">
                {quoteRulesPreview.length > 0 ? (
                  <div className="space-y-2">
                    {quoteRulesPreview.map((rule) => (
                      <div
                        key={rule.name}
                        className="rounded-2xl border border-black/5 bg-[#FAFAFA] px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{rule.name}</p>
                            <p className="mt-1 text-xs leading-5 text-gray-500">{rule.descricao}</p>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                rule.nivel === 'OBRIGATORIO'
                                  ? 'bg-[#EBF57D] text-gray-900'
                                  : 'bg-white text-gray-500'
                              }`}
                            >
                              {formatEnumLabel(rule.nivel)}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                rule.ativo
                                  ? 'border-[#EBF57D] bg-[#F8FBCF] text-gray-700'
                                  : 'border-black/10 bg-white text-gray-500'
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
                  <div className="rounded-2xl border border-dashed border-black/10 bg-[#FAFAFA] px-4 py-6 text-center">
                    <p className="text-sm font-medium text-gray-500">Nenhuma regra configurada ainda.</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Crie regras para orientar a IA sobre quais informações solicitar.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-black/5 bg-[#FCFCFC] p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm">
                <Split size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Modo do Orçamento</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
                  Defina se a IA pode enviar o orçamento automaticamente ao cliente ou se ele sempre
                  deve passar por aprovação humana.
                </p>
              </div>
            </div>

            {budgetModeError ? (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {budgetModeError}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/5 bg-white px-4 py-4">
              <div>
                <p className="text-xs font-medium text-gray-400">Modo atual</p>
                <span
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    memberBudgetMode === 'AUTO'
                      ? 'border-[#EBF57D] bg-[#F8FBCF] text-gray-700'
                      : 'border-black/10 bg-[#FAFAFA] text-gray-600'
                  }`}
                >
                  {isAccountLoading ? 'Carregando...' : budgetModeLabel}
                </span>
                <p className="mt-3 max-w-xl text-xs leading-5 text-gray-500">
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
                className={`flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                  isAutomaticBudgetMode ? 'bg-[#EBF57D]' : 'bg-gray-200'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    isAutomaticBudgetMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-black/5 bg-[#FCFCFC] p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Orçamento para Novos Clientes</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
                  Defina se a IA pode montar orçamentos para clientes que ainda não existem na base.
                </p>
              </div>
            </div>

            {newClientsBudgetError ? (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {newClientsBudgetError}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/5 bg-white px-4 py-4">
              <div>
                <p className="text-xs font-medium text-gray-400">Status atual</p>
                <span
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${newClientsBudgetStatusClassName}`}
                >
                  {isAccountLoading ? 'Carregando...' : newClientsBudgetLabel}
                </span>
                <p className="mt-3 max-w-xl text-xs leading-5 text-gray-500">
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
                className={`flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                  allowBudgetForNewClients ? 'bg-[#EBF57D]' : 'bg-gray-200'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    allowBudgetForNewClients ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {isAdminMember ? (
            <div className="rounded-2xl border border-black/5 bg-[#FCFCFC] p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm">
                    <Database size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Fonte de Dados - Produtos</h3>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Configure de onde os itens da empresa serão coletados.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenSourceDataModal}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  Editar
                </button>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white px-4 py-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-400">Configuração atual</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {isCompanyPlanLoading
                        ? 'Carregando...'
                        : hasCompanySourceConfigured
                          ? companySourceStatusLabel
                          : 'Nenhuma fonte configurada'}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-gray-400">URL</p>
                    <p className="mt-1 break-all text-xs leading-5 text-gray-500">
                      {companySourceLink || '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isAdminMember ? (
            <div className="rounded-2xl border border-black/5 bg-[#FCFCFC] p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm">
                    <Database size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Fonte de Dados - Clientes</h3>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Configure de onde os clientes da empresa serão coletados.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenClientSourceDataModal}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  Editar
                </button>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white px-4 py-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-400">Configuração atual</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {isCompanyPlanLoading
                        ? 'Carregando...'
                        : hasCompanyClientSourceConfigured
                          ? companyClientSourceStatusLabel
                          : 'Nenhuma fonte configurada'}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-gray-400">URL</p>
                    <p className="mt-1 break-all text-xs leading-5 text-gray-500">
                      {companyClientSourceLink || '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {isSourceDataModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="absolute inset-0" aria-hidden="true" onClick={handleCloseSourceDataModal} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fonte-dados-modal-title"
            className="relative z-10 flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAFAFA] text-gray-600">
                  <Database size={18} />
                </div>
                <div>
                  <h2
                    id="fonte-dados-modal-title"
                    className="text-base font-semibold tracking-tight text-gray-900"
                  >
                    Fonte de Dados - Produtos
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                    Escolha como os itens da empresa serão coletados. Neste momento, apenas a
                    integração via API está disponível para configuração.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCloseSourceDataModal}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#FAFAFA]"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSourceData}
                  disabled={isSavingSourceData || sourceDataForm.scrapper_tipo !== 'API'}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {isSavingSourceData ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="border-b border-black/5 bg-[#FCFCFC] px-6 py-5 lg:border-b-0 lg:border-r">
                <p className="text-sm font-semibold text-gray-900">Integrações</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Selecione o formato de coleta disponível.
                </p>

                <div className="mt-5 space-y-2">
                  {SCRAPPER_TYPE_OPTIONS.map((option) => {
                    const isActive = sourceDataForm.scrapper_tipo === option;
                    const isEnabled = option === 'API';

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleSelectScrapperType(option)}
                        disabled={!isEnabled}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                          isActive
                            ? 'border-[#EBF57D] bg-[#F8FBCF] text-gray-900'
                            : 'border-black/5 bg-white text-gray-600'
                        } ${!isEnabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-[#FAFAFA]'}`}
                      >
                        <span>{option}</span>
                        {!isEnabled ? (
                          <span className="text-[11px] font-medium text-gray-400">Em breve</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto px-6 py-5">
                <div className="rounded-3xl border border-black/5 bg-[#FCFCFC] p-5">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Configuração da API</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      URL, Body, Query e Header são opcionais. Os campos JSON serão salvos como JSONB
                      no banco.
                    </p>
                  </div>

                  <div className="mt-5 space-y-4">
                    {sourceDataError ? (
                      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {sourceDataError}
                      </div>
                    ) : null}

                    <div>
                      <label
                        htmlFor="scrapper-link"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        URL
                      </label>
                      <input
                        id="scrapper-link"
                        type="text"
                        value={sourceDataForm.scrapper_link}
                        onChange={handleSourceDataInputChange('scrapper_link')}
                        disabled={sourceDataForm.scrapper_tipo !== 'API'}
                        className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-gray-400"
                        placeholder="https://api.exemplo.com/itens"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="scrapper-body"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Body
                      </label>
                      <textarea
                        id="scrapper-body"
                        value={sourceDataForm.scrapper_body}
                        onChange={handleSourceDataInputChange('scrapper_body')}
                        disabled={sourceDataForm.scrapper_tipo !== 'API'}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 font-mono text-sm text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-gray-400"
                        placeholder='{"token":"abc"}'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="scrapper-query"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Query
                      </label>
                      <textarea
                        id="scrapper-query"
                        value={sourceDataForm.scrapper_query}
                        onChange={handleSourceDataInputChange('scrapper_query')}
                        disabled={sourceDataForm.scrapper_tipo !== 'API'}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 font-mono text-sm text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-gray-400"
                        placeholder='{"page":1}'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="scrapper-headers"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Header
                      </label>
                      <textarea
                        id="scrapper-headers"
                        value={sourceDataForm.scrapper_headers}
                        onChange={handleSourceDataInputChange('scrapper_headers')}
                        disabled={sourceDataForm.scrapper_tipo !== 'API'}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 font-mono text-sm text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-gray-400"
                        placeholder='{"Authorization":"Bearer ..."}'
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isClientSourceDataModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={handleCloseClientSourceDataModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fonte-dados-clientes-modal-title"
            className="relative z-10 flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAFAFA] text-gray-600">
                  <Database size={18} />
                </div>
                <div>
                  <h2
                    id="fonte-dados-clientes-modal-title"
                    className="text-base font-semibold tracking-tight text-gray-900"
                  >
                    Fonte de Dados - Clientes
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                    Escolha como os clientes da empresa serão coletados. Neste momento, apenas a
                    integração via API está disponível para configuração.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCloseClientSourceDataModal}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#FAFAFA]"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSaveClientSourceData}
                  disabled={
                    isSavingClientSourceData || clientSourceDataForm.scrapper_tipo !== 'API'
                  }
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {isSavingClientSourceData ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="border-b border-black/5 bg-[#FCFCFC] px-6 py-5 lg:border-b-0 lg:border-r">
                <p className="text-sm font-semibold text-gray-900">Integrações</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Selecione o formato de coleta disponível.
                </p>

                <div className="mt-5 space-y-2">
                  {SCRAPPER_TYPE_OPTIONS.map((option) => {
                    const isActive = clientSourceDataForm.scrapper_tipo === option;
                    const isEnabled = option === 'API';

                    return (
                      <button
                        key={`clientes-${option}`}
                        type="button"
                        onClick={() =>
                          isEnabled &&
                          setClientSourceDataForm((current) => ({
                            ...current,
                            scrapper_tipo: option,
                          }))
                        }
                        disabled={!isEnabled}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                          isActive
                            ? 'border-[#EBF57D] bg-[#F8FBCF] text-gray-900'
                            : 'border-black/5 bg-white text-gray-600'
                        } ${!isEnabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-[#FAFAFA]'}`}
                      >
                        <span>{option}</span>
                        {!isEnabled ? (
                          <span className="text-[11px] font-medium text-gray-400">Em breve</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto px-6 py-5">
                <div className="rounded-3xl border border-black/5 bg-[#FCFCFC] p-5">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Configuração da API</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      URL, Body, Query e Header são opcionais. Os campos JSON serão salvos como JSONB
                      no banco.
                    </p>
                  </div>

                  <div className="mt-5 space-y-4">
                    {clientSourceDataError ? (
                      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {clientSourceDataError}
                      </div>
                    ) : null}

                    <div>
                      <label
                        htmlFor="cliente-api-link"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        URL
                      </label>
                      <input
                        id="cliente-api-link"
                        type="text"
                        value={clientSourceDataForm.scrapper_link}
                        onChange={handleClientSourceDataInputChange('scrapper_link')}
                        disabled={clientSourceDataForm.scrapper_tipo !== 'API'}
                        className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-gray-400"
                        placeholder="https://api.exemplo.com/clientes"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="cliente-api-body"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Body
                      </label>
                      <textarea
                        id="cliente-api-body"
                        value={clientSourceDataForm.scrapper_body}
                        onChange={handleClientSourceDataInputChange('scrapper_body')}
                        disabled={clientSourceDataForm.scrapper_tipo !== 'API'}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 font-mono text-sm text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-gray-400"
                        placeholder='{"token":"abc"}'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="cliente-api-query"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Query
                      </label>
                      <textarea
                        id="cliente-api-query"
                        value={clientSourceDataForm.scrapper_query}
                        onChange={handleClientSourceDataInputChange('scrapper_query')}
                        disabled={clientSourceDataForm.scrapper_tipo !== 'API'}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 font-mono text-sm text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-gray-400"
                        placeholder='{"page":1}'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="cliente-api-headers"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Header
                      </label>
                      <textarea
                        id="cliente-api-headers"
                        value={clientSourceDataForm.scrapper_headers}
                        onChange={handleClientSourceDataInputChange('scrapper_headers')}
                        disabled={clientSourceDataForm.scrapper_tipo !== 'API'}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 font-mono text-sm text-gray-900 outline-none transition-colors focus:border-black/20 disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:text-gray-400"
                        placeholder='{"Authorization":"Bearer ..."}'
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isQuoteRulesModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="absolute inset-0" aria-hidden="true" onClick={handleCloseQuoteRulesModal} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regras-cotacao-modal-title"
            className="relative z-10 flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F8FBCF] text-gray-700">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2
                    id="regras-cotacao-modal-title"
                    className="text-base font-semibold tracking-tight text-gray-900"
                  >
                    Regras de Cotação
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                    Configure quais informações a IA deve solicitar ao cliente para validar uma cotação
                    antes de avançar no atendimento.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCloseQuoteRulesModal}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#FAFAFA]"
                >
                  Fechar
                </button>
                {hasQuoteRulesChanges ? (
                  <button
                    type="button"
                    onClick={handleSaveQuoteRules}
                    disabled={isSavingQuoteRules}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={16} />
                    {isSavingQuoteRules ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1.2fr)_380px]">
              <div className="min-h-0 overflow-y-auto border-b border-black/5 bg-[#FCFCFC] px-6 py-5 xl:border-b-0 xl:border-r">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Regras atuais</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {quoteRulesDraft.length} regra(s) cadastrada(s),{' '}
                      {quoteRulesDraft.filter((rule) => rule.ativo).length} ativa(s)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetQuoteRuleForm}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
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
                        className="rounded-3xl border border-black/5 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900">{rule.name}</p>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  rule.nivel === 'OBRIGATORIO'
                                    ? 'bg-[#EBF57D] text-gray-900'
                                    : 'bg-[#FAFAFA] text-gray-500'
                                }`}
                              >
                                {formatEnumLabel(rule.nivel)}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                  rule.ativo
                                    ? 'border-[#EBF57D] bg-[#F8FBCF] text-gray-700'
                                    : 'border-black/10 bg-white text-gray-500'
                                }`}
                              >
                                {rule.ativo ? 'Ativa' : 'Desativada'}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-gray-500">{rule.descricao}</p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectQuoteRuleForEdit(rule)}
                              className="rounded-2xl bg-[#FAFAFA] px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleQuoteRuleActive(rule.name)}
                              className="inline-flex items-center gap-2 rounded-2xl bg-[#FAFAFA] px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                            >
                              {rule.ativo ? <PowerOff size={14} /> : <Power size={14} />}
                              {rule.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuoteRule(rule.name)}
                              className="inline-flex items-center gap-2 rounded-2xl bg-[#FFF1F1] px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-[#FFE5E5]"
                            >
                              <Trash2 size={14} />
                              Excluir
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-black/10 bg-white px-6 py-10 text-center">
                      <p className="text-sm font-semibold text-gray-900">Nenhuma regra cadastrada</p>
                      <p className="mt-2 text-sm leading-6 text-gray-500">
                        Crie a primeira regra para orientar a IA sobre o que deve ser solicitado ao
                        cliente na etapa de cotação.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto px-6 py-5">
                <div className="rounded-3xl border border-black/5 bg-[#FCFCFC] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {isEditingQuoteRule ? 'Editar regra' : 'Nova regra'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Toda nova regra comeca como ativa e passa a orientar a IA apos salvar as
                        alteracoes.
                      </p>
                    </div>

                    {isEditingQuoteRule ? (
                      <button
                        type="button"
                        onClick={handleResetQuoteRuleForm}
                        className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-800"
                        aria-label="Cancelar edicao da regra"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-4">
                    {quoteRulesError ? (
                      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {quoteRulesError}
                      </div>
                    ) : null}

                    <div>
                      <label
                        htmlFor="quote-rule-name"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Nome da regra
                      </label>
                      <input
                        id="quote-rule-name"
                        type="text"
                        value={quoteRuleForm.name}
                        onChange={handleQuoteRuleFormChange('name')}
                        className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                        placeholder="Ex.: CNPJ, CEP de entrega, Industria"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="quote-rule-level"
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Nivel
                      </label>
                      <select
                        id="quote-rule-level"
                        value={quoteRuleForm.nivel}
                        onChange={handleQuoteRuleFormChange('nivel')}
                        className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
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
                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                      >
                        Descricao
                      </label>
                      <textarea
                        id="quote-rule-description"
                        value={quoteRuleForm.descricao}
                        onChange={handleQuoteRuleFormChange('descricao')}
                        rows={5}
                        maxLength={100}
                        className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                        placeholder="Explique para a IA qual informacao ela deve solicitar ao cliente e por que isso e necessario."
                      />
                      <div className="mt-2 text-right text-[11px] font-medium text-gray-400">
                        {quoteRuleForm.descricao.length}/100
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleResetQuoteRuleForm}
                        className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#FAFAFA]"
                      >
                        Limpar
                      </button>
                      <button
                        type="button"
                        onClick={handleUpsertQuoteRule}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90"
                      >
                        <Plus size={15} />
                        {isEditingQuoteRule ? 'Atualizar regra' : 'Adicionar regra'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
            className="relative z-10 w-full max-w-md rounded-3xl border border-black/5 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAFAFA] text-gray-600">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h2
                    id="alterar-senha-modal-title"
                    className="text-base font-semibold tracking-tight text-gray-900"
                  >
                    Alterar senha
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-gray-500">
                    Informe sua senha atual e defina uma nova senha para a conta.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseChangePasswordModal}
                className="rounded-xl bg-[#FAFAFA] px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-4">
              {passwordSaveError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {passwordSaveError}
                </div>
              ) : null}

              {passwordSaveSuccess ? (
                <div className="rounded-2xl border border-[#EBF57D] bg-[#F8FBCF] px-4 py-3 text-sm font-medium text-gray-700">
                  {passwordSaveSuccess}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="current-password"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Senha atual
                </label>
                <div className="relative mt-2">
                  <input
                    id="current-password"
                    type={passwordVisibility.currentPassword ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordInputChange('currentPassword')}
                    className="w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 pr-12 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                    placeholder="Digite sua senha atual"
                  />
                  <button
                    type="button"
                    onClick={() => handleTogglePasswordVisibility('currentPassword')}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 transition-colors hover:text-gray-700"
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
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Nova senha
                </label>
                <div className="relative mt-2">
                  <input
                    id="new-password"
                    type={passwordVisibility.newPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={handlePasswordInputChange('newPassword')}
                    className="w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 pr-12 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                    placeholder="Digite a nova senha"
                  />
                  <button
                    type="button"
                    onClick={() => handleTogglePasswordVisibility('newPassword')}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 transition-colors hover:text-gray-700"
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
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Confirmar nova senha
                </label>
                <div className="relative mt-2">
                  <input
                    id="confirm-new-password"
                    type={passwordVisibility.confirmNewPassword ? 'text' : 'password'}
                    value={passwordForm.confirmNewPassword}
                    onChange={handlePasswordInputChange('confirmNewPassword')}
                    className="w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 pr-12 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                    placeholder="Confirme a nova senha"
                  />
                  <button
                    type="button"
                    onClick={() => handleTogglePasswordVisibility('confirmNewPassword')}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 transition-colors hover:text-gray-700"
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
                className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#FAFAFA]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePassword}
                disabled={isSavingPassword}
                className="rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="relative z-10 flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAFAFA] text-gray-600">
                  <FileText size={18} />
                </div>
                <div>
                  <h2
                    id="termos-modal-title"
                    className="text-base font-semibold tracking-tight text-gray-900"
                  >
                    Termos de Uso
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-gray-500">
                    Visualize os termos completos de uso da empresa.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseTermsModal}
                className="rounded-xl bg-[#FAFAFA] px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                Fechar
              </button>
            </div>

            <div className="min-h-0 flex-1 bg-[#FAFAFA] p-3">
              <iframe
                src="/termos-de-uso.html"
                title="Termos de Uso"
                className="h-full w-full rounded-2xl border border-black/5 bg-white"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default GeralTab;
