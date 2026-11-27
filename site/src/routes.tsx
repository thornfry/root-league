import type { RouteObject } from 'react-router'

function Home() {
  return (
    <main>
      <h1>Root League</h1>
      <p>Season 1 is being set up.</p>
    </main>
  )
}

// One line per route, to keep merges small.
export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
]
