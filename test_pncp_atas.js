const url = "https://pncp.gov.br/api/pncp/v1/orgaos/00394452000103/compras/2025/21188/atas"
fetch(url).then(r => r.json()).then(d => {
  console.log("Success with pncp.gov.br/atas!")
  console.log(JSON.stringify(d, null, 2))
}).catch(e => console.log(e.message))
