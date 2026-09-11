// Simula uma mensagem de WhatsApp chegando para uma empresa em ambiente_teste=true,
// disparando o fluxo real (Triagem Global -> Worker Global) sem precisar de um
// numero real validado na Meta. So funciona para empresas com ambiente_teste=true
// (o envio de resposta real e pulado automaticamente pelas automacoes).
//
// Uso:
//   node scripts/sandbox-whatsapp.mjs <telefone> "<mensagem>" [empresa]
//
// Exemplos:
//   node scripts/sandbox-whatsapp.mjs 5511999990001 "Oi, preciso de um orcamento"
//   node scripts/sandbox-whatsapp.mjs 5511999990001 "Meu CNPJ e 12.345.678/0001-90" squalo
//
// Para "responder" como o lead, rode de novo com o MESMO telefone - a automacao
// trata como continuacao da mesma conversa. Espere ~90s e confira a resposta da
// IA no painel (Cotacoes) antes de mandar a proxima mensagem.

const WEBHOOK_URL = 'https://primary-production-b86f1.up.railway.app/webhook/triagem-whatsapp-v2';

// numero_meta_id configurado em sales_membros_v2.canal_whatsapp para cada empresa
// sandbox. Adicione aqui conforme configurar novas empresas de teste.
const EMPRESAS = {
  squalo: { numeroMetaId: '1147183001803680', nome: 'Squalo Digital' },
  // 4truck: ainda sem canal_whatsapp configurado - configure um numero_meta_id
  // (pode ser qualquer texto, e so uma chave de roteamento interna) antes de usar.
};

const [, , telefone, mensagem, empresaKey = 'squalo'] = process.argv;

if (!telefone || !mensagem) {
  console.error('Uso: node scripts/sandbox-whatsapp.mjs <telefone> "<mensagem>" [empresa]');
  console.error('Empresas disponiveis:', Object.keys(EMPRESAS).join(', '));
  process.exit(1);
}

const empresa = EMPRESAS[empresaKey];
if (!empresa) {
  console.error(`Empresa "${empresaKey}" nao configurada neste script. Disponiveis: ${Object.keys(EMPRESAS).join(', ')}`);
  process.exit(1);
}

const payload = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: empresa.numeroMetaId },
            contacts: [{ profile: { name: `Lead Teste ${telefone.slice(-4)}` } }],
            messages: [
              {
                from: telefone,
                id: `wamid.SANDBOX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'text',
                text: { body: mensagem },
              },
            ],
          },
        },
      ],
    },
  ],
};

const response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

console.log(`[${empresa.nome}] ${telefone} -> "${mensagem}"`);
console.log(`Status: ${response.status}`);

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
