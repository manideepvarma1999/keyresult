/** An error whose message is safe to show to the user. */
export class UserError extends Error {}

export class ForbiddenError extends UserError {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

export class NotFoundError extends UserError {
  constructor(message = "Not found.") {
    super(message);
  }
}
