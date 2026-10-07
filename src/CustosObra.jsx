import { useState } from 'react';
import { fmt, hoje } from './lib.js';
import { TIPOS_CUSTO, brl, brlCentavos, pctFmt, resultadoDemanda, tipoCustoNome } from './custos.js';

// aceita "20.000", "20000", "180,50" e "180.50"
const num = (s) => {
  if (s === '' || s == null) return null;
  let t = String(s).replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const paraCampo = (v, casas = 2) =>
  v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });

// Aba "Custos e resultado" dentro da demanda (só administradores)
export function CustosObra({ demanda, dados, porDemanda }) {
  const r = resultadoDemanda(demanda.id, dados, porDemanda);
  const [vendido, setVendido] = useState(paraCampo(r.vendido));
  const [pct, setPct] = useState(paraCampo(r.impostoPct));
  const [impR, setImpR] = useState(paraCampo(r.vendido != null && r.impostoPct != null ? r.imposto : null));

  const salvar = (v, p) => dados.salvarFinanceiro(demanda.id, { valor_vendido: v, imposto_pct: p });
  const aoMudarVendido = () => {
    const v = num(vendido), p = num(pct);
    if (v != null && p != null) setImpR(paraCampo((v * p) / 100));
    salvar(v, p);
  };
  const aoMudarPct = () => {
    const v = num(vendido), p = num(pct);
    if (v != null && p != null) setImpR(paraCampo((v * p) / 100));
    salvar(v, p);
  };
  const aoMudarImpR = () => {
    const v = num(vendido), ir = num(impR);
    if (!v || ir == null) return;
    const p = Math.round((ir / v) * 10000) / 100;
    setPct(paraCampo(p));
    salvar(v, p);
  };
  const enter = (e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur());

  const linhas = [
    ['Mão de obra', r.mo.total, `${r.mo.dias} ${r.mo.dias === 1 ? 'dia' : 'dias'} de equipe na agenda${r.mo.semCusto ? ` · ${r.mo.semCusto} sem custo cadastrado` : ''}`],
    ['Material', r.material],
    ['Combustível', r.combustivel],
    ['Despesas extras', r.despesa],
  ];

  return (
    <div className="stack">
      <div className="grid2">
        <label className="field"><span>Valor vendido (R$)</span>
          <input inputMode="decimal" placeholder="Ex.: 20.000" value={vendido} onChange={(e) => setVendido(e.target.value)} onBlur={aoMudarVendido} onKeyDown={enter} />
        </label>
        <div className="field"><span>Imposto</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" style={{ width: 90 }} inputMode="decimal" aria-label="Imposto em porcentagem" placeholder="%" value={pct}
              onChange={(e) => setPct(e.target.value)} onBlur={aoMudarPct} onKeyDown={enter} />
            <input className="input" style={{ flex: 1, minWidth: 0 }} inputMode="decimal" aria-label="Imposto em reais" placeholder="R$" value={impR}
              onChange={(e) => setImpR(e.target.value)} onBlur={aoMudarImpR} onKeyDown={enter} />
          </div>
        </div>
      </div>

      <div className="result">
        <div className="result-row strong"><span>Valor vendido</span><b>{r.vendido != null ? brlCentavos(r.vendido) : '—'}</b></div>
        <div className="result-row neg"><span>Imposto {r.impostoPct != null ? `(${pctFmt(r.impostoPct)})` : ''}</span><b>− {brlCentavos(r.imposto)}</b></div>
        {linhas.map(([nome, valor, sub]) => (
          <div key={nome} className="result-row neg">
            <span>{nome}{sub && <small>{sub}</small>}</span><b>− {brlCentavos(valor)}</b>
          </div>
        ))}
        <div className={'result-row total ' + (r.resultado == null ? '' : r.resultado >= 0 ? 'pos' : 'bad')}>
          <span>Resultado {r.margemPct != null && <small>margem de {pctFmt(r.margemPct)} sobre o vendido</small>}</span>
          <b>{r.resultado != null ? brlCentavos(r.resultado) : 'informe o valor vendido'}</b>
        </div>
      </div>

      <NovoLancamento dados={dados} demandaId={demanda.id} />

      <div className="stack" style={{ gap: 8 }}>
        <span className="modal-kicker">Lançamentos ({r.lancamentos.length})</span>
        {r.lancamentos.length ? (
          <ListaLancamentos lancamentos={r.lancamentos} dados={dados} />
        ) : (
          <p className="note">Nenhum custo lançado ainda. Dá para lançar aqui ou direto no dia, na agenda.</p>
        )}
      </div>

      {r.mo.porFunc.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="modal-kicker">Mão de obra por funcionário</span>
          <ul className="cost-list">
            {r.mo.porFunc.map((f) => (
              <li key={f.funcionario_id}>
                <span>{dados.funcionarios.find((x) => x.id === f.funcionario_id)?.nome || '?'}</span>
                <span className="sub">{f.dias} {f.dias === 1 ? 'dia' : 'dias'}{f.semCusto ? ` · ${f.semCusto} sem custo` : ''}</span>
                <b>{brlCentavos(f.custo)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function NovoLancamento({ dados, demandaId, dia: diaFixo, onLancado }) {
  const [tipo, setTipo] = useState('combustivel');
  const [dia, setDia] = useState(diaFixo || hoje());
  const [valor, setValor] = useState('');
  const [desc, setDesc] = useState('');
  const [salvando, setSalvando] = useState(false);
  const v = num(valor);
  const lancar = async (e) => {
    e?.preventDefault();
    if (v == null || v <= 0) return;
    setSalvando(true);
    const ok = await dados.lancarCusto({ demanda_id: demandaId, dia: diaFixo || dia, tipo, valor: v, descricao: desc.trim() || null });
    setSalvando(false);
    if (ok !== false) { setValor(''); setDesc(''); onLancado?.(); }
  };
  return (
    <div className="lanc-form" role="group" aria-label="Lançar custo">
      <span className="modal-kicker">Lançar custo</span>
      <div className="seg three">
        {TIPOS_CUSTO.map((t) => (
          <button key={t.id} type="button" className={tipo === t.id ? 'on' : ''} aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>{t.nome}</button>
        ))}
      </div>
      <div className="lanc-fields">
        {!diaFixo && (
          <label className="field"><span>Dia</span>
            <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </label>
        )}
        <label className="field"><span>Valor (R$)</span>
          <input inputMode="decimal" placeholder="Ex.: 180,50" value={valor} onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lancar(e)} />
        </label>
        <label className="field" style={{ flex: '2 1 200px' }}><span>Descrição (opcional)</span>
          <input placeholder={tipo === 'combustivel' ? 'Ex.: HR, posto da Marginal' : tipo === 'material' ? 'Ex.: 10 sacos de cimento' : 'Ex.: estacionamento, frete'}
            value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lancar(e)} />
        </label>
        <button type="button" className="pill lime" style={{ minHeight: 44, alignSelf: 'flex-end' }} disabled={salvando || v == null || v <= 0} onClick={lancar}>
          {salvando ? 'Lançando…' : 'Lançar'}
        </button>
      </div>
    </div>
  );
}

export function ListaLancamentos({ lancamentos, dados, mostrarDia = true }) {
  const [confirmar, setConfirmar] = useState(null);
  const lista = [...lancamentos].sort((a, b) => b.dia.localeCompare(a.dia) || (b.criado_em || '').localeCompare(a.criado_em || ''));
  const autor = (id) => dados.perfis.find((p) => p.id === id)?.nome;
  return (
    <ul className="lanc-list">
      {lista.map((l) => (
        <li key={l.id}>
          <span className={'tipo-tag ' + l.tipo}>{tipoCustoNome[l.tipo]}</span>
          <span className="lanc-desc">
            {l.descricao || '—'}
            <small>{[mostrarDia && fmt(l.dia), autor(l.criado_por) && 'por ' + autor(l.criado_por)].filter(Boolean).join(' · ')}</small>
          </span>
          <b>{brlCentavos(l.valor)}</b>
          {confirmar === l.id ? (
            <button type="button" className="mini danger" onClick={() => { dados.apagarLancamento(l.id); setConfirmar(null); }}>Apagar?</button>
          ) : (
            <button type="button" className="x-btn" aria-label={`Apagar lançamento de ${brl(l.valor)}`} onClick={() => setConfirmar(l.id)}>×</button>
          )}
        </li>
      ))}
    </ul>
  );
}
