-- As categorias de procedimento da rede (pedido do Heitor, 2026-10-14).
--
-- Eram quinze fixas no código (CATEGORIES no formulário do procedimento), sem
-- tela nenhuma — e o procedimento com categoria fora delas ("Facial", vinda da
-- importação ou dos dados antigos) aparecia como "Selecione…" na edição: salvar
-- obrigava a trocar, e a categoria se perdia.
--
-- O mesmo desenho das tags da rede (20261013000006):
-- - `procedures.category` continua TEXTO: relatórios e métricas agrupam pelo
--   nome, e nada que lê a categoria muda.
-- - O vocabulário cresce SOZINHO: gatilho em procedures registra toda categoria
--   gravada (o cadastro, a importação, o Copilot, o seed).
-- - Nome único por rede SEM caixa: "Peeling" e "peeling" são uma.
-- - Rede nova nasce com as quinze de sempre; as que existem ganham essas mais
--   tudo o que já está em uso.
-- - RLS ligada e ZERO políticas permissivas: só o servidor.

create table if not exists public.procedure_categories (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  nome         text not null check (length(btrim(nome)) between 1 and 60),
  arquivada_em timestamptz,
  criada_em    timestamptz not null default now()
);

create unique index if not exists procedure_categories_nome_na_rede
  on public.procedure_categories (tenant_id, lower(nome));

alter table public.procedure_categories enable row level security;

-- A sessão de suporte não grava pelo PostgREST (o laço de 20261008000010).
create policy suporte_sem_escrita_ins on public.procedure_categories as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.procedure_categories as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.procedure_categories as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end);

-- ─── Registrar as categorias gravadas ───────────────────────────────────────

create or replace function private.registrar_categorias_de_procedimento(p_tenant uuid, p_lista text[])
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.procedure_categories (tenant_id, nome)
  select distinct on (lower(btrim(x))) p_tenant, btrim(x)
  from unnest(coalesce(p_lista, '{}')) as x
  where length(btrim(x)) between 1 and 60
  on conflict (tenant_id, lower(nome)) do nothing
$$;

-- Nada aqui pode derrubar a gravação do procedimento: o vocabulário é derivado.
create or replace function private.trg_registrar_categoria_de_procedimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category is not null and (tg_op = 'INSERT' or new.category is distinct from old.category) then
    begin
      perform private.registrar_categorias_de_procedimento(new.tenant_id, array[new.category]);
    exception when others then
      raise warning '[categorias] registrar no vocabulário da rede %: %', new.tenant_id, sqlerrm;
    end;
  end if;
  return new;
end
$$;

drop trigger if exists trg_registrar_categoria on public.procedures;
create trigger trg_registrar_categoria after insert or update of category on public.procedures
  for each row execute function private.trg_registrar_categoria_de_procedimento();

-- ─── As padrão da rede nova ──────────────────────────────────────────────────

create or replace function private.categorias_de_procedimento_padrao()
returns text[]
language sql
immutable
as $$ select array[
  'Toxina botulínica', 'Preenchimento', 'Fios', 'Bioestimuladores',
  'Limpeza de pele', 'Peeling', 'Microagulhamento', 'Laser',
  'Depilação', 'Massagem', 'Drenagem linfática', 'Corpo',
  'Estética íntima', 'Tricologia', 'Outros'
] $$;

create or replace function private.trg_rede_ganha_categorias_de_procedimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.registrar_categorias_de_procedimento(new.id, private.categorias_de_procedimento_padrao());
  return new;
end
$$;

drop trigger if exists trg_rede_ganha_categorias_de_procedimento on public.tenants;
create trigger trg_rede_ganha_categorias_de_procedimento after insert on public.tenants
  for each row execute function private.trg_rede_ganha_categorias_de_procedimento();

-- As redes que já existem: as padrão e tudo o que já está em uso.
select private.registrar_categorias_de_procedimento(t.id, private.categorias_de_procedimento_padrao()) from public.tenants t;
select private.registrar_categorias_de_procedimento(p.tenant_id, array_agg(distinct p.category))
  from public.procedures p where p.category is not null group by p.tenant_id;

-- ─── O uso de cada uma (a janela de categorias) ─────────────────────────────

create or replace function public.categorias_de_procedimento_da_rede(p_tenant uuid)
returns table (id uuid, nome text, arquivada_em timestamptz, procedimentos bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nome, c.arquivada_em,
         (select count(*) from public.procedures p
           where p.tenant_id = p_tenant and lower(btrim(p.category)) = lower(c.nome))
  from public.procedure_categories c
  where c.tenant_id = p_tenant
  order by lower(c.nome)
$$;

-- ─── Renomear (e juntar) ────────────────────────────────────────────────────
--
-- Troca a categoria em todos os procedimentos da rede, sem caixa. Se o nome
-- novo já é de outra categoria, as duas viram UMA (a que já existia, com o
-- nome dela). Na mesma transação. As variáveis não se chamam como colunas.

create or replace function public.renomear_categoria_de_procedimento(p_tenant uuid, p_categoria uuid, p_novo text)
returns table (nome_final text, procedimentos bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antigo text;
  v_final  text;
  v_outra  uuid;
  v_n      bigint;
begin
  select c.nome into v_antigo from public.procedure_categories c where c.id = p_categoria and c.tenant_id = p_tenant;
  if v_antigo is null then raise exception 'Categoria não encontrada.'; end if;
  v_final := btrim(p_novo);
  if length(v_final) not between 1 and 60 then raise exception 'Nome inválido.'; end if;

  select c.id, c.nome into v_outra, v_final
  from public.procedure_categories c
  where c.tenant_id = p_tenant and lower(c.nome) = lower(btrim(p_novo)) and c.id <> p_categoria;
  if v_outra is null then
    v_final := btrim(p_novo);
    update public.procedure_categories set nome = v_final where id = p_categoria;
  else
    delete from public.procedure_categories where id = p_categoria;
  end if;

  update public.procedures p set category = v_final
   where p.tenant_id = p_tenant and lower(btrim(p.category)) = lower(v_antigo);
  get diagnostics v_n = row_count;

  return query select v_final, v_n;
end
$$;

revoke execute on function public.categorias_de_procedimento_da_rede(uuid) from public, anon, authenticated;
revoke execute on function public.renomear_categoria_de_procedimento(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.categorias_de_procedimento_da_rede(uuid) to service_role;
grant execute on function public.renomear_categoria_de_procedimento(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
