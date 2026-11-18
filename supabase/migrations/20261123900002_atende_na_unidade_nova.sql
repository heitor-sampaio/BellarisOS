-- Quem tem "A rede inteira" e atende em todas as unidades atende também na
-- unidade que a rede abrir (ou reativar) depois (EQ1, o Heitor: "Concord." a
-- "A rede inteira (todas, inclusive as que vierem)"). Saiu "a unidade nova
-- nasce sem ninguém marcado", que citava o princípio 6 contra a fala.
--
-- Quem tem "A rede inteira" mas escolheu à mão em quais unidades atende (a
-- lista sem todas as ativas) fica como escolheu: a unidade nova não entra
-- (decisão do Claude pelo princípio 1, 2026-11-18 — a escolha é da rede).
-- O `atende_em_sincronizar` dos membros acerta o `provides_services`.

create or replace function private.atende_na_unidade_nova()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not new.is_active then return new; end if;
  if tg_op = 'UPDATE' and old.is_active then return new; end if;

  update public.users u
     set atende_em = u.atende_em || new.id
   where u.tenant_id = new.tenant_id
     and u.branch_id is null
     and u.provides_services
     and not (new.id = any(u.atende_em))
     and not exists (
       select 1 from public.branches b
        where b.tenant_id = new.tenant_id and b.is_active and b.id <> new.id
          and not (b.id = any(u.atende_em)));
  return new;
end
$function$;

revoke execute on function private.atende_na_unidade_nova() from public, anon, authenticated;

drop trigger if exists trg_atende_na_unidade_nova on public.branches;
create trigger trg_atende_na_unidade_nova
  after insert or update of is_active on public.branches
  for each row execute function private.atende_na_unidade_nova();

notify pgrst, 'reload schema';
