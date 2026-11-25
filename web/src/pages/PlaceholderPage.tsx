type PlaceholderPageProps = {
  children?: React.ReactNode
  title: string
  description: string
}

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <>
      <header className="page-holder">
        <h2>{title}</h2>
      </header>
      <section className="page">
        <p>{description}</p>
        {children}
      </section>
    </>
  )
}
