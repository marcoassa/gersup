const url1 = "https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=numeroControlePNCPCompra&codigo=00394452000103-1-000038/2025"
const url2 = "https://pncp.gov.br/api/pncp/v1/orgaos/00394452000103/compras/2025/38/itens"

async function testApi(url, name) {
  try {
    const res = await fetch(url)
    console.log(`${name}: ${res.status} ${res.statusText}`)
    if (res.ok) {
       const text = await res.text()
       console.log(`Response length: ${text.length} bytes`)
    }
  } catch (e) {
    console.log(`${name}: Error - ${e.message}`)
  }
}

async function run() {
  await testApi(url1, "dadosabertos.compras.gov.br")
  await testApi(url2, "pncp.gov.br")
}

run()
