/**
 * A failure the person using the program caused, and can do something about.
 * The server sends these back as a 4xx with the sentence as it is; anything
 * else is ours, and is a 500 with an apology.
 */
export class UserError extends Error {
  constructor(message, { status = 400, detail, cause } = {}) {
    super(message);
    this.name = 'UserError';
    this.status = status;
    if (detail) this.detail = detail;
    if (cause) this.cause = cause;
  }
}

export const notFound = (message) => new UserError(message, { status: 404 });
