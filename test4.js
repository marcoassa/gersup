const url = "https://dadosabertos.compras.gov.br/modulo-arp/1_consultarARP?codigoUnidadeGerenciadora=160518&dataVigenciaInicialMin=2026-01-01&dataVigenciaInicialMax=2026-12-31&pagina=1&tamanhoPagina=500"
fetch(url).then(r => r.json()).then(d => {
  const arps = (d.resultado || d).filter(a => a.numeroControlePncpCompra === '00394452000103-1-021188/2025')
  console.log(`Encontradas ${arps.length} atas para esta compra em 2026:`)
  console.log(JSON.stringify(arps, null, 2))
}).catch(e => console.error(e.message))
