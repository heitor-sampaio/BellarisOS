-- D3 da 41ª simulação (2026-11-28) — o aviso "Estoque no mínimo/abaixo" não vai
-- a quem causou o fato (NE-04: "Quem causou o fato não recebe o aviso dele";
-- docs/regras/whatsapp-push.md).
--
-- A Jussara (Estoque em Gerenciar, "A rede inteira") transferiu 2 Máscaras de
-- Bento para Garibaldi e recebeu os dois avisos — o de Bento (que ficou no
-- mínimo) e o de Garibaldi (que entrou abaixo dele). O aviso saía sem ator
-- (`avisarEstoqueMinimo`), e a fila do cruzamento (20261215300001) não sabia
-- quem fez o movimento.
--
-- Quem causou é quem GRAVOU o movimento que cruzou o mínimo: o `created_by` do
-- movimento de estoque (o id do membro, `users.id`) da MESMA transação, na
-- mesma linha (produto e unidade) — a transferência (os dois lados), a entrada,
-- o ajuste, a perda, a venda, os "desfazer", e o atendimento concluído (quem
-- concluiu: `concluir_atendimento` grava o p_ator). As funções gravam o
-- movimento ora antes, ora depois do saldo; por isso dois lados:
--   - o gatilho do cruzamento (no saldo) procura o movimento já gravado;
--   - um gatilho novo no movimento completa o cruzamento que nasceu antes dele.
-- "Mesma transação" é `created_at = now()` (o default da coluna; o `now()` é o
-- começo da transação, e `cruzou_em` nasce dele também).
--
-- Sem autor (o mínimo salvo à mão, que não grava movimento; o 'sistema'), o
-- aviso segue indo a todos os responsáveis.

alter table public.estoque_cruzamentos_do_minimo add column if not exists autor_id uuid;

comment on column public.estoque_cruzamentos_do_minimo.autor_id is
  'Quem gravou o movimento que cruzou o mínimo (users.id): o aviso não vai a ele (NE-04, D3 da 41ª). Nulo = sem autor (a todos).';

-- ─── 1. O cruzamento procura o movimento já gravado na transação ────────────
create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

select pg_temp.trocar_no_corpo(
  'private.estoque_registrar_cruzamento_do_minimo()'::regprocedure,
  array[$t$    (tenant_id, product_id, branch_id, current_stock, current_rendimento, min_stock)
  values (v_tenant, new.product_id, new.branch_id, new.current_stock, new.current_rendimento, new.min_stock);$t$],
  array[$t$    (tenant_id, product_id, branch_id, current_stock, current_rendimento, min_stock, autor_id)
  values (v_tenant, new.product_id, new.branch_id, new.current_stock, new.current_rendimento, new.min_stock,
          -- D3 da 41ª: quem gravou o movimento desta transação (NE-04).
          (select m.created_by::uuid
             from public.stock_movements m
            where m.product_id = new.product_id and m.branch_id = new.branch_id
              and m.created_at = now()
              and m.created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            order by m.id desc
            limit 1));$t$],
  array[1]
);

-- ─── 2. O movimento gravado DEPOIS do saldo completa o cruzamento ───────────
create or replace function private.estoque_autor_do_cruzamento_do_minimo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null
     or new.created_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;   -- 'sistema': sem autor, o aviso vai a todos
  end if;
  update public.estoque_cruzamentos_do_minimo c
     set autor_id = new.created_by::uuid
   where c.product_id = new.product_id and c.branch_id = new.branch_id
     and c.autor_id is null and c.avisado_em is null
     and c.cruzou_em = now();
  return null;
end
$$;

revoke execute on function private.estoque_autor_do_cruzamento_do_minimo() from public, anon, authenticated;
grant execute on function private.estoque_autor_do_cruzamento_do_minimo() to service_role;

drop trigger if exists trg_estoque_autor_do_cruzamento_do_minimo on public.stock_movements;
create trigger trg_estoque_autor_do_cruzamento_do_minimo
  after insert on public.stock_movements
  for each row execute function private.estoque_autor_do_cruzamento_do_minimo();

notify pgrst, 'reload schema';
