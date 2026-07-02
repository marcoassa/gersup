const url = "https://pncp.gov.br/api/pncp/v1/orgaos/00394452000103/compras/2025/21188"
fetch(url).then(r => r.json()).then(d => {
  console.log("Success with pncp.gov.br!")
  console.log("Orgao:", d.unidadeOrgaoCodigo)
  console.log("UASG:", d.unidadeSubRogadoCodigo) // wait, what is the UASG field in PNCP?
  console.log(Object.keys(d).join(', '))
  console.log("UASG is actually:", d.unidadeOrgao?.codigoUnidade)
}).catch(e => console.log(e.message))
