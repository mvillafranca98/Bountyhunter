import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'

/* ─── Inline SVG icons ────────────────────────────────────────────────────── */
const IconSearch = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
  </svg>
)
const IconSparkle = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.09 6.26L21 12l-6.91 2.74L12 21l-2.09-6.26L3 12l6.91-2.74z"/>
  </svg>
)
const IconDoc = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const IconBell = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
  </svg>
)
const IconExtension = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
  </svg>
)
const IconTarget = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
)
const IconDownload = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
  </svg>
)
const IconTimeline = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
  </svg>
)
const IconChart = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IconLinkedIn = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
    <circle cx="4" cy="4" r="2"/>
  </svg>
)
const IconQuestion = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/>
    <path strokeLinecap="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/>
  </svg>
)
const IconGitHub = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
  </svg>
)
const IconMenu = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
  </svg>
)
const IconX = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
  </svg>
)

/* ─── Animation variants ──────────────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (delay = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay, ease: [0.2, 0, 0, 1] } }),
}
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}
const cardVariant = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0, 0, 1] } },
}

/* ─── Scroll-animated section wrapper ────────────────────────────────────── */
function ScrollReveal({ children, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} className={className}>
      {children}
    </motion.div>
  )
}

/* ─── Nav ─────────────────────────────────────────────────────────────────── */
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'glass-dark border-b border-surface-600/60' : ''}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-md bg-gradient-cobalt flex items-center justify-center flex-shrink-0">
            <span className="font-display font-bold text-white text-sm">B</span>
          </div>
          <span className="font-display font-semibold text-ink-primary text-base tracking-tight">BountyHunter</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-3">
          <Link to="/login" className="btn-ghost text-sm">Sign in</Link>
          <Link to="/register" className="btn-primary text-sm">Get started free</Link>
        </div>

        {/* Mobile hamburger */}
        <button className="sm:hidden btn-ghost p-2" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">
          {open ? <IconX /> : <IconMenu />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          className="sm:hidden glass-dark border-t border-surface-600/60 px-4 py-4 flex flex-col gap-3"
        >
          <Link to="/login" className="btn-ghost w-full justify-start" onClick={() => setOpen(false)}>Sign in</Link>
          <Link to="/register" className="btn-primary w-full justify-center" onClick={() => setOpen(false)}>Get started free</Link>
        </motion.div>
      )}
    </nav>
  )
}

/* ─── Hero ────────────────────────────────────────────────────────────────── */
function Hero() {
  const metrics = [
    { label: '9 sources + ATS watchlist', top: '18%', right: '6%' },
    { label: '10-dimension scoring', top: '55%', left: '3%' },
    { label: 'STAR interview prep included', bottom: '20%', right: '5%' },
  ]

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-brand overflow-hidden pt-16">
      {/* Ambient glow blobs */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-cobalt/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet/15 rounded-full blur-3xl pointer-events-none" />

      {/* Floating metric chips — hidden on small screens */}
      {metrics.map((m) => (
        <motion.div
          key={m.label}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4 + Math.random() * 2, repeat: Infinity, ease: 'easeInOut' }}
          className="hidden lg:flex absolute glass border border-surface-500/50 rounded-full px-3.5 py-1.5 text-xs font-medium font-display text-ink-secondary items-center gap-2"
          style={{ top: m.top, bottom: m.bottom, left: m.left, right: m.right }}
        >
          <span className="glow-dot" />
          {m.label}
        </motion.div>
      ))}

      {/* Main content */}
      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
          <span className="section-label mb-6 block">AI Job Copilot</span>
        </motion.div>

        <motion.h1
          variants={fadeUp} initial="hidden" animate="visible" custom={0.1}
          className="font-display text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-6"
        >
          <span className="text-ink-primary">Hunt smarter.</span>
          <br />
          <span className="bg-gradient-cta bg-clip-text text-transparent">Land faster.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp} initial="hidden" animate="visible" custom={0.2}
          className="text-ink-secondary text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed"
        >
          BountyHunter scans 9 job platforms + company career pages, scores every role across 10 dimensions, and generates tailored applications with STAR interview prep — automatically.
        </motion.p>

        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={0.3}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8"
        >
          <Link to="/register" className="btn-primary text-base px-7 py-3">Start hunting free</Link>
          <a href="#how-it-works" className="btn-secondary text-base px-7 py-3">See how it works</a>
        </motion.div>

        <motion.p
          variants={fadeUp} initial="hidden" animate="visible" custom={0.4}
          className="text-ink-muted text-sm"
        >
          No credit card&nbsp;&nbsp;·&nbsp;&nbsp;9 sources + ATS watchlist&nbsp;&nbsp;·&nbsp;&nbsp;Remote filter built-in
        </motion.p>
      </div>
    </section>
  )
}

/* ─── Source strip ────────────────────────────────────────────────────────── */
const SOURCES = ['Remotive', 'Arbeitnow', 'RemoteOK', 'HackerNews', 'Himalayas', 'The Muse', 'Jobicy', 'Google Jobs', 'JSearch', 'Greenhouse', 'Lever', 'Ashby', 'Wellfound']

function SourceStrip() {
  return (
    <section className="bg-surface-950 border-y border-surface-600/50 py-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="flex items-center gap-4 mb-6 justify-center">
          <div className="h-px flex-1 max-w-20 bg-surface-600" />
          <span className="section-label">Aggregating jobs from</span>
          <div className="h-px flex-1 max-w-20 bg-surface-600" />
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          {SOURCES.map((s) => (
            <span key={s} className="px-3 py-1.5 rounded-full bg-surface-800 border border-surface-600 text-ink-secondary text-sm font-medium font-display">
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Core capabilities ───────────────────────────────────────────────────── */
const CAPABILITIES = [
  {
    icon: <IconSearch />,
    title: '9-source + company scan',
    desc: 'Queries Remotive, Google Jobs, HackerNews, and 6 more — plus scrapes Greenhouse, Lever, and Ashby career pages for companies you follow.',
  },
  {
    icon: <IconSparkle />,
    title: '10-dimension AI scoring',
    desc: 'Claude scores every job across 10 axes: skills, seniority, work type, salary, industry, culture signals, and more. Remote vs hybrid vs on-site is always detected.',
  },
  {
    icon: <IconDoc />,
    title: 'One-click applications',
    desc: 'Tailored resume + cover letter generated per job. Download as ATS-friendly .docx or auto-apply. Subscription-gated jobs are flagged before you waste time.',
  },
]

function Capabilities() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <section className="py-24 bg-surface-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <ScrollReveal className="text-center mb-16">
          <h2 className="font-display text-h2 font-bold text-ink-primary">Every angle covered — from search to offer</h2>
        </ScrollReveal>
        <motion.div ref={ref} variants={stagger} initial="hidden" animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CAPABILITIES.map((c) => (
            <motion.div key={c.title} variants={cardVariant} className="card-hover p-6 flex flex-col gap-4">
              <div className="w-11 h-11 rounded-xl bg-cobalt/15 border border-cobalt/30 flex items-center justify-center text-cobalt-light">
                {c.icon}
              </div>
              <div>
                <h3 className="font-display font-semibold text-ink-primary text-base mb-2">{c.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed">{c.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── How it works ────────────────────────────────────────────────────────── */
const STEPS = [
  { n: '1', title: 'Upload your resume', desc: 'Claude parses your PDF and builds a Harvard-style master resume, LinkedIn copy, and skill profile.' },
  { n: '2', title: 'Set your targets', desc: 'Choose roles, salary range, work type (remote / hybrid / on-site), and add companies to your watchlist.' },
  { n: '3', title: 'Hunt', desc: 'We scan 9 job boards + your watched companies on Greenhouse, Lever, and Ashby. Every match is scored across 10 dimensions.' },
  { n: '4', title: 'Apply', desc: 'Review your tailored resume + cover letter, prep with STAR interview questions, then apply or auto-submit.' },
]

function HowItWorks() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <section id="how-it-works" className="py-24 bg-surface-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <ScrollReveal className="text-center mb-16">
          <h2 className="font-display text-h2 font-bold text-ink-primary">From search to application in minutes</h2>
        </ScrollReveal>

        <motion.div ref={ref} variants={stagger} initial="hidden" animate={inView ? 'visible' : 'hidden'}
          className="relative grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-4">
          {/* Connecting line — desktop only */}
          <div className="hidden md:block absolute top-6 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-cobalt via-violet to-cobalt-light opacity-40" />

          {STEPS.map((s) => (
            <motion.div key={s.n} variants={cardVariant} className="relative flex flex-col items-center text-center gap-4 px-2">
              <div className="relative z-10 w-12 h-12 rounded-full bg-gradient-cobalt flex items-center justify-center flex-shrink-0 shadow-glow-cobalt">
                <span className="font-display font-bold text-white text-base">{s.n}</span>
              </div>
              <div>
                <h4 className="font-display font-semibold text-ink-primary text-sm mb-1.5">{s.title}</h4>
                <p className="text-ink-muted text-sm leading-relaxed">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Feature grid ────────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: <IconBell />,      title: 'Daily company watchlist scan', desc: 'Add companies by ATS slug. BountyHunter hits Greenhouse, Lever, and Ashby every morning and drops new openings into your queue automatically.' },
  { icon: <IconTarget />,    title: '10-dimension fit scoring',      desc: 'Skills, seniority, work type, salary, industry, growth potential, culture signals — each scored 0–10. No more guessing why a job "feels off".' },
  { icon: <IconSparkle />,   title: 'Remote / hybrid / on-site filter', desc: 'Work type is detected from every job description. Set remote-only in preferences and on-site jobs never reach your queue.' },
  { icon: <IconQuestion />,  title: 'STAR interview prep',           desc: 'After scoring, Claude generates 7 role-specific questions — 3 behavioral with full STAR answers, 2 technical, 1 situational, 1 company-specific.' },
  { icon: <IconDoc />,       title: 'Subscription job detection',    desc: 'Jobs requiring paid subscriptions are flagged with a 💳 badge. Hidden by default — toggle to include when you have access.' },
  { icon: <IconDownload />,  title: '.docx resume download',         desc: 'Tailored per job, ATS-safe, Harvard format. Mirrors exact keywords from the job description for maximum pass-through rate.' },
  { icon: <IconTimeline />,  title: 'Application timeline',          desc: 'Every status change, note, and resume version logged per job. Know exactly where every application stands.' },
  { icon: <IconChart />,     title: 'Analytics dashboard',           desc: 'Score distribution, source breakdown, response rates. See which platforms are actually sending you callbacks.' },
  { icon: <IconExtension />, title: 'Chrome extension',              desc: 'Import any job from any page with one click. Claude scores it against your resume instantly.' },
  { icon: <IconLinkedIn />,  title: 'Embedding pre-filter',          desc: 'Semantic similarity check runs before Claude. Irrelevant jobs are filtered in milliseconds — no API call, no wasted cost.' },
]

function FeatureGrid() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <section className="py-24 bg-surface-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <ScrollReveal className="text-center mb-16">
          <h2 className="font-display text-h2 font-bold text-ink-primary">Everything serious job hunters actually need</h2>
        </ScrollReveal>
        <motion.div ref={ref} variants={stagger} initial="hidden" animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <motion.div key={f.title} variants={cardVariant}
              className="card flex items-start gap-4 p-5">
              <div className="w-9 h-9 rounded-lg bg-surface-700 border border-surface-500 flex items-center justify-center text-cobalt-light flex-shrink-0">
                {f.icon}
              </div>
              <div>
                <p className="font-display font-semibold text-ink-primary text-sm mb-0.5">{f.title}</p>
                <p className="text-ink-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── CTA band ────────────────────────────────────────────────────────────── */
function CTABand() {
  return (
    <section className="py-24 bg-gradient-cobalt">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
        <ScrollReveal>
          <h2 className="font-display text-h2 font-bold text-white mb-4">Ready to hunt smarter?</h2>
          <p className="text-white/70 text-lg mb-10 leading-relaxed">
            9 job boards + ATS career pages. 10-dimension scoring. STAR interview prep. Remote filter. All in one tool — free to start.
          </p>
          <Link to="/register"
            className="inline-flex items-center justify-center gap-2 bg-white text-cobalt font-semibold font-display px-8 py-3.5 rounded-lg text-base shadow-glow-cobalt transition-all duration-200 hover:bg-ink-primary hover:-translate-y-px active:translate-y-0">
            Get started free
          </Link>
        </ScrollReveal>
      </div>
    </section>
  )
}

/* ─── Footer ──────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="bg-surface-950 border-t-2 border-cobalt/60">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gradient-cobalt flex items-center justify-center">
            <span className="font-display font-bold text-white text-sm">B</span>
          </div>
          <div>
            <p className="font-display font-semibold text-ink-primary text-sm leading-none">BountyHunter</p>
            <p className="text-ink-muted text-xs mt-0.5">AI Job Copilot</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <Link to="/login" className="text-ink-muted hover:text-ink-primary text-sm transition-colors duration-200">Sign in</Link>
          <Link to="/register" className="text-ink-muted hover:text-ink-primary text-sm transition-colors duration-200">Register</Link>
          <a href="https://github.com/mvillafranca98/Bountyhunter" target="_blank" rel="noopener noreferrer"
            className="text-ink-muted hover:text-ink-primary text-sm flex items-center gap-1.5 transition-colors duration-200">
            <IconGitHub /> GitHub
          </a>
        </div>
      </div>

      <div className="border-t border-surface-800 py-4 text-center">
        <p className="text-ink-muted text-xs">© 2026 BountyHunter. Built on Cloudflare Workers.</p>
      </div>
    </footer>
  )
}

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default function Landing() {
  return (
    <div className="min-h-screen bg-surface-950 text-ink-primary">
      <Nav />
      <Hero />
      <SourceStrip />
      <Capabilities />
      <HowItWorks />
      <FeatureGrid />
      <CTABand />
      <Footer />
    </div>
  )
}
