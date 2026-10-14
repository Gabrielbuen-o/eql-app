import { listaClientes } from './ClienteCampo.jsx';
import { useRef, useState } from 'react';
import { Atividades } from './Atividades.jsx';
import { Visualizacoes } from './Visualizacoes.jsx';
import { FRASES_PADRAO, PAPEIS, PREFS_PADRAO, addDias, diaSemana, fmt, hoje, mensagemDoDia, papelNome, reduzirImagem, supabase, tempoRelativo } from './lib.js';
import { Avatar } from './Avatar.jsx';

const ABAS_CFG = [
  { id: 'usuarios', nome: 'Usuários', desc: 'Quem entra no app, tipo de acesso e último acesso' },
  { id: 'visualizacoes', nome: 'Visualizações', desc: 'O que cada cliente vê no portal' },
  { id: 'clientes', nome: 'Clientes', desc: 'Empresas atendidas, obras e acessos ao portal' },
  { id: 'frases', nome: 'Frases', desc: 'Frase do dia do app' },
  { id: 'registros', nome: 'Registros', desc: 'Quem fez o quê e quando' },
];

export function Configuracoes({ dados, eu, usuario, pode, salvarPrefs, avisar, verComo = null, resto = [], irSub }) {
  const prefs = { ...PREFS_PADRAO, ...lerPrefs(), ...(eu?.preferencias || {}) };
  const semPerfis = dados.faltando.has('perfis');
  const set = (k, v) => salvarPrefs({ ...prefs, [k]: v });
  const [filtroLog, setFiltroLog] = useState(null);
  const aba = ABAS_CFG.some((a) => a.id === resto[0]) ? resto[0] : 'usuarios';
  const irAba = (id, extra) => {
    irSub?.(id + (extra ? '/' + extra : ''));
    // leva a tela até as abas (no celular elas ficam abaixo da conta e da aparência)
    setTimeout(() => document.querySelector('.cfg-abas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const verAtividades = (id) => { setFiltroLog(id); irAba('registros'); };
  const contagem = {
    usuarios: dados.perfis.length,
    clientes: (dados.clientes || []).filter((c) => c.ativo !== false).length,
    frases: (dados.frases || []).filter((f) => f.ativo !== false).length,
    visualizacoes: (dados.portal_config || []).filter((c) => c.escopo !== '*').length || null,
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>Configurações</h1>
          <p className="date">Sua conta, aparência do app{pode.admin ? ', usuários, clientes e o que cada cliente vê' : ''}</p>
        </div>
      </header>

      {semPerfis && (
        <section className="card note" role="alert">
          Para liberar fotos, acessos e “quem está online”, rode no Supabase o arquivo <b>04_acessos_e_perfis.sql</b>.
        </section>
      )}

      <div className="settings-grid">
        <section className="card stack" aria-label="Minha conta">
          <h2 className="card-title">Minha conta</h2>
          {eu ? <MinhaConta eu={eu} dados={dados} /> : <p className="note">{usuario.email}</p>}
          <button type="button" className="pill ghost" style={{ alignSelf: 'flex-start' }} onClick={() => supabase.auth.signOut()}>Sair da conta</button>
        </section>

        <section className="card stack" aria-label="Aparência e uso">
          <h2 className="card-title">Aparência e uso</h2>
          <Opcao rotulo="Tema" valor={prefs.tema} onMudar={(v) => set('tema', v)}
            opcoes={[['claro', 'Claro'], ['escuro', 'Escuro']]} />
          <Opcao rotulo="Tamanho do texto" valor={prefs.texto} onMudar={(v) => set('texto', v)}
            opcoes={[['p', 'Pequeno'], ['m', 'Normal'], ['g', 'Grande'], ['gg', 'Maior']]} />
          <Opcao rotulo="Espaçamento" valor={prefs.densidade} onMudar={(v) => set('densidade', v)}
            opcoes={[['confortavel', 'Confortável'], ['compacta', 'Compacto']]} />
          <label className="field"><span>Idioma</span>
            <select value={prefs.idioma} onChange={(e) => set('idioma', e.target.value)}>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en" disabled>English (em breve)</option>
              <option value="es" disabled>Español (em breve)</option>
            </select>
          </label>
          <p className="preview-text">As preferências ficam salvas na sua conta e valem em qualquer aparelho.</p>
        </section>
      </div>

      {pode.admin && (
        <>
          <nav className="cfg-abas" aria-label="Seções de configuração">
            {ABAS_CFG.map((a) => (
              <button key={a.id} type="button" className={aba === a.id ? 'on' : ''} aria-current={aba === a.id ? 'page' : undefined} onClick={() => irAba(a.id)}>
                {a.nome}{contagem[a.id] ? <span className="cfg-n">{contagem[a.id]}</span> : null}
              </button>
            ))}
          </nav>
          <p className="note cfg-desc">{ABAS_CFG.find((a) => a.id === aba).desc}</p>
          {aba === 'usuarios' && (semPerfis ? <p className="note">Rode o arquivo 04_acessos_e_perfis.sql.</p>
            : <Usuarios dados={dados} eu={eu} pode={pode} avisar={avisar} verAtividades={verAtividades} verComo={verComo} />)}
          {aba === 'visualizacoes' && <Visualizacoes dados={dados} avisar={avisar} verComo={verComo} clienteId={resto[1] || '*'} irCliente={(id) => irAba('visualizacoes', id === '*' ? null : id)} />}
          {aba === 'clientes' && <Clientes dados={dados} avisar={avisar} verComo={verComo} irVis={(id) => irAba('visualizacoes', id)} />}
          {aba === 'frases' && <Frases dados={dados} />}
          {aba === 'registros' && !semPerfis && <Atividades dados={dados} filtroUsuario={filtroLog} setFiltroUsuario={setFiltroLog} />}
        </>
      )}
    </>
  );
}

function Opcao({ rotulo, valor, opcoes, onMudar }) {
  return (
    <div className="opt" role="group" aria-label={rotulo}>
      <span>{rotulo}</span>
      <div className={'seg' + (opcoes.length === 3 ? ' three' : opcoes.length === 2 ? ' two' : '')}>
        {opcoes.map(([id, nome]) => (
          <button key={id} type="button" className={valor === id ? 'on' : ''} aria-pressed={valor === id} onClick={() => onMudar(id)}>{nome}</button>
        ))}
      </div>
    </div>
  );
}

function MinhaConta({ eu, dados }) {
  const [nome, setNome] = useState(eu.nome || '');
  const mudou = nome.trim() && nome.trim() !== eu.nome;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <BotaoFoto perfil={eu} dados={dados} grande online />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>{eu.nome}</span>
          <span className="note">{eu.email}</span>
          {eu.papel === 'admin' && <span className="badge blue">{papelNome[eu.papel]}</span>}
        </div>
      </div>
      <form className="add-form" onSubmit={(e) => { e.preventDefault(); if (mudou) dados.atualizarPerfil(eu.id, { nome: nome.trim() }); }}>
        <label className="field"><span>Nome que aparece no app</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Gabriel Bueno Severino" />
        </label>
        <button type="submit" className="pill lime" style={{ minHeight: 44 }} disabled={!mudou}>Salvar</button>
      </form>
    </>
  );
}

function BotaoFoto({ perfil, dados, grande, online, podeTrocar = true }) {
  const input = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const escolher = async (e) => {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq) return;
    setEnviando(true);
    try { await dados.enviarFoto(perfil.id, await reduzirImagem(arq)); } finally { setEnviando(false); }
  };
  if (!podeTrocar) return <Avatar perfil={perfil} online={online} grande={grande} />;
  return (
    <>
      <button type="button" className="photo-btn" aria-label={`Trocar foto de ${perfil.nome || perfil.email}`} onClick={() => input.current?.click()} disabled={enviando}>
        <Avatar perfil={perfil} online={online} grande={grande} />
        <span className="foto-tag">{enviando ? '…' : 'Foto'}</span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={escolher} />
    </>
  );
}

function Usuarios({ dados, eu, pode, avisar, verAtividades, verComo }) {
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const todos = dados.perfis;
  const conta = (papel) => todos.filter((p) => p.papel === papel).length;
  const semEmpresa = todos.filter((p) => p.papel === 'cliente' && !(p.cliente_grupo || '').trim());
  const nunca = todos.filter((p) => !p.ultimo_acesso);
  const semana = todos.filter((p) => p.ultimo_acesso && Date.now() - Date.parse(p.ultimo_acesso) < 7 * 864e5).length;
  const qtdOnline = todos.filter((p) => dados.online.has(p.id)).length;
  const b = busca.trim().toLowerCase();
  const lista = todos
    .filter((p) => filtro === 'todos' || (filtro === 'online' ? dados.online.has(p.id) : filtro === 'atencao' ? semEmpresa.includes(p) || nunca.includes(p) : p.papel === filtro))
    .filter((p) => !b || [p.nome, p.email, p.cliente_grupo].some((x) => (x || '').toLowerCase().includes(b)))
    .sort((a, c) => (dados.online.has(c.id) - dados.online.has(a.id)) || (a.nome || '').localeCompare(c.nome || '', 'pt-BR'));
  const chips = [
    ['todos', `Todos ${todos.length}`], ['online', `Online ${qtdOnline}`],
    ...PAPEIS.map((r) => [r.id, `${r.nome} ${conta(r.id)}`]),
    ...(semEmpresa.length || nunca.length ? [['atencao', `Atenção ${new Set([...semEmpresa, ...nunca]).size}`]] : []),
  ];
  return (
    <section className="card stack" aria-label="Usuários">
      <div className="cfg-kpis">
        <div><b>{todos.length}</b><span>usuários</span></div>
        <div><b className="ok">{qtdOnline}</b><span>online agora</span></div>
        <div><b>{semana}</b><span>entraram nos últimos 7 dias</span></div>
        <div><b>{conta('cliente')}</b><span>acessos de clientes</span></div>
      </div>
      {semEmpresa.length > 0 && (
        <p className="cfg-alerta">{semEmpresa.length === 1 ? 'Um usuário cliente está' : `${semEmpresa.length} usuários clientes estão`} sem empresa ligada e não {semEmpresa.length === 1 ? 'vê' : 'veem'} nada no portal: {semEmpresa.map((p) => p.nome || p.email).join(', ')}.</p>
      )}
      <div className="cfg-filtros">
        <input className="input" type="search" placeholder="Buscar por nome, e-mail ou empresa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuário" />
        <div className="chips-filtro" role="group" aria-label="Filtrar usuários">
          {chips.map(([id, nome]) => (
            <button key={id} type="button" className={'pill' + (filtro === id ? ' on' : '')} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{nome}</button>
          ))}
        </div>
      </div>
      {verComo && (
        <div className="ver-como-barra">
          <span>Ver o app como:</span>
          <button type="button" className="pill" onClick={() => verComo('campo:compartilhado')}>Campo (celular compartilhado)</button>
          {(dados.clientes || []).filter((c) => c.ativo !== false).map((c) => (
            <button key={c.id} type="button" className="pill" onClick={() => verComo('cliente:' + c.nome)}>Portal {c.nome}</button>
          ))}
        </div>
      )}
      <div className="users">
        {lista.map((p) => (
          <LinhaUsuario key={p.id} p={p} dados={dados} online={dados.online.has(p.id)} admin={pode.admin} eu={eu} avisar={avisar} verAtividades={verAtividades} verComo={verComo} />
        ))}
        {!lista.length && <p className="empty">Ninguém neste filtro.</p>}
      </div>
      <div className="note cfg-ajuda">
        <b>Para adicionar alguém:</b> no Supabase, vá em Authentication → Users → <b>Invite user</b> e coloque o e-mail da pessoa. Ela recebe o convite,
        cria a senha e aparece aqui como <b>Campo</b>; depois é só trocar o tipo de acesso nesta lista.
        {PAPEIS.map((r) => <span key={r.id} style={{ display: 'block', marginTop: 4 }}><b>{r.nome}:</b> {r.desc}</span>)}
      </div>
    </section>
  );
}

function LinhaUsuario({ p, dados, online, admin, eu, avisar, verAtividades, verComo }) {
  const [nome, setNome] = useState(p.nome || '');
  const [grupo, setGrupo] = useState(p.cliente_grupo || '');
  const souEu = p.id === eu?.id;
  const salvarNome = () => { if (nome.trim() && nome.trim() !== p.nome) dados.atualizarPerfil(p.id, { nome: nome.trim() }); };
  const mudarPapel = async (papel) => {
    if (souEu && papel !== 'admin' && !window.confirm('Você vai perder o acesso de administrador. Continuar?')) return;
    const ok = await dados.atualizarPerfil(p.id, { papel, cliente_grupo: papel === 'cliente' ? grupo || null : null });
    if (ok) avisar(`${p.nome || p.email} agora é ${papelNome[papel]}.`);
  };
  const grupos = listaClientes(dados);

  return (
    <div className="user-row">
      <BotaoFoto perfil={p} dados={dados} online={online} podeTrocar={admin || souEu} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {admin ? (
          <input className="input" aria-label={`Nome de ${p.email}`} value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarNome}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        ) : (
          <span className="nm">{p.nome}{souEu ? ' (você)' : ''}</span>
        )}
        <span className="sub">{p.email}{admin && souEu ? ' · você' : ''}</span>
        {(!p.ultimo_acesso || (p.papel === 'cliente' && !(p.cliente_grupo || '').trim())) && (
          <span className="user-tags">
            {!p.ultimo_acesso && <span className="badge yellow">nunca entrou</span>}
            {p.papel === 'cliente' && !(p.cliente_grupo || '').trim() && <span className="badge red">sem empresa</span>}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {admin ? (
          <select className="input" aria-label={`Tipo de acesso de ${p.nome || p.email}`} value={p.papel} onChange={(e) => mudarPapel(e.target.value)}>
            {PAPEIS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        ) : (
          <span className="badge blue">{papelNome[p.papel]}</span>
        )}
        {admin && p.papel === 'cliente' && (
          <>
            {/* o cliente só vê as obras deste cliente no portal */}
            <select className="input" aria-label="Cliente que ele vê" value={grupo}
              onChange={(e) => { setGrupo(e.target.value); dados.atualizarPerfil(p.id, { cliente_grupo: e.target.value || null }); }}>
              <option value="">Cliente: escolha…</option>
              {[...grupos, ...(grupo && !grupos.includes(grupo) ? [grupo] : [])].map((g) => <option key={g} value={g}>Cliente: {g}</option>)}
            </select>
          </>
        )}
        {admin && p.papel === 'campo' && (
          // login individual de campo: liga ao funcionário (login compartilhado: deixe "pergunta no celular")
          <select className="input" aria-label={`Funcionário de ${p.nome || p.email}`} value={p.funcionario_id || ''}
            onChange={(e) => dados.atualizarPerfil(p.id, { funcionario_id: e.target.value || null })}>
            <option value="">Funcionário: perguntar</option>
            {dados.funcionarios.filter((f) => f.ativo !== false).map((f) => <option key={f.id} value={f.id}>Funcionário: {f.nome}</option>)}
          </select>
        )}
      </div>
      <div className="times">
        <span style={{ color: online ? 'var(--green-dot)' : undefined, fontWeight: online ? 700 : 500 }}>
          {online ? 'Online agora' : 'Último acesso ' + tempoRelativo(p.ultimo_acesso)}
        </span>
        <span>Última modificação {tempoRelativo(p.ultima_modificacao)}</span>
        {admin && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--brand-text)' }} onClick={() => verAtividades(p.id)}>Ver atividades</button>}
        {verComo && !souEu && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--brand-text)' }} onClick={() => verComo(p.id)}>Ver como {(p.nome || p.email || '').split(' ')[0]}</button>}
      </div>
    </div>
  );
}

function lerPrefs() {
  try { return JSON.parse(localStorage.getItem('eql-prefs') || '{}') || {}; } catch { return {}; }
}

// ---------- Clientes (Help, Ageplan…) ----------
function Clientes({ dados, avisar, verComo, irVis }) {
  const [novo, setNovo] = useState('');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null); // { id, nome }
  const falta = dados.faltando.has('clientes');
  const igual = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  const b = busca.trim().toLowerCase();
  const lista = [...(dados.clientes || [])]
    .filter((c) => !b || c.nome.toLowerCase().includes(b))
    .sort((a, c) => (a.ativo === false) - (c.ativo === false) || a.nome.localeCompare(c.nome, 'pt-BR'));
  const info = (c) => {
    const ds = dados.demandas.filter((d) => igual(d.grupo, c.nome));
    const obras = ds.filter((d) => d.empresa !== 'eko');
    const ids = new Set(ds.map((d) => d.id));
    const rels = (dados.relatorios || []).filter((r) => ids.has(r.demanda_id) && r.status !== 'rascunho');
    const ultimo = rels.reduce((m, r) => (r.dia > m ? r.dia : m), '');
    const pcfg = (dados.portal_config || []).find((x) => x.escopo === c.id);
    return {
      ativas: obras.filter((d) => !d.arquivada).length, concluidas: obras.filter((d) => d.arquivada).length,
      pedidos: ds.filter((d) => d.empresa === 'eko' && !d.arquivada).length,
      usuarios: dados.perfis.filter((p) => p.papel === 'cliente' && igual(p.cliente_grupo, c.nome)),
      ultimo, personalizado: !!pcfg && Object.keys(pcfg.config || {}).length > 0, escondidas: (pcfg?.config?.ocultas || []).length,
    };
  };
  const adicionar = async () => { const n = await dados.criarCliente(novo); if (n) { setNovo(''); avisar(`Cliente “${n}” cadastrado.`); } };
  const renomear = async () => {
    const n = editando.nome.trim(); const c = lista.find((x) => x.id === editando.id);
    if (!n || n === c.nome) { setEditando(null); return; }
    if ((dados.clientes || []).some((x) => x.id !== c.id && x.nome.trim().toLowerCase() === n.toLowerCase())) { avisar(`Já existe um cliente “${n}”.`); return; }
    if (!window.confirm(`Renomear “${c.nome}” para “${n}”? Muda também nas obras, nos orçamentos em aberto e no acesso dos usuários desse cliente.`)) return;
    if (await dados.atualizarCliente(c.id, { nome: n })) { setEditando(null); avisar('Cliente renomeado em todo o sistema.'); }
  };
  if (falta) return <section className="card"><p className="note">Para ter a lista de clientes, rode no Supabase o arquivo <b>16_clientes.sql</b>.</p></section>;
  return (
    <section className="card stack" aria-label="Clientes">
      <p className="note">Aparecem para escolher ao criar obras, pedidos da fábrica e orçamentos. Um nome novo usado em 2 obras entra aqui sozinho.</p>
      <div className="cfg-filtros">
        <input className="input" type="search" placeholder="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
        <div className="row" style={{ flexWrap: 'nowrap', flex: 1 }}>
          <input className="input" style={{ flex: 1 }} placeholder="Novo cliente (ex.: Radial)" maxLength={80} value={novo}
            onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && novo.trim() && adicionar()} aria-label="Novo cliente" />
          <button type="button" className="pill lime" disabled={!novo.trim()} onClick={adicionar}>Adicionar</button>
        </div>
      </div>
      <div className="cli-cards">
        {lista.map((c) => {
          const x = info(c);
          return (
            <article key={c.id} className={'cli-card' + (c.ativo === false ? ' off' : '')}>
              <div className="cli-card-top">
                {editando?.id === c.id ? (
                  <input className="input" autoFocus value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') renomear(); if (e.key === 'Escape') setEditando(null); }} aria-label={`Novo nome de ${c.nome}`} />
                ) : <b className="cli-card-nome">{c.nome}</b>}
                <span className="cli-tags">
                  {c.origem === 'automatico' && <span className="badge">criado sozinho</span>}
                  {c.ativo === false && <span className="badge">escondido</span>}
                  {x.personalizado && <span className="badge blue">portal personalizado</span>}
                </span>
              </div>
              <div className="cli-nums">
                <span><b>{x.ativas}</b> {x.ativas === 1 ? 'obra ativa' : 'obras ativas'}</span>
                <span><b>{x.concluidas}</b> {x.concluidas === 1 ? 'concluída' : 'concluídas'}</span>
                {x.pedidos > 0 && <span><b>{x.pedidos}</b> {x.pedidos === 1 ? 'pedido' : 'pedidos'} na fábrica</span>}
                <span>{x.ultimo ? <>último relatório <b>{new Date(x.ultimo + 'T12:00').toLocaleDateString('pt-BR')}</b></> : 'sem relatórios recentes'}</span>
              </div>
              <div className="cli-portal">
                <span className="note">Portal:</span>
                {x.usuarios.length ? x.usuarios.map((p) => <span key={p.id} className="chip small">{p.nome || p.email}</span>)
                  : <span className="note">nenhum usuário com acesso</span>}
                {x.escondidas > 0 && <span className="note">· {x.escondidas} {x.escondidas === 1 ? 'obra escondida' : 'obras escondidas'}</span>}
              </div>
              <div className="cli-acoes">
                {editando?.id === c.id
                  ? <><button type="button" className="link-btn" onClick={renomear}>Salvar</button><button type="button" className="link-btn" onClick={() => setEditando(null)}>Cancelar</button></>
                  : <>
                    <button type="button" className="pill" onClick={() => irVis(c.id)}>O que vê no portal</button>
                    {verComo && <button type="button" className="pill ghost" onClick={() => verComo('cliente:' + c.nome)}>Ver portal</button>}
                    <button type="button" className="link-btn" onClick={() => setEditando({ id: c.id, nome: c.nome })}>Renomear</button>
                    <button type="button" className="link-btn" onClick={() => dados.atualizarCliente(c.id, { ativo: c.ativo === false })}>{c.ativo === false ? 'Mostrar na lista' : 'Esconder da lista'}</button>
                  </>}
              </div>
            </article>
          );
        })}
        {!lista.length && <p className="empty">Nenhum cliente {b ? 'com esse nome' : 'cadastrado'}.</p>}
      </div>
    </section>
  );
}

// ---------- Frases do dia ----------
function Frases({ dados }) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(null); // { id, texto }
  const lista = dados.frases || [];
  const ativas = lista.filter((f) => f.ativo !== false).map((f) => f.texto);
  const falta = dados.faltando.has('frases');
  const adicionar = async () => {
    const t = texto.trim();
    if (t.length < 3) return;
    if (await dados.salvarFrase(t)) setTexto('');
  };
  const salvarEdicao = async () => {
    const t = editando.texto.trim();
    if (t.length >= 3) await dados.editarFrase(editando.id, t);
    setEditando(null);
  };
  const proximos = Array.from({ length: 7 }, (_, i) => addDias(hoje(), i));
  return (
    <section className="card stack" aria-label="Frases do dia">
      <p className="note">Aparecem embaixo do “Bom dia, fulano”: uma por dia, a mesma para todo mundo, e mudam à meia-noite.
        {' '}{ativas.length ? `${ativas.length} ${ativas.length === 1 ? 'frase ativa' : 'frases ativas'}.` : `Sem frases suas: o app usa ${FRASES_PADRAO.length} prontas.`}</p>
      <div className="frases-semana">
        {proximos.map((d, i) => (
          <div key={d} className={i === 0 ? 'hoje' : ''}>
            <span>{i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : diaSemana(d) + ' ' + fmt(d)}</span>
            <p>{mensagemDoDia(d, ativas)}</p>
          </div>
        ))}
      </div>
      {falta ? (
        <p className="note">Para cadastrar as suas frases, rode no Supabase o arquivo <b>11_painel_financeiro_e_campo.sql</b>. Enquanto isso, o app usa {FRASES_PADRAO.length} frases prontas.</p>
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" style={{ flex: 1 }} placeholder="Ex.: Que seu dia seja iluminado!" maxLength={240} value={texto}
              onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionar()} aria-label="Nova frase" />
            <button type="button" className="pill lime" disabled={texto.trim().length < 3} onClick={adicionar}>Adicionar</button>
          </div>
          {lista.length ? (
            <ul className="frases-lista">
              {lista.map((f) => (
                <li key={f.id} className={f.ativo === false ? 'off' : ''}>
                  {editando?.id === f.id ? (
                    <input className="input" style={{ flex: 1 }} autoFocus maxLength={240} value={editando.texto} aria-label="Editar frase"
                      onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicao(); if (e.key === 'Escape') setEditando(null); }} />
                  ) : <span>{f.texto}</span>}
                  {editando?.id === f.id
                    ? <button type="button" className="link-btn" onClick={salvarEdicao}>Salvar</button>
                    : <button type="button" className="link-btn" onClick={() => setEditando({ id: f.id, texto: f.texto })}>Editar</button>}
                  <button type="button" className="link-btn" onClick={() => dados.alternarFrase(f.id, f.ativo === false)}>{f.ativo === false ? 'Ativar' : 'Pausar'}</button>
                  <button type="button" className="link-btn danger-text" onClick={() => window.confirm('Apagar esta frase?') && dados.apagarFrase(f.id)}>Apagar</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">Nenhuma frase cadastrada: o app usa {FRASES_PADRAO.length} frases prontas.{' '}
              <button type="button" className="link-btn" onClick={() => setAberto((v) => !v)}>{aberto ? 'Esconder' : 'Ver quais são'}</button></p>
          )}
          {aberto && !lista.length && <ul className="frases-lista padrao">{FRASES_PADRAO.map((f) => <li key={f}><span>{f}</span></li>)}</ul>}
        </>
      )}
    </section>
  );
}
