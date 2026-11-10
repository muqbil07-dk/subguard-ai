import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SubscriptionForm from './SubscriptionForm.jsx';

afterEach(cleanup);

describe('subscription editor', () => {
  it('blocks missing merchant and invalid monetary input', async () => {
    const submit = vi.fn();
    const user = userEvent.setup();
    render(<SubscriptionForm onSubmit={submit} onCancel={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Add subscription' }));
    expect(await screen.findByText('Enter a subscription name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a positive amount with up to 2 decimal places.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
  it('submits an exact minor amount and selected quarterly cadence', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SubscriptionForm onSubmit={submit} onCancel={() => {}} />);
    await user.type(screen.getByLabelText('Subscription name'), 'Figma Pro');
    await user.type(screen.getByLabelText('Amount per billing cycle'), '1299.01');
    await user.selectOptions(screen.getByLabelText('Billing frequency'), 'Quarterly');
    await user.click(screen.getByRole('button', { name: 'Add subscription' }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Figma Pro', amountMinor: '129901', frequency: 'Quarterly', currency: 'INR' }));
  });
  it('surfaces persistence failures and keeps the editor open', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('Browser storage is full.'));
    const user = userEvent.setup();
    render(<SubscriptionForm subscription={{ name: 'Test', amountMinor: '99900', currency: 'INR', category: 'Productivity', frequency: 'Monthly', nextRenewal: '2026-11-12', status: 'Active' }} onSubmit={submit} onCancel={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Browser storage is full.');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
});
