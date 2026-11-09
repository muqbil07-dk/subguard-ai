import { render,screen } from '@testing-library/react'
import { it,expect,vi,beforeEach } from 'vitest'
const api=vi.hoisted(()=>({summary:vi.fn(),spending:vi.fn(),categories:vi.fn(),upcoming:vi.fn(),calendar:vi.fn()}))
vi.mock('../services/apiService.js',()=>({apiService:api}))
import AccountAnalytics from './AccountAnalytics.jsx'
beforeEach(()=>{vi.resetAllMocks();api.summary.mockResolvedValue({activeCount:1,monthlyMinor:'1200',spentMinor:'900',savingsMinor:'0',from:'2026-11-01',to:'2026-11-09'});for(const key of ['spending','categories','upcoming','calendar'])api[key].mockResolvedValue([])})
it('renders backend amounts and clear empty timelines without demo labels or invented records',async()=>{render(<AccountAnalytics/>);expect(await screen.findByText('₹12.00')).toBeInTheDocument();expect(screen.getByText('No upcoming payments.')).toBeInTheDocument();expect(screen.getByText('No completed spending in this range.')).toBeInTheDocument();expect(screen.queryByText('Alex Morgan')).not.toBeInTheDocument();expect(api.calendar).toHaveBeenCalledWith({currency:'INR'})})
it('surfaces backend failure and does not render any sample figures',async()=>{api.summary.mockRejectedValue(new Error('API unavailable'));render(<AccountAnalytics/>);expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable');expect(screen.queryByText('₹12.00')).not.toBeInTheDocument()})
