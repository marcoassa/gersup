const url = "https://corsproxy.io/?https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=numeroControlePNCPCompra&codigo=00394452000103-1-021188/2025"
fetch(url).then(r => r.text()).then(d => {
  console.log("Response:", d)
}).catch(e => console.log(e.message))
