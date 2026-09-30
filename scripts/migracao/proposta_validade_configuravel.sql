-- Validade da proposta configuravel por empresa.
-- O selo "Valida ate" do PDF ja usa sales_empresas_v2.modelo_proposta->>'validadeDias'.
-- Esta RPC gravava sales_orcamentos_v2.validade com o 15 fixo que o n8n manda no payload,
-- o que deixava a data do orcamento diferente da data impressa no PDF.
-- Agora: validade configurada pela empresa (> 0) > validade_dias do payload > 15.
-- Alteracao so de funcao (create or replace), sem mexer em tabela.

create or replace function public.sales_v2_worker_montar_orcamento(p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_orcamento_id uuid;
  v_atendimento_id uuid := (p_payload->>'atendimento_id')::uuid;
  v_empresa_id uuid := (p_payload->>'empresa_id')::uuid;
  v_membro_id uuid := nullif(p_payload->>'membro_id','')::uuid;
  v_cliente_id uuid := nullif(p_payload->>'cliente_id','')::uuid;
  v_modo text := coalesce(p_payload->>'modo_orcamento', 'SEMI');
  v_duvida boolean := coalesce((p_payload->>'duvida')::boolean, false);
  v_cliente_novo boolean := coalesce((p_payload->>'cliente_novo')::boolean, false);
  v_validade_dias int := coalesce(
    (select case when (e.modelo_proposta->>'validadeDias') ~ '^[0-9]+$'
                   and (e.modelo_proposta->>'validadeDias')::int > 0
                 then least((e.modelo_proposta->>'validadeDias')::int, 365) end
       from sales_empresas_v2 e where e.empresa_id = (p_payload->>'empresa_id')::uuid),
    (p_payload->>'validade_dias')::int,
    15
  );
  v_item jsonb;
  v_valor_total numeric := 0;
  v_item_total numeric;
  v_qtd_itens int := jsonb_array_length(coalesce(p_payload->'itens', '[]'::jsonb));
begin
  if v_qtd_itens = 0 then
    if v_modo = 'SEMI' then
      -- Modo semi-automatico: o Worker responde ao cliente com um aviso
      -- NEUTRO (so diz que a solicitacao esta em analise, nada sobre o
      -- catalogo) e deixa o atendimento aguardando a resposta do vendedor.
      -- Neutro de proposito: se o item nao foi achado por falha da busca,
      -- dizer 'nao temos' mandaria o cliente para o concorrente.
      update sales_atendimentos_v2 set status = 'AGUARDANDO_APROVACAO', updated_at = now() where atendimento_id = v_atendimento_id;
      perform sales_v2_worker_registrar_notificacao(
        v_empresa_id, v_membro_id, v_atendimento_id,
        'NENHUM_ITEM_ENCONTRADO'::sales_notificacao_tipo_v2,
        'Nenhum item encontrado - resposta aguardando aprovacao',
        'O cliente solicitou uma cotacao, mas nenhum item foi encontrado em nosso catalogo. Ele recebeu apenas um aviso neutro de que a solicitacao esta em analise - nada foi dito sobre o catalogo. Responda a ele quando puder.'
      );
      return jsonb_build_object('orcamento_criado', false, 'motivo', 'nenhum_item_encontrado', 'precisa_aprovacao', true);
    else
      perform sales_v2_worker_registrar_notificacao(
        v_empresa_id, v_membro_id, v_atendimento_id,
        'NENHUM_ITEM_ENCONTRADO'::sales_notificacao_tipo_v2,
        'Nenhum item encontrado para o cliente',
        'O cliente solicitou uma cotacao, mas nenhum item foi encontrado em nosso catalogo de produtos.'
      );
      update sales_atendimentos_v2 set status = 'CONCLUIDO', updated_at = now() where atendimento_id = v_atendimento_id;
      return jsonb_build_object('orcamento_criado', false, 'motivo', 'nenhum_item_encontrado', 'precisa_aprovacao', false);
    end if;
  end if;

  insert into sales_orcamentos_v2 (empresa_id, atendimento_id, cliente_id, status, valor_total, html_orcamento, validade)
  values (v_empresa_id, v_atendimento_id, v_cliente_id, 'RASCUNHO', 0, p_payload->>'html_orcamento', (current_date + v_validade_dias))
  on conflict (atendimento_id) do update
    set cliente_id = excluded.cliente_id,
        html_orcamento = excluded.html_orcamento,
        validade = excluded.validade,
        updated_at = now()
  returning orcamento_id into v_orcamento_id;

  delete from sales_orcamentos_itens_v2 where orcamento_id = v_orcamento_id;

  for v_item in select * from jsonb_array_elements(p_payload->'itens')
  loop
    v_item_total := (coalesce(v_item->>'quantidade','0'))::numeric * (coalesce(v_item->>'preco_unitario','0'))::numeric;
    v_valor_total := v_valor_total + v_item_total;

    insert into sales_orcamentos_itens_v2 (empresa_id, orcamento_id, produto_id, solicitacao_id, quantidade, preco_unitario, total_item)
    values (
      v_empresa_id, v_orcamento_id,
      nullif(v_item->>'produto_id','')::uuid,
      nullif(v_item->>'solicitacao_id','')::uuid,
      (coalesce(v_item->>'quantidade','0'))::numeric,
      (coalesce(v_item->>'preco_unitario','0'))::numeric,
      v_item_total
    );
  end loop;

  update sales_orcamentos_v2 set valor_total = v_valor_total, updated_at = now() where orcamento_id = v_orcamento_id;

  if v_cliente_novo then
    perform sales_v2_worker_registrar_notificacao(
      v_empresa_id, v_membro_id, v_atendimento_id,
      'NOVO_CLIENTE'::sales_notificacao_tipo_v2,
      'Orcamento para novo cliente',
      'Foi gerada uma cotacao para um cliente ainda nao cadastrado, aguardando aprovacao.'
    );
  end if;

  if v_duvida then
    update sales_atendimentos_v2 set status = 'AGUARDANDO_APROVACAO', updated_at = now() where atendimento_id = v_atendimento_id;
    perform sales_v2_worker_registrar_notificacao(
      v_empresa_id, v_membro_id, v_atendimento_id,
      'DUVIDA_MATCH_PRODUTO'::sales_notificacao_tipo_v2,
      'Divergencia no match de produto',
      'Um ou mais itens tiveram correspondencia parcial/divergente no catalogo e precisam de revisao antes do envio.'
    );
  elsif v_modo = 'SEMI' then
    update sales_atendimentos_v2 set status = 'AGUARDANDO_APROVACAO', updated_at = now() where atendimento_id = v_atendimento_id;
    perform sales_v2_worker_registrar_notificacao(
      v_empresa_id, v_membro_id, v_atendimento_id,
      'AGUARDANDO_APROVACAO'::sales_notificacao_tipo_v2,
      'Orcamento aguardando aprovacao',
      'Valor total: ' || v_valor_total::text
    );
  else
    update sales_atendimentos_v2 set status = 'COLETANDO_DADOS', updated_at = now()
    where atendimento_id = v_atendimento_id and situacao_final is null and status <> 'ORCAMENTO_ENVIADO';
  end if;

  return jsonb_build_object(
    'orcamento_criado', true,
    'orcamento_id', v_orcamento_id,
    'valor_total', v_valor_total,
    'modo_orcamento', v_modo,
    'duvida', v_duvida,
    'precisa_aprovacao', (v_duvida or v_modo = 'SEMI')
  );
end;
$function$;
