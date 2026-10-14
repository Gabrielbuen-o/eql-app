import { useState } from 'react';
import { MOTIVOS_VEICULO, addDias, diaSemana, diffDias, fmt, hoje, inicioSemana, motivoVeiculoNome } from './lib.js';

const VAZIO = { nome: '', placa: '', tipo: '', proxima_manutencao: '', observacoes: '' };

export function Frotas({ dados }) {
  const [form, setForm] = useState(null); // veículo sendo criado/editado
  const [salvando, setSalvando] = useState(false);
  const dia = hoje();
  const semana = Array.from({ length: 6 }, (_, i) => addDias(inicioSemana(dia), i));
  const demandaNome = Object.fromEntries(dados.demandas.map((d) => [d.id, d.nome]));
  const ativos = dados.veiculos.filter((v) => v.ativo);
  const inativos = dados.veiculos.filter((v) => !v.ativo);

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSalvando(true);
    const ok = await dados.salvarVeiculo({
      ...form,
      nome: form.nome.trim(),
      placa: form.placa?.trim().toUpperCase() || null,
      tipo: form.tipo?.trim() || null,
      proxima_manutencao: form.proxima_manutencao || null,
      observacoes: form.observacoes?.trim() || null,
    });
    setSalvando(false);
    if (ok !== false) setForm(null);
  };

  const manutencao = (v) => {
    if (!v.proxima_manutencao) return null;
    const dd = diffDias(v.proxima_manutencao, dia);
    if (dd < 0) return { cls: 'red', txt: `Manutenção vencida (${fmt(v.proxima_manutencao)})` };
    if (dd <= 15) return { cls: 'yellow', txt: `Manutenção em ${dd} ${dd === 1 ? 'dia' : 'dias'} · ${fmt(v.proxima_manutencao)}` };
    return { cls: '', txt: `Manutenção ${fmt(v.proxima_manutencao)}` };
  };
  const obrasNoDia = (vid, d) =>
    dados.veiculo_alocacoes.filter((a) => a.veiculo_id === vid && a.dia === d).map((a) => demandaNome[a.demanda_id]).filter(Boolean);
  const foraNoDia = (vid, d) => (dados.veiculo_fora || []).find((f) => f.veiculo_id === vid && f.dia === d);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <header className="head">
        <div>
          <h1>Frotas</h1>
          <p className="date">{ativos.length} {ativos.length === 1 ? 'veículo' : 'veículos'} · coloque cada um na obra pela agenda, na aba Demandas</p>
        </div>
        {!form && <button type="button" className="pill lime" onClick={() => setForm({ ...VAZIO })}>+ Novo veículo</button>}
      </header>

      {form && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>{form.id ? 'Editar veículo' : 'Novo veículo'}</h2>
          <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="grid2">
              <label className="field"><span>Nome / apelido</span>
                <input autoFocus value={form.nome} onChange={set('nome')} placeholder="Ex.: HR, Strada branca" required />
              </label>
              <label className="field"><span>Placa</span>
                <input value={form.placa || ''} onChange={set('placa')} placeholder="ABC1D23" />
              </label>
              <label className="field"><span>Tipo</span>
                <input list="tipos-veiculo" value={form.tipo || ''} onChange={set('tipo')} placeholder="Caminhão de entrega, utilitário…" />
                <datalist id="tipos-veiculo">
                  <option value="Caminhão de entrega" /><option value="Utilitário" /><option value="Carro" /><option value="Van" />
                </datalist>
              </label>
              <label className="field"><span>Próxima manutenção</span>
                <input type="date" value={form.proxima_manutencao || ''} onChange={set('proxima_manutencao')} />
              </label>
            </div>
            <label className="field"><span>Observações</span>
              <textarea value={form.observacoes || ''} onChange={set('observacoes')} placeholder="Ex.: troca de óleo a cada 10 mil km, documento vence em março" />
            </label>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="pill ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="pill lime" disabled={salvando || !form.nome.trim()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Veículos</h2>
        {!ativos.length && <p className="empty" style={{ padding: 0 }}>Nenhum veículo cadastrado ainda. Clique em “+ Novo veículo”.</p>}
        <div className="vehicles">
          {ativos.map((v) => {
            const m = manutencao(v);
            const hojeEm = obrasNoDia(v.id, dia);
            return (
              <div key={v.id} className="vehicle">
                <div className="top">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="nm">{v.nome}</span>
                    <span className="sub">{v.tipo || 'Tipo não informado'}</span>
                  </div>
                  {v.placa && <span className="plate">{v.placa}</span>}
                </div>
                {foraNoDia(v.id, dia)
                  ? <span className="badge yellow">Hoje: {motivoVeiculoNome(foraNoDia(v.id, dia)).toLowerCase()}</span>
                  : <span className={'badge ' + (hojeEm.length ? 'green' : '')}>{hojeEm.length ? 'Hoje: ' + hojeEm.join(', ') : 'Sem obra hoje'}</span>}
                {m && <span className={'badge ' + m.cls}>{m.txt}</span>}
                <div className="sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                  {semana.map((d) => {
                    const o = obrasNoDia(v.id, d);
                    const f = foraNoDia(v.id, d);
                    return <span key={d}><b style={{ textTransform: 'capitalize' }}>{diaSemana(d)}</b> {f ? <i>{motivoVeiculoNome(f)}</i> : o.length ? o.join(', ') : '—'}</span>;
                  })}
                </div>
                {v.observacoes && <p className="sub" style={{ whiteSpace: 'pre-line' }}>{v.observacoes}</p>}
                <div className="row">
                  <button type="button" className="mini" onClick={() => setForm({ ...VAZIO, ...v })}>Editar</button>
                  <button type="button" className="mini" onClick={() => dados.salvarVeiculo({ id: v.id, ativo: false })}>Remover</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {ativos.length > 0 && <ForaDeObra dados={dados} ativos={ativos} />}

      {inativos.length > 0 && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>Removidos</h2>
          <div className="row">
            {inativos.map((v) => (
              <button key={v.id} type="button" className="pill ghost" onClick={() => dados.salvarVeiculo({ id: v.id, ativo: true })}>
                Reativar {v.nome}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// Veículo fora de obra por período (manutenção ou outro motivo) — aparece na agenda, na faixa “Fora da obra”
function ForaDeObra({ dados, ativos }) {
  const dia = hoje();
  const [veic, setVeic] = useState('');
  const [motivo, setMotivo] = useState('manutencao');
  const [obs, setObs] = useState('');
  const [de, setDe] = useState(dia);
  const [ate, setAte] = useState(dia);
  const [salvando, setSalvando] = useState(false);
  if (dados.faltando?.has('veiculo_fora')) {
    return (
      <section className="card"><p className="note">Para tirar veículos de obra (manutenção e outros motivos), rode no Supabase o arquivo <b>20_recebimentos_falta_frota_ancoragem.sql</b>.</p></section>
    );
  }
  const nome = Object.fromEntries(dados.veiculos.map((v) => [v.id, v.nome]));
  const marcar = async (e) => {
    e.preventDefault();
    if (!veic || !de || !ate || ate < de || (motivo === 'outro' && !obs.trim())) return;
    const dias = [];
    for (let c = de; c <= ate && dias.length < 120; c = addDias(c, 1)) dias.push(c);
    setSalvando(true);
    const ok = await dados.marcarVeiculoForaPeriodo(veic, dias, motivo, motivo === 'outro' ? obs.trim() : null);
    setSalvando(false);
    if (ok !== false) setObs('');
  };
  // dias seguidos do mesmo veículo e motivo viram um período
  const periodos = [];
  [...(dados.veiculo_fora || [])]
    .filter((f) => f.dia >= dia)
    .sort((a, b) => (a.veiculo_id + a.dia).localeCompare(b.veiculo_id + b.dia))
    .forEach((f) => {
      const p = periodos[periodos.length - 1];
      if (p && p.veic === f.veiculo_id && p.motivo === f.motivo && (p.obs || '') === (f.observacao || '') && addDias(p.ate, 1) === f.dia) { p.ate = f.dia; p.ids.push(f.id); }
      else periodos.push({ veic: f.veiculo_id, motivo: f.motivo, obs: f.observacao, de: f.dia, ate: f.dia, ids: [f.id] });
    });
  periodos.sort((a, b) => a.de.localeCompare(b.de));
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800 }}>Fora de obra</h2>
      <p className="note" style={{ marginTop: -8 }}>Manutenção ou outro motivo. Também dá para arrastar o veículo na agenda, na faixa “Fora da obra”.</p>
      <form className="add-form" onSubmit={marcar}>
        <label className="field"><span>Veículo</span>
          <select value={veic} onChange={(e) => setVeic(e.target.value)} required>
            <option value="">Escolha…</option>
            {ativos.map((v) => <option key={v.id} value={v.id}>{v.nome}{v.placa ? ' · ' + v.placa : ''}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '0 1 170px' }}><span>Motivo</span>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS_VEICULO.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
        {motivo === 'outro' && (
          <label className="field" style={{ flex: '1 1 200px' }}><span>Qual?</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: emprestado para a fábrica" required />
          </label>
        )}
        <label className="field" style={{ flex: '0 1 160px' }}><span>De</span>
          <input type="date" value={de} onChange={(e) => { setDe(e.target.value); if (e.target.value > ate) setAte(e.target.value); }} required />
        </label>
        <label className="field" style={{ flex: '0 1 160px' }}><span>Até</span>
          <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} required />
        </label>
        <button type="submit" className="pill lime" style={{ minHeight: 44 }} disabled={!veic || salvando || (motivo === 'outro' && !obs.trim())}>{salvando ? 'Salvando…' : 'Marcar'}</button>
      </form>
      {periodos.length ? (
        <div className="people">
          {periodos.map((p) => (
            <div key={p.ids[0]} className="person">
              <div className={'avatar ' + (p.motivo === 'outro' ? 'aus-ferias' : 'aus-folga')} aria-hidden="true">{(nome[p.veic] || '?').slice(0, 2).toUpperCase()}</div>
              <div className="info">
                <span className="nm">{nome[p.veic] || '?'}</span>
                <span className="sub">{p.motivo === 'outro' ? p.obs || 'Outro motivo' : 'Manutenção'} · {p.de === p.ate ? fmt(p.de) : fmt(p.de) + ' a ' + fmt(p.ate)}</span>
              </div>
              <button type="button" className="mini" onClick={() => p.ids.forEach((id) => dados.removerVeiculoFora(id))}>Cancelar</button>
            </div>
          ))}
        </div>
      ) : <p className="empty" style={{ padding: 0 }}>Nenhum veículo fora de obra daqui pra frente.</p>}
    </section>
  );
}
