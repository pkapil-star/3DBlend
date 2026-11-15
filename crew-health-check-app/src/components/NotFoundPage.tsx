import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading" className="text-2xl font-semibold">
        Page not found
      </h1>
      <p className="mt-2">
        <Link to="/" className="underline underline-offset-4">
          Go to Home
        </Link>
      </p>
    </section>
  )
}
