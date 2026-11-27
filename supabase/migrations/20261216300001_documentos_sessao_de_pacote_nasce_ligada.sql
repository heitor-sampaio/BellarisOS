-- D5 da 37ª simulação (2026-11-27): a sessão de pacote não emite documento
-- (DE-14 do catálogo de Documentos: "A sessão não emite documento próprio";
-- PA-08 e DT-01; PC2, o Heitor, 13/11: assina-se uma vez, pelo pacote).
--
-- O agendamento da sessão de pacote nascia avulso: o INSERT em appointments
-- disparava trg_documentos_no_agendamento, que emitia o termo, o contrato e os
-- "Outros documentos" do procedimento; no pedido seguinte, a ligação ao pacote
-- (o UPDATE em package_sessions) disparava private.documentos_da_sessao_de_pacote,
-- que os cancelava ("Sessão de pacote: os documentos são os do pacote"). A
-- cliente ganhava documentos cancelados, o termo.emitido saía, e a contagem
-- de emitidos da tela Documentos inflava (a D12 da 37ª: 38 emitidos, 35 reais).
--
-- Agora:
--  1. public.agendamento_criar_na_sessao_de_pacote grava o agendamento e o liga
--     à sessão do pacote numa transação só. A sessão já tomada por outro
--     agendamento (a corrida) levanta CREDITO_JA_USADO e desfaz o agendamento
--     inteiro — nada fica para apagar depois.
--  2. Enquanto ela insere, a marca local da transação bellaris.sessao_de_pacote
--     diz ao gatilho do INSERT que o agendamento é sessão de pacote: ele não
--     emite nada. A marca sai logo depois do insert (e com a transação).
--  3. O resto fica: o agendamento AVULSO que depois vira sessão de pacote
--     (o "abater do pacote" da comanda, agendamento_usar_credito) continua com
--     o cancelamento de private.documentos_da_sessao_de_pacote — ali o
--     documento nasceu certo, quando o agendamento era avulso. Os documentos
--     cancelados já gravados não se apagam.
--
-- Troca de trecho no corpo VIVO de private.documentos_no_agendamento() (o padrão
-- de 20261130100007), com a conferência da contagem.

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

-- O INSERT da sessão de pacote (com a marca) não emite.
select pg_temp.trocar_no_corpo(
  'private.documentos_no_agendamento()'::regprocedure,
  array[$t$  if tg_op = 'INSERT' then$t$],
  array[$t$  if tg_op = 'INSERT' and coalesce(current_setting('bellaris.sessao_de_pacote', true), '') <> '' then
    return null;
  end if;

  if tg_op = 'INSERT' then$t$],
  array[1]
);

create or replace function public.agendamento_criar_na_sessao_de_pacote(p_agendamento jsonb, p_sessao uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r    public.appointments;
  v_id uuid;
begin
  r := jsonb_populate_record(null::public.appointments, p_agendamento);

  perform set_config('bellaris.sessao_de_pacote', p_sessao::text, true);
  insert into public.appointments (
    branch_id, client_id, procedure_id, professional_id, room_id, scheduled_at,
    duration_min, price, notes, status, source, created_by_id, sem_preferencia)
  values (
    r.branch_id, r.client_id, r.procedure_id, r.professional_id, r.room_id, r.scheduled_at,
    r.duration_min, r.price, r.notes, coalesce(r.status, 'SCHEDULED'), coalesce(r.source, 'INTERNAL'),
    r.created_by_id, coalesce(r.sem_preferencia, false))
  returning id into v_id;
  perform set_config('bellaris.sessao_de_pacote', '', true);

  -- A sessão livre, da mesma cliente. Perdeu a corrida: nada fica gravado.
  update public.package_sessions s
     set appointment_id = v_id
   where s.id = p_sessao
     and s.status = 'AVAILABLE'
     and s.appointment_id is null
     and exists (select 1 from public.client_packages cp
                  where cp.id = s.client_package_id and cp.client_id = r.client_id);
  if not found then
    raise exception 'CREDITO_JA_USADO';
  end if;

  return v_id;
end $$;

revoke all on function public.agendamento_criar_na_sessao_de_pacote(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.agendamento_criar_na_sessao_de_pacote(jsonb, uuid) to service_role;

notify pgrst, 'reload schema';
