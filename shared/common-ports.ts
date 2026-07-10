export type PortStatus = 'free' | 'occupied' | 'unknown';

export interface PortProcess {
  pid: number;
  name: string;
  command?: string;
  user?: string;
}

export interface PortInfo {
  port: number;
  label: string;
  category: string;
  status: PortStatus;
  processes: PortProcess[];
}

export interface ScanResult {
  scannedAt: string;
  platform: NodeJS.Platform;
  ports: PortInfo[];
}

export interface KillResult {
  port: number;
  success: boolean;
  killedPids: number[];
  message: string;
}

export interface CommonPortDefinition {
  port: number;
  label: string;
  category: string;
}

/** Frequently used local development and service ports. */
export const COMMON_PORTS: CommonPortDefinition[] = [
  { port: 3000, label: 'Next.js / React / Node', category: 'Web' },
  { port: 3001, label: 'Dev server (alt)', category: 'Web' },
  { port: 4000, label: 'GraphQL / Nest', category: 'Web' },
  { port: 4200, label: 'Angular', category: 'Web' },
  { port: 5000, label: 'Flask / ASP.NET', category: 'Web' },
  { port: 5173, label: 'Vite', category: 'Web' },
  { port: 8000, label: 'Django / Python', category: 'Web' },
  { port: 8080, label: 'HTTP proxy / Tomcat', category: 'Web' },
  { port: 8888, label: 'Jupyter', category: 'Web' },
  { port: 9000, label: 'PHP-FPM / Sonar', category: 'Web' },
  { port: 9229, label: 'Node inspector', category: 'Debug' },
  { port: 19000, label: 'Expo Metro', category: 'Mobile' },
  { port: 5432, label: 'PostgreSQL', category: 'Database' },
  { port: 3306, label: 'MySQL / MariaDB', category: 'Database' },
  { port: 1433, label: 'SQL Server', category: 'Database' },
  { port: 27017, label: 'MongoDB', category: 'Database' },
  { port: 6379, label: 'Redis', category: 'Cache' },
  { port: 11211, label: 'Memcached', category: 'Cache' },
  { port: 9200, label: 'Elasticsearch', category: 'Search' },
  { port: 5672, label: 'RabbitMQ', category: 'Queue' },
  { port: 15672, label: 'RabbitMQ UI', category: 'Queue' },
  { port: 2375, label: 'Docker API', category: 'Containers' },
  { port: 6443, label: 'Kubernetes API', category: 'Containers' },
];

export const CATEGORIES = [
  'All',
  'Web',
  'Database',
  'Cache',
  'Queue',
  'Search',
  'Debug',
  'Mobile',
  'Containers',
  'Custom',
] as const;

export type CategoryFilter = (typeof CATEGORIES)[number];
