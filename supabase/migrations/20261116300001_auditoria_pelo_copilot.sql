-- CP1, o bloco Copilot do plano de adaptação (docs/revisao.md): a gravação que
-- o Copilot faz entra na Auditoria em nome de QUEM PEDIU, com a marca "pelo
-- Copilot".
--
-- O servidor põe o cabeçalho `x-bellaris-via: copilot` nas gravações do
-- cliente de serviço feitas dentro do Confirmar do Copilot (`efetivarAcao`,
-- pelo `comViaDoCopilot` de `packages/nucleo/src/lib/supabase/via-da-escrita.ts`).
-- O gatilho só o lê com a chave de SERVIÇO, como o `x-bellaris-ator` (CF3b):
-- pela sessão, o cabeçalho forjado não vale. E só o valor 'copilot' conta.
--
-- A marca vai em dois lugares: a coluna `via` (o filtro, o CSV) e o nome de
-- quem agiu, "Nome (pelo Copilot)" — é o que a tela mostra em "Quem", sem
-- mudar a tela. Sem backfill: o que já foi gravado fica como estava.
--
-- O corpo de private.auditar parte da definição VIVA (pg_get_functiondef) e só
-- troca os trechos abaixo; cada um tem de estar lá, senão a migration para.

alter table public.auditoria add column if not exists via text;
alter table public.auditoria drop constraint if exists auditoria_via_conhecida;
alter table public.auditoria add constraint auditoria_via_conhecida check (via is null or via = 'copilot');

do $$
declare
  d text := pg_get_functiondef('private.auditar()'::regprocedure);
  trocas text[][] := array[
    -- 1. a variável
    array[$t$  v_atendente   text;$t$,
          $t$  v_atendente   text;
  v_via         text;$t$],
    -- 2. o cabeçalho, só com a chave de serviço
    array[$t$      v_sessao_tx := v_cab ->> 'x-bellaris-suporte-sessao';$t$,
          $t$      v_sessao_tx := v_cab ->> 'x-bellaris-suporte-sessao';
      v_via := case when btrim(coalesce(v_cab ->> 'x-bellaris-via', '')) = 'copilot' then 'copilot' end;$t$],
    -- 3. a coluna no insert
    array[$t$ator_user_id, ator_cliente_id, ator_nome, ator_tipo, suporte_sessao_id)
    select$t$,
          $t$ator_user_id, ator_cliente_id, ator_nome, ator_tipo, suporte_sessao_id, via)
    select$t$],
    array[$t$a.user_id, a.cliente_id, a.nome, a.tipo, a.sessao
      from ($t$,
          $t$a.user_id, a.cliente_id, a.nome, a.tipo, a.sessao, a.via
      from ($t$],
    -- 4. o nome do membro, com a marca
    array[$t$            when v_membro is not null and v_membro_rede = tn.id then coalesce(nullif(btrim(v_membro_nome), ''), 'Membro')
            when v_staff_nome$t$,
          $t$            when v_membro is not null and v_membro_rede = tn.id then coalesce(nullif(btrim(v_membro_nome), ''), 'Membro')
              || case when v_via is not null then ' (pelo Copilot)' else '' end
            when v_staff_nome$t$],
    -- 5. a via, só de quem é membro da rede (fora da sessão de suporte)
    array[$t$          case when v_sessao is not null and v_sessao_rede = tn.id then v_sessao end as sessao
      ) a$t$,
          $t$          case when v_sessao is not null and v_sessao_rede = tn.id then v_sessao end as sessao,
          case when v_via is not null and v_tab <> 'prontuario_acessos'
                    and not (v_sessao is not null and v_sessao_rede = tn.id)
                    and v_membro is not null and v_membro_rede = tn.id then v_via end as via
      ) a$t$]
  ];
  i int;
begin
  if position('v_via' in d) > 0 then
    raise exception 'private.auditar já tem a via: nada a fazer (ou a migration rodou duas vezes)';
  end if;
  for i in 1 .. array_length(trocas, 1) loop
    if position(trocas[i][1] in d) = 0 then
      raise exception 'private.auditar mudou: o trecho % não está onde se esperava', i;
    end if;
    d := replace(d, trocas[i][1], trocas[i][2]);
  end loop;
  execute d;
end $$;

notify pgrst, 'reload schema';
