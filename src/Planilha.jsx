import { useEffect, useMemo, useState } from 'react';
import { empresaPorId, fasesDe, ehProducao, percentual, rotuloPrazo, situacao, hoje } from './lib.js';
import { brl, resultadoDemanda } from './custos.js';

// ordem de importância: atrasadas, depois as que vencem logo, depois o resto, sem prazo no fim
const PESO = { atrasada: 0, urgente: 1, semana: 2, ok: 3, sem: 4 };

// Visão em planilha das demandas: edição rápida na linha e em lote
export function Planilha({ demandas, dados, pode, custos, onAbrir, avisar }) {
  const dia = hoje();
  const [sel, setSel] = useState(() => new Set());
  const [ordem, setOrdem] = useState({ col: 'importancia', asc: true });
  const [lote, setLote] = useState({ fase: '', inicio: '', entrega: '', percentual: '' });
  const [aplicando, setAplicando] = useState(false);
  const verValores = pode.admin && !!custos;
  const L = !pode.gestao; // campo: só fase e %
  const RO = !pode.editarAndamento; // cliente: só visualiza

  const linhas = useMemo(() => {
    const comInfo = demandas.map((d) => ({
      d, sit: d.arquivada ? 'ok' : situacao(d, dia), pct: percentual(d),
      r: verValores ? resultadoDemanda(d.id, dados, custos) : null,
    }));
    const chave = {
      importancia: (x) => [PESO[x.sit], x.d.entrega || '9999-99-99'],
      nome: (x) => [x.d.nome.toLowerCase()],
      empresa: (x) => [x.d.empresa, x.d.grupo || ''],
      cliente: (x) => [(x.d.grupo || '').toLowerCase()],
      fase: (x) => [x.d.fase],
      pct: (x) => [x.pct],
      inicio: (x) => [x.d.inicio || '9999-99-99'],
      entrega: (x) => [x.d.entrega || '9999-99-99'],
      vendido: (x) => [x.r?.vendido ?? -1],
      custo: (x) => [x.r ? x.r.custos + x.r.imposto : 0],
      resultado: (x) => [x.r?.resultado ?? -Infinity],
    }[ordem.col];
    return comInfo.sort((a, b) => {
      const ka = chave(a), kb = chave(b);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) return ordem.asc ? -1 : 1;
        if (ka[i] > kb[i]) return ordem.asc ? 1 : -1;
      }
      return 0;
    });
  }, [demandas, dados, custos, ordem, verValores, dia]);

  const salvar = (d, campos) => dados.salvarDemanda({ id: d.id, ...campos }); // só o que mudou
  const todosMarcados = linhas.length > 0 && linhas.every((x) => sel.has(x.d.id));
  const alternar = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const alternarTodos = () => setSel(todosMarcados ? new Set() : new Set(linhas.map((x) => x.d.id)));

  const aplicarLote = async (extra = {}) => {
    const alvo = demandas.filter((d) => sel.has(d.id));
    const campos = {};
    if (lote.fase) campos.fase = lote.fase;
    if (lote.inicio && !L) campos.inicio = lote.inicio;
    if (lote.entrega && !L) campos.entrega = lote.entrega;
    if (lote.percentual !== '') campos.percentual = Math.max(0, Math.min(100, Number(lote.percentual) || 0));
    Object.assign(campos, extra);
    if (!Object.keys(campos).length) { avisar('Escolha o que mudar nas selecionadas.'); return; }
    setAplicando(true);
    let n = 0;
    for (const d of alvo) {
      const c = { ...campos };
      if (c.fase && !fasesDe(d.empresa).some((f) => f.id === c.fase)) delete c.fase; // fase que não existe na Eko (ou vice-versa)
      if (ehProducao(d)) delete c.percentual; // na fábrica a % vem do estoque
      if (!Object.keys(c).length) continue;
      if (await salvar(d, c)) n++;
    }
    setAplicando(false);
    avisar(`${n} ${n === 1 ? 'demanda atualizada' : 'demandas atualizadas'}.`);
    setLote({ fase: '', inicio: '', entrega: '', percentual: '' });
    if (extra.arquivada !== undefined) setSel(new Set());
  };

  const Th = ({ col, children, className }) => (
    <th scope="col" className={className}>
      <button type="button" className="th-sort" onClick={() => setOrdem((o) => ({ col, asc: o.col === col ? !o.asc : true }))}>
        {children}{ordem.col === col ? (ordem.asc ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
  const clientes = [...new Set(dados.demandas.map((d) => d.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const todasFases = [...new Map([...fasesDe('engenharia'), ...fasesDe('eko')].map((f) => [f.id, f])).values()];

  return (
    <section className="card stack" aria-label="Planilha de demandas">
      {sel.size > 0 && (
        <div className="bulk" role="region" aria-label="Alterar selecionadas">
          <span className="bulk-count">{sel.size} {sel.size === 1 ? 'selecionada' : 'selecionadas'}</span>
          <label className="field"><span>Fase</span>
            <select value={lote.fase} onChange={(e) => setLote({ ...lote, fase: e.target.value })}>
              <option value="">—</option>
              {todasFases.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </label>
          {!L && (
            <>
              <label className="field"><span>Início</span>
                <input type="date" value={lote.inicio} onChange={(e) => setLote({ ...lote, inicio: e.target.value })} />
              </label>
              <label className="field"><span>Entrega</span>
                <input type="date" value={lote.entrega} onChange={(e) => setLote({ ...lote, entrega: e.target.value })} />
              </label>
            </>
          )}
          <label className="field" style={{ maxWidth: 110 }}><span>Andamento %</span>
            <input type="number" min="0" max="100" value={lote.percentual} onChange={(e) => setLote({ ...lote, percentual: e.target.value })} />
          </label>
          <div className="row" style={{ alignSelf: 'flex-end' }}>
            <button type="button" className="pill lime" disabled={aplicando} onClick={() => aplicarLote()}>{aplicando ? 'Aplicando…' : 'Aplicar'}</button>
            {!L && <button type="button" className="pill ghost" disabled={aplicando} onClick={() => aplicarLote({ arquivada: !linhas.find((x) => sel.has(x.d.id))?.d.arquivada })}>
              {linhas.find((x) => sel.has(x.d.id))?.d.arquivada ? 'Reabrir' : 'Concluir'}
            </button>}
            <button type="button" className="pill ghost" onClick={() => setSel(new Set())}>Limpar seleção</button>
          </div>
        </div>
      )}

      <datalist id="planilha-clientes">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="grid-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th scope="col" className="ck">{!RO && <input type="checkbox" aria-label="Selecionar todas" checked={todosMarcados} onChange={alternarTodos} />}</th>
              <Th col="nome">Demanda</Th>
              <Th col="cliente">Cliente</Th>
              <Th col="empresa">Empresa</Th>
              <Th col="importancia">Prazo</Th>
              <Th col="fase">Fase</Th>
              <Th col="pct">Andamento</Th>
              <Th col="inicio">Início</Th>
              <Th col="entrega">Entrega</Th>
              {verValores && <Th col="vendido" className="num">Vendido</Th>}
              {verValores && <Th col="custo" className="num">Custo</Th>}
              {verValores && <Th col="resultado" className="num">Resultado</Th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ d, sit, pct, r }) => (
              <LinhaPlanilha key={d.id} d={d} sit={sit} pct={pct} r={r} dia={dia} L={L} RO={RO} marcado={sel.has(d.id)} clientes={clientes}
                onMarcar={() => alternar(d.id)} onAbrir={() => onAbrir(d)} salvar={salvar} verValores={verValores} dados={dados} />
            ))}
            {!linhas.length && <tr><td colSpan={12} className="empty" style={{ padding: 16 }}>Nenhuma demanda neste filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Clique no nome para abrir a demanda completa. As mudanças na linha são salvas na hora. Marque várias para alterar em lote.</p>
    </section>
  );
}

function LinhaPlanilha({ d, sit, pct, r, dia, L, RO, marcado, onMarcar, onAbrir, salvar, verValores, dados, clientes }) {
  const [pctTxt, setPctTxt] = useState(String(d.percentual ?? 0));
  const [cliTxt, setCliTxt] = useState(d.grupo || '');
  useEffect(() => { setCliTxt(d.grupo || ''); }, [d.grupo]);
  const salvarCliente = () => {
    const v = cliTxt.trim();
    if (v === (d.grupo || '')) return;
    // na fábrica o nome do pedido é o próprio cliente
    salvar(d, d.empresa === 'eko' ? { grupo: v || 'Estoque', nome: v || 'Estoque' } : { grupo: v || null });
  };
  const [vendTxt, setVendTxt] = useState(r?.vendido != null ? String(r.vendido) : '');
  useEffect(() => { setPctTxt(String(d.percentual ?? 0)); }, [d.percentual]);
  useEffect(() => { setVendTxt(r?.vendido != null ? String(r.vendido) : ''); }, [r?.vendido]);
  const producao = ehProducao(d);
  const emp = empresaPorId[d.empresa];
  const salvarPct = () => {
    const v = Math.max(0, Math.min(100, Math.round(Number(pctTxt) || 0)));
    setPctTxt(String(v));
    if (v !== (d.percentual || 0)) salvar(d, { percentual: v });
  };
  const salvarVendido = () => {
    const v = vendTxt.trim() === '' ? null : Number(vendTxt.replace(/\./g, '').replace(',', '.'));
    if (v !== null && !Number.isFinite(v)) return;
    if (v !== (r?.vendido ?? null)) dados.salvarFinanceiro(d.id, { valor_vendido: v, imposto_pct: r?.impostoPct ?? null });
  };
  const enter = (e) => e.key === 'Enter' && e.currentTarget.blur();
  return (
    <tr className={marcado ? 'sel' : ''}>
      <td className="ck">{!RO && <input type="checkbox" aria-label={`Selecionar ${d.nome}`} checked={marcado} onChange={onMarcar} />}</td>
      <th scope="row">
        <button type="button" className="link-cell" onClick={onAbrir}>{d.nome}</button>
        {d.empresa === 'eko' && <small>{[d.produto, d.especificacao].filter(Boolean).join(' · ')}</small>}
      </th>
      <td>
        <input className="cell-input cli" list="planilha-clientes" disabled={L} aria-label={`Cliente de ${d.nome}`} value={cliTxt}
          placeholder="—" onChange={(e) => setCliTxt(e.target.value)} onBlur={salvarCliente} onKeyDown={enter} />
      </td>
      <td><span className="dot" style={{ background: emp?.cor, display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />{emp?.curto}</td>
      <td><span className={'due ' + (d.arquivada ? 'concl' : sit)}>{d.arquivada ? 'Concluída' : rotuloPrazo(d, dia)}</span></td>
      <td>
        <select className="cell-input" disabled={RO} aria-label={`Fase de ${d.nome}`} value={d.fase} onChange={(e) => salvar(d, { fase: e.target.value })}>
          {fasesDe(d.empresa).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </td>
      <td>
        {producao ? (
          <span className="pct-ro" title="Na fábrica a % vem do estoque">{pct}%</span>
        ) : (
          <span className="pct-cell">
            <input className="cell-input" type="number" min="0" max="100" disabled={RO} aria-label={`Andamento de ${d.nome}`} value={pctTxt}
              onChange={(e) => setPctTxt(e.target.value)} onBlur={salvarPct} onKeyDown={enter} />
            <span className="mini-bar"><span style={{ width: pct + '%' }} /></span>
          </span>
        )}
      </td>
      <td><input className="cell-input" type="date" disabled={L} aria-label={`Início de ${d.nome}`} value={d.inicio || ''} onChange={(e) => salvar(d, { inicio: e.target.value || null })} /></td>
      <td><input className="cell-input" type="date" disabled={L} aria-label={`Entrega de ${d.nome}`} value={d.entrega || ''} onChange={(e) => salvar(d, { entrega: e.target.value || null })} /></td>
      {verValores && (
        <td className="num">
          <input className="cell-input num" inputMode="decimal" placeholder="—" aria-label={`Valor vendido de ${d.nome}`} value={vendTxt}
            onChange={(e) => setVendTxt(e.target.value)} onBlur={salvarVendido} onKeyDown={enter} />
        </td>
      )}
      {verValores && <td className="num">{r.custos + r.imposto ? brl(r.custos + r.imposto) : '—'}</td>}
      {verValores && <td className={'num ' + (r.resultado == null ? '' : r.resultado >= 0 ? 'pos' : 'bad')}>{r.resultado != null ? brl(r.resultado) : '—'}</td>}
    </tr>
  );
}
