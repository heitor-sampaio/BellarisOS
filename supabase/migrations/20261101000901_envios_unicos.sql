-- O envio que chega duas vezes grava uma vez só (D10 da 5ª simulação,
-- 2026-11-01; o Heitor: "se achar que precisa, use idempotência para todos os
-- cadastros e edições do sistema"). Um "Cadastrar cliente" criou duas fichas
-- "Valdir Duplicado" com 0,7 s de diferença: o botão só se desligava com o
-- `pending`, e a action não tinha trava de reenvio.
--
-- O mecanismo é UM para o sistema (`lib/envio-unico.ts`): a tela gera uma
-- chave por envio de formulário (`useEnvioUnico`) e a action a reivindica
-- aqui antes de gravar.
-- - `gravando`: a primeira chegada está gravando; a segunda espera por ela.
-- - `feito`: gravou; quem chegar com a mesma chave recebe o MESMO resultado
--   (`resultado`), sem gravar de novo.
-- - `livre`: a primeira voltou sem gravar (erro, aviso, pergunta): a chave
--   serve ao próximo envio, que é a resposta da pessoa.
-- A trava pelo CONTEÚDO (o mesmo nome e telefone ao mesmo tempo, sem chave da
-- tela) usa a mesma tabela, com uma chave derivada e `p_validade`: o `feito`
-- mais velho que ela vale como livre.
--
-- É do SERVIDOR: RLS ligada e nenhuma política (a sessão não lê nem escreve);
-- as restritivas do suporte, como em toda tabela de `public` (CLAUDE.md §14).

create table if not exists public.envios_unicos (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  acao          text not null,
  chave         uuid not null,
  estado        text not null default 'gravando' check (estado in ('gravando', 'feito', 'livre')),
  resultado     jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, acao, chave)
);

comment on table public.envios_unicos is
  'A chave de cada envio de formulário (D10, 2026-11-01): o reenvio do mesmo envio devolve o resultado do primeiro em vez de gravar de novo. Só o servidor (lib/envio-unico.ts).';

create index if not exists envios_unicos_criado_em on public.envios_unicos (criado_em);

alter table public.envios_unicos enable row level security;
revoke all on table public.envios_unicos from anon, authenticated;

create policy suporte_sem_escrita_ins on public.envios_unicos as restrictive for insert with check (
  case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_upd on public.envios_unicos as restrictive for update using (
  case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
       else (not private.suporte_sem_escrita()) end
) with check (
  case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_del on public.envios_unicos as restrictive for delete using (
  case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
       else (not private.suporte_sem_escrita()) end
);

-- Reivindica a chave, numa ida só e sem corrida (a chave primária decide quem
-- chegou primeiro). Devolve {situacao: 'sua' | 'feito' | 'ocupada', resultado}.
-- `gravando` parado há mais de 2 minutos é de uma passagem que morreu: vale
-- como livre.
create or replace function public.envio_reivindicar(p_tenant uuid, p_acao text, p_chave uuid, p_validade interval default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_estado    text;
  v_resultado jsonb;
begin
  insert into public.envios_unicos as e (tenant_id, acao, chave)
  values (p_tenant, p_acao, p_chave)
  on conflict (tenant_id, acao, chave) do update
    set estado = 'gravando', resultado = null, atualizado_em = now()
    where e.estado = 'livre'
       or (e.estado = 'gravando' and e.atualizado_em < now() - interval '2 minutes')
       or (e.estado = 'feito' and p_validade is not null and e.atualizado_em < now() - p_validade)
  returning e.estado into v_estado;
  if found then
    return jsonb_build_object('situacao', 'sua');
  end if;

  select e.estado, e.resultado into v_estado, v_resultado
  from public.envios_unicos e
  where e.tenant_id = p_tenant and e.acao = p_acao and e.chave = p_chave;

  if v_estado = 'feito' then
    return jsonb_build_object('situacao', 'feito', 'resultado', v_resultado);
  end if;
  return jsonb_build_object('situacao', 'ocupada');
end $$;

comment on function public.envio_reivindicar(uuid, text, uuid, interval) is
  'Reivindica a chave de um envio (D10): sua (grave), feito (devolva o resultado guardado) ou ocupada (outra chegada está gravando). Só o servidor.';

revoke execute on function public.envio_reivindicar(uuid, text, uuid, interval) from public, anon, authenticated;
grant  execute on function public.envio_reivindicar(uuid, text, uuid, interval) to service_role;

notify pgrst, 'reload schema';
