import { useMemo, useState } from 'react';
import { PASSOS_ANCORAGEM, basesDaEstrutura, etapasDoRelatorio, tipoRelatorio } from './lib.js';
import { pdfAmericanTower, pdfEql, prepararImagem } from './relatorioPdf.js';
import { grupoInterno } from './ClienteCampo.jsx';

// Exportar um relatório em PDF: modelo EQL (todos) ou American Tower (ancoragem).
// Escolhe quais fotos entram, inclusive fotos de outros relatórios da mesma obra.
const dataBr = (iso) => (iso ? new Date(iso + 'T12:00').toLocaleDateString('pt-BR') : '');
const quandoBr = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const limpar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 -]+/g, '').trim().replace(/\s+/g, ' ');
const fotosDe = (r) => (r.arquivos || []).filter((a) => a.tipo !== 'video' && a.caminho);
const chave = (r, a) => r.id + '|' + a.caminho;

const CAMPOS_AT = [
  { id: 'site', rotulo: 'Site (ID ATC)' },
  { id: 'data', rotulo: 'Data do relatório' },
  { id: 'endereco', rotulo: 'Endereço', largo: true },
  { id: 'operadora', rotulo: 'Operadora' },
  { id: 'supervisor', rotulo: 'Supervisor' },
  { id: 'contratada', rotulo: 'Contratada' },
];
const CAMPOS_EQL = [
  { id: 'titulo', rotulo: 'Título', largo: true },
  { id: 'cliente', rotulo: 'Cliente' },
  { id: 'responsavel', rotulo: 'Responsável' },
  { id: 'endereco', rotulo: 'Endereço', largo: true },
];

export function ExportarPdf({ r, obra, dados, salvarCampos, entregar, onFechar }) {
  const tipo = tipoRelatorio[r.tipo];
  const ancoragem = r.tipo === 'ancoragem';
  const etapas = useMemo(() => etapasDoRelatorio(r) || [], [r]);
  const cliente = grupoInterno(obra?.grupo) ? '' : obra?.grupo || ''; // "Obras civis" etc. não é cliente
  const quem = dados.funcionarios?.find((f) => f.id === r.funcionario_id)?.nome || r.funcionario || '';
  const [modelo, setModelo] = useState(ancoragem ? 'at' : 'eql');
  const [cAt, setCAt] = useState(() => ({
    site: obra?.nome || '', data: dataBr(r.dia), endereco: r.campos?.endereco || '', operadora: '', supervisor: '', contratada: cliente,
    ...(r.campos?.at || {}),
  }));
  const [cEql, setCEql] = useState(() => ({
    titulo: `${tipo?.nome || 'Relatório'} · ${obra?.nome || ''}`.trim(), cliente, responsavel: quem, endereco: r.campos?.endereco || '',
    ...(r.campos?.pdf || {}),
  }));
  const campos = modelo === 'at' ? cAt : cEql;
  const setCampo = (id, v) => (modelo === 'at' ? setCAt({ ...cAt, [id]: v }) : setCEql({ ...cEql, [id]: v }));

  // outros relatórios da mesma obra com fotos (mais recentes primeiro)
  const outros = useMemo(() => (dados.relatorios || [])
    .filter((x) => x.demanda_id === r.demanda_id && x.id !== r.id && fotosDe(x).length)
    .sort((a, b) => (b.dia + (b.criado_em || '')).localeCompare(a.dia + (a.criado_em || ''))), [dados.relatorios, r]);
  const [sel, setSel] = useState(() => new Set(fotosDe(r).map((a) => chave(r, a))));
  const alternar = (k) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const marcarTodas = (rel, sim) => setSel((s) => { const n = new Set(s); fotosDe(rel).forEach((a) => (sim ? n.add(chave(rel, a)) : n.delete(chave(rel, a)))); return n; });
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');
  const [fim, setFim] = useState('');
  const ocupado = !!status;
  const edita = !!salvarCampos;

  // fotos do relatório na ordem das etapas
  const ordenar = (rel, lista) => {
    const es = etapasDoRelatorio(rel) || [];
    const pos = (eid) => { const i = es.findIndex((e) => e.id === eid); return i < 0 ? 9999 : i; };
    return [...lista].sort((a, b) => pos(a.etapa) - pos(b.etapa) || (a.ordem || 0) - (b.ordem || 0));
  };
  const minhas = ordenar(r, fotosDe(r));
  const nomeEtapa = (rel, eid) => (etapasDoRelatorio(rel) || []).find((e) => e.id === eid) || null;
  const total = sel.size;

  const gerar = async () => {
    setErro(''); setFim('');
    try {
      if (edita) {
        const novo = { ...(r.campos || {}), ...(modelo === 'at' ? { at: cAt } : { pdf: cEql }) };
        if (JSON.stringify(novo) !== JSON.stringify(r.campos || {})) await salvarCampos(r.id, novo);
      }
      // escolhidas: deste relatório (na ordem das etapas) e dos outros
      const escolhidas = [
        ...minhas.filter((a) => sel.has(chave(r, a))).map((a) => ({ rel: r, a })),
        ...outros.flatMap((o) => ordenar(o, fotosDe(o)).filter((a) => sel.has(chave(o, a))).map((a) => ({ rel: o, a }))),
      ];
      if (!escolhidas.length) throw new Error('Escolha pelo menos uma foto.');
      const imgs = [];
      for (const [i, x] of escolhidas.entries()) {
        setStatus(`Preparando foto ${i + 1} de ${escolhidas.length}…`);
        imgs.push({ ...x, img: await prepararImagem(dados.urlArquivo(x.a.caminho)) });
      }
      setStatus('Montando o PDF…');
      let blob, nome;
      if (modelo === 'at') {
        const logo = await prepararImagem('/modelos/american-tower.jpg', 400, 0.92).catch(() => null);
        // cada foto na sua base; fotos de outro relatório entram na base/etapa igual, se houver
        const bases = basesDaEstrutura(r.estrutura).map((b) => ({ ...b, fotos: [] }));
        const porBase = Object.fromEntries(bases.map((b) => [b.id, b]));
        const complementares = { sigla: 'COMPLEMENTARES', nome: 'Fotos complementares', fotos: [] };
        const ordemPasso = (eid) => PASSOS_ANCORAGEM.findIndex((p) => p.id === (eid || '').split(':')[1]);
        imgs.forEach((x) => {
          const [bid, pid] = (x.a.etapa || '').split(':');
          const passo = PASSOS_ANCORAGEM.find((p) => p.id === pid);
          const destino = x.rel.tipo === 'ancoragem' && porBase[bid] && passo ? porBase[bid] : complementares;
          const legenda = destino === complementares
            ? [nomeEtapa(x.rel, x.a.etapa)?.nome || tipoRelatorio[x.rel.tipo]?.nome, x.a.quando ? quandoBr(x.a.quando) : dataBr(x.rel.dia)].filter(Boolean).join(' · ')
            : passo.legenda;
          destino.fotos.push({ img: x.img, legenda, ordem: ordemPasso(x.a.etapa), seq: x.a.ordem || 0 });
        });
        bases.forEach((b) => b.fotos.sort((p, q) => p.ordem - q.ordem || p.seq - q.seq));
        blob = pdfAmericanTower({ campos: cAt, bases: [...bases, complementares], logo });
        nome = `ANCORAGEM - ${limpar(cAt.site || obra?.nome)} - ${(r.dia || '').replace(/-/g, '')}.pdf`;
      } else {
        const logo = await prepararImagem('/img/icone-512.png', 240, 0.92).catch(() => null);
        const secoes = [];
        const doRel = (rel, lista, titulo, sub) => {
          if (!lista.length) return;
          const es = etapasDoRelatorio(rel);
          if (rel.tipo === 'ancoragem') {
            // ancoragem: uma seção por base
            basesDaEstrutura(rel.estrutura).forEach((b) => {
              const fs = lista.filter((x) => (x.a.etapa || '').startsWith(b.id + ':'));
              if (fs.length) secoes.push({ titulo: `${b.sigla} · ${b.nome}`, sub, fotos: fs.map((x) => ({ img: x.img, legenda: nomeEtapa(rel, x.a.etapa)?.nome, detalhe: quandoBr(x.a.quando) })) });
            });
            const soltas = lista.filter((x) => !basesDaEstrutura(rel.estrutura).some((b) => (x.a.etapa || '').startsWith(b.id + ':')));
            if (soltas.length) secoes.push({ titulo: `${titulo} · outras fotos`, sub, fotos: soltas.map((x) => ({ img: x.img, detalhe: quandoBr(x.a.quando) })) });
            return;
          }
          secoes.push({
            titulo, sub,
            fotos: lista.map((x) => {
              const e = es && nomeEtapa(rel, x.a.etapa);
              const n = e && es ? es.indexOf(e) + 1 : null;
              return { img: x.img, legenda: e ? `${n}. ${e.nome}` : null, detalhe: quandoBr(x.a.quando) };
            }),
          });
        };
        doRel(r, imgs.filter((x) => x.rel === r), r.tipo === 'ancoragem' ? 'Ancoragem' : 'Fotos do relatório', dataBr(r.dia));
        outros.forEach((o) => doRel(o, imgs.filter((x) => x.rel === o), `${tipoRelatorio[o.tipo]?.nome || 'Relatório'} · ${dataBr(o.dia)}`, 'outro relatório desta obra'));
        const dias = [...new Set(imgs.map((x) => x.rel.dia))].sort();
        blob = pdfEql({
          cab: { titulo: cEql.titulo || tipo?.nome || 'Relatório' },
          info: [
            ['Obra', obra?.nome], ['Cliente', cEql.cliente], ['Relatório', tipo?.nome],
            ['Data', dias.length > 1 ? `${dataBr(dias[0])} a ${dataBr(dias[dias.length - 1])}` : dataBr(r.dia)],
            ['Responsável', cEql.responsavel], ['Fotos', String(imgs.length)],
            ['Endereço', cEql.endereco],
          ],
          observacao: r.observacao,
          secoes, logo,
          rodape: `EQL Group · ${obra?.nome || ''} · gerado em ${new Date().toLocaleDateString('pt-BR')}`,
        });
        nome = `${limpar(obra?.nome || 'Obra')} - ${limpar(tipo?.nome || r.tipo)} - ${(r.dia || '').replace(/-/g, '')}.pdf`;
      }
      setStatus('');
      await entregar([{ nome, blob }], nome);
      setFim(`Pronto: ${imgs.length} ${imgs.length === 1 ? 'foto' : 'fotos'} · ${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB`);
    } catch (e) { setStatus(''); setErro(e.message || 'Não deu para gerar o PDF.'); }
  };

  const grade = (rel, lista) => (
    <div className="pdf-grade">
      {lista.map((a) => {
        const k = chave(rel, a);
        const e = nomeEtapa(rel, a.etapa);
        return (
          <button key={k} type="button" className={'pdf-foto' + (sel.has(k) ? ' on' : '')} aria-pressed={sel.has(k)} disabled={ocupado}
            title={[e ? (e.sigla ? e.sigla + ' · ' : '') + e.nome : null, quandoBr(a.quando)].filter(Boolean).join(' · ')} onClick={() => alternar(k)}>
            <img src={dados.urlArquivo(a.miniatura || a.caminho)} alt="" loading="lazy" />
            <span className="pdf-check" aria-hidden="true">{sel.has(k) ? '✓' : ''}</span>
            {e?.sigla && <span className="pdf-tag">{e.sigla}</span>}
          </button>
        );
      })}
    </div>
  );
  const nSel = (rel) => fotosDe(rel).filter((a) => sel.has(chave(rel, a))).length;

  return (
    <div className="overlay" style={{ zIndex: 80 }} onMouseDown={(e) => e.target === e.currentTarget && !ocupado && onFechar()}>
      <div className="modal pdf-modal" role="dialog" aria-modal="true" aria-label="Exportar PDF">
        <div className="modal-head">
          <div><span className="modal-kicker">Exportar PDF · {tipo?.nome}</span><h2>{obra?.nome || 'Obra'}</h2>
            <p className="note">Escolha o modelo e as fotos. Dá para incluir fotos de outros relatórios desta obra.</p></div>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onFechar} disabled={ocupado}>×</button>
        </div>

        {ancoragem && (
          <div className="seg" role="group" aria-label="Modelo">
            <button type="button" className={modelo === 'at' ? 'on' : ''} aria-pressed={modelo === 'at'} onClick={() => setModelo('at')}>Padrão American Tower</button>
            <button type="button" className={modelo === 'eql' ? 'on' : ''} aria-pressed={modelo === 'eql'} onClick={() => setModelo('eql')}>Padrão EQL</button>
          </div>
        )}

        <div className="rfi-campos">
          {(modelo === 'at' ? CAMPOS_AT : CAMPOS_EQL).map((f) => (
            <label key={f.id} className={'field' + (f.largo ? ' largo' : '')}><span>{f.rotulo}</span>
              <input value={campos[f.id] || ''} disabled={ocupado} onChange={(e) => setCampo(f.id, e.target.value)} />
            </label>
          ))}
        </div>

        <div className="pdf-bloco">
          <div className="pdf-bloco-cab">
            <b>Fotos deste relatório</b><span className="note">{nSel(r)} de {minhas.length}</span>
            <button type="button" className="link-btn" disabled={ocupado} onClick={() => marcarTodas(r, nSel(r) < minhas.length)}>{nSel(r) < minhas.length ? 'Marcar todas' : 'Desmarcar todas'}</button>
          </div>
          {grade(r, minhas)}
        </div>

        {outros.length > 0 && (
          <div className="pdf-bloco">
            <div className="pdf-bloco-cab"><b>Fotos de outros relatórios desta obra</b><span className="note">toque para abrir e escolher</span></div>
            {outros.map((o) => (
              <details key={o.id} className="pdf-outro">
                <summary>
                  <span>{dataBr(o.dia)} · {tipoRelatorio[o.tipo]?.nome || o.tipo}</span>
                  <span className="note">{fotosDe(o).length} {fotosDe(o).length === 1 ? 'foto' : 'fotos'}{nSel(o) ? ` · ${nSel(o)} escolhida${nSel(o) > 1 ? 's' : ''}` : ''}</span>
                </summary>
                <button type="button" className="link-btn" disabled={ocupado} onClick={() => marcarTodas(o, nSel(o) < fotosDe(o).length)}>{nSel(o) < fotosDe(o).length ? 'Marcar todas deste' : 'Desmarcar todas deste'}</button>
                {grade(o, ordenar(o, fotosDe(o)))}
              </details>
            ))}
          </div>
        )}

        {erro && <div className="err" role="alert">{erro}</div>}
        {fim && <p className="note" role="status">{fim}</p>}
        <div className="modal-foot">
          <button type="button" className="pill ghost" onClick={onFechar} disabled={ocupado}>Fechar</button>
          <button type="button" className="pill lime" onClick={gerar} disabled={ocupado || !total}>
            {status || `Baixar PDF (${total} ${total === 1 ? 'foto' : 'fotos'})`}
          </button>
        </div>
      </div>
    </div>
  );
}
