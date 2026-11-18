-- A20d da 25ª simulação (CLAUDE.md §14: "Escrever no banco fora de transação
-- quando duas gravações precisam valer juntas (padrão: o app calcula, uma
-- função grava)").
--
-- O plano de tratamento (o "Salvar" do editor do plano e o rascunho do plano da
-- avaliação) era gravado pelo app em chamadas separadas: o cabeçalho (upsert do
-- rascunho, ou o update das observações e do desconto), depois apagava as
-- sessões e inseria cada sessão e os procedimentos dela um a um. A chamada que
-- falhasse no meio deixava o plano sem sessões, ou com parte delas. E o
-- rascunho da avaliação fazia o upsert com status DRAFT sem conferir o status:
-- o plano aceito, concluído ou cancelado voltava a rascunho.
--
-- Agora o app confere (permissão, alcance, quem monta, a sessão vazia, o
-- procedimento que a unidade do plano faz, o plano fechado) e monta; esta
-- função grava o cabeçalho e as sessões numa transação só, com o plano travado
-- (for update), conferindo de novo o que não pode escapar: a rede (pela
-- unidade), o plano fechado (ACCEPTED, COMPLETED, CANCELLED, REJECTED — a lista
-- de `planoFechado`, lib/plano-de-tratamento/fechado.ts) e todo procedimento da
-- rede (o id vem do navegador).
--
-- Dois caminhos:
--   p_plano preenchido → o plano que existe (o editor): o cabeçalho muda só
--                        nas chaves presentes ('notas', 'combinado').
--   p_plano nulo       → o rascunho da avaliação: p_cabecalho.avaliacao é o
--                        agendamento; o plano dele é criado ou volta a DRAFT,
--                        com a cliente e a unidade DO AGENDAMENTO e
--                        p_cabecalho.profissional.
-- Devolve o id do plano.
--
-- p_cabecalho: { avaliacao?, profissional?, notas? (sem a chave, a anotação
--   fica), combinado?: { desconto_combinado_tipo, desconto_combinado_valor,
--   desconto_combinado_por } (sem a chave, o desconto fica) }
-- p_sessoes, a forma do `gerar_plano_da_avaliacao`:
--   [{ "procedimentos": [{ "procedure_id", "price", "sort_order", "products": [...] }] }]
--
-- Só o servidor (service_role) executa: recebe a rede por parâmetro.

create or replace function public.plano_gravar_sessoes(p_tenant uuid, p_plano uuid, p_sessoes jsonb, p_cabecalho jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v_cab        jsonb := coalesce(p_cabecalho, '{}'::jsonb);
  v_combinado  jsonb := case when jsonb_typeof(coalesce(p_cabecalho, '{}'::jsonb) -> 'combinado') = 'object'
                              then p_cabecalho -> 'combinado' end;
  v_tem_notas  boolean := coalesce(p_cabecalho ? 'notas', false);
  v_tem_desc   boolean := coalesce(p_cabecalho ? 'combinado', false);
  v_plano      uuid := p_plano;
  v_rede       uuid;
  v_status     text;
  v_avaliacao  uuid;
  v_unidade    uuid;
  v_cliente    uuid;
  v_sessao     jsonb;
  v_sessao_id  uuid;
  v_ordem      int := 0;
begin
  if p_sessoes is null or jsonb_typeof(p_sessoes) <> 'array' then
    raise exception 'Sessões do plano inválidas.' using errcode = 'invalid_parameter_value';
  end if;
  -- Todo procedimento do plano é DESTA rede.
  if exists (
    select 1
      from jsonb_array_elements(p_sessoes) s,
           jsonb_array_elements(coalesce(s -> 'procedimentos', '[]'::jsonb)) pr
     where not exists (
       select 1 from public.procedures p
        where p.id::text = pr ->> 'procedure_id' and p.tenant_id = p_tenant
     )
  ) then
    raise exception 'Procedimento do plano não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_plano is null then
    -- O rascunho do plano da avaliação: o agendamento travado serializa quem gera o plano dele.
    v_avaliacao := nullif(v_cab ->> 'avaliacao', '')::uuid;
    if v_avaliacao is null then
      raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
    end if;
    select a.branch_id, a.client_id, b.tenant_id
      into v_unidade, v_cliente, v_rede
      from public.appointments a
      join public.branches b on b.id = a.branch_id
     where a.id = v_avaliacao
       for update of a;
    if not found or v_rede is distinct from p_tenant then
      raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
    end if;

    select tp.id, tp.status::text into v_plano, v_status
      from public.treatment_plans tp
     where tp.evaluation_appointment_id = v_avaliacao
       for update;
    if v_status in ('ACCEPTED', 'COMPLETED', 'CANCELLED', 'REJECTED') then
      raise exception 'Este plano já foi fechado e não pode mais ser alterado.' using errcode = 'invalid_parameter_value';
    end if;

    if v_plano is null then
      insert into public.treatment_plans
        (evaluation_appointment_id, client_id, branch_id, professional_id, professional_notes, status, updated_at,
         desconto_combinado_tipo, desconto_combinado_valor, desconto_combinado_por)
      values
        (v_avaliacao, v_cliente, v_unidade, nullif(v_cab ->> 'profissional', '')::uuid,
         case when v_tem_notas then v_cab ->> 'notas' end,
         'DRAFT', now(),
         v_combinado ->> 'desconto_combinado_tipo',
         coalesce((v_combinado ->> 'desconto_combinado_valor')::numeric, 0),
         nullif(v_combinado ->> 'desconto_combinado_por', '')::uuid)
      returning id into v_plano;
    else
      update public.treatment_plans
         set client_id                = v_cliente,
             branch_id                = v_unidade,
             professional_id          = nullif(v_cab ->> 'profissional', '')::uuid,
             -- Sem a chave (quem gera não anota), a anotação que havia fica (PT2).
             professional_notes       = case when v_tem_notas then v_cab ->> 'notas' else professional_notes end,
             desconto_combinado_tipo  = case when v_tem_desc then v_combinado ->> 'desconto_combinado_tipo' else desconto_combinado_tipo end,
             desconto_combinado_valor = case when v_tem_desc then coalesce((v_combinado ->> 'desconto_combinado_valor')::numeric, 0) else desconto_combinado_valor end,
             desconto_combinado_por   = case when v_tem_desc then nullif(v_combinado ->> 'desconto_combinado_por', '')::uuid else desconto_combinado_por end,
             status                   = 'DRAFT',
             updated_at               = now()
       where id = v_plano;
    end if;
  else
    -- O plano que existe (o editor do plano).
    select b.tenant_id, tp.status::text
      into v_rede, v_status
      from public.treatment_plans tp
      join public.branches b on b.id = tp.branch_id
     where tp.id = v_plano
       for update of tp;
    if not found or v_rede is distinct from p_tenant then
      raise exception 'Plano não encontrado.' using errcode = 'no_data_found';
    end if;
    if v_status in ('ACCEPTED', 'COMPLETED', 'CANCELLED', 'REJECTED') then
      raise exception 'Este plano já foi fechado e não pode mais ser alterado.' using errcode = 'invalid_parameter_value';
    end if;

    update public.treatment_plans
       set professional_notes       = case when v_tem_notas then nullif(v_cab ->> 'notas', '') else professional_notes end,
           desconto_combinado_tipo  = case when v_tem_desc then v_combinado ->> 'desconto_combinado_tipo' else desconto_combinado_tipo end,
           desconto_combinado_valor = case when v_tem_desc then coalesce((v_combinado ->> 'desconto_combinado_valor')::numeric, 0) else desconto_combinado_valor end,
           desconto_combinado_por   = case when v_tem_desc then nullif(v_combinado ->> 'desconto_combinado_por', '')::uuid else desconto_combinado_por end,
           updated_at               = now()
     where id = v_plano;
  end if;

  -- As sessões do editor substituem as que havia (cascade leva os procedimentos).
  delete from public.treatment_plan_sessions where plan_id = v_plano;
  for v_sessao in select * from jsonb_array_elements(p_sessoes)
  loop
    insert into public.treatment_plan_sessions (plan_id, sort_order)
    values (v_plano, v_ordem)
    returning id into v_sessao_id;

    insert into public.treatment_plan_session_procedures (session_id, procedure_id, price, sort_order, products)
    select v_sessao_id,
           (pr ->> 'procedure_id')::uuid,
           coalesce((pr ->> 'price')::numeric, 0),
           coalesce((pr ->> 'sort_order')::int, (o - 1)::int),
           case when jsonb_typeof(pr -> 'products') = 'array' then pr -> 'products' else '[]'::jsonb end
      from jsonb_array_elements(coalesce(v_sessao -> 'procedimentos', '[]'::jsonb)) with ordinality as t(pr, o);

    v_ordem := v_ordem + 1;
  end loop;

  return v_plano;
end;
$function$;

revoke all on function public.plano_gravar_sessoes(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.plano_gravar_sessoes(uuid, uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
