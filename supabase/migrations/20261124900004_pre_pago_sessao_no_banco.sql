-- A6 da 25ª simulação, a parte do banco: as recusas e os textos do pré-pago
-- diziam "unidade" querendo dizer a SESSÃO paga ("Esta unidade está agendada:
-- cancele o agendamento antes.", "Unidade não encontrada."). "Unidade" é a
-- unidade da rede (CLAUDE.md §1); a tela já diz "sessão" (código da 25ª).
--
-- Troca só as frases que são da sessão, no corpo VIVO de cada função
-- (conferido na produção em 18/11: cada trecho aparece o número de vezes
-- esperado, sem CR). Fica de propósito o que é da unidade da REDE: em
-- `procedimento_vender` e `procedimento_vender_com_equipe`, "Unidade não
-- encontrada." confere `public.branches`, e "Este procedimento é de outra
-- unidade." também. Os nomes (da função, de parâmetro, a chave 'unidade' do
-- registro da auditoria) não mudam.
--
-- Além das recusas: o motivo do estorno ("Sessão cancelada: …"), a descrição
-- do lançamento ("Cancelamento da sessão N de …") e o motivo do acerto da
-- comissão ("Cancelamento de sessão do pré-pago") — os três chegam à tela
-- (Financeiro, extrato de comissões). Só os lançamentos NOVOS; os gravados
-- ficam como estão.
--
-- Não depende do código novo (nenhuma action casa estes textos; a recusa
-- chega à tela como veio).

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.agendamento_usar_credito(uuid,uuid,text,uuid,uuid,text)'::regprocedure,
  array[
    $t$'Esta unidade pré-paga não serve a este agendamento$t$
  ],
  array[
    $t$'Esta sessão pré-paga não serve a este agendamento$t$
  ],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.procedimento_cancelar_unidade_devolvendo(uuid,uuid,uuid,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[
    $t$'Unidade não encontrada.'$t$,
    $t$'Só uma unidade ainda disponível pode ser cancelada.'$t$,
    $t$'Esta unidade está agendada: cancele o agendamento antes.'$t$,
    $t$estorno_motivo = 'Unidade cancelada: ' ||$t$,
    $t$'Cancelamento da unidade ' ||$t$,
    $t$no cancelamento da unidade ' ||$t$,
    $t$'Cancelamento de unidade do pré-pago'$t$
  ],
  array[
    $t$'Sessão não encontrada.'$t$,
    $t$'Só uma sessão ainda disponível pode ser cancelada.'$t$,
    $t$'Esta sessão está agendada: cancele o agendamento antes.'$t$,
    $t$estorno_motivo = 'Sessão cancelada: ' ||$t$,
    $t$'Cancelamento da sessão ' ||$t$,
    $t$no cancelamento da sessão ' ||$t$,
    $t$'Cancelamento de sessão do pré-pago'$t$
  ],
  array[2, 1, 1, 1, 1, 1, 1]);

select pg_temp.trocar_no_corpo(
  'public.procedimento_vender(uuid,uuid,uuid,uuid,uuid,integer,numeric,integer,jsonb,jsonb)'::regprocedure,
  array[
    $t$'O rateio das unidades não fecha com o valor da venda.'$t$
  ],
  array[
    $t$'O rateio das sessões não fecha com o valor da venda.'$t$
  ],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.procedimento_vender_com_equipe(uuid,uuid,uuid,uuid,uuid,uuid,integer,numeric,integer,jsonb,jsonb)'::regprocedure,
  array[
    $t$'O rateio das unidades não fecha com o valor da venda.'$t$
  ],
  array[
    $t$'O rateio das sessões não fecha com o valor da venda.'$t$
  ],
  array[1]);

notify pgrst, 'reload schema';
