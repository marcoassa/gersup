# Demandas

Consulta centralizada com busca por descrição, requisitante, CM, PN, MPN e referências das fontes. Filtros de grupo, situação da fonte, acompanhamento, entrega e pendências. Detalhes editáveis, fontes originais preservadas, candidatos a compra/estoque e histórico de alterações.

## Importação inicial
263 registros do levantamento de 12/11/2026. Todos entram com revisão pendente, demanda a validar e entrega a verificar. A situação anotada na fonte permanece separada do acompanhamento atual. Registros semelhantes não são somados nem fundidos automaticamente. Dados privados são armazenados somente no banco autenticado; não fazem parte deste repositório.

## Confirmação
Recebimentos exigem evidência e data. Atendimento ou cancelamento exige justificativa. Vínculos com itens de pedidos ou estoque são explicitamente confirmados pelo usuário e registram quantidades prevista, recebida e destinada por unidade. Não alteram pedidos nem movimentam estoque automaticamente. A desativação mantém o histórico.

## Banco e acesso
`database/demandas.sql` define tabelas, restrições, histórico e acesso por proprietário autenticado. O original importado é imutável na interface. Atualizações usam versão para evitar sobrescrita entre sessões. Não há acesso anônimo. O histórico não pode ser alterado pela interface.

## Validação
Build de produção, verificação de estilo e testes `tests/demandas.test.ts`. As regras de propriedade, evidência, concorrência e histórico também foram verificadas em transação revertida no banco.
