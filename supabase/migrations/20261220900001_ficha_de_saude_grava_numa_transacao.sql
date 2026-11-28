-- A ficha de saúde respondida grava DUAS coisas que precisam valer juntas: a
-- ficha no prontuário (medical_records.general_anamnesis) e o fechamento do
-- pendente da cliente (pre_atendimentos). Eram duas idas ao banco, pelo
-- gravarAnamneseGeral (lib/pre-atendimento/ficha.ts): se a segunda falhasse,
-- a ficha ficava gravada e o pendente aberto, e a cliente seria chamada a
-- responder de novo. CLAUDE.md §14: "Escrever no banco fora de transação
-- quando duas gravações precisam valer juntas (padrão: o app calcula, uma
-- função grava)". Arremate da 41ª, decisão do Claude (28/11).
--
-- O app monta a ficha (o retrato das perguntas, as respostas, a origem e
-- quando); a função grava as duas coisas numa transação. Só o servidor a chama
-- (security definer que recebe a rede por parâmetro: CLAUDE.md §4).

create or replace function public.pre_atendimento_gravar_ficha_de_saude(
  p_tenant   uuid,
  p_client   uuid,
  p_anamnese jsonb,
  p_fechar   boolean,
  p_origem   text,
  p_por      uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_quando timestamptz := coalesce((p_anamnese ->> 'respondidoEm')::timestamptz, now());
begin
  if not exists (
    select 1 from public.clients
     where id = p_client and tenant_id = p_tenant
  ) then
    raise exception 'A cliente não é desta rede.' using errcode = 'check_violation';
  end if;

  insert into public.medical_records (client_id, general_anamnesis)
  values (p_client, p_anamnese)
  on conflict (client_id) do update set general_anamnesis = excluded.general_anamnesis;

  -- Sem resposta nenhuma, o pendente continua aberto (quem chama decide).
  if p_fechar then
    update public.pre_atendimentos
       set status         = 'RESPONDIDO',
           respostas      = p_anamnese -> 'respostas',
           respondido_em  = v_quando,
           origem         = p_origem,
           respondido_por = p_por,
           updated_at     = v_quando
     where client_id = p_client
       and tenant_id = p_tenant
       and status = 'PENDENTE';
  end if;
end
$function$;

revoke execute on function public.pre_atendimento_gravar_ficha_de_saude(uuid, uuid, jsonb, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.pre_atendimento_gravar_ficha_de_saude(uuid, uuid, jsonb, boolean, text, uuid) to service_role;

notify pgrst, 'reload schema';
