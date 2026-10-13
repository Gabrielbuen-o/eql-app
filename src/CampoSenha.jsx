import { useState } from 'react';

// Campo de senha com o "olhinho" para mostrar/esconder o que está sendo digitado.
// Recebe as mesmas props de um <input> comum (id, name, value, onChange, autoComplete…).
export function CampoSenha(props) {
  const [ver, setVer] = useState(false);
  return (
    <span className="senha-campo">
      <input {...props} type={ver ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="senha-olho" aria-label={ver ? 'Esconder senha' : 'Mostrar senha'} aria-pressed={ver}
        title={ver ? 'Esconder senha' : 'Mostrar senha'}
        // não tira o foco do campo (no celular o teclado continua aberto)
        onMouseDown={(e) => e.preventDefault()} onClick={() => setVer((v) => !v)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {ver && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </span>
  );
}
