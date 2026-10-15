---
description: Research a topic on Cadre's public site and propose a sourced knowledge-base update
argument-hint: "<topic, e.g. 'case studies in construction'>"
---
Add or update knowledge about: **$ARGUMENTS**

1. Delegate the research to the `kb-researcher` subagent. It returns facts with source URLs and an explicit "not found" list.
2. Decide which file in `knowledge/` the facts belong in, or propose a new one. Show the user the proposed diff. Every fact must carry its source URL, and anything marked UNVERIFIED stays out.
3. For topics the research couldn't answer, make sure the KB says so explicitly, e.g. "Pricing is not published; offer a handoff". That way the bot escalates instead of guessing.
4. Only after the user approves, write the change. Then suggest the eval cases that should cover it.
