const url = "https://pncp.gov.br/api/pncp/v1/orgaos/00394452000103/compras/2025/38/itens"
fetch(url).then(r => {
  console.log("CORS Headers for GET PNCP:")
  for (let [k,v] of r.headers.entries()) {
    console.log(`${k}: ${v}`)
  }
}).catch(e => console.log(e.message))
