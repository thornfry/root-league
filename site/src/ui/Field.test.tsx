import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Field } from './Field'

describe('Field', () => {
  it('ties the label to the input', async () => {
    const user = userEvent.setup()
    render(<Field label="Discord user ID" placeholder="digits only" />)
    const input = screen.getByLabelText('Discord user ID')
    await user.type(input, '123')
    expect(input).toHaveValue('123')
  })

  it('describes the input with its hint', () => {
    render(<Field label="Name" hint="As shown on the roster" />)
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('As shown on the roster')
  })

  it('marks the input invalid and describes it with the error', () => {
    render(<Field label="Name" hint="As shown on the roster" error="Enter a name" />)
    const input = screen.getByLabelText('Name')
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription('As shown on the roster Enter a name')
  })

  it('is valid with no error', () => {
    render(<Field label="Name" />)
    expect(screen.getByLabelText('Name')).toBeValid()
  })

  it('can be a textarea', () => {
    render(<Field label="Paste IDs" multiline />)
    expect(screen.getByLabelText('Paste IDs').tagName).toBe('TEXTAREA')
  })

  it('gives each field its own id', () => {
    render(
      <>
        <Field label="One" />
        <Field label="Two" />
      </>,
    )
    expect(screen.getByLabelText('One').id).not.toBe(screen.getByLabelText('Two').id)
  })
})
