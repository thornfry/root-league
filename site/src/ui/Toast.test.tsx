import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { ToastProvider, TOAST_MS, useToast } from './Toast'

function Trigger({ message, bad }: { message: string; bad?: boolean }) {
  const toast = useToast()
  return <button onClick={() => toast(message, { bad })}>show</button>
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('has a polite live region from the start, empty', () => {
    render(<ToastProvider>x</ToastProvider>)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()
  })

  it('shows a message and removes it after a few seconds', () => {
    render(
      <ToastProvider>
        <Trigger message="List submitted." />
      </ToastProvider>,
    )
    act(() => screen.getByRole('button').click())
    expect(screen.getByRole('status')).toHaveTextContent('List submitted.')
    expect(screen.getByText('List submitted.')).toHaveAttribute('class', 'toast')
    act(() => vi.advanceTimersByTime(TOAST_MS - 1))
    expect(screen.getByText('List submitted.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2))
    expect(screen.queryByText('List submitted.')).toBeNull()
  })

  it('styles an error differently', () => {
    render(
      <ToastProvider>
        <Trigger message="Lists are locked." bad />
      </ToastProvider>,
    )
    act(() => screen.getByRole('button').click())
    expect(screen.getByText('Lists are locked.')).toHaveClass('toast', 'bad')
  })

  it('replaces the message and restarts the timer', () => {
    render(
      <ToastProvider>
        <Trigger message="First" />
      </ToastProvider>,
    )
    act(() => screen.getByRole('button').click())
    act(() => vi.advanceTimersByTime(TOAST_MS - 100))
    act(() => screen.getByRole('button').click())
    act(() => vi.advanceTimersByTime(TOAST_MS - 100))
    expect(screen.getByText('First')).toBeInTheDocument()
  })

  it('refuses to be used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger message="x" />)).toThrow('ToastProvider')
    spy.mockRestore()
  })
})
