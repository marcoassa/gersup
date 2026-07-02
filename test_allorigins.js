const url = "https://api.allorigins.win/raw?url=" + encodeURIComponent("https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=numeroControlePNCPCompra&codigo=00394452000103-1-021188/2025")
fetch(url).then(r => r.json()).then(d => {
  console.log("Success with allorigins!")
  console.log("Records:", d.totalRegistros)
}).catch(e => console.log(e.message))
