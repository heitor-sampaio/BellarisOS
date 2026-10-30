-- O histórico do atendimento GRAVADO antes do D18 (migration 20261029000301)
-- ficou com o código da forma de pagamento, cru: "Pagamento confirmado via
-- CREDIT_CARD em 3x", "via CASH", "Checkout concluído — … 3x em CREDIT_CARD",
-- "Plano de tratamento recebido — … PIX à vista". Pedido do Heitor (frente de
-- cadastro, 2026-10-29): traduzir as linhas antigas, em TODAS as redes, com o
-- mesmo nome que a função usa hoje (`private.rotulo_da_forma`, o espelho de
-- `rotuloDaForma` no app).
--
-- Antes desta migration (SELECT na produção, 2026-10-29): 6 linhas em
-- appointment_history — e nenhuma outra tabela com texto (description, notes…)
-- tem o código depois de "via", "em" ou "—".
--
-- A tradução é uma função (`historico_forma_em_portugues`), para o E2E provar
-- cada formato (e2e/financeiro-historico-forma-em-portugues.spec.ts). Só troca o
-- código NOS LUGARES em que o sistema o escrevia — "<código> em Nx", "via
-- <código>", "em <código>", "— <código>", "<código> à vista" —, nunca a palavra
-- solta em outro texto.

create or replace function public.historico_forma_em_portugues(p_texto text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_t      text := p_texto;
  v_metodo text;
  v_vezes  text[];
begin
  if v_t is null then return null; end if;
  foreach v_metodo in array array['CREDIT_CARD', 'DEBIT_CARD', 'INTERNAL_CREDIT', 'CASH', 'PIX'] loop
    -- "CREDIT_CARD em 3x" (o cartão em vezes, pago na hora) → "Crédito 3x".
    loop
      v_vezes := regexp_match(v_t, '\m' || v_metodo || ' em (\d+)x');
      exit when v_vezes is null;
      v_t := regexp_replace(v_t, '\m' || v_metodo || ' em ' || v_vezes[1] || 'x',
        private.rotulo_da_forma(v_metodo, v_vezes[1]::int));
    end loop;
    -- "via PIX", "3x em PIX" (o crediário), "— PIX" → o nome curto.
    v_t := regexp_replace(v_t, '(via |em |— )' || v_metodo || '\M', '\1' || private.rotulo_da_forma(v_metodo), 'g');
    -- "PIX à vista".
    v_t := regexp_replace(v_t, '\m' || v_metodo || ' à vista', private.rotulo_da_forma(v_metodo) || ' à vista', 'g');
  end loop;
  return v_t;
end
$$;

comment on function public.historico_forma_em_portugues(text) is
  'Troca o código da forma de pagamento (CREDIT_CARD, PIX…) pelo nome da tela num texto do histórico, nos formatos que o sistema gravava antes do D18 (2026-10-29). Usada pela migration 20261029001002 e pelo E2E.';

-- Não recebe rede, mas é security definer (lê private.rotulo_da_forma): só o servidor.
revoke execute on function public.historico_forma_em_portugues(text) from public, anon, authenticated;
grant  execute on function public.historico_forma_em_portugues(text) to service_role;

-- As linhas antigas, em todas as redes.
update public.appointment_history
   set description = public.historico_forma_em_portugues(description)
 where description ~ '(via |em |— )(CASH|PIX|DEBIT_CARD|CREDIT_CARD|INTERNAL_CREDIT)\M'
    or description ~ '\m(CASH|PIX|DEBIT_CARD|CREDIT_CARD|INTERNAL_CREDIT) (em \d+x|à vista)';

notify pgrst, 'reload schema';
