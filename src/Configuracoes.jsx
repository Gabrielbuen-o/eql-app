import { listaClientes } from './ClienteCampo.jsx';
import { useRef, useState } from 'react';
import { Atividades } from './Atividades.jsx';
import { FRASES_PADRAO, PAPEIS, PREFS_PADRAO, hoje, mensagemDoDia, papelNome, reduzirImagem, supabase, tempoRelativo } from './lib.js';
import { Avatar } from './Avatar.jsx';

export function Configuracoes({ dados, eu, usuario, pode, salvarPrefs, avisar, verComo = null }) {
  const prefs = { ...PREFS_PADRAO, ...lerPrefs(), ...(eu?.preferencias || {}) };
  const semPerfis = dados.faltando.has('perfis');
  const set = (k, v) => salvarPrefs({ ...prefs, [k]: v });
  const [filtroLog, setFiltroLog] = useState(null);
  const verAtividades = (id) => {
    setFiltroLog(id);
    setTimeout(() => document.getElementById('registro-atividades')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>Configurações</h1>
          <p className="date">Sua conta, aparência do app{pode.verOperacao ? ' e usuários' : ''}</p>
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

      {pode.verOperacao && !semPerfis && <Usuarios dados={dados} eu={eu} pode={pode} avisar={avisar} verAtividades={verAtividades} verComo={verComo} />}
      {pode.admin && <Clientes dados={dados} avisar={avisar} verComo={verComo} />}
      {pode.admin && <Frases dados={dados} />}
      {pode.admin && !semPerfis && <Atividades dados={dados} filtroUsuario={filtroLog} setFiltroUsuario={setFiltroLog} />}
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
          <span className="badge blue">{papelNome[eu.papel]}</span>
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
  const lista = [...dados.perfis].sort((a, b) =>
    (dados.online.has(b.id) - dados.online.has(a.id)) || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const qtdOnline = lista.filter((p) => dados.online.has(p.id)).length;
  return (
    <section className="card stack" aria-label="Usuários">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="card-title">Usuários</h2>
        <span className="badge green">{qtdOnline} online agora</span>
      </div>
      {verComo && (
        <div className="ver-como-barra">
          <span>Ver o app como:</span>
          <button type="button" className="pill" onClick={() => verComo('campo:compartilhado')}>Campo (celular compartilhado)</button>
          {(dados.clientes || []).filter((c) => c.ativo !== false).map((c) => (
            <button key={c.id} type="button" className="pill" onClick={() => verComo('cliente:' + c.nome)}>Portal {c.nome}</button>
          ))}
          <span className="note">ou clique em “Ver como” em cada usuário</span>
        </div>
      )}
      <div className="users">
        {lista.map((p) => (
          <LinhaUsuario key={p.id} p={p} dados={dados} online={dados.online.has(p.id)} admin={pode.admin} eu={eu} avisar={avisar} verAtividades={verAtividades} verComo={verComo} />
        ))}
      </div>
      {pode.admin && (
        <div className="note" style={{ background: 'var(--soft)', borderRadius: 16, padding: 14 }}>
          <b>Para adicionar alguém:</b> no Supabase, vá em Authentication → Users → Add user → Create new user (e-mail, senha e
          “Auto Confirm User”). A pessoa aparece aqui como <b>Campo</b>; depois é só trocar o tipo de acesso nesta lista.
          <br />
          {PAPEIS.map((r) => <span key={r.id} style={{ display: 'block', marginTop: 4 }}><b>{r.nome}:</b> {r.desc}</span>)}
        </div>
      )}
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

// Frases do dia (aparecem para o campo e no Início): administradores cadastram
// ---------- Clientes (Help, Ageplan…) ----------
function Clientes({ dados, avisar, verComo }) {
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState(null); // { id, nome }
  const falta = dados.faltando.has('clientes');
  const lista = [...(dados.clientes || [])].sort((a, b) => (a.ativo === false) - (b.ativo === false) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const obras = (nome) => dados.demandas.filter((d) => (d.grupo || '').trim().toLowerCase() === nome.trim().toLowerCase()).length;
  const acessos = (nome) => dados.perfis.filter((p) => p.papel === 'cliente' && (p.cliente_grupo || '').trim().toLowerCase() === nome.trim().toLowerCase()).length;
  const adicionar = async () => { const n = await dados.criarCliente(novo); if (n) { setNovo(''); avisar(`Cliente “${n}” cadastrado.`); } };
  const renomear = async () => {
    const n = editando.nome.trim(); const c = lista.find((x) => x.id === editando.id);
    if (!n || n === c.nome) { setEditando(null); return; }
    if (lista.some((x) => x.id !== c.id && x.nome.trim().toLowerCase() === n.toLowerCase())) { avisar(`Já existe um cliente “${n}”.`); return; }
    if (!window.confirm(`Renomear “${c.nome}” para “${n}”? Muda também nas obras, nos orçamentos em aberto e no acesso dos usuários desse cliente.`)) return;
    if (await dados.atualizarCliente(c.id, { nome: n })) { setEditando(null); avisar('Cliente renomeado em todo o sistema.'); }
  };
  return (
    <section className="card stack" aria-label="Clientes">
      <div>
        <h2 className="card-title">Clientes</h2>
        <p className="note">Aparecem para escolher ao criar obras, pedidos da fábrica e orçamentos. Um nome novo usado em 2 obras entra aqui sozinho.</p>
      </div>
      {falta ? (
        <p className="note">Para ter a lista de clientes, rode no Supabase o arquivo <b>16_clientes.sql</b>.</p>
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" style={{ flex: 1 }} placeholder="Ex.: Radial" maxLength={80} value={novo}
              onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && novo.trim() && adicionar()} aria-label="Novo cliente" />
            <button type="button" className="pill lime" disabled={!novo.trim()} onClick={adicionar}>Adicionar</button>
          </div>
          <ul className="cli-lista">
            {lista.map((c) => (
              <li key={c.id} className={c.ativo === false ? 'off' : ''}>
                {editando?.id === c.id ? (
                  <input className="input" autoFocus value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') renomear(); if (e.key === 'Escape') setEditando(null); }} aria-label={`Novo nome de ${c.nome}`} />
                ) : (
                  <span className="cli-nome"><b>{c.nome}</b>{c.origem === 'automatico' && <small className="cli-auto">criado sozinho</small>}</span>
                )}
                <span className="note">{obras(c.nome)} {obras(c.nome) === 1 ? 'obra' : 'obras'}{acessos(c.nome) ? ` · ${acessos(c.nome)} no portal` : ''}</span>
                <span className="cli-acoes">
                  {editando?.id === c.id
                    ? <><button type="button" className="link-btn" onClick={renomear}>Salvar</button><button type="button" className="link-btn" onClick={() => setEditando(null)}>Cancelar</button></>
                    : <><button type="button" className="link-btn" onClick={() => setEditando({ id: c.id, nome: c.nome })}>Renomear</button>
                      <button type="button" className="link-btn" onClick={() => dados.atualizarCliente(c.id, { ativo: c.ativo === false })}>{c.ativo === false ? 'Mostrar' : 'Esconder'}</button>
                      {verComo && <button type="button" className="link-btn" onClick={() => verComo('cliente:' + c.nome)}>Ver portal</button>}</>}
                </span>
              </li>
            ))}
            {!lista.length && <li className="note">Nenhum cliente cadastrado.</li>}
          </ul>
        </>
      )}
    </section>
  );
}

function Frases({ dados }) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const lista = dados.frases || [];
  const ativas = lista.filter((f) => f.ativo !== false).map((f) => f.texto);
  const falta = dados.faltando.has('frases');
  const adicionar = async () => {
    const t = texto.trim();
    if (t.length < 3) return;
    if (await dados.salvarFrase(t)) setTexto('');
  };
  return (
    <section className="card stack" aria-label="Frases do dia">
      <div>
        <h2 className="card-title">Frases do dia</h2>
        <p className="note">Aparecem embaixo do “Bom dia, fulano” — uma por dia, a mesma para todo mundo, e mudam à meia-noite.</p>
      </div>
      <div className="frase-hoje"><span>Hoje:</span> {mensagemDoDia(hoje(), ativas)}</div>
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
                  <span>{f.texto}</span>
                  <button type="button" className="link-btn" onClick={() => dados.alternarFrase(f.id, f.ativo === false)}>{f.ativo === false ? 'Ativar' : 'Pausar'}</button>
                  <button type="button" className="link-btn danger-text" onClick={() => dados.apagarFrase(f.id)}>Apagar</button>
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
