-- D4 da 25ª simulação: o documento do PLANO que bloqueia trava a sessão do
-- plano.
--
-- documentos.md: "nenhuma porta põe IN_PROGRESS com documento BLOQUEIA
-- aberto". A sessão de plano não emite documento seu (o plano tem os dele,
-- `private.modelos_do_atendimento`), e a trava saía na hora para toda sessão
-- de plano (`if new.treatment_plan_id is not null then return new`) — o
-- "Termo de consentimento" do plano, que bloqueia, não segurava nada: a
-- sessão começava e terminava sem a assinatura. O checkout do plano só segura
-- o CONTRATO (PT1c).
--
-- Agora vale para o plano o que já valia para o pacote (PC2): os abertos do
-- plano da sessão entram em `documentos_pendentes_do_atendimento`, e a trava
-- confere a sessão de plano como confere qualquer atendimento.
--
-- As duas recriadas do corpo de PRODUÇÃO (pg_get_functiondef, 18/11), com a
-- parte nova. Não destrutiva. Grants mantidos (create or replace). Não
-- depende do código novo: a janela de documentos da sessão passa a MOSTRAR os
-- do plano com `documentosDoAgendamento` (lib/documentos/leitura.ts); sem o
-- código, a trava já vale e a mensagem do início diz o que falta assinar.

create or replace function public.documentos_pendentes_do_atendimento(p_agendamento uuid)
 returns table(id uuid, title text, kind text, enforcement text, status text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select d.id, d.title, d.kind, d.enforcement, d.status
    from public.issued_documents d
   where (
           d.appointment_id = p_agendamento
           -- A sessão de pacote: os abertos do pacote vendido (PC2).
           or d.client_package_id in (
             select ps.client_package_id from public.package_sessions ps where ps.appointment_id = p_agendamento
           )
           -- A sessão de plano: os abertos do plano (D4 da 25ª).
           or d.treatment_plan_id = (select a.treatment_plan_id from public.appointments a where a.id = p_agendamento)
         )
     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
     and private.rede_tem_recurso(d.tenant_id, 'documentos')
   order by d.kind, d.title
$function$;

create or replace function private.documentos_bloqueiam_inicio()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_faltam text;
begin
  -- D4 da 25ª: a sessão de plano não passa mais direto — os documentos do
  -- plano contam em documentos_pendentes_do_atendimento.
  if not (
    (new.status = 'IN_PROGRESS' and old.status is distinct from 'IN_PROGRESS') or
    (new.status = 'COMPLETED' and old.status not in ('IN_PROGRESS', 'COMPLETED'))
  ) then
    return new;
  end if;

  select string_agg(p.title, ', ' order by p.title) into v_faltam
    from public.documentos_pendentes_do_atendimento(new.id) p
   where p.enforcement = 'BLOQUEIA';

  if v_faltam is not null then
    raise exception 'Falta assinar: %. Colha a assinatura antes de iniciar o atendimento.', v_faltam
      using errcode = 'P0001';
  end if;
  return new;
end $function$;

notify pgrst, 'reload schema';
