# BountyHunter — Integration Options & Cost/Benefit Analysis

## Current State (What We Have Now)

| Source | Cost | Avg Jobs/Search | Quality | Notes |
|--------|------|-----------------|---------|-------|
| Remotive | $0 | 5-15 | Good | Remote-only tech jobs |
| Arbeitnow | $0 | 5-20 | Medium | EU-focused, some US |
| RemoteOK | $0 | 5-15 | Good | Remote tech/startup |
| Jobicy | $0 | 3-10 | Medium | Remote-only, smaller board |
| TheMuse | $0 | 5-15 | Medium | US corporate, entry-mid level |
| JSearch (RapidAPI) | $0 (free tier) | 0-10 | Low-Medium | 500 req/mo, often sparse results |

**Total cost: $0/mo**
**Coverage: ~5-10% of available jobs**
**Best for: Remote tech roles, startup jobs**
**Weakness: No LinkedIn, Indeed, Glassdoor, or company career pages**

---

## Free Integrations (Recommended First)

### 1. SerpAPI — Google Jobs
| Detail | Info |
|--------|------|
| **What it does** | Queries Google Jobs, which aggregates from LinkedIn, Indeed, Glassdoor, ZipRecruiter, Dice, CareerBuilder, and thousands of company career pages |
| **Cost** | $0 (free tier: 100 searches/month) |
| **Paid tiers** | $50/mo (5,000 searches), $130/mo (15,000) |
| **Jobs per search** | 10-40 results per query |
| **Coverage boost** | Massive — one API covers 80%+ of all online job listings |
| **Implementation time** | ~30 minutes |
| **Limitations** | Free tier is 100 searches/month — need to be strategic (save for deep searches) |
| **Quality** | High — these are the same results Google shows users |

**Verdict: Best ROI of any integration. Even the free tier is transformative.**

### 2. HackerNews "Who's Hiring" (Algolia API)
| Detail | Info |
|--------|------|
| **What it does** | Scrapes the monthly "Ask HN: Who is Hiring?" threads — hundreds of jobs posted directly by founders and hiring managers |
| **Cost** | $0 (public API, no key needed) |
| **Jobs per search** | 200-500 per monthly thread |
| **Coverage boost** | Niche but high-quality — YC companies, top startups, FAANG |
| **Implementation time** | ~20 minutes |
| **Limitations** | Only updates once a month, tech-focused only |
| **Quality** | Very high — first-party postings, often include salary, direct contact |

**Verdict: Free, easy, high-quality tech jobs. No reason not to add it.**

### 3. Himalayas.app API
| Detail | Info |
|--------|------|
| **What it does** | Remote job board with a free, well-documented API |
| **Cost** | $0 |
| **Jobs per search** | 10-30 |
| **Coverage boost** | Small but complementary — remote roles across all industries |
| **Implementation time** | ~15 minutes |
| **Limitations** | Smaller board, mostly remote |
| **Quality** | Good — curated listings with salary info |

**Verdict: Quick win, adds diversity to results.**

### 4. Adzuna API
| Detail | Info |
|--------|------|
| **What it does** | Aggregates jobs from multiple countries (US, UK, EU, AU, etc.) |
| **Cost** | $0 (free tier: 250 requests/month) |
| **Paid tiers** | Custom pricing for higher volume |
| **Jobs per search** | 20-50 |
| **Coverage boost** | Good international coverage, strong in UK/EU |
| **Implementation time** | ~20 minutes |
| **Limitations** | Free tier limited, need to apply for API access |
| **Quality** | Medium-High — well-structured data with salary estimates |

**Verdict: Good for international coverage, especially EU market.**

### 5. Chrome Extension (Import from Any Page)
| Detail | Info |
|--------|------|
| **What it does** | User browses LinkedIn/Indeed/any site normally, clicks extension button, job gets imported + AI-scored + resume tailored automatically |
| **Cost** | $0 (unpacked) or $5 one-time (Chrome Web Store) |
| **Coverage boost** | Effectively unlimited — every job site becomes a source |
| **Implementation time** | ~1-2 hours |
| **Limitations** | Requires user action (click per job), not automated discovery |
| **Quality** | Same as source — LinkedIn quality for LinkedIn jobs, etc. |

**Verdict: The highest-impact feature. Makes BountyHunter work with 100% of job sites.**

### 6. Bookmarklet (Lightweight Alternative to Extension)
| Detail | Info |
|--------|------|
| **What it does** | User drags a bookmarklet to their toolbar. On any job page, click it to auto-import to BountyHunter |
| **Cost** | $0 |
| **Coverage boost** | Same as Chrome extension |
| **Implementation time** | ~30 minutes |
| **Limitations** | Less polished than extension, no popup UI |
| **Quality** | Same as source |

**Verdict: Fastest way to get "import from anywhere" without building a full extension.**

---

## Paid Integrations (Future Growth)

### 7. SerpAPI Paid Tier
| Detail | Info |
|--------|------|
| **Cost** | $50/mo (5,000 searches) |
| **What you get** | Unlimited-feeling Google Jobs access for all users |
| **When to upgrade** | When you have 50+ active users or free tier runs out |
| **ROI** | $50/mo for access to 80%+ of all job listings — extremely good value |

### 8. ScraperAPI / Bright Data (Web Scraping)
| Detail | Info |
|--------|------|
| **Cost** | $49-$149/mo |
| **What it does** | Proxy network + headless browser for scraping Indeed, Glassdoor, etc. directly |
| **Pros** | Full control, no middleman |
| **Cons** | Fragile (sites change HTML), legal gray area, needs maintenance |
| **When to consider** | Only if SerpAPI isn't enough and you want direct scraping |

### 9. LinkedIn API (Official)
| Detail | Info |
|--------|------|
| **Cost** | $2,000-10,000+/mo (Recruiter/Talent Solutions tier) |
| **What it does** | Official LinkedIn job search + candidate data |
| **Realistic?** | No, not for an indie project. Only for funded companies |
| **Alternative** | SerpAPI captures most LinkedIn jobs via Google indexing |

### 10. Indeed Publisher API
| Detail | Info |
|--------|------|
| **Cost** | $0 (revenue share model — you earn per click) |
| **What it does** | Access to Indeed's full job database |
| **Catch** | Need to apply, get approved, and display Indeed branding |
| **When to consider** | When BountyHunter has real traffic — could actually be a revenue source |

### 11. Reed.co.uk API
| Detail | Info |
|--------|------|
| **Cost** | $0 (free for developers) |
| **Coverage** | UK market, 100,000+ active listings |
| **When to consider** | If targeting UK users |

---

## Comparison: BountyHunter vs Cowork

### Current State (Free APIs Only)

| Capability | Cowork | BountyHunter Now | Winner |
|------------|--------|------------------|--------|
| Job sources | Unlimited (live browser) | 6 free APIs | Cowork |
| Jobs found per search | 50-200+ | 10-50 | Cowork |
| LinkedIn access | Full | None | Cowork |
| Indeed/Glassdoor | Full | None | Cowork |
| Search cost | $0 (uses your Claude sub) | $0 | Tie |
| AI scoring | Yes (per session) | Yes (persistent) | Tie |
| Resume tailoring | Yes | Yes (.docx download) | Tie |
| Job tracking | No (session-based) | Yes (DB, persistent) | BountyHunter |
| Application notes | No | Yes | BountyHunter |
| Job alerts (daily auto) | No | Yes (cron) | BountyHunter |
| Analytics | No | Yes (charts/stats) | BountyHunter |
| Multi-user | No (your machine only) | Yes (anyone can sign up) | BountyHunter |
| Monthly cost | $0-20 (Claude sub) | $0 | Tie |

### After Free Improvements (SerpAPI free + HN + Himalayas + Chrome Extension)

| Capability | Cowork | BountyHunter Improved | Winner |
|------------|--------|----------------------|--------|
| Job sources | Unlimited | 9 APIs + any page via extension | Close |
| Jobs found per search | 50-200+ | 30-100 | Cowork (slight edge) |
| LinkedIn access | Full | Partial (via Google Jobs) | Cowork |
| Indeed/Glassdoor | Full | Partial (via Google Jobs) | Cowork |
| Import from any site | No (manual copy) | Yes (1-click extension) | BountyHunter |
| AI scoring | Per session | Persistent + comparable | Tie |
| Resume tailoring | Per session | Persistent + .docx | BountyHunter |
| Job tracking over time | No | Full (notes, timeline) | BountyHunter |
| Automated daily hunting | No | Yes (cron alerts) | BountyHunter |
| Works while you sleep | No | Yes | BountyHunter |
| Analytics / insights | No | Yes | BountyHunter |
| Multi-user platform | No | Yes | BountyHunter |
| Monthly cost | $0-20 | $0 | Tie |

### After Paid Upgrade (SerpAPI $50/mo)

| Capability | Cowork | BountyHunter Paid | Winner |
|------------|--------|-------------------|--------|
| Job discovery | Unlimited | 80%+ via Google Jobs | Close |
| Workflow automation | No | Full pipeline | BountyHunter |
| Scale to team/users | No | Yes | BountyHunter |
| Cost | $0-20/mo | $50/mo | Cowork |
| Total value | Great for personal use | Platform potential | Depends on goals |

---

## Summary: Where Each Wins

### Cowork is better for:
- One-off deep searches on a specific platform (e.g., "show me all ML jobs on LinkedIn in Austin")
- When you need to browse and interact with a site in real-time
- Personal use where you don't need to track over time
- Zero setup — works immediately

### BountyHunter is better for:
- Ongoing job hunts tracked over weeks/months
- Automated daily searches while you sleep
- Comparing and scoring many jobs against your resume
- Generating tailored resumes per application
- Sharing the tool with other people
- Building a product/business around job search

### The Sweet Spot (Recommended Strategy):
1. **Use Cowork** for initial deep searches on LinkedIn/Indeed
2. **Import interesting finds** into BountyHunter via Chrome extension
3. **Let BountyHunter** handle scoring, resume tailoring, tracking, and daily alerts
4. **They complement each other** — Cowork discovers, BountyHunter manages

---

## Implementation Priority (Free Tier)

| Priority | Integration | Time | Impact | Cost |
|----------|-------------|------|--------|------|
| 1 | SerpAPI (Google Jobs) | 30 min | Massive coverage boost | $0 |
| 2 | Chrome Extension | 1-2 hrs | 100% site coverage | $0-5 |
| 3 | HackerNews Who's Hiring | 20 min | High-quality tech jobs | $0 |
| 4 | Himalayas API | 15 min | More remote jobs | $0 |
| 5 | Adzuna API | 20 min | International coverage | $0 |
| 6 | Bookmarklet | 30 min | Quick import fallback | $0 |

**Total implementation time: ~3-4 hours**
**Total cost: $0-5**
**Expected coverage improvement: From ~5-10% to ~35-50% (search) + 100% (with extension)**

---

## Claude API Cost Estimate (Per User)

Each job scored by Claude costs approximately:
- **Haiku**: ~$0.001 per job scored (cheapest)
- **Sonnet**: ~$0.005 per job scored (current)
- **Opus**: ~$0.025 per job scored (most accurate)

For a user scoring 50 jobs/day:
- **Haiku**: ~$1.50/month
- **Sonnet**: ~$7.50/month
- **Opus**: ~$37.50/month

**Recommendation**: Use Haiku for initial scoring/filtering, Sonnet for detailed analysis of top matches. This keeps costs under $3/user/month.
