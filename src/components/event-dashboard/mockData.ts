import type {
  DashboardKpis,
  TimeSeriesBucket,
  LeaderboardEntry,
  DistributionSlice,
  ParticipantRow,
  ActivityItem,
} from './types';

const REGION_COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(270, 70%, 60%)',
  'hsl(180, 70%, 45%)',
  'hsl(330, 80%, 55%)',
];

export const MOCK_KPIS: DashboardKpis = {
  totalPosts: 1247,
  activeRegions: 18,
  trackedCount: 379,
  allCodesTracked: 403,
  last5min: 23,
  uniquePosters: 156,
};

export const MOCK_TIME_SERIES: TimeSeriesBucket[] = [
  { time: '13:00', posts: 8, posters: 5 },
  { time: '13:05', posts: 12, posters: 7 },
  { time: '13:10', posts: 6, posters: 4 },
  { time: '13:15', posts: 15, posters: 9 },
  { time: '13:20', posts: 22, posters: 12 },
  { time: '13:25', posts: 18, posters: 10 },
  { time: '13:30', posts: 25, posters: 14 },
  { time: '13:35', posts: 20, posters: 11 },
  { time: '13:40', posts: 30, posters: 16 },
  { time: '13:45', posts: 27, posters: 15 },
  { time: '13:50', posts: 35, posters: 18 },
  { time: '13:55', posts: 23, posters: 13 },
];

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, regionId: '01-10111', label: 'Libertador', count: 187 },
  { rank: 2, regionId: '13-1304', label: 'Baruta', count: 142 },
  { rank: 3, regionId: '02-201', label: 'Anaco', count: 98 },
  { rank: 4, regionId: '08-801', label: 'Valencia', count: 76 },
  { rank: 5, regionId: '15-1501', label: 'Maracaibo', count: 63 },
];

export const MOCK_DISTRIBUTION: DistributionSlice[] = [
  { name: 'Libertador', value: 187, fill: REGION_COLORS[0] },
  { name: 'Baruta', value: 142, fill: REGION_COLORS[1] },
  { name: 'Anaco', value: 98, fill: REGION_COLORS[2] },
  { name: 'Valencia', value: 76, fill: REGION_COLORS[3] },
  { name: 'Maracaibo', value: 63, fill: REGION_COLORS[4] },
  { name: 'Iribarren', value: 51, fill: REGION_COLORS[5] },
  { name: 'Others', value: 630, fill: 'hsl(0, 0%, 70%)' },
];

export const MOCK_PARTICIPANTS: ParticipantRow[] = [
  { rank: 1, regionId: '01-10111', label: 'Libertador', hashtag: '01-10111', count: 187, isActive: true },
  { rank: 2, regionId: '13-1304', label: 'Baruta', hashtag: '13-1304', count: 142, isActive: true },
  { rank: 3, regionId: '02-201', label: 'Anaco', hashtag: '02-201', count: 98, isActive: false },
  { rank: 4, regionId: '08-801', label: 'Valencia', hashtag: '08-801', count: 76, isActive: true },
  { rank: 5, regionId: '15-1501', label: 'Maracaibo', hashtag: '15-1501', count: 63, isActive: false },
  { rank: 6, regionId: '11-1101', label: 'Iribarren', hashtag: '11-1101', count: 51, isActive: true },
  { rank: 7, regionId: '03-301', label: 'Tucupita', hashtag: '03-301', count: 44, isActive: false },
  { rank: 8, regionId: '14-1401', label: 'Maturín', hashtag: '14-1401', count: 38, isActive: true },
  { rank: 9, regionId: '06-601', label: 'San Carlos', hashtag: '06-601', count: 31, isActive: false },
  { rank: 10, regionId: '04-401', label: 'San Fernando', hashtag: '04-401', count: 28, isActive: false },
  { rank: 11, regionId: '09-901', label: 'Coro', hashtag: '09-901', count: 25, isActive: true },
  { rank: 12, regionId: '10-1001', label: 'Guanare', hashtag: '10-1001', count: 22, isActive: false },
  { rank: 13, regionId: '16-1601', label: 'La Asunción', hashtag: '16-1601', count: 19, isActive: false },
  { rank: 14, regionId: '18-1801', label: 'San Cristóbal', hashtag: '18-1801', count: 17, isActive: true },
  { rank: 15, regionId: '20-2001', label: 'San Felipe', hashtag: '20-2001', count: 14, isActive: false },
  { rank: 16, regionId: '22-2201', label: 'Carúpano', hashtag: '22-2201', count: 12, isActive: false },
  { rank: 17, regionId: '23-2301', label: 'Valera', hashtag: '23-2301', count: 10, isActive: false },
  { rank: 18, regionId: '12-1201', label: 'Los Teques', hashtag: '12-1201', count: 9, isActive: true },
  { rank: 19, regionId: '05-501', label: 'Barcelona', hashtag: '05-501', count: 7, isActive: false },
  { rank: 20, regionId: '17-1701', label: 'Puerto Ayacucho', hashtag: '17-1701', count: 5, isActive: false },
];

const now = Math.floor(Date.now() / 1000);

export const MOCK_ACTIVITY: ActivityItem[] = [
  { id: 'a1', pubkey: 'abc1', content: 'Participando desde Libertador. Vamos Venezuela!', created_at: now - 30, regionLabel: 'Libertador' },
  { id: 'a2', pubkey: 'abc2', content: 'Reporte desde Baruta, todo en orden.', created_at: now - 90, regionLabel: 'Baruta' },
  { id: 'a3', pubkey: 'abc3', content: 'Actividad registrada en Anaco.', created_at: now - 180, regionLabel: 'Anaco' },
  { id: 'a4', pubkey: 'abc4', content: 'Verificando desde Valencia.', created_at: now - 240, regionLabel: 'Valencia' },
  { id: 'a5', pubkey: 'abc5', content: 'Presente desde Maracaibo, reportando sin novedad.', created_at: now - 320, regionLabel: 'Maracaibo' },
  { id: 'a6', pubkey: 'abc6', content: 'Confirmando actividad en Iribarren.', created_at: now - 410, regionLabel: 'Iribarren' },
  { id: 'a7', pubkey: 'abc7', content: 'Reporte enviado desde Maturín.', created_at: now - 520, regionLabel: 'Maturín' },
  { id: 'a8', pubkey: 'abc8', content: 'Todo bien en San Cristóbal.', created_at: now - 640, regionLabel: 'San Cristóbal' },
  { id: 'a9', pubkey: 'abc9', content: 'Actividad desde Coro.', created_at: now - 780, regionLabel: 'Coro' },
  { id: 'a10', pubkey: 'abc10', content: 'Participación activa en Los Teques.', created_at: now - 900, regionLabel: 'Los Teques' },
  { id: 'a11', pubkey: 'abc11', content: 'Reporte desde Tucupita.', created_at: now - 1020, regionLabel: 'Tucupita' },
  { id: 'a12', pubkey: 'abc12', content: 'Verificando en San Carlos.', created_at: now - 1150, regionLabel: 'San Carlos' },
  { id: 'a13', pubkey: 'abc13', content: 'Desde San Fernando, todo en calma.', created_at: now - 1280, regionLabel: 'San Fernando' },
  { id: 'a14', pubkey: 'abc14', content: 'Presente en Guanare.', created_at: now - 1400, regionLabel: 'Guanare' },
  { id: 'a15', pubkey: 'abc15', content: 'Actividad reportada desde La Asunción.', created_at: now - 1550, regionLabel: 'La Asunción' },
];
