import { useState } from 'react';
import { EMPRESAS } from './lib.js';
import { brl, pctFmt, resultadoDemanda } from './custos.js';

// Aba Financeiro → resultado de todas as obras (só administradores)
export function Resultados({ dados, porDemanda }) {
  const [concluidas, setConcluidas] = useState(false);
  const [empresa, setEmpresa] = useState('todas');

  if (!porDemanda) {
    return (
      <>
        <header className="head"><h1>Financeiro</h1></header>
        <section className="card placeholder">
          <span className="tag">Falta um passo</span>
          <p>Para ver o resultado das obras, rode no Supabase o arquivo <b>07_custos_e_resultado.sql</b>.</p>
        </section>
      </>
    );
  }

  const lista = dados.demandas
    .filter((d) => (concluidas || !d.arquivada) && (empresa === 'todas' || d.empresa === empresa))
    .map((d) => ({ d, r: resultadoDemanda(d.id, dados, porDemanda) }));

  const somar = (xs) => xs.reduce((t, { r }) => ({
    vendido: t.vendido + (r.vendido || 0), imposto: t.imposto + r.imposto, mo: t.mo + r.mo.total,
    material: t.material + r.material, combustivel: t.combustivel + r.combustivel, despesa: t.despesa + r.despesa,
    custos: t.custos + r.custos, resultado: t.resultado + (r.resultado ?? -r.custos),
  }), { vendido: 0, imposto: 0, mo: 0, material: 0, combustivel: 0, despesa: 0, custos: 0, resultado: 0 });

  const geral = somar(lista);
  const comValor = lista.filter(({ r }) => r.vendido != null);
  const semValor = lista.filter(({ r }) => r.vendido == null && r.custos > 0).length;
  const margem = geral.vendido ? (somar(comValor).resultado / geral.vendido) * 100 : null;

  // demandas com valores primeiro, depois as demais em ordem alfabética
  const ordem = (a, b) => (b.r.temAlgo - a.r.temAlgo) || a.d.nome.localeCompare(b.d.nome, 'pt-BR');
  const grupos = EMPRESAS.map((e) => ({ ...e, itens: lista.filter(({ d }) => d.empresa === e.id).sort(ordem) })).filter((g) => g.itens.length);

  return (
    <>
      <header className="head">
        <div>
          <h1>Financeiro</h1>
          <p className="date">Resultado por obra: valor vendido − imposto − mão de obra − material − combustível − despesas extras</p>
        </div>
        <div className="row">
          {[{ id: 'todas', curto: 'Todas' }, ...EMPRESAS].map((e) => (
            <button key={e.id} type="button" className={'pill' + (empresa === e.id ? ' on' : '')} aria-pressed={empresa === e.id} onClick={() => setEmpresa(e.id)}>{e.curto}</button>
          ))}
          <button type="button" className={'pill' + (concluidas ? ' on' : ' ghost')} aria-pressed={concluidas} onClick={() => setConcluidas((v) => !v)}>
            {concluidas ? 'Com concluídas' : 'Só em andamento'}
          </button>
        </div>
      </header>

      <div className="stats">
        <div className="stat" style={{ background: 'var(--blue)' }}>
          <span className="stat-label">Vendido</span><span className="stat-value">{brl(geral.vendido)}</span>
          <span className="stat-hint">{comValor.length} de {lista.length} demandas com valor</span>
        </div>
        <div className="stat" style={{ background: 'var(--peach)' }}>
          <span className="stat-label">Imposto + custos</span><span className="stat-value">{brl(geral.imposto + geral.custos)}</span>
          <span className="stat-hint">mão de obra {brl(geral.mo)}</span>
        </div>
        <div className="stat" style={{ background: 'var(--lav)' }}>
          <span className="stat-label">Resultado</span><span className="stat-value">{brl(somar(comValor).resultado)}</span>
          <span className="stat-hint">das demandas com valor vendido</span>
        </div>
        <div className="stat" style={{ background: 'var(--yellow)' }}>
          <span className="stat-label">Margem média</span><span className="stat-value">{pctFmt(margem)}</span>
          <span className="stat-hint">{semValor ? `${semValor} com custo e sem valor vendido` : 'sobre o valor vendido'}</span>
        </div>
      </div>

      <section className="card">
        <div className="grid-wrap">
          <table className="fin">
            <thead>
              <tr>
                <th scope="col">Demanda</th><th scope="col">Vendido</th><th scope="col">Imposto</th><th scope="col">Mão de obra</th>
                <th scope="col">Material</th><th scope="col">Combustível</th><th scope="col">Extras</th><th scope="col">Resultado</th><th scope="col">Margem</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const t = somar(g.itens);
                return [
                  <tr key={g.id} className="sep"><td colSpan={9}>{g.nome}</td></tr>,
                  ...g.itens.map(({ d, r }) => (
                    <tr key={d.id}>
                      <th scope="row">{d.nome}<small>{d.empresa === 'eko' ? d.produto : d.grupo}{d.arquivada ? ' · concluída' : ''}</small></th>
                      <td>{r.vendido != null ? brl(r.vendido) : '—'}</td>
                      <td>{r.imposto ? brl(r.imposto) : '—'}</td>
                      <td>{r.mo.total ? brl(r.mo.total) : '—'}{r.mo.semCusto ? <small className="warn">{r.mo.semCusto} dia(s) sem custo</small> : null}</td>
                      <td>{r.material ? brl(r.material) : '—'}</td>
                      <td>{r.combustivel ? brl(r.combustivel) : '—'}</td>
                      <td>{r.despesa ? brl(r.despesa) : '—'}</td>
                      <td className={r.resultado == null ? '' : r.resultado >= 0 ? 'pos' : 'bad'}>{r.resultado != null ? brl(r.resultado) : '—'}</td>
                      <td className={r.margemPct == null ? '' : r.margemPct >= 0 ? 'pos' : 'bad'}>{pctFmt(r.margemPct)}</td>
                    </tr>
                  )),
                  <tr key={g.id + '-t'} className="subtotal">
                    <th scope="row">Total {g.curto}</th>
                    <td>{brl(t.vendido)}</td><td>{brl(t.imposto)}</td><td>{brl(t.mo)}</td><td>{brl(t.material)}</td>
                    <td>{brl(t.combustivel)}</td><td>{brl(t.despesa)}</td>
                    <td className={t.resultado >= 0 ? 'pos' : 'bad'}>{brl(t.resultado)}</td>
                    <td>{pctFmt(t.vendido ? (t.resultado / t.vendido) * 100 : null)}</td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 12 }}>
          Para lançar valor vendido, imposto e custos, abra a demanda na aba Demandas → “Custos e resultado”, ou use o botão “+ R$” no dia da agenda.
          No total do grupo, demandas sem valor vendido entram só com os custos.
        </p>
      </section>
    </>
  );
}
