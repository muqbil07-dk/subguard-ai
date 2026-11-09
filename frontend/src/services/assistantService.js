/** Provider-independent boundary. A future authenticated REST adapter replaces this. */
export const assistantService = {
  async sendMessage() {
    return {
      available: false,
      message: 'The AI assistant is not connected yet. Your message was not sent to a model. Explore the demo Insights page for labeled, deterministic sample observations.',
    };
  },
};
