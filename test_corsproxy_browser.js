const url = "https://corsproxy.io/?" + encodeURIComponent("https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=numeroControlePNCPCompra&codigo=00394452000103-1-021188/2025")
fetch(url, { 
  headers: { 
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Origin": "https://marcoassa.github.io"
  } 
}).then(r => r.json()).then(d => {
  console.log("Success with corsproxy.io!")
  console.log("Records:", d.totalRegistros)
}).catch(e => console.log(e.message))
