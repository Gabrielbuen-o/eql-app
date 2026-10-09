import { createPortal } from 'react-dom';
import { Avatar } from './Avatar.jsx';
import { useVoltarFecha } from './rota.js';

// Celular (até 899 px): barra de cima com menu, logo no meio e foto (Configurações);
// barra flutuante embaixo com as telas principais, estilo Instagram. O computador continua com o menu lateral.
const PRINCIPAIS = ['inicio', 'demandas', 'calendario', 'orcamentos'];

export function Icone({ nome, cheio = false }) {
  const p = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: cheio ? 2.4 : 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (nome) {
    case 'inicio': // casinha
      return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" fill={cheio ? 'currentColor' : 'none'} fillOpacity={cheio ? 0.15 : 0} /></svg>;
    case 'demandas': // prancheta com lista
      return <svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" fill={cheio ? 'currentColor' : 'none'} fillOpacity={cheio ? 0.15 : 0} /><path d="M9 4V3h6v1" /><path d="M9 10h6M9 14h6M9 18h3" /></svg>;
    case 'calendario': // capacete de obra
      return <svg {...p}><path d="M4 17a8 8 0 0 1 16 0" fill={cheio ? 'currentColor' : 'none'} fillOpacity={cheio ? 0.15 : 0} /><path d="M10 9V6h4v3" /><path d="M2.5 17h19v2.5h-19z" /><path d="M8 10.5 9.5 17M16 10.5 14.5 17" /></svg>;
    case 'orcamentos': // cifrão
      return <svg {...p}><circle cx="12" cy="12" r="9.5" fill={cheio ? 'currentColor' : 'none'} fillOpacity={cheio ? 0.15 : 0} /><path d="M15 9.2c-.5-1-1.6-1.6-3-1.6-1.8 0-3 .9-3 2.2 0 3.2 6 1.6 6 4.6 0 1.4-1.3 2.3-3.1 2.3-1.5 0-2.6-.6-3.1-1.7" /><path d="M12 6v1.6M12 16.7v1.5" /></svg>;
    case 'equipes': // pessoas
      return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.2c2.6.3 4.5 2.6 4.5 5.3" /></svg>;
    case 'frotas': // caminhonete
      return <svg {...p}><path d="M2.5 16V8.5a1 1 0 0 1 1-1H13v8.5" /><path d="M13 10h4.2l3.3 3.6V16" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M9 17h6" /></svg>;
    case 'epi': // escudo
      return <svg {...p}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'financeiro': // gráfico
      return <svg {...p}><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>;
    case 'rh': // crachá
      return <svg {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M9 3h6v4H9z" /><circle cx="12" cy="12" r="2.3" /><path d="M8.5 17.5c.6-1.6 2-2.5 3.5-2.5s2.9.9 3.5 2.5" /></svg>;
    case 'aquisicao': // funil
      return <svg {...p}><path d="M3.5 5h17l-6.5 7.5V19l-4 1.5v-8z" /></svg>;
    case 'menu':
      return <svg {...p}><path d="M4 7h16M4 12h16M4 17h10" /></svg>;
    case 'fechar':
      return <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    default:
      return null;
  }
}

export function TopoCelular({ abas, atual, sub, pode, eu, usuario, irAba, abrirMenu }) {
  const subs = atual.sub?.filter((x) => x.mostrar(pode)) || [];
  return (
    <header className="m-topo">
      <div className="m-topo-linha">
        <button type="button" className="m-btn" aria-label="Abrir menu" onClick={abrirMenu}><Icone nome="menu" /></button>
        <button type="button" className="m-marca" onClick={() => irAba(abas.some((a) => a.id === 'inicio') ? 'inicio' : abas[0].id)} aria-label="EQL Group, ir para o início">
          <img src="/img/logo-96.png?v=2" alt="" width="30" height="30" /><span>EQL Group</span>
        </button>
        <button type="button" className="m-btn m-eu" aria-label="Configurações" onClick={() => irAba('config')}>
          <Avatar perfil={eu} nome={usuario.email} online />
        </button>
      </div>
      {subs.length > 0 && (
        <div className="m-subs" aria-label={`Seções de ${atual.nome}`}>
          {subs.map((x) => (
            <button key={x.id} type="button" className={sub === x.id ? 'on' : ''} aria-current={sub === x.id ? 'page' : undefined}
              onClick={() => irAba(atual.id + '/' + x.id)}>{x.nome}</button>
          ))}
        </div>
      )}
    </header>
  );
}

export function AbasCelular({ abas, atual, irAba }) {
  const itens = PRINCIPAIS.map((id) => abas.find((a) => a.id === id)).filter(Boolean);
  if (itens.length < 2) return null;
  return createPortal(
    <nav className="m-abas" aria-label="Telas principais">
      {itens.map((a) => {
        const on = atual.id === a.id;
        return (
          <button key={a.id} type="button" className={on ? 'on' : ''} aria-label={a.nome} aria-current={on ? 'page' : undefined} onClick={() => irAba(a.id)}>
            <Icone nome={a.id} cheio={on} />
            <span className="m-abas-ponto" aria-hidden="true" />
          </button>
        );
      })}
    </nav>,
    document.body,
  );
}

// Menu completo (todas as telas), abre pela esquerda
export function GavetaMenu({ aberto, fechar, abas, atual, sub, pode, eu, usuario, papelTexto, irAba }) {
  useVoltarFecha(aberto, fechar);
  if (!aberto) return null;
  // fecha a gaveta (o "voltar" dela some do histórico) e só então troca de tela, para o voltar do celular continuar certo
  const ir = (id) => { window.addEventListener('popstate', () => setTimeout(() => irAba(id), 0), { once: true }); fechar(); };
  return createPortal(
    <div className="m-gaveta-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <aside className="m-gaveta" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="m-gaveta-topo">
          <span className="m-marca estatica"><img src="/img/logo-96.png?v=2" alt="" width="30" height="30" /><span>EQL Group</span></span>
          <button type="button" className="m-btn" aria-label="Fechar menu" onClick={fechar}><Icone nome="fechar" /></button>
        </div>
        <nav className="m-gaveta-lista">
          {abas.filter((a) => a.id !== 'config').map((a) => {
            const subs = a.sub?.filter((x) => x.mostrar(pode)) || [];
            return (
              <div key={a.id} className="m-gaveta-grupo">
                <button type="button" className={'m-gaveta-item' + (atual.id === a.id ? ' on' : '')} onClick={() => ir(a.id)}>
                  <Icone nome={a.id} cheio={atual.id === a.id} />
                  <span>{a.nome}</span>
                  {a.breve && <small className="soon">em breve</small>}
                </button>
                {subs.length > 1 && subs.map((x) => (
                  <button key={x.id} type="button" className={'m-gaveta-sub' + (atual.id === a.id && sub === x.id ? ' on' : '')} onClick={() => ir(a.id + '/' + x.id)}>{x.nome}</button>
                ))}
              </div>
            );
          })}
        </nav>
        <button type="button" className="m-gaveta-eu" onClick={() => ir('config')}>
          <Avatar perfil={eu} nome={usuario.email} online />
          <span><b>{eu?.nome || usuario.email}</b><small>{papelTexto} · Configurações</small></span>
        </button>
      </aside>
    </div>,
    document.body,
  );
}
