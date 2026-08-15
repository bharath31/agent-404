# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## This repository is public. Planning documents are not.

agent-404 is open source and publicly visible. It holds **code, tests, and the
documentation a user needs to run the software** — nothing else.

Do not create, commit, or push any of the following here:

- Roadmaps, plans, adoption or growth plans
- PRDs, specs for unshipped work, product briefs
- Launch plans, marketing plans, GTM or positioning docs
- Tactics, competitive analysis, pricing strategy
- Metrics targets, kill criteria, internal retrospectives

All of it lives in the Linear project **agent-404: Recovery & Adoption**:
https://linear.app/brth31/project/agent-404-recovery-and-adoption-27fe1bb5e9ba

This holds even when the request arrives mid-coding-session as "write up a plan"
or "document the roadmap." Write it to Linear and link the issue. If Linear is
unreachable, say so and return the content in chat — do not fall back to a file
in the repo.

## What does belong here

- Source, tests, migrations, build and deploy configuration
- README and docs describing how to install, configure and run what already exists
- Changelog entries for shipped work
- Architecture decision records for decisions already implemented — what was done
  and why, not what is planned

The distinction is tense, not topic: how the matcher works today is documentation;
how it should work next quarter is a Linear issue.

## Enforcement

`.gitignore` blocks the common filenames, but treat it as a safety net rather than
the rule. It will not catch a filename nobody anticipated, and it does not apply to
`git add -f` or to a file that is already tracked. The rule is the section above.

## Referencing work

Reference Linear issues by identifier (for example `NOM-32`) in commit messages and
pull request descriptions. Link to the issue; do not paste its contents into the repo.
