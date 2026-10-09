import { useLayoutEffect, useRef, useState } from 'react';

// Largura real do elemento (px). Os gráficos usam isso para desenhar na escala da tela:
// em telas grandes eles ficam mais largos, mas o texto continua do mesmo tamanho.
export function useLargura(padrao) {
  const ref = useRef(null);
  const [w, setW] = useState(padrao);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => { const x = Math.round(e.contentRect.width); if (x > 0) setW(x); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
