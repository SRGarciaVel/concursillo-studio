/**
 * «¡TIEMPO!»: entra con zoom y un destello rojo y se desvanece a los 3 s,
 * dejando ver lo que hay debajo (p. ej. la respuesta correcta).
 *
 * Se monta cuando se agota un tiempo; la animación es `forwards` y termina
 * invisible, así que aunque siga montado no vuelve a aparecer hasta que cambie
 * su `key` (otro agotamiento distinto).
 */
export function TimeUpFlash({ label = "¡TIEMPO!" }: { label?: string }) {
  return (
    <div className="timeup-flash" role="alert" aria-live="assertive">
      <div className="timeup-burst" />
      <div className="timeup-text">{label}</div>
    </div>
  );
}
