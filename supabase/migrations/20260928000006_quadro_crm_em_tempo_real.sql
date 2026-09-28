-- O quadro de oportunidades em tempo real, para todo mundo e sem expor dado.
--
-- O quadro assinava leads, crm_stages e crm_funnels pelo realtime, e quase
-- nada chegava:
--  - crm_funnels não estava na publicação;
--  - a política de crm_stages compara a claim no topo do token (onde ela não
--    está — mora em app_metadata), então ninguém recebia mudança de etapa;
--  - leads só é legível pela sessão de quem é da REDE: gerente e recepção de
--    unidade nunca recebiam nada.
-- E abrir leitura de leads pela sessão para "consertar" o realtime entregaria
-- a linha inteira do lead pelo websocket a quem o escopo "só os meus" esconde.
--
-- Então a tela não assina os dados: assina um SINAL. crm_quadro_sinais tem uma
-- linha por rede — "o quadro desta rede mudou às X", sem conteúdo nenhum —, e
-- gatilhos nas três tabelas a marcam. A tela, ao receber, recarrega pelo
-- servidor, que aplica o alcance de sempre. Mesmo argumento dos eventos de
-- estoque e pagamento (§9.9): vários caminhos gravam lead; o gatilho não
-- esquece nenhum.

create table if not exists public.crm_quadro_sinais (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  mudou_em  timestamptz not null default now()
);

comment on table public.crm_quadro_sinais is
  'Sinal de "o quadro de oportunidades desta rede mudou" — sem conteúdo, só para o realtime da tela.';

alter table public.crm_quadro_sinais enable row level security;

create policy crm_quadro_sinais_select on public.crm_quadro_sinais
  for select using ((tenant_id)::text = jwt_claim('tenant_id') and jwt_claim('role') <> 'CLIENT');

-- Nenhuma variável com nome de coluna (§9.2.1): prefixo v_.
create or replace function public.on_crm_quadro_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if tg_op = 'DELETE' then v_tenant := old.tenant_id; else v_tenant := new.tenant_id; end if;
  if v_tenant is null then return null; end if;
  insert into public.crm_quadro_sinais (tenant_id, mudou_em) values (v_tenant, now())
  on conflict (tenant_id) do update set mudou_em = excluded.mudou_em;
  return null;
end
$$;

revoke execute on function public.on_crm_quadro_mudou() from public, anon, authenticated;

drop trigger if exists trg_quadro_leads on public.leads;
create trigger trg_quadro_leads
  after insert or update or delete on public.leads
  for each row execute function public.on_crm_quadro_mudou();

drop trigger if exists trg_quadro_etapas on public.crm_stages;
create trigger trg_quadro_etapas
  after insert or update or delete on public.crm_stages
  for each row execute function public.on_crm_quadro_mudou();

drop trigger if exists trg_quadro_funis on public.crm_funnels;
create trigger trg_quadro_funis
  after insert or update or delete on public.crm_funnels
  for each row execute function public.on_crm_quadro_mudou();

alter publication supabase_realtime add table public.crm_quadro_sinais;

notify pgrst, 'reload schema';
