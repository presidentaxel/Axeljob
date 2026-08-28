/** Catalogue AXE-358. `trackType` omis sur les surfaces A/B non-clic. */
export function analyticsAttrs(id, zone, level, trackType) {
  const attrs = { 'data-attr': id, 'data-zone': zone, 'data-level': level };
  if (trackType) attrs['data-track'] = trackType;
  return attrs;
}
