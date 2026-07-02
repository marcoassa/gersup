const url = "https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=numeroControlePNCPCompra&codigo=00394452000103-1-021188/2025"
fetch(url, { method: 'OPTIONS' }).then(r => {
  console.log("CORS Headers:")
  for (let [k,v] of r.headers.entries()) {
    console.log(`${k}: ${v}`)
  }
}).catch(e => console.log(e.message))
