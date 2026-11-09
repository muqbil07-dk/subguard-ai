import {it,expect} from 'vitest'
import {render,screen} from '@testing-library/react'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import Account from './Account.jsx'
it('protects persistent account without silently falling back to demo records',async()=>{render(<MemoryRouter initialEntries={['/account']}><Routes><Route path="/account" element={<Account/>}/><Route path="/login" element={<h1>Sign in required</h1>}/></Routes></MemoryRouter>);expect(await screen.findByRole('heading',{name:'Sign in required'})).toBeInTheDocument();expect(screen.queryByText('Alex Morgan')).not.toBeInTheDocument()})
