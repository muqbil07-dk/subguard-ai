export class AuthUnavailableError extends Error {
  constructor() {
    super('Supabase authentication is not connected yet. No account was created, no email was sent, and no password was stored. You can explore the local demo instead.');
    this.name = 'AuthUnavailableError';
    this.code = 'AUTH_UNAVAILABLE';
  }
}

// Deliberately no fake sessions, password persistence or network requests.
export const authService = {
  async login() { throw new AuthUnavailableError(); },
  async register() { throw new AuthUnavailableError(); },
  async resetPassword() { throw new AuthUnavailableError(); },
};
