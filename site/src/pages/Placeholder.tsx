/** A stand-in for a page a later commit builds. It has no data. */
export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1 className="disp h1s">{title}</h1>
      <p className="muted">This page is a placeholder. It has no data yet.</p>
    </>
  )
}
