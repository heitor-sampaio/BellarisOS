-- pdv_atritos_da_22 — o PDV e o caixa da 22ª simulação.
--
-- A11: a comanda da venda estornada INTEIRA perdia as formas ("Pago com" em
--      branco): o `vp` de pdv_comandas só lia os lançamentos vivos, e o
--      estorno marca os da venda como 'Estornada'. Com a venda estornada
--      inteira (v_estornada), os lançamentos estornados contam para as formas.
-- A31: a descrição do lançamento da venda de pré-pago era "Procedimento
--      pré-pago — 1× Massagem relaxante"; passa a "Massagem relaxante — 1
--      sessão" (o resto da descrição, o sufixo, não muda).
-- A13: o produto da comanda tem "−": comanda_tirar_um_item tira UMA unidade
--      (a linha some quando era a última), com as travas do comanda_tirar_item.

-- ---------------------------------------------------------------------------
-- A11 — pdv_comandas: as formas da venda estornada inteira.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_def  text;
  v_novo text;
begin
  v_def := pg_get_functiondef('public.pdv_comandas(uuid,uuid,text,timestamptz,timestamptz)'::regprocedure);
  v_novo := replace(v_def,
    'and t.type::text = ''INCOME'' and t.estorno_de is null and t.is_paid and coalesce(t.notes, '''') <> ''Estornada''',
    'and t.type::text = ''INCOME'' and t.estorno_de is null and t.is_paid
         and (coalesce(t.notes, '''') <> ''Estornada'' or coalesce(s.v_estornada, false))');
  if v_novo = v_def then
    raise exception 'pdv_comandas: o trecho das formas da venda (vp) não foi achado';
  end if;
  execute v_novo;
end
$do$;

-- ---------------------------------------------------------------------------
-- A31 — a descrição do lançamento da venda de pré-pago.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_f    regprocedure;
  v_def  text;
  v_novo text;
begin
  foreach v_f in array array[
    'public.procedimento_vender(uuid,uuid,uuid,uuid,uuid,integer,numeric,integer,jsonb,jsonb)'::regprocedure,
    'public.procedimento_vender_com_equipe(uuid,uuid,uuid,uuid,uuid,uuid,integer,numeric,integer,jsonb,jsonb)'::regprocedure
  ] loop
    v_def := pg_get_functiondef(v_f);
    v_novo := replace(v_def,
      '''Procedimento pré-pago — '' || p_quantidade || ''× '' || v_proc.name',
      'v_proc.name || '' — '' || p_quantidade || case when p_quantidade = 1 then '' sessão'' else '' sessões'' end');
    if v_novo = v_def then
      raise exception '%: a descrição do lançamento não foi achada', v_f;
    end if;
    execute v_novo;
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- A13 — tirar UMA unidade do produto da comanda.
-- ---------------------------------------------------------------------------
create or replace function public.comanda_tirar_um_item(p_tenant uuid, p_item uuid)
returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_i public.comanda_itens%rowtype;
  v_a uuid;
begin
  select * into v_i from public.comanda_itens i where i.id = p_item and i.tenant_id = p_tenant;
  if not found then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;
  select c.appointment_id into v_a from public.comandas c where c.id = v_i.comanda_id;
  perform 1 from public.appointments a where a.id = v_a for update;
  select * into v_i from public.comanda_itens i where i.id = p_item;
  if not found then
    return;
  end if;
  if v_i.product_sale_id is not null then
    raise exception 'Este produto já foi vendido com a comanda: a devolução é pelo estorno da venda.' using errcode = 'P0001';
  end if;
  if v_i.quantidade > 1 then
    update public.comanda_itens set quantidade = quantidade - 1 where id = p_item;
  else
    delete from public.comanda_itens where id = p_item;
  end if;
end $$;

revoke execute on function public.comanda_tirar_um_item(uuid, uuid) from public, anon, authenticated;
grant execute on function public.comanda_tirar_um_item(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
