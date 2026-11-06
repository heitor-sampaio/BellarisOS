-- F36 — decisão 2 do Heitor sobre a 8ª simulação (2026-11-06): "Inves de
-- atende também em, o atende vira um checklist com todas as unidades, as que
-- estiverem marcadas ficam disponiveis".
--
-- `users.atende_em` é a lista das unidades em que o membro aparece como
-- profissional (a agenda, o agendar da equipe, do app e do Copilot, o repasse,
-- o "próximo livre", a comissão e os relatórios da unidade). A ABRANGÊNCIA
-- (`branch_id`) não muda com ela.
--
-- Por que uma coluna (uuid[]) e não uma tabela membro × unidade: uma tabela
-- com chave estrangeira para `users` E para `branches` na chave primária o
-- PostgREST lê como junção, e todo embed `users → branches(name)` (a Equipe,
-- a agenda) quebraria com PGRST201 — foi o que derrubou a produção em
-- 2026-11-04 (CLAUDE.md §14). E a lista de "quem atende aqui" é um filtro só
-- (`filtroDeQuemAtendeNaUnidade`), que vira `atende_em cs {unidade}`.
--
-- `provides_services` fica, e passa a querer dizer "atende em ALGUMA unidade":
-- ~60 lugares e ~120 specs o leem ou gravam. Os dois andam juntos num gatilho
-- só (`private.atende_em_sincronizar`):
--   - grava a lista → `provides_services` = lista não vazia;
--   - grava só `provides_services` (o caminho de antes) → ligado sem lista
--     vira o que a pessoa alcança (unidade fixa → a dela; da rede → todas as
--     ATIVAS de agora); desligado esvazia a lista;
--   - troca a abrangência sem mexer na lista, e a lista era o que ela
--     alcançava → passa a ser o que alcança na nova.
-- A unidade NOVA nasce sem ninguém marcado (princípio 6): nada a acrescenta
-- sozinho.

alter table public.users
  add column if not exists atende_em uuid[] not null default '{}';

create index if not exists users_atende_em_idx on public.users using gin (atende_em);

create or replace function private.atende_em_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_padrao_antes uuid[];
  v_estranha     uuid;
begin
  if tg_op = 'INSERT' then
    if cardinality(new.atende_em) > 0 then
      new.provides_services := true;
    elsif new.provides_services then
      new.atende_em := case when new.branch_id is not null then array[new.branch_id]
        else coalesce((select array_agg(b.id order by b.id) from branches b
                       where b.tenant_id = new.tenant_id and b.is_active), '{}') end;
    end if;
  else
    if new.atende_em is distinct from old.atende_em then
      new.provides_services := cardinality(new.atende_em) > 0;
    elsif new.provides_services is distinct from old.provides_services then
      if not new.provides_services then
        new.atende_em := '{}';
      elsif cardinality(new.atende_em) = 0 then
        new.atende_em := case when new.branch_id is not null then array[new.branch_id]
          else coalesce((select array_agg(b.id order by b.id) from branches b
                         where b.tenant_id = new.tenant_id and b.is_active), '{}') end;
      end if;
    elsif new.branch_id is distinct from old.branch_id and new.provides_services then
      -- A lista seguia a abrangência de antes? Segue a nova.
      v_padrao_antes := case when old.branch_id is not null then array[old.branch_id]
        else coalesce((select array_agg(b.id order by b.id) from branches b
                       where b.tenant_id = old.tenant_id and b.is_active), '{}') end;
      if (select array_agg(x order by x) from unnest(old.atende_em) x) is not distinct from v_padrao_antes then
        new.atende_em := case when new.branch_id is not null then array[new.branch_id]
          else coalesce((select array_agg(b.id order by b.id) from branches b
                         where b.tenant_id = new.tenant_id and b.is_active), '{}') end;
      end if;
    end if;
  end if;

  -- Sem repetição, em ordem, e só unidades DA REDE do membro.
  new.atende_em := coalesce((select array_agg(distinct x order by x) from unnest(new.atende_em) x), '{}');
  select x into v_estranha from unnest(new.atende_em) x
   where not exists (select 1 from branches b where b.id = x and b.tenant_id = new.tenant_id)
   limit 1;
  if v_estranha is not null then
    raise exception 'A unidade % não é desta rede.', v_estranha using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace trigger trg_atende_em_sincronizar
  before insert or update on public.users
  for each row execute function private.atende_em_sincronizar();

-- A migração do dado: quem atende hoje fica marcado no que alcança hoje, para
-- nada mudar na tela de ninguém (unidade fixa → a dela; da rede → as ativas).
update public.users u
   set atende_em = case when u.branch_id is not null then array[u.branch_id]
     else coalesce((select array_agg(b.id order by b.id) from public.branches b
                    where b.tenant_id = u.tenant_id and b.is_active), '{}') end
 where u.provides_services and cardinality(u.atende_em) = 0;

notify pgrst, 'reload schema';
