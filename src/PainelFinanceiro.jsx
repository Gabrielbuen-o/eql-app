import { useLargura } from './useLargura.js';
import { useMemo, useState } from 'react';
import { EMPRESAS, empresaPorId, iso, parse } from './lib.js';
import { brl, custoAtual, pctFmt, resultadoDemanda, tipoCustoNome } from './custos.js';
import { Legenda, TituloGrafico, barraArredondada, useTip } from './PainelDesktop.jsx';

// Visão financeira do Início (só administradores): faturamento, custos e resultado do mês.
const mesDe = (dia) => dia.slice(0, 7);
const nomeMes = (m, curto) => {
  const t = parse(m + '-01').toLocaleDateString('pt-BR', curto ? { month: 'short' } : { month: 'long', year: 'numeric' });
  return (curto ? t.replace('.', '') : t).replace(/^./, (c) => c.toUpperCase());
};
const mesMais = (m, n) => { const d = parse(m + '-01'); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7); };

// Tudo o que o painel precisa para um mês
export function resumoFinanceiro(dados, porDemanda, mes) {
  const fin = Object.fromEntries((dados.financeiro_demandas || []).map((f) => [f.demanda_id, f]));
  const vendidoDe = (d) => (fin[d.id]?.valor_vendido != null ? Number(fin[d.id].valor_vendido) : null);
  const impostoDe = (d) => { const v = vendidoDe(d), p = fin[d.id]?.imposto_pct; return v != null && p != null ? (v * Number(p)) / 100 : 0; };
  const temData = dados.demandas.some((d) => 'faturado_em' in d);

  const faturadasNo = (m) => dados.demandas.filter((d) => d.faturado_em && mesDe(d.faturado_em) === m);
  const somaVendido = (ds) => ds.reduce((t, d) => t + (vendidoDe(d) || 0), 0);
  const faturadas = faturadasNo(mes);
  const faturado = somaVendido(faturadas);
  const faturadoAnterior = somaVendido(faturadasNo(mesMais(mes, -1)));
  const impostos = faturadas.reduce((t, d) => t + impostoDe(d), 0);
  const semValor = faturadas.filter((d) => vendidoDe(d) == null);

  const aReceber = somaVendido(dados.demandas.filter((d) => d.pagamento === 'faturada'));
  const aFaturarDs = dados.demandas.filter((d) => (d.pagamento || 'a_faturar') === 'a_faturar' && vendidoDe(d) != null);
  const aFaturar = somaVendido(aFaturarDs);
  const concluidasSemFaturar = aFaturarDs.filter((d) => d.arquivada);

  // custos do mês: lançamentos + mão de obra (dias na agenda × custo do dia)
  const lanc = (dados.custos_lancamentos || []).filter((l) => mesDe(l.dia) === mes);
  const porTipo = { material: 0, combustivel: 0, despesa: 0 };
  lanc.forEach((l) => { porTipo[l.tipo] = (porTipo[l.tipo] || 0) + Number(l.valor || 0); });
  let maoDeObra = 0, diasSemCusto = 0;
  const cf = dados.custos_funcionarios || [];
  dados.alocacoes.filter((a) => mesDe(a.dia) === mes).forEach((a) => {
    const c = custoAtual(a.funcionario_id, cf, a.dia);
    if (c) maoDeObra += Number(c.custo_diario) || 0; else diasSemCusto++;
  });
  const custos = maoDeObra + porTipo.material + porTipo.combustivel + porTipo.despesa;
  const resultado = faturado - impostos - custos;

  // faturamento dos últimos 6 meses, por empresa
  const meses = Array.from({ length: 6 }, (_, i) => mesMais(mes, i - 5)).map((m) => {
    const ds = faturadasNo(m);
    return { m, total: somaVendido(ds), porEmpresa: EMPRESAS.map((e) => ({ e, v: somaVendido(ds.filter((d) => d.empresa === e.id)) })) };
  });

  // resultado por obra (as que têm valor vendido)
  const obras = dados.demandas
    .map((d) => ({ d, r: resultadoDemanda(d.id, dados, porDemanda) }))
    .filter((x) => x.r.vendido != null)
    .sort((a, b) => b.r.resultado - a.r.resultado);
  const margemMedia = obras.length ? obras.reduce((t, x) => t + (x.r.margemPct || 0), 0) / obras.length : null;

  return {
    temData, faturado, faturadoAnterior, impostos, semValor, faturadas, aReceber, aFaturar, concluidasSemFaturar,
    porTipo, maoDeObra, diasSemCusto, custos, resultado, meses, obras, margemMedia,
  };
}

export function useMesFinanceiro(dia) {
  const [mes, setMes] = useState(mesDe(dia));
  return { mes, setMes, anterior: () => setMes(mesMais(mes, -1)), proximo: () => setMes(mesMais(mes, 1)), atual: mes === mesDe(dia), nome: nomeMes(mes) };
}

export function useResumoFinanceiro(dados, porDemanda, mes, ativo) {
  return useMemo(() => (ativo ? resumoFinanceiro(dados, porDemanda, mes) : null),
    [ativo, dados.demandas, dados.financeiro_demandas, dados.custos_lancamentos, dados.custos_funcionarios, dados.alocacoes, porDemanda, mes]); // eslint-disable-line
}

export function PainelFinanceiro({ f, dados, mes, irPara }) {
  const varPct = f.faturadoAnterior ? ((f.faturado - f.faturadoAnterior) / f.faturadoAnterior) * 100 : null;
  const semFinanceiro = dados.faltando.has('financeiro_demandas');

  return (
    <>
      {semFinanceiro && (
        <section className="card aviso-banco"><strong>Os valores das obras ainda não estão liberados no banco.</strong>
          <span>Rode o arquivo <b>08_eko_e_custos_juntos.sql</b> no Supabase.</span></section>
      )}
      {!f.temData && !semFinanceiro && (
        <section className="card aviso-banco"><strong>Falta um passo para o faturamento por mês.</strong>
          <span>Rode o arquivo <b>11_painel_financeiro_e_campo.sql</b> no Supabase: ele guarda a data em que cada obra foi faturada.</span></section>
      )}

      <div className="fin-kpis">
        <FinKpi rotulo={`Faturado em ${nomeMes(mes.mes, true).toLowerCase()}`} valor={brl(f.faturado)} destaque
          dica={varPct == null ? `${f.faturadas.length} ${f.faturadas.length === 1 ? 'obra faturada' : 'obras faturadas'}`
            : `${varPct >= 0 ? '▲' : '▼'} ${pctFmt(Math.abs(varPct))} vs. mês anterior`}
          tom={varPct == null ? '' : varPct >= 0 ? 'bom' : 'ruim'} />
        <FinKpi rotulo="A receber" valor={brl(f.aReceber)} dica="faturado e ainda não pago" />
        <FinKpi rotulo="A faturar" valor={brl(f.aFaturar)}
          dica={f.concluidasSemFaturar.length ? `${f.concluidasSemFaturar.length} ${f.concluidasSemFaturar.length === 1 ? 'obra concluída' : 'obras concluídas'} sem faturar` : 'vendido, ainda não faturado'}
          tom={f.concluidasSemFaturar.length ? 'ruim' : ''} />
        <FinKpi rotulo="Custos do mês" valor={brl(f.custos)} dica={`mão de obra ${brl(f.maoDeObra)} · lançamentos ${brl(f.custos - f.maoDeObra)}`} />
        <FinKpi rotulo="Resultado do mês" valor={brl(f.resultado)} dica="faturado − impostos − custos do mês" tom={f.resultado >= 0 ? 'bom' : 'ruim'} />
        <FinKpi rotulo="Margem média" valor={pctFmt(f.margemMedia)} dica={`${f.obras.length} obras com valor de venda`} />
      </div>

      <div className="painel-grid g-2-1">
        <section className="card stack">
          <TituloGrafico titulo="Faturamento por mês" sub="Valor vendido das obras, pelo mês em que foram faturadas" />
          <GraficoFaturamento meses={f.meses} atual={mes.mes} />
        </section>
        <section className="card stack">
          <TituloGrafico titulo={`Custos de ${nomeMes(mes.mes, true).toLowerCase()}`} sub="Para onde foi o dinheiro no mês" />
          <CustosPorTipo f={f} />
        </section>
      </div>

      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <TituloGrafico titulo="Resultado por obra" sub="Vendido − impostos − custos (mão de obra e lançamentos) · todas as obras com valor de venda" />
          <button type="button" className="pill ghost" onClick={() => irPara('financeiro')}>Abrir Financeiro</button>
        </div>
        <ResultadoObras obras={f.obras} />
      </section>
    </>
  );
}

function FinKpi({ rotulo, valor, dica, tom = '', destaque }) {
  return (
    <div className={'fin-kpi' + (destaque ? ' destaque' : '')}>
      <span className="fin-kpi-l">{rotulo}</span>
      <span className="fin-kpi-v">{valor}</span>
      <span className={'fin-kpi-h ' + tom}>{dica}</span>
    </div>
  );
}

function GraficoFaturamento({ meses, atual }) {
  const tip = useTip();
  const max = Math.max(1, ...meses.map((m) => m.total));
  const passo = escala(max);
  const topo = Math.ceil(max / passo) * passo;
  const [caixa, largura] = useLargura(680);
  const W = Math.max(420, largura), H = 240, padL = 64, padB = 30, padT = 22;
  const bw = (W - padL) / meses.length;
  const y = (v) => H - padB - (v / topo) * (H - padB - padT);
  return (
    <div className="chart-box" ref={caixa}>
      <Legenda itens={EMPRESAS.map((e) => ({ nome: e.curto, cor: e.cor }))} />
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Faturamento dos últimos 6 meses">
        {Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo).map((v) => (
          <g key={v}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="grid" />
            <text x={padL - 8} y={y(v) + 4} className="axis" textAnchor="end">{compacto(v)}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          const w = Math.min(bw * 0.56, 72), x = padL + i * bw + (bw - w) / 2;
          const segs = m.porEmpresa.filter((s) => s.v > 0);
          let acc = 0;
          return (
            <g key={m.m} onMouseEnter={(ev) => tip.mostrar(ev, (
              <>
                <b>{nomeMes(m.m)}</b>
                <span>{brl(m.total)}</span>
                {segs.map((s) => <span key={s.e.id}><i style={{ background: s.e.cor }} />{s.e.curto}: {brl(s.v)}</span>)}
              </>
            ))} onMouseLeave={tip.esconder}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              {segs.map((s, j) => {
                const y0 = y(acc), y1 = y(acc + s.v); acc += s.v;
                const topoSeg = j === segs.length - 1;
                return topoSeg
                  ? <path key={s.e.id} d={barraArredondada(x, y1, w, y0 - y1, 4)} style={{ fill: s.e.cor }} />
                  : <rect key={s.e.id} x={x} y={y1 + 2} width={w} height={Math.max(0, y0 - y1 - 2)} style={{ fill: s.e.cor }} />;
              })}
              {m.total > 0 && <text x={x + w / 2} y={y(m.total) - 6} textAnchor="middle" className="val">{compacto(m.total)}</text>}
              <text x={x + w / 2} y={H - 10} textAnchor="middle" className={'axis' + (m.m === atual ? ' axis-strong' : '')}>{nomeMes(m.m, true)}</text>
            </g>
          );
        })}
      </svg>
      {tip.el}
    </div>
  );
}

function CustosPorTipo({ f }) {
  const linhas = [
    { id: 'mo', nome: 'Mão de obra', v: f.maoDeObra },
    { id: 'material', nome: tipoCustoNome.material, v: f.porTipo.material },
    { id: 'combustivel', nome: tipoCustoNome.combustivel, v: f.porTipo.combustivel },
    { id: 'despesa', nome: tipoCustoNome.despesa, v: f.porTipo.despesa },
  ];
  const max = Math.max(1, ...linhas.map((l) => l.v));
  return (
    <div className="fin-custos">
      {linhas.map((l) => (
        <div key={l.id} className="fin-custo">
          <span className="fin-custo-n">{l.nome}</span>
          <span className="fin-custo-bar"><span style={{ width: `${(l.v / max) * 100}%` }} /></span>
          <b>{brl(l.v)}</b>
        </div>
      ))}
      <div className="fin-custo total"><span className="fin-custo-n">Total</span><span /><b>{brl(f.custos)}</b></div>
      {f.diasSemCusto > 0 && <p className="note">{f.diasSemCusto} {f.diasSemCusto === 1 ? 'dia' : 'dias'} de agenda sem custo de funcionário cadastrado (aba Equipes).</p>}
    </div>
  );
}

function ResultadoObras({ obras }) {
  const [todas, setTodas] = useState(false);
  if (!obras.length) return <p className="empty">Nenhuma obra com valor de venda ainda. Cadastre em Demandas → obra → Custos e resultado.</p>;
  const lista = todas ? obras : [...obras.slice(0, 6), ...obras.slice(6).filter((x) => x.r.resultado < 0)];
  const maxAbs = Math.max(1, ...obras.map((x) => Math.abs(x.r.resultado)));
  return (
    <>
      <div className="fin-obras" role="table" aria-label="Resultado por obra">
        <div className="fin-obra cab" role="row">
          <span role="columnheader">Obra</span><span role="columnheader">Vendido</span><span role="columnheader">Custos + impostos</span>
          <span role="columnheader">Resultado</span><span role="columnheader">Margem</span>
        </div>
        {lista.map(({ d, r }) => (
          <div key={d.id} className="fin-obra" role="row">
            <span role="cell" className="fin-obra-n"><span className="dot" style={{ background: empresaPorId[d.empresa]?.cor }} />{d.nome}
              {d.arquivada && <small> · concluída</small>}</span>
            <span role="cell">{brl(r.vendido)}</span>
            <span role="cell">{brl(r.custos + r.imposto)}</span>
            <span role="cell" className={r.resultado >= 0 ? 'pos' : 'bad'}>
              <span className={'fin-res-bar ' + (r.resultado >= 0 ? 'pos' : 'neg')} style={{ width: `${(Math.abs(r.resultado) / maxAbs) * 100}%` }} />
              <b>{brl(r.resultado)}</b>
            </span>
            <span role="cell" className={r.margemPct >= 0 ? '' : 'bad'}>{pctFmt(r.margemPct)}</span>
          </div>
        ))}
      </div>
      {obras.length > lista.length && <button type="button" className="pill ghost" style={{ alignSelf: 'center' }} onClick={() => setTodas(true)}>Ver todas ({obras.length})</button>}
    </>
  );
}

function escala(max) {
  const bruto = max / 4;
  const p = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= bruto) || p * 10;
}
function compacto(v) {
  if (v >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (v >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil';
  return 'R$ ' + Math.round(v);
}
