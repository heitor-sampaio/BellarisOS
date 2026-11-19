-- A1a da 25ª simulação: o plano AINDA NÃO ACEITO (o rascunho e o proposto,
-- mandado à cliente) não tinha "Cancelar" — só o aceito se cancelava, pelo
-- "Cancelar plano" do Financeiro em Gerenciar (`plano_cancelar_devolvendo`, com
-- o dinheiro). O Heitor, 18/11, à pergunta "o plano proposto e ainda não aceito
-- não tem um botão 'Cancelar'. Entra?": "sim".
--
-- O proposto não tem dinheiro: a comanda do plano nasce no aceite
-- (`plano_aceitar`), e "Uma coisa só foi vendida se foi paga." (o Heitor,
-- 18/11). Cancelar é só fechar o plano, com o motivo (o do aceito pede; a mesma
-- forma, princípio 7) e o retrato (`cancelamento.antes_do_aceite`, que a tela
-- lê em `retratoDoCancelamento`). Na MESMA transação, pelo gatilho que já existe
-- (`documentos_do_plano_cancelado`), os documentos do plano que esperavam
-- assinatura são cancelados e os links de assinatura deles, revogados — a
-- cliente não assina um plano cancelado. A Auditoria registra quem cancelou
-- (o gatilho `auditoria_upd` de treatment_plans, pelo `x-bellaris-ator`).
-- A oportunidade ligada à cliente NÃO se move (nada se move sozinho; R12).
--
-- O app confere a permissão (quem MONTA o plano, `montaPlano`), a rede, o
-- alcance e o "só os meus"; esta função confere de novo, com o plano travado,
-- o que não pode escapar: a rede (pela unidade), o status (só DRAFT e PROPOSED
-- — a lista de `cancelaSemDinheiro`, lib/plano-de-tratamento/cancelar-proposto.ts),
-- o motivo, e que não há dinheiro, comanda viva nem sessão agendada (o aceite é
-- o que cria cada um deles: um plano com eles não é "proposto").
--
-- Só o servidor (service_role) executa: recebe a rede por parâmetro.

create or replace function public.plano_cancelar_proposto(p_tenant uuid, p_plano uuid, p_ator uuid, p_ator_nome text, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v_tp      public.treatment_plans%rowtype;
  v_rede    uuid;
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_sessoes int;
  v_valor   numeric;
  v_docs    int;
begin
  select * into v_tp from public.treatment_plans tp where tp.id = p_plano for update;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'P0001';
  end if;
  select b.tenant_id into v_rede from public.branches b where b.id = v_tp.branch_id;
  if v_rede is distinct from p_tenant then
    raise exception 'Plano não encontrado.' using errcode = 'P0001';
  end if;
  if v_motivo is null then
    raise exception 'Diga o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  if v_tp.status in ('CANCELLED', 'REJECTED') or v_tp.cancelado_em is not null then
    raise exception 'Este plano já foi cancelado.' using errcode = 'P0001';
  end if;
  if v_tp.status = 'COMPLETED' then
    raise exception 'Todas as sessões deste plano já foram feitas: não há o que cancelar.' using errcode = 'P0001';
  end if;
  if v_tp.status not in ('DRAFT', 'PROPOSED') then
    raise exception 'Este plano já foi aceito: o cancelamento dele acerta o dinheiro e é de quem tem o Financeiro em Gerenciar ("Cancelar plano", no resumo do plano).' using errcode = 'P0001';
  end if;

  -- Defesa: o que só o aceite cria (o dinheiro, a comanda, a sessão agendada).
  if exists (select 1 from public.financial_transactions f where f.treatment_plan_id = p_plano)
     or exists (select 1 from public.comandas c where c.treatment_plan_id = p_plano and c.cancelada_em is null) then
    raise exception 'Este plano tem lançamento ou comanda no PDV: o cancelamento dele é o "Cancelar plano", de quem tem o Financeiro em Gerenciar.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.treatment_plan_sessions s
               join public.appointments a on a.id = s.appointment_id
              where s.plan_id = p_plano and a.status::text not in ('CANCELLED')) then
    raise exception 'Este plano tem sessão agendada: cancele o agendamento antes.' using errcode = 'P0001';
  end if;

  select count(*)::int into v_sessoes from public.treatment_plan_sessions s where s.plan_id = p_plano;
  select coalesce(sum(p.price), 0) into v_valor
    from public.treatment_plan_session_procedures p
    join public.treatment_plan_sessions s on s.id = p.session_id
   where s.plan_id = p_plano;
  -- Os que o gatilho `documentos_do_plano_cancelado` vai cancelar (contados antes: o retrato vai no mesmo update).
  select count(*)::int into v_docs
    from public.issued_documents d
   where d.treatment_plan_id = p_plano and d.appointment_id is null
     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE');

  update public.treatment_plans
     set status = 'CANCELLED', updated_at = now(),
         cancelado_em = now(), cancelado_por = p_ator, cancelamento_motivo = v_motivo,
         -- Nada foi usado: o plano inteiro "caiu" (o pacote LGPD diz "valeu R$ 0,00").
         valor_cancelado = v_valor,
         cancelamento = jsonb_build_object(
           'antes_do_aceite', true,
           'status_anterior', v_tp.status,
           'sessoes', v_sessoes,
           'valor', v_valor,
           'documentos', v_docs,
           'por', p_ator_nome)
   where id = p_plano;

  return jsonb_build_object('status_anterior', v_tp.status, 'documentos', v_docs);
end;
$function$;

revoke all on function public.plano_cancelar_proposto(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.plano_cancelar_proposto(uuid, uuid, uuid, text, text) to service_role;

-- O aceite do plano cancelado dizia "Este plano já foi aceito. Recarregue a
-- tela." (a cliente no app, com a página aberta, aceitava um plano que a
-- unidade tinha acabado de cancelar). A recusa clara, trocada no corpo VIVO
-- (recriar a função de uma cópia velha desfaz consertos — 20261124900003).
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
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.plano_aceitar(uuid,uuid)'::regprocedure,
  array[$t$  if v_plano.status not in ('DRAFT', 'PROPOSED') then$t$],
  array[$t$  if v_plano.status in ('CANCELLED', 'REJECTED') then
    raise exception 'Este plano foi cancelado e não pode mais ser aceito.' using errcode = 'P0001';
  end if;
  if v_plano.status not in ('DRAFT', 'PROPOSED') then$t$],
  array[1]);

-- O "Cancelar plano" do aceito mandava o não aceito ao "Cancelar checkout", que
-- não existe mais na tela: agora ele se cancela sem dinheiro, por quem monta.
select pg_temp.trocar_no_corpo(
  'public.plano_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[$t$'Só o plano fechado se cancela aqui: o que ainda está no checkout se desfaz em "Cancelar checkout".'$t$],
  array[$t$'Este plano ainda não foi aceito: nada foi vendido nem recebido. Ele se cancela pelo "Cancelar plano" da página do plano, por quem monta o plano.'$t$],
  array[1]);

notify pgrst, 'reload schema';
