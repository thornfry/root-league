import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ConfirmModal, Modal } from './Modal'

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Modal open={false} title="Leave the league?" onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a labelled modal dialog when open', () => {
    render(
      <Modal open title="Leave the league?" onClose={() => {}}>
        This clears your list.
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Leave the league?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('This clears your list.')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal open title="T" onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a click on the backdrop but not inside the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open title="T" onClose={onClose}>
        body text
      </Modal>,
    )
    await user.click(screen.getByText('body text'))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus in, keeps Tab inside, and gives focus back on close', async () => {
    const user = userEvent.setup()
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} title="T" onClose={() => setOpen(false)} actions={<><button>First</button><button>Last</button></>} />
        </>
      )
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('focuses the first input when there is one', () => {
    render(
      <Modal open title="Rename" onClose={() => {}} actions={<button>Save</button>}>
        <input aria-label="Label" />
      </Modal>,
    )
    expect(screen.getByLabelText('Label')).toHaveFocus()
  })
})

describe('ConfirmModal', () => {
  it('confirms and cancels', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmModal open title="Remove?" confirmLabel="Remove" danger onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('danger')
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('uses the primary style unless it is dangerous', () => {
    render(<ConfirmModal open title="Save?" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'OK' })).toHaveClass('pri')
  })

  it('cancels on Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ConfirmModal open title="Save?" onConfirm={() => {}} onCancel={onCancel} />)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })
})
