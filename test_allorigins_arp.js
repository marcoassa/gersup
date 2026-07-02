const url = `https://api.allorigins.win/raw?url=` + encodeURIComponent(`https://dadosabertos.compras.gov.br/modulo-arp/1_consultarARP?codigoUnidadeGerenciadora=160518&dataVigenciaInicialMin=2026-01-01&dataVigenciaInicialMax=2026-12-31&pagina=1&tamanhoPagina=500`)
fetch(url).then(r => r.json()).then(d => {
  const arr = (d.resultado || d.data || d)
  if (!Array.isArray(arr)) {
    console.log("NOT AN ARRAY:", arr)
    return
  }
  const arps = arr.filter(a => a.numeroControlePncpCompra === '00394452000103-1-021188/2025')
  console.log(`Encontradas ${arps.length} atas para esta compra em 2026 via ALLORIGINS:`)
  console.log(arps.length > 0 ? arps[0].numeroAtaRegistroPreco : "Nenhuma")
}).catch(e => console.error(e.message))
