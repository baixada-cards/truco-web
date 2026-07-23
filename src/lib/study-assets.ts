export function resolveStudyManifestUrl(manifestUrl: string, origin: string): string {
  return new URL(manifestUrl, origin).toString()
}

export function resolveStudyAssetUrl(
  asset: string,
  manifestUrl: string,
  origin: string,
): string {
  return new URL(asset, resolveStudyManifestUrl(manifestUrl, origin)).toString()
}
