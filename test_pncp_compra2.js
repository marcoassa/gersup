const url = "https://pncp.gov.br/api/pncp/v1/orgaos/00394452000103/compras/2025/21188"
fetch(url).then(r => r.json()).then(d => {
  console.log(JSON.stringify(d, null, 2))
}).catch(e => console.log(e.message))
