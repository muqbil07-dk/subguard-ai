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

it('navigates to the account only after accepted login and clears a rejected password',async()=>{
 const user=userEvent.setup()
 const login=vi.spyOn(authService,'login').mockRejectedValueOnce(new Error('Invalid login credentials')).mockResolvedValueOnce({session:{user:{id:'fixture-user'}}})
 const {Routes,Route}=await import('react-router-dom')
 render(<MemoryRouter initialEntries={['/login']}><Routes><Route path="/login" element={<Auth mode="login"/>}/><Route path="/account" element={<h1>Authenticated account route</h1>}/></Routes></MemoryRouter>)
 await user.type(screen.getByLabelText('Email address'),'fixture@example.com');await user.type(screen.getByLabelText('Password'),'fixture-password')
 await user.click(screen.getByRole('button',{name:'Log in'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');expect(screen.getByLabelText('Password')).toHaveValue('')
 await user.type(screen.getByLabelText('Password'),'fixture-password');await user.click(screen.getByRole('button',{name:'Log in'}))
 expect(await screen.findByRole('heading',{name:'Authenticated account route'})).toBeInTheDocument();expect(login).toHaveBeenCalledTimes(2);login.mockRestore()
})
it('registration with no session requests confirmation instead of entering the account',async()=>{
 const register=vi.spyOn(authService,'register').mockResolvedValue({session:null})
 const user=userEvent.setup();renderAuth('register')
 await user.type(screen.getByLabelText('Full name'),'Test Person');await user.type(screen.getByLabelText('Email address'),'fixture@example.com');await user.type(screen.getByLabelText('Password'),'fixture-password');await user.type(screen.getByLabelText('Confirm password'),'fixture-password');await user.click(screen.getByRole('button',{name:'Create account'}))
 expect(await screen.findByRole('status')).toHaveTextContent('Check your email');expect(screen.getByLabelText('Password')).toHaveValue('');expect(screen.getByLabelText('Confirm password')).toHaveValue('');register.mockRestore()
})
it('disables repeated login clicks while the authentication request is pending',async()=>{
 let resolveLogin;const login=vi.spyOn(authService,'login').mockReturnValue(new Promise(resolve=>{resolveLogin=resolve}))
 const user=userEvent.setup();renderAuth('login')
 await user.type(screen.getByLabelText('Email address'),'fixture@example.com');await user.type(screen.getByLabelText('Password'),'fixture-password');await user.click(screen.getByRole('button',{name:'Log in'}))
 const button=screen.getByRole('button',{name:'Checking connection…'});expect(button).toBeDisabled();await user.click(button);expect(login).toHaveBeenCalledTimes(1)
 const {act}=await import('@testing-library/react');await act(async()=>resolveLogin({session:{}}));login.mockRestore()
})
