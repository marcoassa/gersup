const url = "https://pncp.gov.br/api/consulta/v1/orgaos/00394452000103/compras/2025/21188"
fetch(url).then(r => r.json()).then(d => {
  console.log(JSON.stringify(d, null, 2))
}).catch(e => console.log(e.message))
