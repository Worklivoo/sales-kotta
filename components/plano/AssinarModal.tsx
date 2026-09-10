import React, { useMemo, useState } from 'react';
import { Check, Copy, CreditCard, QrCode, Ticket, X } from 'lucide-react';
import {
  assinarPlano,
  validarCupom,
  verificarStatusPagamento,
  type AssinarPlanoResultado,
  type CatalogoOpcao,
  type ConsumoResposta,
  type CupomValidado,
  type FormaPagamento,
} from '../../lib/planoApi';

interface AssinarModalProps {
  opcao: CatalogoOpcao;
  empresa: ConsumoResposta['empresa'];
  jaTemAssinatura: boolean;
  onSucesso: () => void;
  onFechar: () => void;
}

type Etapa = 'dados' | 'pagamento' | 'pix' | 'cartao';

const somenteDigitos = (valor: string) => valor.replace(/\D/g, '');

const formatarCnpj = (valor: string) =>
  somenteDigitos(valor)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2')
    .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, '$1-$2');

const formatarCelular = (valor: string) => {
  const digitos = somenteDigitos(valor).slice(0, 11);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
};

const formatarCep = (valor: string) => {
  const digitos = somenteDigitos(valor).slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
};

const formatarNumeroCartao = (valor: string) =>
  somenteDigitos(valor)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

const formatarValidade = (valor: string) => {
  const digitos = somenteDigitos(valor).slice(0, 4);
  return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
};

const celularInicial = (telefone: string | null) => {
  const digitos = somenteDigitos(telefone || '');
  const semDdi = digitos.startsWith('55') && digitos.length > 11 ? digitos.slice(2) : digitos;
  return formatarCelular(semDdi);
};

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

/* Cupom que a empresa ja tem continua valendo numa troca de plano (o
   desconto negociado nao se perde), entao o modal ja abre com ele aplicado -
   caso contrario o resumo mostraria um valor maior do que o cobrado. A conta
   espelha calcularPreco no servidor, que segue sendo a fonte da verdade. */
const preverCupomVigente = (
  cupom: ConsumoResposta['empresa']['cupom'],
  opcao: CatalogoOpcao,
): CupomValidado | null => {
  if (!cupom?.codigo) return null;

  const precoCheio = opcao.precoCicloTotal;
  let precoFinal = precoCheio;

  if (cupom.descontoPct) {
    precoFinal = arredondar(precoCheio * (1 - cupom.descontoPct / 100));
  } else if (cupom.descontoValor) {
    precoFinal = arredondar(precoCheio - cupom.descontoValor);
  } else {
    return null;
  }

  if (precoFinal < 1) precoFinal = 1;

  return {
    codigo: cupom.codigo,
    descricao: null,
    descontoPct: cupom.descontoPct,
    descontoValor: cupom.descontoValor,
    precoCheio,
    precoFinal,
    precoMesEquivalente: arredondar(precoFinal / opcao.meses),
    descontoAplicado: arredondar(precoCheio - precoFinal),
  };
};

const inputClass =
  'mt-1.5 w-full rounded-tile border border-line-soft bg-paper px-3.5 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-ink';
const labelClass = 'text-[11.5px] uppercase text-muted-soft';
const labelStyle = { fontWeight: 700, letterSpacing: '.06em' } as const;

const AssinarModal: React.FC<AssinarModalProps> = ({
  opcao,
  empresa,
  jaTemAssinatura,
  onSucesso,
  onFechar,
}) => {
  const [etapa, setEtapa] = useState<Etapa>('dados');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<AssinarPlanoResultado | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const [nome, setNome] = useState(empresa.nomeResponsavel || '');
  const [cnpj, setCnpj] = useState(formatarCnpj(empresa.cnpj || ''));
  const [email, setEmail] = useState(empresa.emailResponsavel || '');
  const [celular, setCelular] = useState(celularInicial(empresa.telefoneResponsavel));

  const [cupomTexto, setCupomTexto] = useState('');
  const [cupomAplicado, setCupomAplicado] = useState<CupomValidado | null>(null);
  const [cupomErro, setCupomErro] = useState<string | null>(null);
  const [validandoCupom, setValidandoCupom] = useState(false);

  const [forma, setForma] = useState<FormaPagamento>('PIX');
  const [numeroCartao, setNumeroCartao] = useState('');
  const [nomeImpresso, setNomeImpresso] = useState('');
  const [validade, setValidade] = useState('');
  const [cvv, setCvv] = useState('');
  const [cep, setCep] = useState(formatarCep(empresa.enderecoFaturamento?.cep || ''));
  const [numeroEndereco, setNumeroEndereco] = useState(empresa.enderecoFaturamento?.numero || '');
  const [complemento, setComplemento] = useState(empresa.enderecoFaturamento?.complemento || '');

  const errosDados = useMemo(() => {
    const problemas: Record<string, string> = {};
    if (!nome.trim()) problemas.nome = 'Informe o nome/razão social.';
    if (somenteDigitos(cnpj).length !== 14) problemas.cnpj = 'CNPJ deve ter 14 dígitos.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) problemas.email = 'E-mail inválido.';

    const digitos = somenteDigitos(celular);
    if (digitos.length !== 11 || digitos[2] !== '9') {
      problemas.celular = 'Celular com DDD, começando com 9 (ex: 11 91234-5678).';
    }

    return problemas;
  }, [nome, cnpj, email, celular]);

  const errosCartao = useMemo(() => {
    if (forma !== 'CREDIT_CARD') return {};

    const problemas: Record<string, string> = {};
    const digitos = somenteDigitos(numeroCartao);
    if (digitos.length < 13 || digitos.length > 19) problemas.numeroCartao = 'Número inválido.';
    if (!nomeImpresso.trim()) problemas.nomeImpresso = 'Informe o nome do cartão.';

    const [mes, ano] = validade.split('/');
    const mesNumero = Number(mes);
    if (!mes || !mesNumero || mesNumero < 1 || mesNumero > 12 || !ano || ano.length !== 2) {
      problemas.validade = 'Validade inválida.';
    }

    if (somenteDigitos(cvv).length < 3) problemas.cvv = 'CVV inválido.';
    if (somenteDigitos(cep).length !== 8) problemas.cep = 'CEP inválido.';
    if (!numeroEndereco.trim()) problemas.numeroEndereco = 'Informe o número.';

    return problemas;
  }, [forma, numeroCartao, nomeImpresso, validade, cvv, cep, numeroEndereco]);

  const dadosOk = Object.keys(errosDados).length === 0;
  const cartaoOk = Object.keys(errosCartao).length === 0;

  /* Erro so aparece depois que o campo foi tocado - abrir o formulario de
     cartao com tudo em vermelho passa a impressao de que algo deu errado. */
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const marcarTocado = (campo: string) => setTocados((atual) => ({ ...atual, [campo]: true }));
  const erroDe = (erros: Record<string, string>, campo: string) =>
    tocados[campo] ? erros[campo] : undefined;

  /* Cupom vigente = o que a empresa ja tem na conta. Vale como preview, mas
     nao vai no payload: o servidor mesmo o recupera, e reenviar o codigo
     faria a troca de plano falhar caso ele tenha sido desativado depois. */
  const cupomVigente = useMemo(() => preverCupomVigente(empresa.cupom, opcao), [empresa.cupom, opcao]);
  const cupomEfetivo = cupomAplicado || cupomVigente;

  const precoCheio = cupomEfetivo?.precoCheio ?? opcao.precoCicloTotal;
  const precoFinal = cupomEfetivo?.precoFinal ?? opcao.precoCicloTotal;
  const precoMes = cupomEfetivo?.precoMesEquivalente ?? opcao.precoMesEquivalente;

  const aplicarCupom = async () => {
    if (!cupomTexto.trim()) return;

    setValidandoCupom(true);
    setCupomErro(null);

    try {
      const validado = await validarCupom(cupomTexto.trim(), opcao.planoCodigo, opcao.ciclo);
      setCupomAplicado(validado);
    } catch (error: any) {
      setCupomAplicado(null);
      setCupomErro(error?.message || 'Não foi possível validar o cupom.');
    } finally {
      setValidandoCupom(false);
    }
  };

  const removerCupom = () => {
    setCupomAplicado(null);
    setCupomTexto('');
    setCupomErro(null);
  };

  const enviar = async () => {
    if (!dadosOk) return;
    if (!jaTemAssinatura && forma === 'CREDIT_CARD' && !cartaoOk) return;

    setEnviando(true);
    setErro(null);

    try {
      const [validadeMes, validadeAno] = validade.split('/');

      const resposta = await assinarPlano({
        planoCodigo: opcao.planoCodigo,
        ciclo: opcao.ciclo,
        dadosCobranca: {
          nome: nome.trim(),
          cnpj: somenteDigitos(cnpj),
          email: email.trim(),
          celular: somenteDigitos(celular),
        },
        cupom: cupomAplicado?.codigo,
        pagamento: jaTemAssinatura
          ? undefined
          : {
              forma,
              cartao:
                forma === 'CREDIT_CARD'
                  ? {
                      numero: somenteDigitos(numeroCartao),
                      nomeImpresso: nomeImpresso.trim(),
                      validadeMes,
                      validadeAno: `20${validadeAno}`,
                      cvv: somenteDigitos(cvv),
                      cep: somenteDigitos(cep),
                      numeroEndereco: numeroEndereco.trim(),
                      complemento: complemento.trim() || undefined,
                    }
                  : undefined,
            },
      });

      if (resposta.tipo === 'ATUALIZADO') {
        onSucesso();
        return;
      }

      setResultado(resposta);
      setEtapa(resposta.tipo === 'PIX' ? 'pix' : 'cartao');
    } catch (error: any) {
      setErro(error?.message || 'Não foi possível concluir a assinatura.');
    } finally {
      setEnviando(false);
    }
  };

  const copiarPix = async () => {
    if (!resultado?.pix?.copiaCola) return;

    try {
      await navigator.clipboard.writeText(resultado.pix.copiaCola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // area de transferencia indisponivel: o QR Code continua servindo
    }
  };

  const verificarPagamento = async () => {
    if (!resultado?.paymentId) return;

    setVerificando(true);
    setErro(null);

    try {
      const status = await verificarStatusPagamento(resultado.paymentId);
      if (status.pago) {
        onSucesso();
      } else {
        setErro('Ainda não identificamos o pagamento. Se você acabou de pagar, aguarde alguns segundos.');
      }
    } catch (error: any) {
      setErro(error?.message || 'Não foi possível verificar o pagamento.');
    } finally {
      setVerificando(false);
    }
  };

  const titulo =
    etapa === 'dados'
      ? jaTemAssinatura
        ? 'Confirmar troca de plano'
        : 'Dados de cobrança'
      : etapa === 'pagamento'
        ? 'Forma de pagamento'
        : etapa === 'pix'
          ? 'Pague com Pix para ativar'
          : resultado?.aprovado
            ? 'Assinatura ativada'
            : 'Pagamento não aprovado';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-panel bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] text-ink" style={{ fontWeight: 800, letterSpacing: '-.02em' }}>
              {titulo}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
              {opcao.nome} · {opcao.cicloLabel.toLowerCase()}
            </p>
          </div>

          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-pill p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>

        {/* Resumo do preco: presente em todas as etapas para o cliente nunca
            perder de vista o que vai pagar. */}
        <div className="mt-4 rounded-tile bg-paper p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11.5px] uppercase text-muted-soft" style={{ fontWeight: 700, letterSpacing: '.06em' }}>
                Total {opcao.meses > 1 ? `a cada ${opcao.meses} meses` : 'por mês'}
              </p>
              <div className="mt-1 flex items-end gap-2">
                {cupomEfetivo ? (
                  <span className="text-[14px] text-muted-soft line-through" style={{ fontWeight: 600 }}>
                    {formatarMoeda(precoCheio)}
                  </span>
                ) : null}
                <span
                  className="text-[26px] leading-none text-ink"
                  style={{ fontWeight: 800, letterSpacing: '-.03em' }}
                >
                  {formatarMoeda(precoFinal)}
                </span>
              </div>
              {opcao.meses > 1 ? (
                <p className="mt-1 text-[11.5px] text-muted" style={{ fontWeight: 500 }}>
                  equivale a {formatarMoeda(precoMes)}/mês
                </p>
              ) : null}
            </div>

            {cupomEfetivo ? (
              <span
                className="rounded-pill bg-lime px-2.5 py-1 text-[10.5px] text-ink"
                style={{ fontWeight: 800 }}
              >
                -{formatarMoeda(cupomEfetivo.descontoAplicado)}
              </span>
            ) : null}
          </div>
        </div>

        {etapa === 'dados' ? (
          <>
            <div className="mt-5 space-y-3.5">
              <div>
                <label className={labelClass} style={labelStyle}>
                  Razão social / nome
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={() => marcarTocado('nome')}
                  className={inputClass}
                />
                {erroDe(errosDados, 'nome') ? (
                  <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                    {errosDados.nome}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={labelStyle}>
                    CNPJ
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                    onBlur={() => marcarTocado('cnpj')}
                    placeholder="00.000.000/0000-00"
                    className={inputClass}
                  />
                  {erroDe(errosDados, 'cnpj') ? (
                    <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                      {errosDados.cnpj}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    Celular
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={celular}
                    onChange={(e) => setCelular(formatarCelular(e.target.value))}
                    onBlur={() => marcarTocado('celular')}
                    placeholder="(11) 91234-5678"
                    className={inputClass}
                  />
                  {erroDe(errosDados, 'celular') ? (
                    <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                      {errosDados.celular}
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className={labelClass} style={labelStyle}>
                  E-mail de cobrança
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => marcarTocado('email')}
                  placeholder="financeiro@empresa.com"
                  className={inputClass}
                />
                {erroDe(errosDados, 'email') ? (
                  <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                    {errosDados.email}
                  </p>
                ) : null}
              </div>

              <div>
                <label className={labelClass} style={labelStyle}>
                  Cupom de desconto (opcional)
                </label>

                {cupomAplicado ? (
                  <div className="mt-1.5 flex items-center justify-between gap-3 rounded-tile bg-lime/20 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <Ticket size={14} className="text-ink" />
                      <span className="text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
                        {cupomAplicado.codigo} aplicado
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={removerCupom}
                      className="text-[11.5px] text-muted transition-colors hover:text-ink"
                      style={{ fontWeight: 600 }}
                    >
                      remover
                    </button>
                  </div>
                ) : cupomVigente ? (
                  <div className="mt-1.5 rounded-tile bg-lime/20 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <Ticket size={14} className="text-ink" />
                      <span className="text-[12.5px] text-ink" style={{ fontWeight: 700 }}>
                        {cupomVigente.codigo} já ativo na sua conta
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted" style={{ fontWeight: 500 }}>
                      O desconto continua valendo no novo plano.
                    </p>
                  </div>
                ) : (
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={cupomTexto}
                      onChange={(e) => setCupomTexto(e.target.value.toUpperCase())}
                      placeholder="Digite o código"
                      className="w-full rounded-tile border border-line-soft bg-paper px-3.5 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-ink"
                    />
                    <button
                      type="button"
                      onClick={aplicarCupom}
                      disabled={validandoCupom || !cupomTexto.trim()}
                      className="shrink-0 rounded-tile bg-ink px-4 text-[12.5px] text-white disabled:opacity-40"
                      style={{ fontWeight: 700 }}
                    >
                      {validandoCupom ? '...' : 'Aplicar'}
                    </button>
                  </div>
                )}

                {cupomErro ? (
                  <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                    {cupomErro}
                  </p>
                ) : null}
              </div>
            </div>

            {erro ? (
              <p className="mt-4 rounded-tile bg-red-50 p-3 text-[12px] text-red-700" style={{ fontWeight: 600 }}>
                {erro}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => (jaTemAssinatura ? enviar() : setEtapa('pagamento'))}
              disabled={enviando || !dadosOk}
              className="mt-5 w-full rounded-pill bg-lime px-4 py-3 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:opacity-40"
              style={{ fontWeight: 700 }}
            >
              {enviando ? 'Confirmando...' : jaTemAssinatura ? 'Confirmar troca de plano' : 'Continuar'}
            </button>
          </>
        ) : null}

        {etapa === 'pagamento' ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {(
                [
                  { valor: 'PIX' as FormaPagamento, label: 'Pix', icone: QrCode, nota: 'Aprovação na hora' },
                  {
                    valor: 'CREDIT_CARD' as FormaPagamento,
                    label: 'Cartão',
                    icone: CreditCard,
                    nota: 'Renova automático',
                  },
                ]
              ).map((item) => {
                const Icone = item.icone;
                const ativo = forma === item.valor;

                return (
                  <button
                    key={item.valor}
                    type="button"
                    onClick={() => setForma(item.valor)}
                    className={`flex flex-col items-start gap-2 rounded-tile border p-4 text-left transition-colors ${
                      ativo ? 'border-ink bg-paper' : 'border-line-soft bg-card hover:border-line'
                    }`}
                    style={{ transitionDuration: '.22s', transitionTimingFunction: 'var(--ease)' }}
                  >
                    <Icone size={19} className="text-ink" />
                    <div>
                      <p className="text-[13px] text-ink" style={{ fontWeight: 700 }}>
                        {item.label}
                      </p>
                      <p className="text-[11px] text-muted" style={{ fontWeight: 500 }}>
                        {item.nota}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {forma === 'CREDIT_CARD' ? (
              <div className="mt-4 space-y-3.5">
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Número do cartão
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={numeroCartao}
                    onChange={(e) => setNumeroCartao(formatarNumeroCartao(e.target.value))}
                    onBlur={() => marcarTocado('numeroCartao')}
                    placeholder="0000 0000 0000 0000"
                    className={inputClass}
                  />
                  {erroDe(errosCartao, 'numeroCartao') ? (
                    <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                      {errosCartao.numeroCartao}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    Nome impresso
                  </label>
                  <input
                    type="text"
                    value={nomeImpresso}
                    onChange={(e) => setNomeImpresso(e.target.value.toUpperCase())}
                    onBlur={() => marcarTocado('nomeImpresso')}
                    placeholder="NOME COMO ESTA NO CARTAO"
                    className={inputClass}
                  />
                  {erroDe(errosCartao, 'nomeImpresso') ? (
                    <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                      {errosCartao.nomeImpresso}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Validade
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={validade}
                      onChange={(e) => setValidade(formatarValidade(e.target.value))}
                      onBlur={() => marcarTocado('validade')}
                      placeholder="MM/AA"
                      className={inputClass}
                    />
                    {erroDe(errosCartao, 'validade') ? (
                      <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                        {errosCartao.validade}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      CVV
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cvv}
                      onChange={(e) => setCvv(somenteDigitos(e.target.value).slice(0, 4))}
                      onBlur={() => marcarTocado('cvv')}
                      placeholder="123"
                      className={inputClass}
                    />
                    {erroDe(errosCartao, 'cvv') ? (
                      <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                        {errosCartao.cvv}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      CEP de cobrança
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cep}
                      onChange={(e) => setCep(formatarCep(e.target.value))}
                      onBlur={() => marcarTocado('cep')}
                      placeholder="00000-000"
                      className={inputClass}
                    />
                    {erroDe(errosCartao, 'cep') ? (
                      <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                        {errosCartao.cep}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Número
                    </label>
                    <input
                      type="text"
                      value={numeroEndereco}
                      onChange={(e) => setNumeroEndereco(e.target.value)}
                      onBlur={() => marcarTocado('numeroEndereco')}
                      placeholder="123"
                      className={inputClass}
                    />
                    {erroDe(errosCartao, 'numeroEndereco') ? (
                      <p className="mt-1 text-[11.5px] text-red-600" style={{ fontWeight: 600 }}>
                        {errosCartao.numeroEndereco}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    Complemento (opcional)
                  </label>
                  <input
                    type="text"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-tile bg-paper p-3.5 text-[12.5px] text-muted" style={{ fontWeight: 500 }}>
                Ao confirmar, mostramos o QR Code na hora. Assim que o pagamento cair, seu plano é ativado.
              </p>
            )}

            {erro ? (
              <p className="mt-4 rounded-tile bg-red-50 p-3 text-[12px] text-red-700" style={{ fontWeight: 600 }}>
                {erro}
              </p>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setEtapa('dados')}
                disabled={enviando}
                className="rounded-pill bg-paper px-4 py-3 text-[13px] text-ink disabled:opacity-40"
                style={{ fontWeight: 700 }}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={enviar}
                disabled={enviando || (forma === 'CREDIT_CARD' && !cartaoOk)}
                className="flex-1 rounded-pill bg-lime px-4 py-3 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:opacity-40"
                style={{ fontWeight: 700 }}
              >
                {enviando ? 'Processando...' : `Pagar ${formatarMoeda(precoFinal)}`}
              </button>
            </div>
          </>
        ) : null}

        {etapa === 'pix' && resultado?.pix ? (
          <>
            <div className="mt-5 flex flex-col items-center gap-4 rounded-tile bg-paper p-5">
              <img
                src={`data:image/png;base64,${resultado.pix.qrCodeBase64}`}
                alt="QR Code Pix"
                className="h-44 w-44 rounded-tile bg-white p-2"
              />

              <button
                type="button"
                onClick={copiarPix}
                className="inline-flex items-center gap-1.5 rounded-pill bg-card px-4 py-2.5 text-[12.5px] text-ink transition-colors hover:bg-stone"
                style={{ fontWeight: 700 }}
              >
                {copiado ? <Check size={14} /> : <Copy size={14} />}
                {copiado ? 'Código copiado' : 'Copiar código Pix'}
              </button>
            </div>

            <p className="mt-3 text-[12px] text-muted" style={{ fontWeight: 500 }}>
              Escaneie o QR Code ou cole o código no app do banco. Depois de pagar, clique em "Já paguei" —
              se o pagamento demorar a cair, seu plano é ativado sozinho quando o banco confirmar.
            </p>

            {erro ? (
              <p className="mt-3 rounded-tile bg-orange-50 p-3 text-[12px] text-orange-700" style={{ fontWeight: 600 }}>
                {erro}
              </p>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onFechar}
                className="rounded-pill bg-paper px-4 py-3 text-[13px] text-ink"
                style={{ fontWeight: 700 }}
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={verificarPagamento}
                disabled={verificando}
                className="flex-1 rounded-pill bg-lime px-4 py-3 text-[13px] text-ink transition-colors hover:bg-lime-deep disabled:opacity-40"
                style={{ fontWeight: 700 }}
              >
                {verificando ? 'Verificando...' : 'Já paguei'}
              </button>
            </div>
          </>
        ) : null}

        {etapa === 'cartao' ? (
          <>
            <div
              className={`mt-5 rounded-tile p-5 text-center ${
                resultado?.aprovado ? 'bg-lime/20' : 'bg-red-50'
              }`}
            >
              <div
                className={`mx-auto flex h-11 w-11 items-center justify-center rounded-tile ${
                  resultado?.aprovado ? 'bg-lime' : 'bg-red-100'
                }`}
              >
                {resultado?.aprovado ? (
                  <Check size={20} className="text-ink" strokeWidth={2.5} />
                ) : (
                  <X size={20} className="text-red-600" strokeWidth={2.5} />
                )}
              </div>

              <p className="mt-3 text-[13.5px] text-ink" style={{ fontWeight: 700 }}>
                {resultado?.aprovado
                  ? `Pagamento aprovado no cartão ${resultado.cartao?.bandeira || ''} •••• ${resultado.cartao?.final4 || ''}`
                  : 'O pagamento não foi aprovado'}
              </p>

              <p className="mt-1 text-[12px] text-muted" style={{ fontWeight: 500 }}>
                {resultado?.aprovado
                  ? 'Seu plano já está ativo e a renovação acontece automaticamente.'
                  : 'Confira os dados do cartão ou tente com outro cartão.'}
              </p>
            </div>

            <div className="mt-5 flex gap-2">
              {resultado?.aprovado ? (
                <button
                  type="button"
                  onClick={onSucesso}
                  className="w-full rounded-pill bg-lime px-4 py-3 text-[13px] text-ink"
                  style={{ fontWeight: 700 }}
                >
                  Concluir
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onFechar}
                    className="rounded-pill bg-paper px-4 py-3 text-[13px] text-ink"
                    style={{ fontWeight: 700 }}
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEtapa('pagamento')}
                    className="flex-1 rounded-pill bg-lime px-4 py-3 text-[13px] text-ink"
                    style={{ fontWeight: 700 }}
                  >
                    Tentar de novo
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default AssinarModal;
