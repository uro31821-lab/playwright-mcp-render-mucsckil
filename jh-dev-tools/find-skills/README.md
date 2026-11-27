# Read-only Find Skills

Run from this directory: `python3 find_skills.py "Android Gradle testing"` (Python 3.10+, standard library). A public directory search requires network access; no API key or package installation is required by this helper. Free access may be limited by the provider. If unavailable, use skills.sh public web search.

Run unit tests: `python3 -m unittest -v test_find_skills.py`. The tests use local fixtures only; they do not prove live API availability.

See [SKILL.md](SKILL.md) for review and adoption rules. Upstream source pinned for API behavior: https://github.com/vercel-labs/skills/blob/e7fd0e9e52f029fe87729d8185cb8caf7049f678/src/find.ts.
