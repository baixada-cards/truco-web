import { NextIntlClientProvider } from 'next-intl'

import messages from '../../messages/en.json'
import { FarolPreviewClient } from './FarolPreviewClient'

export default function FarolPreview() {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <FarolPreviewClient />
    </NextIntlClientProvider>
  )
}
