export interface Plan {
  id: 'advanced' | 'starter';
  name: string;
  zh: string;
  audience: string;
  price: number;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'advanced',
    name: 'Advanced',
    zh: '高級計劃',
    audience: '適用具 API / EA / MT 帳戶經驗的資深使用者 · For experienced API, EA and MT users',
    price: 25,
    features: ['專用 EA API · Dedicated EA API', '7/24 SIGNAL 低延遲信號源 · 24/7 low-latency signal source', 'Live Positions', 'History'],
  },
  {
    id: 'starter',
    name: 'Starter',
    zh: '初級使用者',
    audience: '一般人均可無痛使用 · Easy for anyone, no setup skills needed',
    price: 50,
    features: ['專用 EA API 安裝 · Dedicated EA API installed for you', 'VPS 7/24 連接 · 24/7 VPS connection', '7/24 SIGNAL 低延遲 · 24/7 low-latency signals', 'Live Positions', 'History'],
  },
];
