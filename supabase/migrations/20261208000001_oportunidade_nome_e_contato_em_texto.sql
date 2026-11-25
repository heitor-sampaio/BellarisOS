-- O nome e o contato da oportunidade cabem como na ficha.
--
-- O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
-- feito." `leads.name` e `leads.email` eram varchar(255), e `leads.phone`
-- varchar(30); os da ficha (`clients`) e do contato (`contacts`), de onde eles
-- vêm (a criação pela ficha, pelo contato e a propagação), são `text`. A janela
-- da oportunidade não limita o nome nem o e-mail: acima de 255 o banco recusava
-- em inglês ("value too long for type character varying(255)"), e a ficha de
-- nome mais longo não virava oportunidade.
--
-- Decisão do Claude, 25/11 (princípio 2): as três colunas viram `text`, como na
-- ficha. Nenhuma view depende delas (conferido na produção em 25/11); de
-- varchar para text o Postgres não reescreve a tabela. ADITIVA: só alarga;
-- nenhum valor gravado muda.

alter table public.leads
  alter column name type text,
  alter column email type text,
  alter column phone type text;

notify pgrst, 'reload schema';
