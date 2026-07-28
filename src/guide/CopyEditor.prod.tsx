// Production stand-in for the dev-only guide copy editor. next.config.mjs
// aliases ./CopyEditor to this module in production builds, so neither the
// editor nor its vim engine reaches a shipped bundle.

export function CopyEditor() {
  return null
}
