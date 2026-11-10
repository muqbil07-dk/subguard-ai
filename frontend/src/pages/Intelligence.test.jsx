import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router-dom'
import Settings from './Settings.jsx'
import Insights from './Insights.jsx'

vi.mock('../hooks/useDemo.js', () => ({
  useDemo: () => ({
    data: {
      profile: { name: 'Demo Member', email: 'demo@example.com' },
      preferences: { currency: 'INR', renewalReminders: true, unusualCharges: true, weeklyDigest: false },
      subscriptions: [], transactions: [], dismissedInsights: [],
    },
    currency: 'INR', updateSettings: vi.fn(), resetDemo: vi.fn(), toast: vi.fn(), dismissInsight: vi.fn(), restoreInsights: vi.fn(),
  }),
}))

vi.mock('../utils/finance.js', async (importOriginal) => ({
  ...await importOriginal(),
  getInsights: () => [{ id: 'recurring-test', type: 'recurring', title: 'A recurring expense to review', description: 'Sample evidence for a recurring charge.', severity: 'info', category: 'Productivity' }],
  getSummary: () => ({ activeCount: 0, monthlyMinor: '0', upcomingMinor: '0', savingsMinor: '0', unusualCount: 0 }),
}))

describe('settings section navigation', () => {
  it('opens the demo account deep link and follows later hash navigation', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/app/settings#account']}><Settings /><Link to="/app/settings#security">Security deep link</Link></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Demo workspace' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Security deep link' }))
    expect(screen.getByRole('heading', { name: 'Security & connections' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Profile' }))
    expect(screen.getByRole('heading', { name: 'Profile details' })).toBeInTheDocument()
  })
})

describe('insight types', () => {
  it('labels recurring evidence separately from savings opportunities', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Insights /></MemoryRouter>)
    expect(screen.getByText('Recurring expense', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Savings opportunity', { exact: true })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Savings opportunities' }))
    expect(screen.queryByRole('heading', { name: 'A recurring expense to review' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recurring expenses' }))
    expect(screen.getByRole('heading', { name: 'A recurring expense to review' })).toBeInTheDocument()
  })
})
