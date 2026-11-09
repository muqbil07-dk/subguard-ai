import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Auth from './Auth'
import { authService } from '../services/authService'

function renderAuth(mode) {
  return render(<MemoryRouter><Auth mode={mode} /></MemoryRouter>)
}

describe('authentication preview', () => {
  it('validates registration and does not call a service with invalid input', async () => {
    const register = vi.spyOn(authService, 'register')
    const user = userEvent.setup()
    renderAuth('register')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter a name with at least 2 characters.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
    register.mockRestore()
  })

  it('toggles password visibility and surfaces the real disconnected state', async () => {
    const user = userEvent.setup()
    renderAuth('login')
    await user.type(screen.getByLabelText('Email address'), 'demo@example.com')
    const password = screen.getByLabelText('Password')
    await user.type(password, 'test-preview-only')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Supabase authentication is not connected yet')
    expect(password).toHaveValue('')
    expect(screen.getByRole('link', { name: /Explore the local demo/ })).toHaveAttribute('href', '/app')
  })

  it('does not claim a reset email was sent', async () => {
    const user = userEvent.setup()
    renderAuth('forgot')
    await user.type(screen.getByLabelText('Email address'), 'demo@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no email was sent')
  })
})
