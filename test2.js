const url = "https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=numeroControlePNCPCompra&codigo=00394452000103-1-021188/2025"
fetch(url).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(e => console.error(e.message))
