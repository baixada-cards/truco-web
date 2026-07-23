export type StudyLabMode = 'off' | 'stealth' | 'public'

type StudyLabEnvironment = Readonly<Record<string, string | undefined>>

export function studyLabMode(env: StudyLabEnvironment = process.env): StudyLabMode {
  const configured = env.STUDY_LAB_MODE?.trim().toLowerCase()
  if (configured === 'off' || configured === 'stealth' || configured === 'public') {
    return configured
  }

  const legacy = env.NEXT_PUBLIC_ENABLE_LAB
  if (legacy !== undefined) return legacy === 'true' ? 'public' : 'off'

  return env.NODE_ENV === 'production' ? 'off' : 'public'
}

export function studyManifestUrl(env: StudyLabEnvironment = process.env): string {
  return env.STUDY_MANIFEST_URL?.trim() || '/study/manifest.json'
}

export function studyLabRouteEnabled(env: StudyLabEnvironment = process.env): boolean {
  return studyLabMode(env) !== 'off'
}
