'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  LineChart,
  Menu,
  Moon,
  PanelLeftClose,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Upload,
  UserRound,
  X,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const prices = [
  { date: 'Jan 08', price: 102, sma: 99, ema: 100 },
  { date: 'Jan 15', price: 104, sma: 100, ema: 101 },
  { date: 'Jan 22', price: 103, sma: 101, ema: 102 },
  { date: 'Jan 29', price: 108, sma: 102, ema: 104 },
  { date: 'Feb 05', price: 111, sma: 104, ema: 106 },
  { date: 'Feb 12', price: 110, sma: 106, ema: 108 },
  { date: 'Feb 19', price: 115, sma: 108, ema: 110 },
  { date: 'Feb 26', price: 118, sma: 111, ema: 113 },
  { date: 'Mar 05', price: 116, sma: 113, ema: 115 },
  { date: 'Mar 12', price: 121, sma: 115, ema: 117 },
  { date: 'Mar 19', price: 124, sma: 118, ema: 120 },
  { date: 'Mar 26', price: 122, sma: 120, ema: 121 },
  { date: 'Apr 02', price: 127, sma: 122, ema: 124 },
]

const confidence = [
  { date: 'Jan', value: 58 }, { date: 'Feb', value: 61 }, { date: 'Mar', value: 64 },
  { date: 'Apr', value: 62 }, { date: 'May', value: 68 }, { date: 'Jun', value: 71 },
  { date: 'Jul', value: 69 }, { date: 'Aug', value: 73 }, { date: 'Sep', value: 72 },
]

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Research Workbench', icon: LineChart, active: true },
  { label: 'Model Lab', icon: BrainCircuit },
  { label: 'Backtesting Studio', icon: FlaskConical },
  { label: 'Portfolio Risk', icon: ShieldCheck },
  { label: 'Experiments', icon: Activity },
  { label: 'Data Sources', icon: Database },
  { label: 'Reports', icon: BookOpen },
]

function Metric({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: 'default' | 'positive' | 'warning' }) {
  return (
    <div className="metric">
      <span className="eyebrow">{label}</span>
      <strong className={tone === 'positive' ? 'positive' : tone === 'warning' ? 'warning' : ''}>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  )
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <button aria-label={on ? 'Disable analysis' : 'Enable analysis'} className={`switch ${on ? 'on' : ''}`} onClick={onToggle}><span /></button>
}

function Sidebar({ collapsed, setCollapsed, active, setActive }: { collapsed: boolean; setCollapsed: (v: boolean) => void; active: string; setActive: (v: string) => void }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><span>Q</span></div>
        {!collapsed && <div><div className="brand-name">QuantPilot</div><div className="brand-sub">RESEARCH TERMINAL</div></div>}
        <button className="icon-button sidebar-toggle" aria-label="Collapse sidebar" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight /> : <PanelLeftClose />}</button>
      </div>
      <div className="workspace-pill"><div className="workspace-dot" />{!collapsed && <><span>Demo Workspace</span><ChevronDown className="tiny-icon" /></>}</div>
      <nav className="nav-list">
        <div className="nav-label">Workspace</div>
        {navItems.map(({ label, icon: Icon, active: isDefault }) => {
          const selected = active === label || (!active && isDefault)
          return <button key={label} className={`nav-item ${selected ? 'selected' : ''}`} onClick={() => setActive(label)} title={collapsed ? label : undefined}><Icon />{!collapsed && <span>{label}</span>}{selected && !collapsed && <span className="active-indicator" />}</button>
        })}
        <div className="nav-label nav-label-spaced">System</div>
        <button className={`nav-item ${active === 'Settings' ? 'selected' : ''}`} onClick={() => setActive('Settings')} title={collapsed ? 'Settings' : undefined}><Settings />{!collapsed && <span>Settings</span>}</button>
      </nav>
      <div className="sidebar-bottom">
        {!collapsed && <div className="status-box"><div className="status-line"><span className="status-dot" />System operational</div><span>All services responding normally</span></div>}
        <button className="profile"><div className="avatar">AR</div>{!collapsed && <div className="profile-copy"><strong>Alex Rivera</strong><span>Researcher</span></div>} {!collapsed && <ChevronRight className="profile-chevron" />}</button>
      </div>
    </aside>
  )
}

export default function Page() {
  const [collapsed, setCollapsed] = useState(false)
  const [active, setActive] = useState('Research Workbench')
  const [dark, setDark] = useState(true)
  const [trend, setTrend] = useState(true)
  const [momentum, setMomentum] = useState(true)
  const [volume, setVolume] = useState(true)
  const [risk, setRisk] = useState(true)
  const [shortSma, setShortSma] = useState(20)
  const [threshold, setThreshold] = useState(65)
  const [running, setRunning] = useState(false)
  const [range, setRange] = useState('6M')

  const signalLabel = useMemo(() => threshold <= 65 ? 'Research candidate' : 'No signal', [threshold])

  return (
    <div className={`app-shell ${dark ? 'dark' : 'light'}`}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} active={active} setActive={setActive} />
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Research</span><ChevronRight /><strong>{active}</strong></div>
          <div className="topbar-actions">
            <div className="freshness"><span className="status-dot" />Data current <span className="muted">· 2m ago</span></div>
            <button className="top-icon" aria-label="Search"><Search /></button>
            <button className="top-icon" aria-label="Notifications"><Bell /></button>
            <button className="top-icon" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</button>
            <div className="top-avatar">AR</div>
          </div>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div><div className="kicker"><span className="demo-badge">DEMO DATA</span><span>Last analysis · Today, 09:42 UTC</span></div><h1>Research Workbench</h1><p>Inspect market behavior, validate signals, and document your research.</p></div>
            <div className="heading-actions"><button className="button secondary"><RefreshCw data-icon="inline-start" />Reset</button><button className="button primary" onClick={() => { setRunning(true); setTimeout(() => setRunning(false), 900) }}><Play data-icon="inline-start" />{running ? 'Running…' : 'Run analysis'}</button></div>
          </div>

          <section className="instrument-bar panel">
            <div className="instrument-main"><div className="ticker">DEMO</div><div><div className="instrument-title">Demo Asset <span className="asset-type">Synthetic series</span></div><div className="instrument-meta"><span className="status-dot" />Synthetic demo data <span className="separator">·</span> Daily <span className="separator">·</span> Jan 08 – Apr 02, 2025</div></div></div>
            <div className="instrument-stats"><div><span>Latest close</span><strong>$127.42</strong></div><div><span>Period return</span><strong className="positive">+24.9%</strong></div><div><span>Observations</span><strong>312</strong></div><button className="icon-button"><SlidersHorizontal /></button></div>
          </section>

          <div className="workspace-grid">
            <aside className="config-panel panel">
              <div className="panel-heading"><div><span className="eyebrow">Configuration</span><h2>Analysis inputs</h2></div><button className="icon-button"><CircleHelp /></button></div>
              <div className="config-section"><div className="section-title">Instrument & range</div><label className="field-label">Asset label<input value="DEMO" readOnly /></label><div className="field-row"><label className="field-label">From<input value="2025-01-08" readOnly /></label><label className="field-label">To<input value="2025-04-02" readOnly /></label></div><div className="range-tabs">{['1M', '3M', '6M', '1Y', 'All'].map(item => <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>)}</div></div>
              <div className="config-section"><div className="section-title">Analysis modules</div><div className="toggle-row"><div><strong>Trend analysis</strong><span>SMA, EMA, MACD, ADX</span></div><Switch on={trend} onToggle={() => setTrend(!trend)} /></div><div className="toggle-row"><div><strong>Momentum analysis</strong><span>RSI, ROC, stochastic</span></div><Switch on={momentum} onToggle={() => setMomentum(!momentum)} /></div><div className="toggle-row"><div><strong>Volume analysis</strong><span>Relative volume, OBV</span></div><Switch on={volume} onToggle={() => setVolume(!volume)} /></div><div className="toggle-row"><div><strong>Risk analysis</strong><span>Volatility, drawdown, VaR</span></div><Switch on={risk} onToggle={() => setRisk(!risk)} /></div></div>
              <div className="config-section"><div className="section-title">Key parameters <button className="link-button">Reset defaults</button></div><label className="field-label">Short SMA period <span className="input-suffix"><input type="number" value={shortSma} onChange={e => setShortSma(Number(e.target.value))} /><em>days</em></span></label><label className="field-label">Long SMA period <span className="input-suffix"><input value="50" readOnly /><em>days</em></span></label><label className="field-label">RSI lookback <span className="input-suffix"><input value="14" readOnly /><em>days</em></span></label><label className="field-label">Forecast horizon <span className="input-suffix"><input value="5" readOnly /><em>days</em></span></label><label className="field-label">Probability threshold <span className="input-suffix"><input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} /><em>%</em></span></label></div>
              <button className="advanced-row"><SlidersHorizontal />Advanced parameters <ChevronRight /></button>
            </aside>

            <div className="analysis-canvas">
              <section className="signal-card panel"><div className="signal-copy"><div className="eyebrow">MODEL ASSESSMENT <span className="info-dot">i</span></div><h2>Probability of positive return</h2><p>Probability that DEMO&apos;s close-to-close return over the next 5 trading sessions exceeds 0%.</p><div className="signal-meta"><span><span className="status-dot" />Calibrated</span><span>Test window · 62 observations</span><span>Logistic Regression · v0.4</span></div></div><div className="probability"><div className="probability-number">68<span>%</span></div><div className="probability-label">estimated probability</div><div className="signal-status"><span className="positive-dot" />{signalLabel}</div></div></section>

              <section className="chart-panel panel"><div className="chart-header"><div><div className="panel-title-row"><h2>Price & indicators</h2><span className="data-chip">DEMO / DAILY</span></div><p className="panel-subtitle">Historical close with configured trend overlays</p></div><div className="chart-actions"><button className="chart-action"><span className="legend-line close" />Close</button><button className="chart-action"><span className="legend-line sma" />SMA {shortSma}</button><button className="chart-action"><span className="legend-line ema" />EMA 12</button><button className="icon-button"><MaximizeIcon /></button></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height={280}><RechartsLineChart data={prices} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" stroke="var(--chart-axis)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><YAxis domain={['dataMin - 5', 'dataMax + 5']} stroke="var(--chart-axis)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={value => `$${value}`} /><Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12 }} /><Line type="monotone" dataKey="price" stroke="var(--accent-blue)" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="sma" stroke="var(--chart-sma)" strokeWidth={1.5} dot={false} strokeDasharray="5 4" /><Line type="monotone" dataKey="ema" stroke="var(--chart-ema)" strokeWidth={1.5} dot={false} /></RechartsLineChart></ResponsiveContainer></div><div className="chart-footer"><span><span className="info-dot">i</span> Historical values are synthetic demo data</span><span>Source: Demo Data Provider</span></div></section>

              <div className="metric-strip panel"><Metric label="Realized volatility" value="18.4%" detail="20-day annualized" /><Metric label="Maximum drawdown" value="−8.2%" detail="Full sample" tone="warning" /><Metric label="RSI (14)" value="61.8" detail="Neutral · 30 / 70" /><Metric label="Trend strength" value="+0.74" detail="ADX · Strong" tone="positive" /><Metric label="Relative volume" value="1.12×" detail="20-day average" /></div>

              <div className="lower-grid"><section className="confidence-panel panel"><div className="panel-header"><div><h2>Model confidence</h2><p className="panel-subtitle">Out-of-sample calibration history</p></div><button className="icon-button"><CircleHelp /></button></div><div className="confidence-score"><strong>0.71</strong><span>Brier score <small>lower is better</small></span><span className="positive-tag">Good calibration</span></div><ResponsiveContainer width="100%" height={120}><AreaChart data={confidence} margin={{ top: 10, right: 4, left: -24, bottom: 0 }}><defs><linearGradient id="confidenceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent-blue)" stopOpacity={0.18} /><stop offset="100%" stopColor="var(--accent-blue)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" hide /><YAxis domain={[45, 85]} hide /><Area type="monotone" dataKey="value" stroke="var(--accent-blue)" fill="url(#confidenceFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer><div className="chart-footer"><span>9 rolling test windows</span><span className="positive">+4.2% vs baseline</span></div></section><section className="checks-panel panel"><div className="panel-header"><div><h2>Signal logic</h2><p className="panel-subtitle">Transparent decision checklist</p></div><button className="button small secondary">Explain</button></div><div className="check-list"><div><span className="check-icon"><Check /></span><span><strong>Probability threshold</strong><small>68% meets configured 65% threshold</small></span><b className="positive">Passed</b></div><div><span className="check-icon"><Check /></span><span><strong>Trend confirmation</strong><small>Price above SMA 20 and SMA 50</small></span><b className="positive">Passed</b></div><div><span className="check-icon muted-check"><Check /></span><span><strong>Risk guardrail</strong><small>Drawdown within −15% limit</small></span><b className="positive">Passed</b></div><div><span className="warning-icon"><AlertTriangle /></span><span><strong>Data sufficiency</strong><small>312 observations available</small></span><b className="warning">Review</b></div></div></section></div>

              <section className="recent-panel panel"><div className="panel-header"><div><h2>Recent research runs</h2><p className="panel-subtitle">Persisted experiment history</p></div><button className="button small secondary">View all <ChevronRight data-icon="inline-end" /></button></div><div className="run-table"><div className="run-row run-head"><span>Run</span><span>Configuration</span><span>Status</span><span>Created</span><span /></div><div className="run-row"><span className="run-name"><span className="run-dot blue" />DEMO · Baseline trend</span><span>20 / 50 SMA · 5d horizon</span><span><span className="table-status complete">Completed</span></span><span>Today, 09:42</span><button className="row-more">•••</button></div><div className="run-row"><span className="run-name"><span className="run-dot purple" />DEMO · Momentum sweep</span><span>RSI 14 · ROC 20 · 5d horizon</span><span><span className="table-status complete">Completed</span></span><span>Yesterday, 16:18</span><button className="row-more">•••</button></div><div className="run-row"><span className="run-name"><span className="run-dot amber" />DEMO · Volatility check</span><span>ATR 14 · Bollinger 20 · 1d horizon</span><span><span className="table-status draft">Draft</span></span><span>Mar 28, 11:04</span><button className="row-more">•••</button></div></div></section>

              <footer className="disclosure"><AlertTriangle /><span>QuantPilot is a historical research and paper simulation tool. Outputs are estimates based on available data and are not financial advice or guarantees of future performance.</span><button className="link-button">Learn more</button></footer>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function MaximizeIcon() { return <span className="maximize-icon"><span /><span /><span /><span /></span> }

void Zap; void Gauge; void Upload; void Plus; void Menu; void X; void UserRound; void BarChart3

