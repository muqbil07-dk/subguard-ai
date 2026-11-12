import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ sendMessage: vi.fn() }))
vi.mock('../services/assistantService.js', () => ({ assistantService: api }))
import Assistant from './Assistant.jsx'

// Deterministic service mocks exercise UI states; no model is called by these tests.
function fixture() {
  const fact = { id: 'monthly-inr', kind: 'monthly_estimate', label: 'Synthetic monthly estimate', amountMinor: '279692', currency: 'INR', asOf: '2026-11-11' }
  return { mode: 'synthetic_demo', synthetic: true, label: 'Synthetic Demo Data', dataset: { id: 'fixed-fixture', asOf: '2026-11-11' }, ai: { provider: 'gemini', generated: true }, context: { asOf: '2026-11-11', facts: [fact], summary: [{ currency: 'INR', activeCount: 5, monthlyMinor: '279692', yearlyMinor: '3356300', upcomingMinor: '559600' }, { currency: 'USD', activeCount: 1, monthlyMinor: '2000', yearlyMinor: '24000', upcomingMinor: '2000' }], warnings: [] }, response: { answer: 'Consider reviewing the linked synthetic facts.', keyFacts: [fact], evidence: [], recommendations: [], warnings: [], confidence: 'grounded', generatedAt: '2026-11-11T10:00:00Z' } }
}
beforeEach(() => vi.resetAllMocks())

describe('synthetic demo assistant', () => {
  it('renders clear synthetic provenance and fills suggested questions without sending local data', async () => {
    const user = userEvent.setup(); render(<Assistant />)
    expect(screen.getByText('Synthetic Demo Data', { exact: true })).toBeVisible()
    expect(screen.getByText(/fixed backend dataset, separate from your browser-local dashboard/)).toBeVisible()
    expect(screen.getByText(/Your question is sent to the demo backend/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /How much am I spending on subscriptions every month/ }))
    expect(screen.getByRole('textbox', { name: 'Ask about your subscriptions' })).toHaveValue('How much am I spending on subscriptions every month?')
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  it('submits a bounded question, disables duplicate sends and displays verified financial facts separately', async () => {
    let resolve
    api.sendMessage.mockImplementation(() => new Promise(done => { resolve = done }))
    const user = userEvent.setup(); render(<Assistant />)
    const input = screen.getByRole('textbox', { name: 'Ask about your subscriptions' })
    expect(input).toHaveAttribute('maxlength', '1000')
    await user.type(input, 'Review my spending')
    await user.click(screen.getByRole('button', { name: 'Send question' }))
    expect(screen.getByRole('button', { name: 'Preparing explanation' })).toBeDisabled()
    expect(screen.getByText('Preparing an evidence-grounded explanation…')).toBeVisible()
    expect(api.sendMessage).toHaveBeenCalledWith({ message: 'Review my spending' }, { signal: expect.any(AbortSignal) })
    fireEvent.submit(input.closest('form'))
    expect(api.sendMessage).toHaveBeenCalledTimes(1)
    await act(async () => resolve(fixture()))
    expect(await screen.findByText('Consider reviewing the linked synthetic facts.')).toBeVisible()
    expect(screen.getByText('Gemini interpretation')).toBeVisible()
    expect(screen.getByText('Backend-calculated key facts')).toBeVisible()
    expect(screen.getByText('₹2,796.92', { selector: 'strong' })).toBeVisible()
    const usd = within(screen.getByText('Synthetic · USD').closest('section'))
    expect(usd.getByText('Monthly recurring estimate').closest('.demo-fact')).toHaveTextContent('US$20.00')
    expect(screen.getByText('Fixed snapshot · 2026-11-11')).toBeVisible()
    await user.click(screen.getByText('Backend-calculated key facts'))
    expect(screen.getByText('Synthetic monthly estimate', { selector: '.demo-ai-reply strong' })).toBeVisible()
    expect(input).toBeEnabled()
    expect(input).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled()
  })

  it('keeps disabled-provider context deterministic and retries the original failed question', async () => {
    const data = fixture(); data.ai.generated = false; delete data.response
    api.sendMessage.mockRejectedValueOnce(Object.assign(new Error('AI assistance is disabled.'), { demo: data })).mockResolvedValueOnce(fixture())
    const user = userEvent.setup(); render(<Assistant />)
    await user.type(screen.getByRole('textbox', { name: 'Ask about your subscriptions' }), 'What renewals are coming up?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('AI assistance is disabled.')
    expect(screen.getByText('₹2,796.92', { selector: 'strong' })).toBeVisible()
    expect(screen.queryByText('Gemini interpretation')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Ask about your subscriptions' }), 'A different unsent question')
    await user.click(within(alert).getByRole('button', { name: 'Retry question' }))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2))
    expect(api.sendMessage.mock.calls[1][0]).toEqual({ message: 'What renewals are coming up?' })
    expect(await screen.findByText('Gemini interpretation')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders answer text safely and clears only this ephemeral conversation', async () => {
    const data = fixture(); data.response.answer = '<img src=x onerror=alert(1)> Consider reviewing the evidence.'
    api.sendMessage.mockResolvedValue(data)
    const user = userEvent.setup(); const { container } = render(<Assistant />)
    await user.type(screen.getByRole('textbox', { name: 'Ask about your subscriptions' }), 'Review my spending')
    await user.click(screen.getByRole('button', { name: 'Send question' }))
    expect(await screen.findByText(data.response.answer)).toBeVisible()
    expect(container.querySelector('img')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(screen.queryByText(data.response.answer)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /What renewals are coming up/ })).toBeVisible()
  })

  it('rejects short input locally and handles an unreachable service without fabricated replies', async () => {
    api.sendMessage.mockRejectedValue(new Error('The demo assistant API is unavailable.'))
    const user = userEvent.setup(); render(<Assistant />)
    const input = screen.getByRole('textbox', { name: 'Ask about your subscriptions' })
    await user.type(input, 'hi'); await user.click(screen.getByRole('button', { name: 'Send question' }))
    expect(screen.getByRole('alert')).toHaveTextContent('between 3 and 1000')
    expect(api.sendMessage).not.toHaveBeenCalled()
    await user.clear(input); await user.type(input, 'Review my spending'); await user.click(screen.getByRole('button', { name: 'Send question' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The demo assistant API is unavailable.')
    expect(screen.queryByText('Gemini interpretation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry question' })).toBeEnabled()
  })
})
