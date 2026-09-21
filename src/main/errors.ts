/** An error whose message is meant for the person using the app, with a stable code for the UI. */
export class UserError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UserError';
  }
}
