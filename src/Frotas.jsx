import { useState } from 'react';
import { addDias, diaSemana, diffDias, fmt, hoje, inicioSemana } from './lib.js';

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
                <span className={'badge ' + (hojeEm.length ? 'green' : '')}>{hojeEm.length ? 'Hoje: ' + hojeEm.join(', ') : 'Sem obra hoje'}</span>
                {m && <span className={'badge ' + m.cls}>{m.txt}</span>}
                <div className="sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                  {semana.map((d) => {
                    const o = obrasNoDia(v.id, d);
                    return <span key={d}><b style={{ textTransform: 'capitalize' }}>{diaSemana(d)}</b> {o.length ? o.join(', ') : '—'}</span>;
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
