const url1 = "https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=numeroControlePNCPCompra&codigo=00394452000103-1-021188/2025"
const url2 = "https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=numeroControlePNCPCompra&codigo=00394452000103-1-021188%2F2025"

fetch(url1).then(r => r.json()).then(d => console.log("Without encoding:", d.totalRegistros)).catch(e => console.log(e.message))
fetch(url2).then(r => r.json()).then(d => console.log("With encoding:", d.totalRegistros)).catch(e => console.log(e.message))
