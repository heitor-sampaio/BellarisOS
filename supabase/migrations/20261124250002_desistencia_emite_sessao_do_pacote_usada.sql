-- A desistência no meio emite "Sessão de pacote usada" (`pacote.sessao_usada`),
-- como a conclusão. Desde 20261123900004 (o Heitor, 2026-11-18: "Não existe
-- isso de desistir no meio do atendimento. Se isso por ventura acontecer,
-- problema de quem desistir.") o atendimento INICIADO e cancelado gasta a
-- sessão do pacote — mas o fato só saía da conclusão (`emitirSessaoDePacoteUsada`,
-- TS): a automação de "acabou, renove" (restantes = 0) não via a última sessão
-- gasta na desistência.
--
-- O fato sai do GATILHO, que vale em todo caminho do cancelamento do iniciado
-- (a desistência com insumo, o cancelar direto, o Copilot), com os MESMOS
-- campos e a MESMA chave da conclusão (`pacote.sessao_usada:<agendamento>`):
-- um atendimento não gera dois consumos. Origem 'banco', sem ator (como
-- `pagamento.*`); o cron despacha (`despacharFatosDoBanco`).
--
-- Corpo de partida: o de 20261123900004; só o ramo do iniciado mudou.

create or replace function private.pre_pago_libera()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pacote uuid;
  v_tenant uuid;
  v_cp record;
begin
  if new.status::text = 'CANCELLED' and old.status::text = 'IN_PROGRESS' then
    select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
    for v_pacote in
      update public.package_sessions
         set status = 'USED', used_at = now()
       where appointment_id = new.id and status = 'AVAILABLE'
      returning client_package_id
    loop
      update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;

      select cp.branch_id, cp.client_id, cp.total_sessions, cp.used_sessions,
             c.name as cliente_nome, sp.name as pacote_nome
        into v_cp
        from public.client_packages cp
        left join public.clients c on c.id = cp.client_id
        left join public.service_packages sp on sp.id = cp.package_id
       where cp.id = v_pacote;

      if v_tenant is not null then
        insert into public.domain_events
          (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave)
        values (
          v_tenant, v_cp.branch_id, 'pacote.sessao_usada', 'pacote', v_pacote,
          jsonb_build_object(
            'clienteId', v_cp.client_id,
            'clienteNome', v_cp.cliente_nome,
            'pacoteNome', v_cp.pacote_nome,
            'agendamentoId', new.id,
            'restantes', greatest(0, coalesce(v_cp.total_sessions, 0) - coalesce(v_cp.used_sessions, 0))),
          'sistema', 'banco', 'pacote.sessao_usada:' || new.id)
        on conflict (tenant_id, chave) where chave is not null do nothing;
      end if;
    end loop;
    update public.procedure_sale_units
       set status = 'USADA', used_at = now()
     where appointment_id = new.id and status = 'DISPONIVEL';
    return new;
  end if;

  if new.status::text in ('CANCELLED', 'NO_SHOW') and old.status::text is distinct from new.status::text then
    update public.procedure_sale_units
       set appointment_id = null
     where appointment_id = new.id and status = 'DISPONIVEL';
    update public.package_sessions
       set appointment_id = null
     where appointment_id = new.id and status = 'AVAILABLE';
    update public.treatment_plan_sessions
       set appointment_id = null
     where appointment_id = new.id;
  end if;
  return new;
end $function$;

revoke execute on function private.pre_pago_libera() from public, anon, authenticated;

notify pgrst, 'reload schema';
