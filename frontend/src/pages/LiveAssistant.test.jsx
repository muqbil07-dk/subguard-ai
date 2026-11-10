import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ai = vi.hoisted(() => ({ listConversations: vi.fn(), createConversation: vi.fn(), getConversation: vi.fn(), deleteConversation: vi.fn(), chat: vi.fn(), recommendations: vi.fn(), wasteScore: vi.fn(), explain: vi.fn(), dismissRecommendation: vi.fn() }))
vi.mock('../services/apiService.js', () => ({ apiService: { ai } }))
import LiveAssistant from './LiveAssistant.jsx'

const fact = { id: 'fact-monthly', kind: 'monthly_total', label: 'Confirmed monthly estimate', amountMinor: '129900', currency: 'INR', basis: 'Confirmed active subscriptions', asOf: '2026-11-10' }
const response = { answer: 'Review the confirmed plans in the supporting evidence.', summary: '', keyFacts: [fact], recommendations: [], evidence: [], warnings: ['Estimates are not a prediction of settled charges.'], confidence: 'grounded', generatedAt: '2026-11-10T10:00:00Z' }
const savedConversation = { id: 'conversation-a', title: 'Review my subscriptions', created_at: '2026-11-10T09:00:00Z', updated_at: '2026-11-10T10:00:00Z' }
const savedMessages = [{ id: 'user-1', role: 'user', content: 'Review my subscriptions', created_at: '2026-11-10T09:59:00Z', sequence: 1 }, { id: 'assistant-1', role: 'assistant', content: response.answer, structured_response: response, created_at: '2026-11-10T10:00:00Z', sequence: 2 }]

beforeEach(() => {
  vi.resetAllMocks()
  ai.listConversations.mockResolvedValue({ data: [], pagination: { page: 1, limit: 25, total: 0 } })
  ai.createConversation.mockResolvedValue(savedConversation)
  ai.getConversation.mockResolvedValue({ data: { conversation: savedConversation, messages: [] }, pagination: { page: 1, limit: 25, total: 0 } })
  ai.recommendations.mockResolvedValue({ recommendations: [], aiAvailable: true, generatedAt: '2026-11-10T10:00:00Z' })
  ai.wasteScore.mockResolvedValue({ state: 'insufficient_data', score: null, category: 'insufficient_data', factors: [], evidence: [], calculatedAt: '2026-11-10T10:00:00Z' })
})

describe('account AI assistant', () => {
  it('keeps unavailable-provider warnings and insufficient evidence distinct from an AI answer', async () => {
    ai.recommendations.mockResolvedValue({ recommendations: [], aiAvailable: false, warning: 'AI_DISABLED: configure the server provider before requesting an explanation.' })
    render(<LiveAssistant />)
    expect(await screen.findByText('AI explanations are unavailable.')).toBeInTheDocument()
    expect(screen.getByText(/AI_DISABLED: configure the server provider/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Not enough data yet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No recommendations to review' })).toBeInTheDocument()
    expect(screen.queryByText(/SubGuard is connected to your bank/)).not.toBeInTheDocument()
    expect(ai.chat).not.toHaveBeenCalled()
  })

  it('shows a pending request and keeps the typed question after a backend error', async () => {
    let rejectChat
    ai.chat.mockImplementation(() => new Promise((_resolve, reject) => { rejectChat = reject }))
    const user = userEvent.setup()
    render(<LiveAssistant />)
    const input = screen.getByRole('textbox', { name: 'Ask about your account' })
    await user.type(input, 'How much do I spend monthly?')
    await user.click(screen.getByRole('button', { name: 'Send account question' }))
    await waitFor(() => expect(ai.chat).toHaveBeenCalledWith({ conversationId: 'conversation-a', message: 'How much do I spend monthly?', requestId: expect.any(String) }))
    expect(screen.getByRole('button', { name: 'Send account question' })).toBeDisabled()
    expect(screen.getByText('Preparing an evidence-grounded answer')).toBeInTheDocument()
    await act(async () => rejectChat(new Error('AI_DISABLED: the provider is unavailable.')))
    expect(await screen.findByRole('alert')).toHaveTextContent('AI_DISABLED: the provider is unavailable.')
    expect(input).toHaveValue('How much do I spend monthly?')
    expect(screen.getByRole('button', { name: 'Send account question' })).toBeEnabled()
    expect(screen.queryByText(response.answer)).not.toBeInTheDocument()
  })

  it('loads persisted conversation history and pages through saved messages', async () => {
    ai.listConversations.mockResolvedValue({ data: [savedConversation], pagination: { page: 1, limit: 25, total: 1 } })
    ai.getConversation.mockImplementation((_id, page) => Promise.resolve({ data: { conversation: savedConversation, messages: page === 1 ? savedMessages : [{ id: 'older-1', role: 'user', content: 'An earlier saved question', created_at: '2026-11-09T10:00:00Z', sequence: 0 }] }, pagination: { page, limit: 2, total: 3 } }))
    const user = userEvent.setup()
    render(<LiveAssistant />)
    await user.click(await screen.findByRole('button', { name: /Review my subscriptions.*10 Nov/ }))
    await waitFor(() => expect(screen.getByText(response.answer)).toBeInTheDocument())
    expect(ai.getConversation).toHaveBeenCalledWith('conversation-a', 1)
    await user.click(screen.getByText('Key facts'))
    expect(screen.getByText('₹1,299.00')).toBeInTheDocument()
    expect(screen.getByText('Basis: Confirmed active subscriptions')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Older messages' }))
    expect(await screen.findByText('An earlier saved question')).toBeInTheDocument()
    expect(ai.getConversation).toHaveBeenLastCalledWith('conversation-a', 2)
  })

  it('renders backend savings and evidence and dismisses only after API acceptance', async () => {
    ai.recommendations.mockResolvedValue({ recommendations: [{ id: 'rec-a', insightId: 'insight-a', title: 'Review overlapping plans', explanation: 'Two confirmed plans share a category.', priority: 'medium', currency: 'INR', evidence: [fact], estimatedSavings: { monthlyMinor: '20000', yearlyMinor: '240000', currency: 'INR', assumptions: ['Only if you decide one plan is unnecessary.'] }, suggestedNextAction: 'Compare the plans before making changes.' }], aiAvailable: true })
    ai.dismissRecommendation.mockResolvedValue({ id: 'rec-a', dismissed: true })
    const user = userEvent.setup()
    render(<LiveAssistant />)
    const title = await screen.findByRole('heading', { name: 'Review overlapping plans' })
    const recommendation = within(title.closest('article'))
    expect(recommendation.getByText('₹200.00')).toBeInTheDocument()
    expect(recommendation.getByText('₹2,400.00 / year')).toBeInTheDocument()
    expect(recommendation.getByText('Only if you decide one plan is unnecessary.')).toBeInTheDocument()
    await user.click(recommendation.getByText('Supporting evidence'))
    expect(recommendation.getByText('₹1,299.00')).toBeInTheDocument()
    await user.click(recommendation.getByRole('button', { name: 'Dismiss recommendation' }))
    expect(ai.dismissRecommendation).toHaveBeenCalledWith('rec-a')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Review overlapping plans' })).not.toBeInTheDocument())
  })

  it('refreshes saved messages after a successful chat instead of fabricating a local reply', async () => {
    ai.chat.mockResolvedValue({ conversationId: 'conversation-a', response })
    ai.getConversation.mockResolvedValue({ data: { conversation: savedConversation, messages: savedMessages }, pagination: { page: 1, limit: 25, total: 2 } })
    const user = userEvent.setup()
    render(<LiveAssistant />)
    const input = screen.getByRole('textbox', { name: 'Ask about your account' })
    await user.type(input, 'Review my subscriptions')
    await user.click(screen.getByRole('button', { name: 'Send account question' }))
    await waitFor(() => expect(screen.getByText(response.answer)).toBeInTheDocument())
    await waitFor(() => expect(input).toHaveValue(''))
    expect(ai.createConversation).toHaveBeenCalledWith({ title: 'Review my subscriptions' })
    expect(ai.chat).toHaveBeenCalledWith({ conversationId: 'conversation-a', message: 'Review my subscriptions', requestId: expect.any(String) })
    expect(ai.getConversation).toHaveBeenCalledWith('conversation-a', 1)
    expect(screen.getByText('Grounded in account facts')).toBeInTheDocument()
  })

  it('reuses a stable request UUID when retrying the same failed question', async () => {
    ai.chat.mockRejectedValueOnce(new Error('The provider timed out.')).mockResolvedValueOnce({ conversationId: 'conversation-a', response })
    const user = userEvent.setup()
    render(<LiveAssistant />)
    const input = screen.getByRole('textbox', { name: 'Ask about your account' })
    expect(input).toHaveAttribute('maxlength', '1000')
    await user.type(input, 'How much do I spend monthly?')
    await user.click(screen.getByRole('button', { name: 'Send account question' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The provider timed out.')
    const firstRequest = ai.chat.mock.calls[0][0]
    expect(firstRequest.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(input).toHaveValue('How much do I spend monthly?')
    await user.click(screen.getByRole('button', { name: 'Send account question' }))
    await waitFor(() => expect(ai.chat).toHaveBeenCalledTimes(2))
    expect(ai.chat.mock.calls[1][0]).toEqual(firstRequest)
    expect(ai.createConversation).toHaveBeenCalledTimes(1)
  })

  it('renders canonical price-change evidence without recalculating amounts or percentages', async () => {
    const priceFact = { id: 'price-a', kind: 'price_increase', label: 'Price change evidence', merchant: 'Sample streaming plan', amountMinor: '79900', previousAmountMinor: '64900', differenceMinor: '15000', percentageDifference: '+23.11', currency: 'INR', frequency: 'Monthly', unused: false }
    ai.listConversations.mockResolvedValue({ data: [savedConversation], pagination: { page: 1, limit: 25, total: 1 } })
    ai.getConversation.mockResolvedValue({ data: { conversation: savedConversation, messages: [{ ...savedMessages[1], structured_response: { ...response, keyFacts: [], evidence: [priceFact] } }] }, pagination: { page: 1, limit: 25, total: 1 } })
    const user = userEvent.setup()
    render(<LiveAssistant />)
    await user.click(await screen.findByRole('button', { name: /Review my subscriptions.*10 Nov/ }))
    await user.click(await screen.findByText('Supporting evidence'))
    expect(screen.getByText('₹799.00')).toBeInTheDocument()
    expect(screen.getByText('Previous amount: ₹649.00')).toBeInTheDocument()
    expect(screen.getByText('Change: ₹150.00')).toBeInTheDocument()
    expect(screen.getByText('Percentage change: +23.11%')).toBeInTheDocument()
    expect(screen.getByText('Billing frequency: Monthly')).toBeInTheDocument()
    expect(screen.getByText('Not marked unused (user preference)')).toBeInTheDocument()
  })
})

it('ignores an older history response when switching conversations quickly',async()=>{
 const second={...savedConversation,id:'conversation-b',title:'Other conversation'}
 ai.listConversations.mockResolvedValue({data:[savedConversation,second],pagination:{page:1,limit:25,total:2}})
 let resolveFirst
 ai.getConversation.mockImplementation(id=>id===savedConversation.id?new Promise(resolve=>{resolveFirst=resolve}):Promise.resolve({data:{conversation:second,messages:[{id:'b-1',role:'user',content:'Only the second conversation',created_at:second.created_at}]},pagination:{page:1,limit:25,total:1}}))
 const user=userEvent.setup();render(<LiveAssistant/>)
 await user.click(await screen.findByRole('button',{name:/Review my subscriptions.*10 Nov/}))
 await user.click(screen.getByRole('button',{name:/Other conversation.*10 Nov/}))
 expect(await screen.findByText('Only the second conversation')).toBeInTheDocument()
 await act(async()=>resolveFirst({data:{conversation:savedConversation,messages:savedMessages},pagination:{page:1,limit:25,total:2}}))
 expect(screen.getByText('Only the second conversation')).toBeInTheDocument()
 expect(screen.queryByText(response.answer)).not.toBeInTheDocument()
})
it('retrieves saved chat again after unmount/remount without generating another answer',async()=>{
 ai.listConversations.mockResolvedValue({data:[savedConversation],pagination:{page:1,limit:25,total:1}})
 ai.getConversation.mockResolvedValue({data:{conversation:savedConversation,messages:savedMessages},pagination:{page:1,limit:25,total:2}})
 const user=userEvent.setup();const view=render(<LiveAssistant/>)
 await user.click(await screen.findByRole('button',{name:/Review my subscriptions.*10 Nov/}))
 expect(await screen.findByText(response.answer)).toBeInTheDocument();view.unmount();render(<LiveAssistant/>)
 await user.click(await screen.findByRole('button',{name:/Review my subscriptions.*10 Nov/}))
 expect(await screen.findByText(response.answer)).toBeInTheDocument();expect(ai.chat).not.toHaveBeenCalled();expect(ai.createConversation).not.toHaveBeenCalled()
})
it('recovers failed message retrieval with an explicit retry',async()=>{
 ai.listConversations.mockResolvedValue({data:[savedConversation],pagination:{page:1,limit:25,total:1}})
 ai.getConversation.mockRejectedValueOnce(new Error('History is temporarily unavailable')).mockResolvedValueOnce({data:{conversation:savedConversation,messages:savedMessages},pagination:{page:1,limit:25,total:2}})
 const user=userEvent.setup();render(<LiveAssistant/>)
 await user.click(await screen.findByRole('button',{name:/Review my subscriptions.*10 Nov/}))
 expect(await screen.findByRole('alert')).toHaveTextContent('History is temporarily unavailable')
 await user.click(screen.getByRole('button',{name:'Retry messages'}))
 expect(await screen.findByText(response.answer)).toBeInTheDocument();expect(screen.queryByText('Loading saved messages…')).not.toBeInTheDocument()
})
