// "Puxar para atualizar" no celular: arrastar a tela para baixo estando no topo recarrega o app.
// O app instalado na tela inicial (e o navegador do WhatsApp) não tem isso sozinho.
// Recarregar é seguro: o endereço guarda a tela, relatórios e orçamentos ficam salvos no aparelho.
const LIMITE = 70; // px puxados (já com resistência) para soltar e atualizar

export function ligarPuxarParaAtualizar() {
  if (typeof window === 'undefined' || !('ontouchstart' in window)) return;
  const ind = document.createElement('div');
  ind.className = 'puxar';
  ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<span>↻</span>';
  document.body.appendChild(ind);

  let y0 = null, d = 0, puxando = false;
  const bloqueado = (t) => {
    if (window.scrollY > 0 || document.documentElement.scrollTop > 0) return true;
    if (!(t instanceof Element)) return true;
    if (t.closest('.campo-folha, .overlay, .cam, .apr, .rel-luz, .chip, .modal, input, textarea, select, [data-sem-puxar]')) return true;
    for (let el = t; el && el !== document.body; el = el.parentElement) if (el.scrollTop > 0) return true; // dentro de algo já rolado
    return false;
  };
  const mostrar = () => {
    ind.style.transform = `translate(-50%, ${d - 50}px) rotate(${d * 4}deg)`;
    ind.style.opacity = String(Math.min(1, d / LIMITE));
    ind.classList.toggle('pronto', d >= LIMITE);
  };
  const soltar = () => {
    ind.classList.remove('pronto');
    ind.style.transition = 'transform .2s, opacity .2s';
    ind.style.transform = 'translate(-50%, -50px)'; ind.style.opacity = '0';
    setTimeout(() => { ind.style.transition = ''; }, 220);
    y0 = null; d = 0; puxando = false;
  };

  document.addEventListener('touchstart', (e) => {
    y0 = e.touches.length === 1 && !bloqueado(e.target) ? e.touches[0].clientY : null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy <= 0) { if (puxando) soltar(); else if (dy < -8) y0 = null; return; } // dedo parado não cancela; subindo cancela
    if (window.scrollY > 0) { soltar(); return; }
    puxando = true;
    d = Math.min(110, dy * 0.45); // resistência
    if (e.cancelable) e.preventDefault(); // sem o "elástico" do iPhone enquanto puxa
    mostrar();
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (!puxando) { y0 = null; return; }
    if (d >= LIMITE) {
      ind.classList.add('carregando');
      ind.style.transform = 'translate(-50%, 24px)'; ind.style.opacity = '1';
      setTimeout(() => window.location.reload(), 180);
    } else soltar();
  }, { passive: true });
}
