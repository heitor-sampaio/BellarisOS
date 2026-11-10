-- F54 — o evento "estoque.abaixo_do_minimo" não sai da linha que ainda está
-- nascendo (consequência da D2 da 11ª, migration 20261110005401).
--
-- As funções de estoque criam a linha da unidade como um MARCADOR — saldo 0,
-- `insert … (…, 0, 0) on conflict do nothing` — e, na mesma transação, gravam
-- o saldo de verdade por UPDATE. Com o mínimo agora herdado do cadastro
-- (trg_bps_minimo_do_produto), o INSERT do marcador "cruzava" o mínimo com
-- saldo 0: a entrada de 10 frascos com mínimo 3 emitia "abaixo do mínimo,
-- saldo 0" (uma automação nesse evento avisaria de uma falta que não houve), e
-- o UPDATE seguinte, vendo o marcador abaixo, não emitia mais nada.
--
-- Agora: o INSERT com saldo 0 (o marcador) não emite, e o UPDATE trata a linha
-- gravada NESTA transação com saldo 0 como "ainda não estava abaixo" — quem
-- decide é o saldo de verdade. Parte do corpo ATUAL da produção.

create or replace function public.on_stock_below_min()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tenant  uuid;
  v_produto text;
  v_unidade text;
begin
  if new.min_stock is null or new.min_stock <= 0 then return new; end if;
  if new.current_stock >= new.min_stock then return new; end if;
  -- O marcador da linha que nasce (saldo 0, o de verdade vem no UPDATE).
  if tg_op = 'INSERT' and new.current_stock = 0 and coalesce(new.current_rendimento, 0) = 0 then return new; end if;
  if tg_op = 'UPDATE' and old.current_stock < old.min_stock
     and not (old.current_stock = 0 and coalesce(old.current_rendimento, 0) = 0 and old.updated_at = now()) then
    return new;
  end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = new.branch_id;
  if v_tenant is null then return new; end if;

  select p.name, p.unit into v_produto, v_unidade
  from public.products p where p.id = new.product_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_tenant, new.branch_id, 'estoque.abaixo_do_minimo', 'estoque', new.product_id,
    jsonb_build_object(
      'produtoId', new.product_id, 'produtoNome', v_produto, 'unidade', v_unidade,
      'saldo', new.current_stock, 'minimo', new.min_stock
    ),
    'sistema', 'banco', null, now()
  );

  return new;
end
$function$;

notify pgrst, 'reload schema';
