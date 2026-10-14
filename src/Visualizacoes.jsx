import { useState } from 'react';
import { empresaPorId, faseNome } from './lib.js';
import { GRUPOS_PORTAL, gravar, ler, regraDe, tirar } from './portalRegras.js';

// Configurações → Visualizações: o que cada cliente vê no portal.
// "Todos os clientes" é o padrão; cada cliente pode ter ajustes próprios e obras escondidas.
// As regras valem no banco (21_visualizacoes_do_portal.sql): o que está desligado nem chega ao cliente.
export function Visualizacoes({ dados, avisar, verComo, clienteId = '*', irCliente }) {
  const [busca, setBusca] = useState('');
  if (dados.faltando?.has('portal_config')) {
    return <section className="card"><p className="note">Para controlar o que cada cliente vê, rode no Supabase o arquivo <b>21_visualizacoes_do_portal.sql</b>.</p></section>;
  }
  const configs = dados.portal_config || [];
  const clientes = [...(dados.clientes || [])].filter((c) => c.ativo !== false || c.id === clienteId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const cliente = clientes.find((c) => c.id === clienteId) || null;
  const escopo = cliente ? cliente.id : '*';
  const proprio = configs.find((c) => c.escopo === escopo)?.config || {};
  const padrao = regraDe(configs, null); // "todos os clientes"
  const efetiva = regraDe(configs, cliente?.id);
  const personalizado = (id) => Object.keys(configs.find((c) => c.escopo === id)?.config || {}).length > 0;

  const salvar = (config) => dados.salvarPortalConfig(escopo, config);
  const mudar = (k, v) => salvar(gravar(proprio, k, v));
  const usarPadrao = (k) => salvar(tirar(proprio, k));
  const voltarTudo = async () => {
    if (!window.confirm(cliente ? `Voltar ${cliente.nome} para o padrão de todos os clientes? As obras escondidas voltam a aparecer.` : 'Voltar o padrão de todos os clientes para o original do sistema?')) return;
    if (await dados.apagarPortalConfig(escopo)) avisar(cliente ? `${cliente.nome} voltou ao padrão.` : 'Padrão original restaurado.');
  };

  // obras e pedidos deste cliente (para esconder uma a uma)
  const igual = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  const ocultas = new Set(efetiva.ocultas || []);
  const b = busca.trim().toLowerCase();
  const demandas = cliente ? dados.demandas.filter((d) => igual(d.grupo, cliente.nome))
    .filter((d) => !b || (d.nome || '').toLowerCase().includes(b) || (d.produto || '').toLowerCase().includes(b))
    .sort((x, y) => (x.arquivada - y.arquivada) || (x.empresa === 'eko') - (y.empresa === 'eko') || (x.nome || '').localeCompare(y.nome || '', 'pt-BR')) : [];
  const alternarObra = (id) => {
    const n = new Set(ocultas);
    if (n.has(id)) n.delete(id); else n.add(id);
    salvar({ ...proprio, ocultas: [...n] });
  };
  const visivelPorRegra = (d) => (d.empresa === 'eko' ? efetiva.fabrica.mostrar : efetiva.obras[d.empresa] !== false) && (efetiva.obras.concluidas || !d.arquivada);

  // resumo em uma linha
  const tiposOn = Object.entries(efetiva.relatorios.tipos || {}).filter(([t, v]) => v && t !== 'entrega_obra').length;
  const resumo = [
    efetiva.obras.andamento ? 'andamento' : null, efetiva.obras.datas ? 'datas' : null,
    efetiva.equipe.mostrar ? (efetiva.equipe.funcao ? 'equipe com função' : 'equipe') : null,
    efetiva.relatorios.mostrar ? `relatórios (${tiposOn} de 5 tipos${efetiva.relatorios.videos ? '' : ', sem vídeo'})` : null,
    efetiva.fabrica.mostrar ? 'pedidos da fábrica' : null,
  ].filter(Boolean).join(' · ') || 'só o nome das obras';
  const usuarios = cliente ? dados.perfis.filter((p) => p.papel === 'cliente' && igual(p.cliente_grupo, cliente.nome)) : [];

  return (
    <div className="vis">
      <nav className="vis-escopos card" aria-label="Para quem vale">
        <span className="vis-rot">Para quem vale</span>
        <button type="button" className={'vis-escopo' + (!cliente ? ' on' : '')} onClick={() => irCliente('*')}>
          <b>Todos os clientes</b><small>padrão{personalizado('*') ? ' · ajustado' : ''}</small>
        </button>
        {clientes.map((c) => (
          <button key={c.id} type="button" className={'vis-escopo' + (cliente?.id === c.id ? ' on' : '')} onClick={() => irCliente(c.id)}>
            <b>{c.nome}</b><small>{personalizado(c.id) ? 'personalizado' : 'usa o padrão'}</small>
          </button>
        ))}
      </nav>

      <div className="vis-corpo">
        <section className="card stack vis-cab">
          <div className="vis-cab-l1">
            <div>
              <h2 className="card-title">{cliente ? `Portal ${cliente.nome}` : 'Padrão para todos os clientes'}</h2>
              <p className="note">{cliente
                ? <>Começa igual ao padrão; o que você mudar aqui vale só para {cliente.nome}. {usuarios.length ? `${usuarios.length} ${usuarios.length === 1 ? 'pessoa acessa' : 'pessoas acessam'} este portal.` : 'Ninguém tem acesso a este portal ainda.'}</>
                : 'Vale para todo cliente que não tiver ajuste próprio. As mudanças valem na hora.'}</p>
            </div>
            <div className="row">
              {cliente && verComo && <button type="button" className="pill" onClick={() => verComo('cliente:' + cliente.nome)}>Ver o portal como {cliente.nome}</button>}
              {Object.keys(proprio).length > 0 && <button type="button" className="pill ghost" onClick={voltarTudo}>{cliente ? 'Voltar ao padrão' : 'Restaurar original'}</button>}
            </div>
          </div>
          <p className="vis-resumo"><b>{cliente ? cliente.nome : 'Os clientes'} {cliente ? 'vê' : 'veem'}:</b> obras · {resumo}. Nunca: valores, custos, frota ou dados de outro cliente.</p>
        </section>

        <div className="vis-grupos">
          {GRUPOS_PORTAL.map((g) => (
            <section key={g.titulo} className="card stack vis-grupo" aria-label={g.titulo}>
              <h3>{g.titulo}</h3>
              {g.itens.map((it) => {
                const v = ler(efetiva, it.k) !== false;
                const pai = it.depende ? ler(efetiva, it.depende) !== false : true;
                const mexido = cliente && ler(proprio, it.k) !== undefined;
                const doPadrao = ler(padrao, it.k) !== false;
                return (
                  <div key={it.k} className={'vis-item' + (it.sub ? ' sub' : '') + (pai ? '' : ' desl')}>
                    <span className="vis-item-txt">
                      <b>{it.nome}</b>
                      {it.dica && <small>{it.dica}</small>}
                      {mexido && <small className="vis-mexido">só para {cliente.nome} (padrão: {doPadrao ? 'sim' : 'não'}) · <button type="button" className="link-btn" onClick={() => usarPadrao(it.k)}>usar o padrão</button></small>}
                    </span>
                    <button type="button" role="switch" aria-checked={v} aria-label={it.nome} disabled={!pai}
                      className={'chave' + (v ? ' on' : '')} onClick={() => mudar(it.k, !v)}><i /></button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        {cliente && (
          <section className="card stack vis-obras" aria-label="Obras e pedidos deste cliente">
            <div className="vis-cab-l1">
              <div>
                <h3>Obras e pedidos de {cliente.nome}</h3>
                <p className="note">Desligue para esconder uma obra ou pedido específico deste cliente. {ocultas.size ? `${ocultas.size} ${ocultas.size === 1 ? 'escondida' : 'escondidas'}.` : ''}</p>
              </div>
              {demandas.length > 6 && <input className="input" type="search" placeholder="Buscar obra" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar obra" />}
            </div>
            <ul className="vis-lista">
              {demandas.map((d) => {
                const regra = visivelPorRegra(d);
                const on = regra && !ocultas.has(d.id);
                return (
                  <li key={d.id} className={on ? '' : 'off'}>
                    <span className="dot" style={{ background: empresaPorId[d.empresa]?.cor }} />
                    <span className="vis-item-txt">
                      <b>{d.empresa === 'eko' ? [d.produto, d.nome].filter(Boolean).join(' · ') : d.nome}</b>
                      <small>{[empresaPorId[d.empresa]?.curto, d.arquivada ? 'concluída' : faseNome[d.fase]].filter(Boolean).join(' · ')}
                        {!regra && ` · escondida pela regra (${d.empresa === 'eko' ? 'pedidos da fábrica desligados' : d.arquivada && !efetiva.obras.concluidas ? 'concluídas desligadas' : 'empresa desligada'})`}</small>
                    </span>
                    <button type="button" role="switch" aria-checked={on} aria-label={`${d.nome} visível para ${cliente.nome}`} disabled={!regra}
                      className={'chave' + (on ? ' on' : '')} onClick={() => alternarObra(d.id)}><i /></button>
                  </li>
                );
              })}
              {!demandas.length && <li className="note">Nenhuma obra ou pedido com o cliente {cliente.nome}.</li>}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
