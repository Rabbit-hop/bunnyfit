type PlaceholderPageProps = {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <header className="page-holder">
        <h2>{title}</h2>
      </header>
      <section className="page">
        <p>{description}</p>
      </section>
    </>
  )
}
