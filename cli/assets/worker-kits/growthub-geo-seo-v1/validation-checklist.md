# Validation Checklist

Use this checklist before starting a session, when validating a kit installation, and after producing outputs.

---

## PRE-SESSION CHECKLIST

### Environment
- [ ] geo-seo-claude fork is present at `GEO_SEO_HOME` / `GEO_SEO_FORK_PATH` (default `$HOME/geo-seo-claude`) — OR agent-only mode is confirmed
- [ ] Python 3.8+ is installed (`python3 --version`)
- [ ] Playwright is installed (`playwright --version`)
- [ ] Playwright chromium browser is installed (`playwright install chromium` — or already done)
- [ ] `.env` file exists (copied from `.env.example`)
- [ ] `node setup/verify-env.mjs` passes with no FAIL entries
- [ ] `bash setup/check-deps.sh` passes with no MISS entries

### Brand Kit
- [ ] Brand kit exists for this client at `brands/<client-slug>/brand-kit.md`
- [ ] `target_url` field is filled in the brand kit
- [ ] `audit_type` field is filled (quick / full / report / specific-command)
- [ ] `delivery_format` field is filled (markdown / pdf / both)
- [ ] If PDF delivery: `logo_file` path is correct or acknowledged as placeholder

### Output Directory
- [ ] `output/<client-slug>/<project-slug>/` directory exists (or will be created by operator)
- [ ] No conflicting files from a previous audit at the same version number

---

## KIT VALIDATION CHECKLIST

Run this when a kit is first installed or after receiving a kit update.

### kit.json
- [ ] `schemaVersion` is `2`
- [ ] `kit.id` is `growthub-geo-seo-v1`
- [ ] `entrypoint.path` points to `workers/geo-seo-operator/CLAUDE.md`
- [ ] `frozenAssetPaths` array contains all 38 expected paths
- [ ] `bundles` array lists `bundles/growthub-geo-seo-v1.json`

### Bundle
- [ ] `bundles/growthub-geo-seo-v1.json` exists
- [ ] Bundle `kitId` matches `growthub-geo-seo-v1`
- [ ] Bundle `workerId` matches `geo-seo-operator`

### Entrypoint
- [ ] `workers/geo-seo-operator/CLAUDE.md` exists and is readable
- [ ] `skills.md` exists at kit root and is readable

### Templates (11 files)
- [ ] `templates/geo-audit-brief.md` exists
- [ ] `templates/citability-analysis.md` exists
- [ ] `templates/crawler-access-report.md` exists
- [ ] `templates/brand-visibility-report.md` exists
- [ ] `templates/geo-score-summary.md` exists
- [ ] `templates/content-analysis.md` exists
- [ ] `templates/schema-validation.md` exists
- [ ] `templates/technical-foundations.md` exists
- [ ] `templates/llmstxt-plan.md` exists
- [ ] `templates/remediation-roadmap.md` exists
- [ ] `templates/client-proposal.md` exists

### Examples (4 files)
- [ ] `examples/geo-audit-sample.md` exists
- [ ] `examples/citability-sample.md` exists
- [ ] `examples/pdf-report-sample.md` exists
- [ ] `examples/prospect-proposal-sample.md` exists

### Docs (4 files)
- [ ] `docs/geo-seo-fork-integration.md` exists
- [ ] `docs/subagent-dispatch.md` exists
- [ ] `docs/scoring-methodology.md` exists
- [ ] `docs/pdf-report-layer.md` exists

### Brands (2 brand kits)
- [ ] `brands/_template/brand-kit.md` exists
- [ ] `brands/growthub/brand-kit.md` exists
- [ ] `brands/NEW-CLIENT.md` exists

### Setup (3 scripts)
- [ ] `setup/clone-fork.sh` exists
- [ ] `setup/verify-env.mjs` exists
- [ ] `setup/check-deps.sh` exists

### Meta
- [ ] `growthub-meta/README.md` exists
- [ ] `growthub-meta/kit-standard.md` exists

---

## METHODOLOGY CHECKLIST

### Skills.md
- [ ] Skills.md is readable and follows the 10-step order (Steps 0–10)
- [ ] Quick Reference Table includes all 11 templates
- [ ] Command selection table lists all 14 /geo commands
- [ ] GEO Score formula matches `docs/scoring-methodology.md`
- [ ] Citability algorithm lists all 5 metrics with correct weights

### Subagents
- [ ] All 5 subagents are documented in `docs/subagent-dispatch.md`
- [ ] Each subagent has: name, scope, inputs, output format, scoring contribution
- [ ] Error handling is documented for failed subagent scenarios

### Scoring
- [ ] GEO Score formula weights sum to 100% (25+20+20+15+10+10)
- [ ] Letter grade thresholds are documented (A≥85, B≥70, C≥55, D≥40, F<40)
- [ ] Citability weights sum to 100% (30+25+20+15+10)

---

## OUTPUT VALIDATION CHECKLIST

Run after producing an audit package.

### Completeness
- [ ] All 9 core artifact files are present in `output/<client-slug>/<project-slug>/`
- [ ] `geo_score_data.json` is written to the output directory
- [ ] If PDF requested: PDF file is present and not corrupted
- [ ] If proposal requested: `ClientProposal` file is present

### Accuracy
- [ ] GEO Score in `GeoScoreSummary` matches the sum of weighted component scores
- [ ] All 14 crawlers appear in `CrawlerAccessReport` crawler permission matrix
- [ ] All 5 citability metrics appear in `CitabilityAnalysis` component breakdown
- [ ] All 8 platforms appear in `BrandVisibilityReport` platform scan
- [ ] Remediation roadmap covers all 4 weeks with specific actions

### Consistency
- [ ] Client name matches brand kit exactly across all files
- [ ] Target URL is consistent across all files
- [ ] Dates are consistent across all files (same audit date)
- [ ] Scores referenced in `RemediationRoadmap` "before" column match `GeoScoreSummary`

### Delivery
- [ ] Brand kit DELIVERABLES LOG has been updated
- [ ] Output files are named correctly (ClientSlug_OutputType_v<N>_<YYYYMMDD>.md)
- [ ] File versions are correct (v1 for first audit, incremented for rescores)
