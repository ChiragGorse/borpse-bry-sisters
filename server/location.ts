/**
 * A human-readable guess at where this server runs, shown to players next to their ping.
 *
 * In order: SERVER_LOCATION (set it to anything, e.g. "Seattle" or "Chirag's PC"), the region of common
 * cloud hosts (Fly.io, Railway), then the city in the machine's time zone (most home PCs). Containers
 * running on UTC with no region variable report nothing, and players see the server's address instead.
 */

const FLY: Record<string, string> = {
  ams: 'Amsterdam', arn: 'Stockholm', atl: 'Atlanta', bog: 'Bogotá', bom: 'Mumbai', bos: 'Boston', cdg: 'Paris',
  den: 'Denver', dfw: 'Dallas', ewr: 'New Jersey', eze: 'Buenos Aires', fra: 'Frankfurt', gdl: 'Guadalajara',
  gig: 'Rio de Janeiro', gru: 'São Paulo', hkg: 'Hong Kong', iad: 'Virginia', jnb: 'Johannesburg', lax: 'Los Angeles',
  lhr: 'London', mad: 'Madrid', mia: 'Miami', nrt: 'Tokyo', ord: 'Chicago', otp: 'Bucharest', phx: 'Phoenix',
  qro: 'Querétaro', scl: 'Santiago', sea: 'Seattle', sin: 'Singapore', sjc: 'San Jose', syd: 'Sydney', waw: 'Warsaw',
  yul: 'Montréal', yyz: 'Toronto',
};

const RAILWAY: Record<string, string> = {
  'us-west1': 'Oregon',
  'us-west2': 'California',
  'us-east4': 'Virginia',
  'europe-west4': 'Netherlands',
  'asia-southeast1': 'Singapore',
};

function fromTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    // "America/Los_Angeles" → "Los Angeles"; skip UTC/Etc zones, which say nothing about the place
    if (!tz.includes('/') || tz.startsWith('Etc/')) return '';
    return tz.split('/').pop()!.replace(/_/g, ' ');
  } catch {
    return '';
  }
}

function detect(): string {
  const env = process.env;
  const custom = env.SERVER_LOCATION?.trim();
  if (custom) return custom.slice(0, 40);
  const fly = env.FLY_REGION?.trim().toLowerCase();
  if (fly) return FLY[fly] ?? fly.toUpperCase();
  const rail = env.RAILWAY_REPLICA_REGION?.trim().toLowerCase();
  if (rail) return RAILWAY[rail.replace(/-[a-z]$/, '')] ?? rail;
  return fromTimeZone();
}

export const SERVER_LOCATION = detect();
