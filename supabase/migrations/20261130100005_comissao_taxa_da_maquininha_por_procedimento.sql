-- Item 11 da 26ª: "Descontar a taxa da maquininha" por procedimento.
--
-- O Heitor, 18/11, ao item 11: "ok". Até aqui a escolha era uma só, da rede
-- (`commission_configs.desconta_taxa`). Agora o procedimento, junto da
-- comissão dele, tem três: "Como a rede" (o padrão), "Desconta a taxa" e "Não
-- desconta".
--
-- 1. `procedures.desconta_taxa`: nulo = como a rede (o padrão de todo
--    procedimento que existe: nenhuma conta muda). O nome é o mesmo da coluna
--    da linha e da config — a Auditoria do procedimento já o diz ("desconta a
--    taxa").
-- 2. O retrato na linha: a linha de comissão do ATENDIMENTO de um procedimento
--    (a que tem `appointment_id` e `procedure_id`: o avulso e as sessões do
--    pacote, do plano e do pré-pago) nasce com a escolha do procedimento, quando
--    ele tem uma; sem ela, com a da rede, como antes. É a `desconta_taxa` da
--    linha, a mesma que `private.comissao_conta`/`comissao_conta_detalhe` já
--    leem e que o extrato diz ("base sem a taxa…" / "base cheia") — a conta
--    não muda, só o que a linha retrata. Um gatilho BEFORE INSERT, e não uma
--    troca em cada função que cria linha (`concluir_atendimento`,
--    `atendimento_abater_do_pacote`…): um lugar só, e a linha que nasce por um
--    caminho novo também o segue. A linha que já existe fica como está (o
--    retrato é da hora em que ela nasceu). A comissão de VENDA (pacote, plano,
--    pré-pago, produto: sem atendimento) segue a escolha da rede — é a comissão
--    de quem vende, não a do procedimento (decisão do Claude, 26ª).
-- 3. `comissao_do_procedimento_definir` ganha `p_desconta_taxa`
--    ('REDE' | 'SIM' | 'NAO'; nulo = não muda), gravado na MESMA transação que
--    a comissão do procedimento. A trava é a da action (a comissão do
--    procedimento é configuração da rede, só da Admin da rede:
--    `mexeNaConfigDaRede`); a função segue só do service_role. O corpo VIVO,
--    com a assinatura nova (o padrão `pg_temp.trocar_no_corpo`); a de cinco
--    parâmetros sai (duas com o mesmo nome confundiriam o PostgREST).

-- ─── 1. A escolha do procedimento ──────────────────────────────────────────
alter table public.procedures add column if not exists desconta_taxa boolean;

comment on column public.procedures.desconta_taxa is
  'Descontar a taxa da maquininha da comissão deste procedimento (item 11 da 26ª): nulo = como a rede (commission_configs.desconta_taxa).';

-- ─── 2. O retrato na linha do atendimento ──────────────────────────────────
create or replace function private.comissao_linha_taxa_do_procedimento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $f$
declare
  v_desconta boolean;
begin
  if new.procedure_id is not null and new.appointment_id is not null then
    select p.desconta_taxa into v_desconta
      from public.procedures p
     where p.id = new.procedure_id and p.tenant_id = new.tenant_id;
    if v_desconta is not null then
      new.desconta_taxa := v_desconta;
    end if;
  end if;
  return new;
end
$f$;

revoke execute on function private.comissao_linha_taxa_do_procedimento() from public, anon, authenticated;

drop trigger if exists trg_comissao_linha_taxa_do_procedimento on public.commission_lines;
create trigger trg_comissao_linha_taxa_do_procedimento
  before insert on public.commission_lines
  for each row execute function private.comissao_linha_taxa_do_procedimento();

-- ─── 3. A gravação, junto da comissão do procedimento ─────────────────────
create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  de text;
  para text;
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    -- O arquivo pode ter vindo com CRLF; o corpo no banco, não.
    de := replace(p_de[i], chr(13), '');
    para := replace(p_para[i], chr(13), '');
    n := (length(d) - length(replace(d, de, ''))) / length(de);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, de, para);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid)'::regprocedure,
  array[
-- 1. A assinatura nova (cria a função de seis parâmetros).
$t$p_profissionais jsonb, p_ator uuid)$t$,
-- 2. A escolha da taxa, conferida e gravada depois de conferido o procedimento.
$t$    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
$t$],
  array[
$t$p_profissionais jsonb, p_ator uuid, p_desconta_taxa text DEFAULT NULL::text)$t$,
$t$    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  -- Item 11 da 26ª: "Descontar a taxa da maquininha" do procedimento.
  if p_desconta_taxa is not null then
    if p_desconta_taxa not in ('REDE', 'SIM', 'NAO') then
      raise exception 'Escolha se a comissão deste procedimento desconta a taxa.' using errcode = 'invalid_parameter_value';
    end if;
    update public.procedures p
       set desconta_taxa = case p_desconta_taxa when 'SIM' then true when 'NAO' then false else null end
     where p.id = p_procedimento and p.tenant_id = p_tenant
       and p.desconta_taxa is distinct from (case p_desconta_taxa when 'SIM' then true when 'NAO' then false else null end);
  end if;
$t$],
  array[1, 1]);

drop function if exists public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid);

revoke execute on function public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid, text) to service_role;

notify pgrst, 'reload schema';
