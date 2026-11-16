import { QuantDashboard } from '@/components/quant-dashboard'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return <QuantDashboard user={{ name: 'Test User', email: 'test@quantpilot.dev' }} />
}
