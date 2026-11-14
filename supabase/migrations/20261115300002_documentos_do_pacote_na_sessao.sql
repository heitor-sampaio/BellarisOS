-- Bloco Documentos, leva 2 — PC2: os documentos do PACOTE valem para as
-- sessões dele.
--
-- A venda do pacote não espera a assinatura (princípios 2 e 6; o "assinatura
-- antes do dinheiro" do Heitor, PT1c, foi dito do plano). O "Bloqueia" do
-- documento do pacote passa a valer onde o "Bloqueia" de todo documento vale:
-- no INÍCIO do atendimento — aqui, de cada sessão do pacote. A sessão não
-- emite documento (`documentos_da_sessao_de_pacote` cancela os do
-- agendamento); os abertos do pacote vendido entram na conta dela.
--
-- Recriada do corpo de PRODUÇÃO (pg_get_functiondef), com a segunda parte.
-- Não destrutiva. Grants mantidos (create or replace).

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
         )
     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
     and private.rede_tem_recurso(d.tenant_id, 'documentos')
   order by d.kind, d.title
$function$;

notify pgrst, 'reload schema';
