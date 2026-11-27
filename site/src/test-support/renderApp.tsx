import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from '../routes'
import { setViewport } from './viewport'

/** Render the real routes at a path and width. The caller mocks `../db/client` to hand in a fake client. */
export function renderApp(path = '/', width = 1280) {
  setViewport(width)
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}
