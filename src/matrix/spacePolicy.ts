export interface SpacePolicy {
  include?: string;
  exclude?: string;
}

function matches(name: string, pattern: string): boolean {
  return new RegExp(`^${pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'u').test(name);
}

// The first unescaped dot separates the space and room patterns.
// A literal dot in a space name can be written as \. in configuration.
function parsePattern(pattern: string): [string, string] {
  let separator = -1;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\' && pattern[i + 1] === '.') { i++; continue; }
    if (pattern[i] === '.') { separator = i; break; }
  }
  const space = separator < 0 ? pattern : pattern.slice(0, separator);
  const room = separator < 0 ? '*' : pattern.slice(separator + 1);
  return [space.trim().replace(/\\\./g, '.'), room.trim().replace(/\\\./g, '.')];
}

function matchesRule(spaceName: string, roomName: string, patterns: string): boolean {
  return patterns.split(',').map(pattern => pattern.trim()).filter(Boolean).some(pattern => {
    const [space, room] = parsePattern(pattern);
    return Boolean(space && room) && matches(spaceName, space) && matches(roomName, room);
  });
}

export function allowsRoomInSpace(spaceName: string, roomName: string, policy: SpacePolicy): boolean {
  const space = spaceName.trim();
  const room = roomName.trim();
  return Boolean(space && room)
    && (!policy.include?.trim() || matchesRule(space, room, policy.include))
    && (!policy.exclude?.trim() || !matchesRule(space, room, policy.exclude));
}
