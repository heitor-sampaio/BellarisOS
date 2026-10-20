-- Sem teto de conexões de WhatsApp extras (2026-10-19, decisão do Heitor: "não
-- existe limitação de quantos números extras podem ser incluídos"). Era 10, no
-- catálogo (ADICIONAIS), na leitura da assinatura e aqui — e a calculadora do
-- site sumia com a indicação acima de 15 números (nenhum plano cabia).
-- O Copilot avulso continua um só; negativo continua recusado.
--
-- Troca só o trecho do teto em `assinatura_adicional_definir`, e falha se não
-- o achar (a função mudou desde então: rever à mão).

do $$
declare
  v_def  text;
  v_novo text;
begin
  select pg_get_functiondef('public.assinatura_adicional_definir(uuid,text,integer,integer)'::regprocedure) into v_def;
  v_novo := replace(v_def,
$a$  v_max := case p_chave when 'whatsapp' then 10 else 1 end;
  if p_quantidade is null or p_quantidade < 0 or p_quantidade > v_max then
    raise exception using errcode = 'P0001', message = format('%s: de 0 até %s.', v_rotulo, v_max);
  end if;$a$,
$b$  -- Sem teto de conexões de WhatsApp extras (2026-10-19; era 10). O Copilot
  -- avulso continua um só.
  v_max := case p_chave when 'whatsapp' then null else 1 end;
  if p_quantidade is null or p_quantidade < 0 or (v_max is not null and p_quantidade > v_max) then
    raise exception using errcode = 'P0001', message = case when v_max is null
      then format('%s: a quantidade não pode ser negativa.', v_rotulo)
      else format('%s: de 0 até %s.', v_rotulo, v_max) end;
  end if;$b$);
  if v_novo = v_def then
    raise exception 'assinatura_adicional_definir: o trecho do teto não foi achado — rever à mão';
  end if;
  execute v_novo;
end $$;

notify pgrst, 'reload schema';
