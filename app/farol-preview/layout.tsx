import type { ReactNode } from 'react'

// This standalone route sits outside the localized app's root layout.
export default function FarolPreviewLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
