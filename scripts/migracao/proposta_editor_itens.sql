-- Editor de orcamento do portal: salvar mantem a tabela de itens em dia
--
-- Antes, o editor gravava so o HTML: editar quantidade, preco ou itens no portal deixava
-- sales_orcamentos_itens_v2 com os valores originais da IA (e quem le essa tabela, como as
-- integracoes de ERP, recebia o pedido antigo).
--
-- Esta funcao faz tudo numa unica transacao (ou grava tudo, ou nada): atualiza o orcamento
-- (html, dados_proposta, valor_total) e sincroniza os itens com o que o vendedor deixou na tela.
--
--  - item que ja existe e continua: e ATUALIZADO no lugar, preservando produto_id e
--    solicitacao_id. Encontrado pelo item_id ou, se o snapshot nao tiver o id, pelo SKU do produto;
--  - item novo (adicionado pelo catalogo): e INSERIDO;
--  - item que o vendedor removeu: e APAGADO.
--  - item sem preco ("Sob consulta") entra com preco 0 (a coluna e NOT NULL), como o n8n ja fazia
--    para produto sem preco cadastrado.
--
-- SECURITY INVOKER: roda com o usuario logado, entao o RLS por empresa continua valendo
-- (ninguem altera orcamento de outra empresa). Migracao ADITIVA: so cria a funcao.

create or replace function public.sales_v2_editor_salvar_orcamento(
  p_orcamento_id uuid,
  p_html text,
  p_dados jsonb,
  p_valor_total numeric,
  p_itens jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_usados uuid[] := '{}';
  v_qtd numeric;
  v_preco numeric;
  v_ids jsonb := '[]'::jsonb;
begin
  select empresa_id into v_empresa_id
    from sales_orcamentos_v2
   where orcamento_id = p_orcamento_id;

  if v_empresa_id is null then
    raise exception 'Orcamento nao encontrado.';
  end if;

  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de itens invalida.';
  end if;

  update sales_orcamentos_v2
     set html_orcamento = p_html,
         dados_proposta = p_dados,
         valor_total = p_valor_total
   where orcamento_id = p_orcamento_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_qtd := greatest(coalesce(nullif(v_item->>'quantidade', '')::numeric, 0), 0);
    v_preco := greatest(coalesce(nullif(v_item->>'preco_unitario', '')::numeric, 0), 0);
    v_item_id := null;

    -- 1) pelo id do item, quando o editor o conhece
    if nullif(v_item->>'item_id', '') is not null then
      select i.item_id into v_item_id
        from sales_orcamentos_itens_v2 i
       where i.item_id = (v_item->>'item_id')::uuid
         and i.orcamento_id = p_orcamento_id
         and not (i.item_id = any(v_usados));
    end if;

    -- 2) senao, pelo SKU do produto (snapshot salvo sem os ids)
    if v_item_id is null and nullif(v_item->>'sku', '') is not null then
      select i.item_id into v_item_id
        from sales_orcamentos_itens_v2 i
        join sales_produtos_v2 p on p.produto_id = i.produto_id
       where i.orcamento_id = p_orcamento_id
         and p.codigo_sku = v_item->>'sku'
         and not (i.item_id = any(v_usados))
       order by i.created_at, i.item_id
       limit 1;
    end if;

    if v_item_id is not null then
      update sales_orcamentos_itens_v2
         set quantidade = v_qtd,
             preco_unitario = v_preco,
             total_item = round(v_qtd * v_preco, 2)
       where item_id = v_item_id;
    else
      insert into sales_orcamentos_itens_v2
        (empresa_id, orcamento_id, produto_id, quantidade, preco_unitario, total_item)
      values
        (v_empresa_id, p_orcamento_id, nullif(v_item->>'produto_id', '')::uuid,
         v_qtd, v_preco, round(v_qtd * v_preco, 2))
      returning item_id into v_item_id;
    end if;

    v_usados := v_usados || v_item_id;
    v_ids := v_ids || to_jsonb(v_item_id);
  end loop;

  -- o que o vendedor tirou da tela sai da tabela
  delete from sales_orcamentos_itens_v2
   where orcamento_id = p_orcamento_id
     and not (item_id = any(v_usados));

  return v_ids;
end;
$$;

revoke all on function public.sales_v2_editor_salvar_orcamento(uuid, text, jsonb, numeric, jsonb) from public, anon;
grant execute on function public.sales_v2_editor_salvar_orcamento(uuid, text, jsonb, numeric, jsonb) to authenticated;
