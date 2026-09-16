// Production stand-in for the dev-only guide review comments. next.config.mjs
// aliases ./ReviewComments to this module in production builds, so neither the
// comment UI nor its vim engine reaches a shipped bundle.

export function ReviewComments() {
  return null
}
