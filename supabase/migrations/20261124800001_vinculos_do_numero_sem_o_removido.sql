-- WPP-03 da varredura de conformidade (18/11): o número REMOVIDO não ganha
-- nome, unidade nem pessoas.
--
-- whatsapp-push.md §9.8.0: "quem acha um número por id (`numeroDaRede`, o
-- salvar, o padrão) recusa o removido". `definir_vinculos_do_numero` achava o
-- número só pela rede — gravava o rótulo e ligava gente a um número que já
-- saiu da rede (sem credencial, fora das Configurações). A action
-- (`atualizarVinculosDoNumero`) passou a recusar antes; esta é a segunda
-- parede, para quem chama a função.
--
-- Corpo vivo: 20260927000001_numero_com_varias_pessoas.sql (as migrations
-- depois dela só a citam). Muda uma linha: `and w.removido_em is null` no
-- update — sem ela, o `if not found` não dispara para o removido. Não depende
-- do código novo: o código velho já traduz o P0002 em "Conexão não encontrada
-- nesta rede.".

create or replace function public.definir_vinculos_do_numero(
  p_numero   uuid,
  p_tenant   uuid,
  p_label    text,
  p_branch   uuid,
  p_usuarios uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_branch is not null and not exists (
    select 1 from public.branches b where b.id = p_branch and b.tenant_id = p_tenant
  ) then
    raise exception 'unidade de outra rede' using errcode = '23503';
  end if;

  update public.whatsapp_numbers w
     set label = p_label, branch_id = p_branch, updated_at = now()
   where w.id = p_numero and w.tenant_id = p_tenant
     and w.removido_em is null;
  if not found then
    raise exception 'número não encontrado nesta rede' using errcode = 'P0002';
  end if;

  delete from public.whatsapp_number_users v
   where v.whatsapp_number_id = p_numero
     and not (v.user_id = any (coalesce(p_usuarios, '{}')));

  -- Pessoa de outra rede bate na chave composta (23503); pessoa que já fala
  -- por outro número bate no índice único (23505). Os dois abortam tudo.
  insert into public.whatsapp_number_users (whatsapp_number_id, user_id, tenant_id)
  select p_numero, x.id, p_tenant
    from unnest(coalesce(p_usuarios, '{}')) as x(id)
  on conflict (whatsapp_number_id, user_id) do nothing;
end;
$$;

revoke all on function public.definir_vinculos_do_numero(uuid, uuid, text, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.definir_vinculos_do_numero(uuid, uuid, text, uuid, uuid[])
  to service_role;

notify pgrst, 'reload schema';
