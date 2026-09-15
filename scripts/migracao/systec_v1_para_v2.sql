-- Migracao da Systec: versao antiga (tabelas sales_* sem _v2) -> v2
--
-- Empresa antiga: 792a5884-1f37-404a-b9ab-af69b67ce0fb (sales_empresa)
-- Empresa v2:     b6ba3599-5454-48aa-ab90-6b2ac6335bb2 (sales_empresas_v2)
--
-- Pode ser repetido ate a virada: apaga tudo que veio da v1 numa rodada anterior e recria a
-- partir da versao antiga (IDs preservados; solicitacoes e notificacoes usam uuid deterministico).
-- NAO rodar depois que a Systec comecar a atender pela v2 - a trava do passo 1 aborta nesse caso.
--
-- Clientes e produtos nao sao copiados: ja vem da integracao da v2. So ligamos por codigo ERP/CNPJ
-- (clientes) e por SKU (produtos).

begin;

create temp table _m on commit drop as
select '792a5884-1f37-404a-b9ab-af69b67ce0fb'::uuid as old_emp,
       'b6ba3599-5454-48aa-ab90-6b2ac6335bb2'::uuid as new_emp;

-- 1. Trava: so migra enquanto a v2 nao tiver atividade propria da Systec
do $$
begin
  if exists (select 1 from sales_atendimentos_v2 a join _m on a.empresa_id = _m.new_emp
             where a.sandbox = false and not (a.metadata ? 'migrado_de_v1')) then
    raise exception 'Systec ja tem atendimentos nativos na v2 - migracao abortada';
  end if;
  if exists (select 1 from sales_mensagens_v2 m
             join sales_atendimentos_v2 a on a.atendimento_id = m.atendimento_id
             join _m on a.empresa_id = _m.new_emp
             where a.metadata ? 'migrado_de_v1' and not (m.metadata ? 'migrado_de_v1')) then
    raise exception 'Ha mensagens novas na v2 em atendimentos migrados - migracao abortada';
  end if;
end $$;

-- 2. Limpa a rodada anterior (a cascata leva mensagens, solicitacoes, orcamentos, itens e notificacoes)
delete from sales_notificacoes_v2 n using _m
where n.empresa_id = _m.new_emp
  and n.notificacao_id in (select md5('sales-v1-notificacao-' || x.notificacao_id)::uuid
                           from sales_notificacoes x where x.empresa_id = _m.old_emp);

delete from sales_atendimentos_v2 a using _m
where a.empresa_id = _m.new_emp and a.metadata ? 'migrado_de_v1';

-- 3. De-para de membros (por e-mail) e clientes (codigo ERP, depois CNPJ).
-- Na v1 os clientes ligados aos atendimentos da Systec estao gravados com o empresa_id da
-- "WORKLIVOO TESTE", por isso o filtro e pelo id referenciado, nao pela empresa do cliente.
create temp table _membro on commit drop as
select o.membro_id as old_id, n.membro_id as new_id, o.smtp_port
from sales_membros_empresa o
join _m on o.empresa_id = _m.old_emp
join sales_membros_v2 n on n.empresa_id = _m.new_emp and lower(n.email) = lower(o.email);

create temp table _cliente on commit drop as
select c.cliente_id as old_id, c.cnpj, c.email,
  coalesce(
    (select v.cliente_id from sales_clientes_v2 v
     where v.empresa_id = _m.new_emp and v.codigo_erp = c.metadata->>'idaux'),
    (select v.cliente_id from sales_clientes_v2 v
     where v.empresa_id = _m.new_emp and v.cnpj = c.cnpj)) as new_id
from sales_clientes_finais c
cross join _m
where c.cliente_id in (select cliente_id from sales_atendimento where empresa_id = _m.old_emp
                       union
                       select cliente_id from sales_orcamentos where empresa_id = _m.old_emp);

-- Cliente da Systec usado em atendimento que a integracao da v2 nao trouxe: cria com o mesmo id
insert into sales_clientes_v2 (cliente_id, empresa_id, nome, razao_social, cnpj, email, telefone, whatsapp,
                               codigo_erp, metadata, created_at)
select c.cliente_id, _m.new_emp, c.nome, c.razao_social, c.cnpj, c.email, c.telefone, c.whatsapp,
       c.metadata->>'idaux', coalesce(c.metadata, '{}'::jsonb) || '{"migrado_de_v1": true}'::jsonb,
       coalesce(c.created_at, now())
from _cliente k
join sales_clientes_finais c on c.cliente_id = k.old_id
cross join _m
where k.new_id is null and c.empresa_id = _m.old_emp
on conflict do nothing;

update _cliente k set new_id = k.old_id
where k.new_id is null and exists (select 1 from sales_clientes_v2 v where v.cliente_id = k.old_id);

-- 4. Atendimentos (etapa real vem do trigger sync_etapa_from_status; TRIAGEM e so o valor inicial)
insert into sales_atendimentos_v2 (atendimento_id, empresa_id, cliente_id, membro_id, numero_ticket, origem,
  categoria, status, assunto, thread_email_id, telefone_lead, email_lead, documento_lead, pdf_url, metadata,
  etapa_id, created_at, updated_at)
select a.atendimento_id, _m.new_emp, k.new_id, mb.new_id, a.numero_ticket,
  (case a.atendimento_origem::text when 'WhatsApp' then 'WHATSAPP' else 'EMAIL' end)::sales_atendimento_origem_v2,
  coalesce(a.categoria::text, 'INDEFINIDO')::sales_atendimento_categoria_v2,
  coalesce(a.status::text, 'TRIAGEM')::sales_atendimento_status_v2,
  a.assunto,
  case when a.atendimento_origem::text = 'Email' then a.provedor_thread_id end,
  case when a.atendimento_origem::text = 'WhatsApp' then a.provedor_thread_id end,
  case when a.atendimento_origem::text = 'Email' then coalesce(
    (select x.metadata->>'email_remetente' from sales_mensagens x
     where x.atendimento_id = a.atendimento_id and x.origem = 'CLIENTE' and x.metadata ? 'email_remetente'
     order by x.created_at limit 1),
    k.email) end,
  k.cnpj,
  a.pdf_url,
  jsonb_strip_nulls(jsonb_build_object(
    'migrado_de_v1', true,
    'dados_extraidos_v1', nullif(a.dados_extraidos, '{}'::jsonb),
    'metadata_v1', a.metadata)),
  e.etapa_id,
  coalesce(a.created_at, now()), coalesce(a.updated_at, a.created_at, now())
from sales_atendimento a
join _m on a.empresa_id = _m.old_emp
join sales_pipeline_etapas_v2 e on e.empresa_id = _m.new_emp and e.codigo = 'TRIAGEM' and e.is_fixed
left join _cliente k on k.old_id = a.cliente_id
left join _membro mb on mb.old_id = a.membro_id;

-- 5. Mensagens. provedor_message_id da v1 guardava o telefone (repetido); so fica se for unico no atendimento.
insert into sales_mensagens_v2 (mensagem_id, empresa_id, atendimento_id, origem, conteudo, provedor_message_id,
  anexos, metadata, created_at, updated_at)
select t.mensagem_id, t.new_emp, t.atendimento_id, t.origem, t.conteudo,
  case when t.prov_valido then t.provedor_message_id end,
  t.anexos,
  coalesce(t.metadata, '{}'::jsonb) || '{"migrado_de_v1": true}'::jsonb
    || case when t.provedor_message_id is not null and not t.prov_valido
            then jsonb_build_object('provedor_message_id_v1', t.provedor_message_id)
            else '{}'::jsonb end,
  t.created_at, t.updated_at
from (
  select m.mensagem_id, _m.new_emp, m.atendimento_id,
    (case m.origem::text when 'CLIENTE' then 'LEAD' else m.origem::text end)::sales_mensagem_origem_v2 as origem,
    m.conteudo, m.provedor_message_id, m.metadata,
    (m.provedor_message_id is not null
      and m.provedor_message_id is distinct from a.provedor_thread_id
      and count(*) over (partition by m.atendimento_id, m.provedor_message_id) = 1) as prov_valido,
    -- anexos: array de urls, array de {url, texto_extraido} ou texto JSON -> sempre array de objetos
    (select coalesce(jsonb_agg(case jsonb_typeof(el) when 'string' then jsonb_build_object('url', el #>> '{}')
                                                     else el end), '[]'::jsonb)
     from jsonb_array_elements(case jsonb_typeof(m.anexos)
                                 when 'array' then m.anexos
                                 when 'string' then (m.anexos #>> '{}')::jsonb
                                 else '[]'::jsonb end) el
     where el <> '""'::jsonb) as anexos,
    coalesce(m.created_at, now()) as created_at,
    coalesce(m.updated_at, m.created_at, now()) as updated_at
  from sales_mensagens m
  join _m on m.empresa_id = _m.old_emp
  join sales_atendimento a on a.atendimento_id = m.atendimento_id
  join sales_atendimentos_v2 v on v.atendimento_id = m.atendimento_id
) t;

-- 6. Itens solicitados pelo lead
insert into sales_solicitacoes_itens_v2 (solicitacao_id, empresa_id, atendimento_id, produto_nome, produto_sku,
  produto_especificacao, quantidade_texto, unidade, created_at)
select md5('sales-v1-solicitacao-' || s.solicitacao_id)::uuid, _m.new_emp, s.atendimento_id, s.produto_nome,
  s.produto_sku, s.produto_especificacao, s.produto_quantidade, s.produto_unidade, s.criado_em
from sales_orcamentos_itens_solicitados s
join _m on s.empresa_id = _m.old_emp
join sales_atendimentos_v2 v on v.atendimento_id = s.atendimento_id;

-- 7. Orcamentos
insert into sales_orcamentos_v2 (orcamento_id, empresa_id, atendimento_id, cliente_id, status, valor_total,
  data_emissao, validade, pdf_url, html_orcamento, aprovado_por, data_aprovacao, created_at, updated_at)
select o.orcamento_id, _m.new_emp, o.atendimento_id, k.new_id, o.status::text::sales_orcamento_status_v2,
  coalesce(o.valor_total, 0), coalesce(o.data_emissao, now()), o.validade, o.pdf_url, o.html_orcamento,
  mb.new_id, o.data_aprovacao, coalesce(o.data_emissao, now()), coalesce(o.updated_at, o.data_emissao, now())
from sales_orcamentos o
join _m on o.empresa_id = _m.old_emp
join sales_atendimentos_v2 v on v.atendimento_id = o.atendimento_id
left join _cliente k on k.old_id = o.cliente_id
left join _membro mb on mb.old_id = o.aprovado_por;

-- 8. Itens do orcamento (produto ligado pelo SKU)
insert into sales_orcamentos_itens_v2 (item_id, empresa_id, orcamento_id, produto_id, solicitacao_id, quantidade,
  preco_unitario, total_item, created_at)
select i.item_id, _m.new_emp, i.orcamento_id, p2.produto_id, s2.solicitacao_id,
  i.quantidade, i.preco_unitario, i.total_item, coalesce(o.data_emissao, now())
from sales_orcamentos_itens i
join sales_orcamentos o on o.orcamento_id = i.orcamento_id
join _m on o.empresa_id = _m.old_emp
join sales_orcamentos_v2 ov on ov.orcamento_id = i.orcamento_id
left join sales_produtos p on p.produto_id = i.produto_id
left join sales_produtos_v2 p2 on p2.empresa_id = _m.new_emp and p2.codigo_sku = p.codigo_sku
left join sales_solicitacoes_itens_v2 s2
  on s2.solicitacao_id = md5('sales-v1-solicitacao-' || i.produto_solicitado_id)::uuid;

-- 9. Notificacoes, sem disparar o webhook de aviso aos usuarios (lock so ate o commit)
alter table sales_notificacoes_v2 disable trigger acionar_notificacoes;

insert into sales_notificacoes_v2 (notificacao_id, empresa_id, membro_id, atendimento_id, tipo, titulo, descricao,
  lida, created_at)
select md5('sales-v1-notificacao-' || n.notificacao_id)::uuid, _m.new_emp, mb.new_id, v.atendimento_id,
  n.notificacao_tipo::sales_notificacao_tipo_v2, n.notificacao_titulo, n.notificacao_descricao,
  coalesce(n.notificacao_lida, false), n.criado_em
from sales_notificacoes n
join _m on n.empresa_id = _m.old_emp
left join _membro mb on mb.old_id = n.membro_id
left join sales_atendimentos_v2 v on v.atendimento_id = n.atendimento_id
where n.notificacao_tipo in (select enumlabel from pg_enum where enumtypid = 'sales_notificacao_tipo_v2'::regtype);

alter table sales_notificacoes_v2 enable trigger acionar_notificacoes;

-- 10. Empresa: contador de tickets, regra "Item" da v1 e status ATIVO
update sales_empresas_v2 e set
  ultimo_numero_ticket = greatest(e.ultimo_numero_ticket, coalesce(o.ultimo_numero_ticket, 0),
    (select coalesce(max(x.numero_ticket), 0) from sales_atendimento x where x.empresa_id = o.empresa_id)),
  regras_cotacao = case when e.regras_cotacao ? 'Item' or o.regras_cotacao->'Item' is null then e.regras_cotacao
                        else e.regras_cotacao || jsonb_build_object('Item', o.regras_cotacao->'Item') end,
  cliente_status = 'ATIVO'
from sales_empresa o, _m
where e.empresa_id = _m.new_emp and o.empresa_id = _m.old_emp;

-- 11. SMTP: mesma porta que funciona na v1 (587/STARTTLS)
update sales_membros_v2 n set canal_email = jsonb_set(n.canal_email, '{smtp_port}', to_jsonb(mb.smtp_port))
from _membro mb
where n.membro_id = mb.new_id and n.canal_email is not null and mb.smtp_port is not null;

commit;
