import { useState } from 'react';
import { fmt, hoje } from './lib.js';
import { brlCentavos, resultadoDemanda } from './custos.js';
import { num, paraCampo } from './CustosObra.jsx';

// Enter dentro destes campos não pode enviar o formulário da demanda
const enterFaz = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

// ---------------------------------------------------------------------
// Recebimentos da obra (só administradores): data de entrada, NF e valor → saldo a receber
// ---------------------------------------------------------------------
export function RecebimentosObra({ demanda, dados, porDemanda }) {
  const [dia, setDia] = useState(hoje());
  const [nf, setNf] = useState('');
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  if (dados.faltando?.has('demanda_recebimentos')) {
    return <p className="note aviso-mini">Para lançar os recebimentos, rode no Supabase o arquivo <b>20_recebimentos_falta_frota_ancoragem.sql</b>.</p>;
  }
  const r = resultadoDemanda(demanda.id, dados, porDemanda);
  const v = num(valor);
  const lancar = async () => {
    if (v == null || v <= 0 || !dia) return;
    setSalvando(true);
    const ok = await dados.lancarRecebimento({ demanda_id: demanda.id, dia, nf: nf.trim() || null, valor: v });
    setSalvando(false);
    if (ok !== false) { setNf(''); setValor(''); }
  };
  const lista = [...r.recebimentos].sort((a, b) => a.dia.localeCompare(b.dia) || (a.criado_em || '').localeCompare(b.criado_em || ''));
  const pct = r.total ? Math.min(100, Math.round((r.recebido / r.total) * 100)) : 0;

  return (
    <div className="fin-obra-box" role="group" aria-label="Recebimentos">
      <div className="fin-obra-resumo">
        <div><span>Valor total</span><b>{r.total != null ? brlCentavos(r.total) : '—'}</b>
          <small>{r.total == null ? 'informe o valor vendido em Custos e resultado' : r.adicionais ? `vendido ${brlCentavos(r.vendido || 0)} + adicionais ${brlCentavos(r.adicionais)}` : 'valor vendido'}</small></div>
        <div><span>Recebido</span><b>{brlCentavos(r.recebido)}</b><small>{lista.length} {lista.length === 1 ? 'entrada' : 'entradas'}</small></div>
        <div className={'saldo' + (r.saldo != null && r.saldo <= 0.004 ? ' quitado' : '')}><span>Saldo a receber</span>
          <b>{r.saldo != null ? brlCentavos(Math.max(0, r.saldo)) : '—'}</b>
          <small>{r.saldo == null ? '' : r.saldo < -0.004 ? `recebido ${brlCentavos(-r.saldo)} a mais` : r.saldo <= 0.004 ? 'tudo recebido' : `${pct}% recebido`}</small></div>
      </div>
      {r.total != null && <div className="fin-obra-barra" aria-hidden="true"><i style={{ width: pct + '%' }} /></div>}

      {lista.length > 0 && (
        <ul className="lanc-list fin-receb-list">
          {lista.map((x) => (
            <li key={x.id}>
              <span className="fin-receb-dia">{fmt(x.dia)}</span>
              <span className="lanc-desc">{x.nf ? `NF ${x.nf}` : 'Sem NF'}</span>
              <b>{brlCentavos(x.valor)}</b>
              {confirmar === x.id
                ? <button type="button" className="mini danger" onClick={() => { dados.apagarRecebimento(x.id); setConfirmar(null); }}>Apagar?</button>
                : <button type="button" className="x-btn" aria-label={`Apagar entrada de ${brlCentavos(x.valor)}`} onClick={() => setConfirmar(x.id)}>×</button>}
            </li>
          ))}
        </ul>
      )}

      <div className="lanc-fields">
        <label className="field"><span>Data de entrada</span>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <label className="field"><span>NF</span>
          <input value={nf} inputMode="numeric" placeholder="Ex.: 1234" onChange={(e) => setNf(e.target.value)} onKeyDown={enterFaz(lancar)} />
        </label>
        <label className="field"><span>Valor (R$)</span>
          <input inputMode="decimal" placeholder="Ex.: 5.000" value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={enterFaz(lancar)} />
        </label>
        <button type="button" className="pill lime" style={{ minHeight: 44, alignSelf: 'flex-end' }} disabled={salvando || v == null || v <= 0 || !dia} onClick={lancar}>
          {salvando ? 'Lançando…' : 'Lançar entrada'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Adicionais da obra. Administrador: descrição + valor. Gerente: só a descrição
// (o administrador coloca o valor depois; o gerente nunca vê valores).
// ---------------------------------------------------------------------
export function AdicionaisObra({ demanda, dados, admin, euId }) {
  const [desc, setDesc] = useState('');
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  if (dados.faltando?.has(admin ? 'demanda_adicionais' : 'adicionais_publicos')) {
    return <p className="note aviso-mini">Para incluir adicionais, rode no Supabase o arquivo <b>20_recebimentos_falta_frota_ancoragem.sql</b>.</p>;
  }
  const lista = (admin ? dados.demanda_adicionais : dados.adicionais_publicos || [])
    .filter((a) => a.demanda_id === demanda.id)
    .sort((a, b) => (a.criado_em || '').localeCompare(b.criado_em || ''));
  const autor = (id) => dados.perfis.find((p) => p.id === id)?.nome;
  const v = num(valor);
  const incluir = async () => {
    if (!desc.trim()) return;
    setSalvando(true);
    const ok = await dados.incluirAdicional({ demanda_id: demanda.id, descricao: desc.trim(), ...(admin && v != null ? { valor: v } : {}) });
    setSalvando(false);
    if (ok !== false) { setDesc(''); setValor(''); }
  };
  const semValor = admin ? lista.filter((a) => a.valor == null).length : 0;

  return (
    <div className="fin-obra-box" role="group" aria-label="Adicionais da obra">
      <div className="fin-obra-tit">
        <b>Adicionais</b>
        <span className="note">{admin
          ? (semValor ? `${semValor} ${semValor === 1 ? 'item espera' : 'itens esperam'} o valor` : 'serviços extras pagos à parte; entram no valor total')
          : 'inclua o serviço extra; o valor é colocado pelo administrador'}</span>
      </div>
      {lista.length > 0 && (
        <ul className="lanc-list fin-adic-list">
          {lista.map((a) => (
            <li key={a.id} className={admin && a.valor == null ? 'sem-valor' : ''}>
              <span className="lanc-desc">{a.descricao}
                <small>{[fmt(a.dia), autor(a.criado_por) && 'por ' + autor(a.criado_por)].filter(Boolean).join(' · ')}</small></span>
              {admin
                ? <ValorAdicional a={a} dados={dados} />
                : <span className={'fin-adic-status' + (a.com_valor ? ' ok' : '')}>{a.com_valor ? 'valor definido' : 'aguardando valor'}</span>}
              {(admin || (a.criado_por === euId && !a.com_valor)) && (confirmar === a.id
                ? <button type="button" className="mini danger" onClick={() => { dados.apagarAdicional(a.id); setConfirmar(null); }}>Tirar?</button>
                : <button type="button" className="x-btn" aria-label={`Tirar o adicional ${a.descricao}`} onClick={() => setConfirmar(a.id)}>×</button>)}
            </li>
          ))}
        </ul>
      )}
      <div className="lanc-fields">
        <label className="field" style={{ flex: '3 1 220px' }}><span>Novo adicional</span>
          <input value={desc} placeholder="Ex.: pintura do muro, base extra, troca de tampa" onChange={(e) => setDesc(e.target.value)} onKeyDown={enterFaz(incluir)} />
        </label>
        {admin && (
          <label className="field"><span>Valor (R$)</span>
            <input inputMode="decimal" placeholder="opcional" value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={enterFaz(incluir)} />
          </label>
        )}
        <button type="button" className="pill lime" style={{ minHeight: 44, alignSelf: 'flex-end' }} disabled={salvando || !desc.trim()} onClick={incluir}>
          {salvando ? 'Incluindo…' : 'Incluir'}
        </button>
      </div>
    </div>
  );
}

// valor de um adicional, editável na própria linha (salva ao sair do campo)
function ValorAdicional({ a, dados }) {
  const [txt, setTxt] = useState(paraCampo(a.valor));
  const salvar = () => {
    const v = num(txt);
    if ((v ?? null) === (a.valor != null ? Number(a.valor) : null)) return;
    dados.atualizarAdicional(a.id, { valor: v });
  };
  return (
    <input className="input fin-adic-valor" inputMode="decimal" aria-label={`Valor de ${a.descricao}`} placeholder="R$ valor"
      value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  );
}
