import { iniciais } from './lib.js';

export function Avatar({ perfil, nome, online, grande }) {
  const n = perfil?.nome || nome || perfil?.email || '?';
  return (
    <div className={'avatar' + (grande ? ' lg' : '')} aria-hidden="true">
      {perfil?.foto_url ? <img src={perfil.foto_url} alt="" /> : iniciais(n)}
      {online && <span className="on-dot" />}
    </div>
  );
}
