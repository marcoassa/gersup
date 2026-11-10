# Rastreio dos itens dos pedidos

A tela Pedidos lê `public.itens_pedido_compra.empenhos_sped` junto com os demais campos do item. A coluna JSONB já existe no banco e tem valor padrão `[]`. Não há dados de pedidos embutidos no código da aplicação.

Cada elemento do array representa um vínculo ou uma pendência e preserva:

- `nup`: número completo do processo de aquisição do item, diferente do NUP do pregão.
- `processo_url`: endereço observado do processo no SPED; não deve ser deduzido do NUP.
- `numero` e `ug`: número da NE e unidade gestora, quando identificados.
- `status`, `ressalvas`, `fonte_numero` e `conferido_em`: situação e evidências do rastreio.
- `candidatos`: números conflitantes ou não confirmados; não são empenhos confirmados.

O array permite mais de um processo ou empenho por item. O NUP permanece salvo mesmo quando `numero` é nulo, como em processos arquivados ou com conflito. Não se mantém uma segunda coluna com o mesmo NUP, para evitar divergência entre cópias. Nos itens sem processo identificado, não se inventa um número.

Atualizações futuras devem preservar todo o array e seus campos de evidência. A tela é somente de consulta: não modifica os vínculos, quantidades ou valores. Estados desconhecidos são exibidos como pendentes de verificação. “Número identificado” não afirma que o conteúdo da NE foi conferido.

A busca de Pedidos inclui número do empenho, NUP de aquisição, UG e situação, além dos filtros textuais existentes. Pesquisar “pendente” localiza os itens com pendência registrada. Itens novos sem rastreio mostram “Rastreio não informado”.

Validação: `npm run build` e `npx tsx --test tests/empenhosSped.test.tsx`.
