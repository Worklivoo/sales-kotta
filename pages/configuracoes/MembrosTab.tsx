import React, { useEffect, useMemo, useState } from 'react';
import { MoreVertical, Plus, User, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TeamMemberRecord {
  membro_id: string;
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  status: string | null;
}

interface CreateMemberFormState {
  nome: string;
  email: string;
  telefone: string;
  senha: string;
}

interface EditMemberFormState {
  nome: string;
  telefone: string;
}

interface MemberActionFeedback {
  type: 'success' | 'error';
  message: string;
}

const INITIAL_CREATE_MEMBER_FORM: CreateMemberFormState = {
  nome: '',
  email: '',
  telefone: '',
  senha: '',
};

const INITIAL_EDIT_MEMBER_FORM: EditMemberFormState = {
  nome: '',
  telefone: '',
};

type MemberCardActionKey =
  | 'reset-password'
  | 'edit-info'
  | 'deactivate'
  | 'activate'
  | 'delete';

interface MemberCardAction {
  key: MemberCardActionKey;
  label: string;
}

const MEMBER_CARD_ACTIONS: MemberCardAction[] = [
  { key: 'reset-password', label: 'Redefinir Senha' },
  { key: 'edit-info', label: 'Editar Informacoes' },
  { key: 'deactivate', label: 'Desativar Membro' },
  { key: 'delete', label: 'Excluir Membro' },
];

const getMemberCardActions = (status: string | null): MemberCardAction[] =>
  MEMBER_CARD_ACTIONS.map((action) => {
    if (action.key !== 'deactivate') {
      return action;
    }

    return {
      key: status === 'INATIVO' ? 'activate' : 'deactivate',
      label: status === 'INATIVO' ? 'Ativar Membro' : 'Desativar Membro',
    };
  });

const sortMembersByName = (memberList: TeamMemberRecord[]) =>
  [...memberList].sort((left, right) => (left.nome || '').localeCompare(right.nome || '', 'pt-BR'));

const formatEnumLabel = (value: string | null) => {
  if (!value) {
    return 'Usuario';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

const getInitials = (name: string | null) => {
  const normalizedName = name?.trim();

  if (!normalizedName) {
    return '--';
  }

  const parts = normalizedName.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

const MembrosTab: React.FC = () => {
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);
  const [memberActionFeedback, setMemberActionFeedback] = useState<MemberActionFeedback | null>(null);
  const [isCreateMemberModalOpen, setIsCreateMemberModalOpen] = useState(false);
  const [createMemberForm, setCreateMemberForm] =
    useState<CreateMemberFormState>(INITIAL_CREATE_MEMBER_FORM);
  const [createMemberError, setCreateMemberError] = useState<string | null>(null);
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [isEditMemberModalOpen, setIsEditMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberRecord | null>(null);
  const [editMemberForm, setEditMemberForm] = useState<EditMemberFormState>(INITIAL_EDIT_MEMBER_FORM);
  const [editMemberError, setEditMemberError] = useState<string | null>(null);
  const [isSavingMemberEdit, setIsSavingMemberEdit] = useState(false);
  const [memberActionInProgressId, setMemberActionInProgressId] = useState<string | null>(null);
  const [memberActionInProgressType, setMemberActionInProgressType] =
    useState<MemberCardActionKey | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMembers = async () => {
      setIsLoadingMembers(true);
      setMembersError(null);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user?.id) {
          throw new Error('Nao foi possivel identificar o usuario autenticado.');
        }

        const { data: currentMember, error: currentMemberError } = await supabase
          .from('sales_membros_empresa')
          .select('empresa_id')
          .eq('membro_id', session.user.id)
          .maybeSingle();

        if (currentMemberError) {
          throw currentMemberError;
        }

        if (!currentMember?.empresa_id) {
          throw new Error('Nao foi possivel identificar a empresa vinculada ao usuario.');
        }

        if (!isMounted) {
          return;
        }

        setCompanyId(currentMember.empresa_id);

        const { data, error } = await supabase
          .from('sales_membros_empresa')
          .select('membro_id, empresa_id, nome, email, telefone, cargo, status')
          .eq('empresa_id', currentMember.empresa_id)
          .order('nome', { ascending: true });

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        setMembers((data as TeamMemberRecord[] | null) ?? []);
      } catch (error: any) {
        console.error('Erro ao carregar membros da equipe:', error);

        if (!isMounted) {
          return;
        }

        setMembers([]);
        setCompanyId(null);
        setMembersError(error?.message || 'Nao foi possivel carregar os membros da equipe.');
      } finally {
        if (isMounted) {
          setIsLoadingMembers(false);
        }
      }
    };

    loadMembers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!openMemberMenuId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(`[data-member-menu-root="${openMemberMenuId}"]`)) {
        return;
      }

      setOpenMemberMenuId(null);
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMemberMenuId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [openMemberMenuId]);

  const memberCards = useMemo(
    () =>
      members.map((member) => ({
        id: member.membro_id,
        name: member.nome?.trim() || 'Sem nome',
        initials: getInitials(member.nome),
        email: member.email?.trim() || '-',
        phone: formatPhone(member.telefone),
        role: formatEnumLabel(member.cargo),
        status: member.status,
      }))
      .filter((member) => member.role !== 'Admin'),
    [members],
  );

  const handleOpenCreateMemberModal = () => {
    setCreateMemberForm(INITIAL_CREATE_MEMBER_FORM);
    setCreateMemberError(null);
    setMemberActionFeedback(null);
    setIsCreateMemberModalOpen(true);
  };

  const handleToggleMemberMenu = (memberId: string) => {
    setOpenMemberMenuId((current) => (current === memberId ? null : memberId));
  };

  const handleCloseCreateMemberModal = () => {
    if (isCreatingMember) {
      return;
    }

    setIsCreateMemberModalOpen(false);
  };

  const handleOpenEditMemberModal = (memberId: string) => {
    const selectedMember = members.find((member) => member.membro_id === memberId);

    if (!selectedMember) {
      setMemberActionFeedback({
        type: 'error',
        message: 'Nao foi possivel localizar o membro selecionado.',
      });
      return;
    }

    setEditingMember(selectedMember);
    setEditMemberForm({
      nome: selectedMember.nome?.trim() || '',
      telefone: formatPhoneInput(selectedMember.telefone || ''),
    });
    setEditMemberError(null);
    setMemberActionFeedback(null);
    setIsEditMemberModalOpen(true);
  };

  const handleCloseEditMemberModal = () => {
    if (isSavingMemberEdit) {
      return;
    }

    setIsEditMemberModalOpen(false);
    setEditingMember(null);
    setEditMemberForm(INITIAL_EDIT_MEMBER_FORM);
    setEditMemberError(null);
  };

  const handleCreateMemberInputChange =
    (field: keyof CreateMemberFormState) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue = field === 'telefone' ? formatPhoneInput(rawValue) : rawValue;

      setCreateMemberForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
      setCreateMemberError(null);
    };

  const handleEditMemberInputChange =
    (field: keyof EditMemberFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      const nextValue = field === 'telefone' ? formatPhoneInput(rawValue) : rawValue;

      setEditMemberForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
      setEditMemberError(null);
    };

  const getSessionAccessToken = async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session?.access_token) {
      throw new Error('Nao foi possivel identificar a sessao atual do usuario.');
    }

    return session.access_token;
  };

  const executeMemberAction = async (payload: Record<string, unknown>) => {
    const accessToken = await getSessionAccessToken();
    const response = await fetch('/api/manage-member', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(responseBody?.error || 'Nao foi possivel executar a acao para o membro.');
    }

    return responseBody;
  };

  const handleMemberMenuAction = async (actionKey: MemberCardActionKey, memberId: string) => {
    setOpenMemberMenuId(null);
    setMemberActionFeedback(null);

    if (actionKey === 'edit-info') {
      handleOpenEditMemberModal(memberId);
      return;
    }

    const selectedMember = members.find((member) => member.membro_id === memberId);

    if (!selectedMember) {
      setMemberActionFeedback({
        type: 'error',
        message: 'Nao foi possivel localizar o membro selecionado.',
      });
      return;
    }

    if (actionKey === 'deactivate' || actionKey === 'activate') {
      const shouldToggleStatus = window.confirm(
        actionKey === 'deactivate'
          ? `Deseja desativar o membro ${selectedMember.nome?.trim() || 'selecionado'}?`
          : `Deseja ativar o membro ${selectedMember.nome?.trim() || 'selecionado'}?`,
      );

      if (!shouldToggleStatus) {
        return;
      }
    }

    if (actionKey === 'delete') {
      const shouldDelete = window.confirm(
        `Deseja excluir o membro ${selectedMember.nome?.trim() || 'selecionado'}? Essa acao tambem removera o usuario do Auth.`,
      );

      if (!shouldDelete) {
        return;
      }
    }

    setMemberActionInProgressId(memberId);
    setMemberActionInProgressType(actionKey);

    try {
      if (actionKey === 'reset-password') {
        const result = await executeMemberAction({
          action: 'reset-password',
          memberId,
        });

        setMemberActionFeedback({
          type: 'success',
          message: result?.message || 'Link de redefinicao enviado com sucesso.',
        });
        return;
      }

      if (actionKey === 'deactivate' || actionKey === 'activate') {
        const result = await executeMemberAction({
          action: actionKey,
          memberId,
        });

        const updatedMember = result?.member as TeamMemberRecord | undefined;

        if (updatedMember?.membro_id) {
          setMembers((current) =>
            sortMembersByName(
              current.map((member) =>
                member.membro_id === updatedMember.membro_id ? { ...member, ...updatedMember } : member,
              ),
            ),
          );
        }

        setMemberActionFeedback({
          type: 'success',
          message:
            result?.message ||
            (actionKey === 'deactivate'
              ? 'Membro desativado com sucesso.'
              : 'Membro ativado com sucesso.'),
        });
        return;
      }

      if (actionKey === 'delete') {
        const result = await executeMemberAction({
          action: 'delete',
          memberId,
        });

        setMembers((current) =>
          current.filter((member) => member.membro_id !== (result?.memberId as string | undefined)),
        );
        setMemberActionFeedback({
          type: 'success',
          message: result?.message || 'Membro excluido com sucesso.',
        });
      }
    } catch (error: any) {
      console.error('Erro ao executar acao do membro:', error);
      setMemberActionFeedback({
        type: 'error',
        message: error?.message || 'Nao foi possivel executar a acao para o membro.',
      });
    } finally {
      setMemberActionInProgressId(null);
      setMemberActionInProgressType(null);
    }
  };

  const handleSaveMemberEdit = async () => {
    if (!editingMember?.membro_id) {
      setEditMemberError('Nao foi possivel identificar o membro selecionado.');
      return;
    }

    const nome = editMemberForm.nome.trim();
    const telefoneDigits = normalizePhoneDigits(editMemberForm.telefone);

    if (!nome) {
      setEditMemberError('Informe o nome do membro.');
      return;
    }

    if (telefoneDigits.length < 10 || telefoneDigits.length > 11) {
      setEditMemberError('Informe um telefone valido com DDD.');
      return;
    }

    setIsSavingMemberEdit(true);
    setEditMemberError(null);
    setMemberActionFeedback(null);

    try {
      const result = await executeMemberAction({
        action: 'update-info',
        memberId: editingMember.membro_id,
        nome,
        telefone: editMemberForm.telefone,
      });

      const updatedMember = result?.member as TeamMemberRecord | undefined;

      if (!updatedMember?.membro_id) {
        throw new Error('Nao foi possivel obter os dados atualizados do membro.');
      }

      setMembers((current) =>
        sortMembersByName(
          current.map((member) =>
            member.membro_id === updatedMember.membro_id ? { ...member, ...updatedMember } : member,
          ),
        ),
      );
      handleCloseEditMemberModal();
      setMemberActionFeedback({
        type: 'success',
        message: result?.message || 'Informacoes do membro atualizadas com sucesso.',
      });
    } catch (error: any) {
      console.error('Erro ao editar membro:', error);
      setEditMemberError(error?.message || 'Nao foi possivel salvar as informacoes do membro.');
    } finally {
      setIsSavingMemberEdit(false);
    }
  };

  const handleCreateMember = async () => {
    const nome = createMemberForm.nome.trim();
    const email = createMemberForm.email.trim().toLowerCase();
    const telefoneDigits = normalizePhoneDigits(createMemberForm.telefone);
    const senha = createMemberForm.senha;

    if (!companyId) {
      setCreateMemberError('Nao foi possivel identificar a empresa do membro.');
      return;
    }

    if (!nome) {
      setCreateMemberError('Informe o nome completo do membro.');
      return;
    }

    if (!email) {
      setCreateMemberError('Informe o e-mail do membro.');
      return;
    }

    if (telefoneDigits.length < 10 || telefoneDigits.length > 11) {
      setCreateMemberError('Informe um telefone valido com DDD.');
      return;
    }

    if (!senha || senha.length < 6) {
      setCreateMemberError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setIsCreatingMember(true);
    setCreateMemberError(null);

    try {
      const accessToken = await getSessionAccessToken();

      const response = await fetch('/api/create-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          nome,
          email,
          telefone: createMemberForm.telefone,
          senha,
        }),
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(responseBody?.error || 'Nao foi possivel criar o membro.');
      }

      const createdMember = responseBody?.member as TeamMemberRecord | undefined;

      if (!createdMember?.membro_id) {
        throw new Error('Nao foi possivel obter os dados do membro criado.');
      }

      setMembers((current) => sortMembersByName([...current, createdMember]));
      setCreateMemberForm(INITIAL_CREATE_MEMBER_FORM);
      setIsCreateMemberModalOpen(false);
      setMemberActionFeedback({
        type: 'success',
        message: 'Membro adicionado com sucesso.',
      });
    } catch (error: any) {
      console.error('Erro ao criar membro da equipe:', error);
      setCreateMemberError(error?.message || 'Nao foi possivel criar o membro.');
    } finally {
      setIsCreatingMember(false);
    }
  };

  return (
    <div className="min-h-[520px]">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-[22px] font-semibold tracking-tight text-gray-900">
              Membros da Equipe
            </h2>
            <p className="text-sm text-gray-500">Gerencie os membros da sua equipe</p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateMemberModal}
            className="inline-flex h-11 items-center gap-2 self-start rounded-2xl bg-[#F5F5F5] px-5 text-sm font-semibold text-gray-900 transition-colors hover:bg-[#EEEEEE]"
          >
            <Plus size={18} />
            Adicionar Membro
          </button>
        </div>

        {membersError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {membersError}
          </div>
        ) : null}

        {memberActionFeedback ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-medium ${
              memberActionFeedback.type === 'success'
                ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border border-red-100 bg-red-50 text-red-600'
            }`}
          >
            {memberActionFeedback.message}
          </div>
        ) : null}

        {isLoadingMembers ? (
          <div className="rounded-2xl border border-black/5 bg-[#FCFCFC] px-5 py-6 text-sm font-medium text-gray-500">
            Carregando membros da equipe...
          </div>
        ) : memberCards.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {memberCards.map((member) => (
              <article
                key={member.id}
                className="w-full rounded-[20px] border border-black/5 bg-[#FCFCFC] px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:w-[260px]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[14px] font-semibold text-gray-900">{member.name}</h3>

                  <div className="relative" data-member-menu-root={member.id}>
                    <button
                      type="button"
                      aria-label={`Mais opcoes para ${member.name}`}
                      aria-haspopup="menu"
                      aria-expanded={openMemberMenuId === member.id}
                      onClick={() => handleToggleMemberMenu(member.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white hover:text-gray-800"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {openMemberMenuId === member.id ? (
                      <div
                        role="menu"
                        aria-label={`Acoes do membro ${member.name}`}
                        className="absolute right-0 top-9 z-20 min-w-[190px] rounded-2xl border border-black/5 bg-white p-1.5 shadow-[0_24px_60px_rgba(15,23,42,0.14)]"
                      >
                        {getMemberCardActions(member.status).map((action) => (
                          <button
                            key={action.key}
                            type="button"
                            role="menuitem"
                            onClick={() => handleMemberMenuAction(action.key, member.id)}
                            disabled={memberActionInProgressId === member.id}
                            className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                              action.key === 'delete'
                                ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                                : 'text-gray-700 hover:bg-[#F7F7F7] hover:text-gray-900'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {memberActionInProgressId === member.id &&
                            memberActionInProgressType === action.key
                              ? 'Processando...'
                              : action.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#F0F0F0] text-[17px] font-semibold text-gray-900">
                    {member.initials}
                  </div>

                  <div className="mt-4 space-y-0.5">
                    <p className="text-[13px] font-medium text-[#5B6477]">{member.email}</p>
                    <p className="text-[13px] font-medium text-[#5B6477]">{member.phone}</p>
                  </div>

                  <div className="mt-3 inline-flex min-w-[108px] items-center justify-center gap-1.5 rounded-full border border-black/8 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-900">
                    <User size={13} className="text-gray-500" />
                    {member.role}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-black/10 bg-[#FCFCFC] px-5 py-8 text-center">
            <p className="text-sm font-semibold text-gray-900">Nenhum membro encontrado</p>
            <p className="mt-1 text-sm text-gray-500">
              Quando houver membros cadastrados na empresa, eles aparecerao aqui.
            </p>
          </div>
        )}
      </div>

      {isCreateMemberModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={handleCloseCreateMemberModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="adicionar-membro-modal-title"
            className="relative z-10 w-full max-w-lg rounded-3xl border border-black/5 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="adicionar-membro-modal-title"
                  className="text-base font-semibold tracking-tight text-gray-900"
                >
                  Adicionar Membro
                </h2>
                <p className="mt-1 text-sm leading-5 text-gray-500">
                  Cadastre um novo membro da equipe com acesso individual ao sistema.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseCreateMemberModal}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FAFAFA] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Fechar popup de adicionar membro"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {createMemberError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {createMemberError}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="novo-membro-nome"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Nome Completo
                </label>
                <input
                  id="novo-membro-nome"
                  type="text"
                  value={createMemberForm.nome}
                  onChange={handleCreateMemberInputChange('nome')}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                  placeholder="Digite o nome completo"
                />
              </div>

              <div>
                <label
                  htmlFor="novo-membro-email"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  E-mail
                </label>
                <input
                  id="novo-membro-email"
                  type="email"
                  value={createMemberForm.email}
                  onChange={handleCreateMemberInputChange('email')}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                  placeholder="Digite o e-mail"
                />
              </div>

              <div>
                <label
                  htmlFor="novo-membro-telefone"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Telefone
                </label>
                <input
                  id="novo-membro-telefone"
                  type="text"
                  value={createMemberForm.telefone}
                  onChange={handleCreateMemberInputChange('telefone')}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div>
                <label
                  htmlFor="novo-membro-senha"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Senha
                </label>
                <input
                  id="novo-membro-senha"
                  type="password"
                  value={createMemberForm.senha}
                  onChange={handleCreateMemberInputChange('senha')}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                  placeholder="Digite a senha inicial"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseCreateMemberModal}
                disabled={isCreatingMember}
                className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateMember}
                disabled={isCreatingMember}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={16} />
                {isCreatingMember ? 'Adicionando...' : 'Adicionar Membro'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditMemberModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={handleCloseEditMemberModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="editar-membro-modal-title"
            className="relative z-10 w-full max-w-lg rounded-3xl border border-black/5 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="editar-membro-modal-title"
                  className="text-base font-semibold tracking-tight text-gray-900"
                >
                  Editar Informacoes
                </h2>
                <p className="mt-1 text-sm leading-5 text-gray-500">
                  Atualize apenas o nome e o telefone do membro selecionado.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseEditMemberModal}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FAFAFA] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Fechar popup de editar membro"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {editMemberError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {editMemberError}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="editar-membro-nome"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Nome
                </label>
                <input
                  id="editar-membro-nome"
                  type="text"
                  value={editMemberForm.nome}
                  onChange={handleEditMemberInputChange('nome')}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                  placeholder="Digite o nome do membro"
                />
              </div>

              <div>
                <label
                  htmlFor="editar-membro-telefone"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400"
                >
                  Telefone
                </label>
                <input
                  id="editar-membro-telefone"
                  type="text"
                  value={editMemberForm.telefone}
                  onChange={handleEditMemberInputChange('telefone')}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#FAFAFA] px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-black/20"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseEditMemberModal}
                disabled={isSavingMemberEdit}
                className="rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveMemberEdit}
                disabled={isSavingMemberEdit}
                className="rounded-2xl bg-[#EBF57D] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingMemberEdit ? 'Salvando...' : 'Salvar Alteracoes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MembrosTab;
