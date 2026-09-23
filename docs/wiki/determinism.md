# Determinism

Passalong hands finished work from one context to another. The obvious question about that is
whether the hand-off is reproducible: does the same work, passed along twice, arrive the same way
twice? The answer is no, and this page is about why that is the right answer, what *is* fixed, and
which of the fixed things are not as fixed as the code assumes.

Everything below was checked against a primary source or measured against the real corpus. Where a
claim could not be verified, it says so.

## Two layers

The product is a baton pass. Its machinery is deterministic; its payload is not.

**Deterministic.** Parsing and validating a guide is a pure function of the text — `validate()` in
`packages/passalong/src/guide.js`. The queue holds one rule, that no two agents hold the same work
in the same place, and holds it with a primary key rather than a check. The hand-in gate is one
rule about evidence. Task state is derived on every read, never stored.

**Not deterministic.** The guide itself is written by a model, and the agent on the receiving side
re-implements from it, adapting anything marked `ASSUMES:`. The same session captured twice gives
two different guides; the same guide pulled into two repos gives two different diffs. That is the
point. A byte-identical replay is a patch file, and a patch file does not cross repositories.

So determinism sits at the seams and not in the middle. The useful question is not "is the output
reproducible" — it is "can two agents double-do work, can an invalid guide publish, can a hand-in
pass with no proof". Those are the invariants worth holding.

## The generator cannot be pinned

This is not a matter of effort. The controls are being removed, not added.

The Anthropic Messages API has no `seed` parameter — the word does not appear in the API reference
at all. The docs state plainly that "even with `temperature` of `0.0`, the results will not be fully
deterministic". On models after Claude Opus 4.6, `temperature`, `top_p` and `top_k` are all
deprecated and rejected with a 400. Greedy decoding is no longer something you can ask for.
<https://platform.claude.com/docs/en/api/messages>

OpenAI's `seed` carries `deprecated: true` in their published OpenAPI spec, is marked Beta, and is
absent entirely from the Responses API; `system_fingerprint` is deprecated alongside it. The spec's
own wording was always "best effort ... Determinism is not guaranteed".
<https://github.com/openai/openai-openapi> Google's Vertex `seed` is documented as "not a guaranteed
absolute deterministic behavior", and is a Preview feature.

The mechanism, from Thinking Machines Lab's "Defeating Nondeterminism in LLM Inference"
(Sep 2025), is not the folk explanation. Matmul kernels *are* run-to-run deterministic; they are not
**batch-invariant**. Server load sets the batch size, batch size changes the reduction order, and
floating-point addition is not associative. Other people's concurrent traffic is therefore an
uncontrolled input to your request. Measured: 1000 identical temperature-0 requests produced **80
unique completions**, first diverging at token 103. With batch-invariant kernels, one.
<https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/>

vLLM shipped that work as `VLLM_BATCH_INVARIANT=1`, in beta, and its own docs bound the promise:
reproducibility holds only "on the same hardware and the same vLLM version".

Even a pinned model id is not a pinned behaviour. Anthropic's versioning page says weights are fixed
per id, and then: "the serving infrastructure around the model can change over time ... includes
components such as the request router, safety classifiers, and **sampling logic**", and
"infrastructure updates produce minor differences in observable behavior even when the model ID and
weights have not changed".
<https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions>

Two consequences specific to this repo:

- **Prompt caching does not memoize output.** "Prompt caching has no effect on output token
  generation. The response you receive is identical to what you would get if prompt caching were not
  used." It is an input-prefix cost optimisation. A store of memoized generations would have to be
  built here, not bought.
- **Passalong never calls a model.** `apps/api/src`, `packages/passalong/src`, `skill/`, `scripts/`
  and `apps/web` contain no reference to `temperature`, `top_p` or `top_k`. Passalong is
  infrastructure around the agent, never a model client. Every source of variance above sits
  upstream, outside its process, unreachable by any knob it could add. It cannot pin the generator.
  It can only pin the artifact and gate the verdict.

## The format is not a fixed point

Measured against the real store, 214 guides in `~/.passalong/guides`:

```
files=214  byte-identical=183  drift=31  parse-error=0
```

`serialize(parse(x)) !== x` for **14.5%** of real guides. Nothing fails to parse, and every drifted
file is a fixed point on the second pass — so `serialize` output is a normal form, but reading an
existing guide and writing it back rewrites it. Three causes, isolated:

- **Field reordering.** `META_ORDER` in `guide.js` imposes a canonical key order on write, so a
  guide authored in another order is rewritten. This accounts for most of the 31.
- **Tag rewriting.** `tag()` folds `_` to `-`, so `passalong_mcp` re-shares as `passalong-mcp`. A
  silent value mutation on a field used for search.
- **`created` normalization.** Quoted ISO timestamps lose their quoting.

There is also a hole in the canonical order. `serializeFrontmatter` orders the keys it knows and
then appends unknown keys **in insertion order**. Unknown keys are not hypothetical: the corpus
already carries `url`, `environment` and `priority`.

Reproducible Builds' documented causes read as a checklist of exactly this. "Timestamps make the
biggest source of reproducibility issues" — that is `created`. On ordering: "Data structures such as
Perl hashes, Python dictionaries and sets ... will list their keys in a different order on every run
... To get a deterministic output, the easiest way is to explicitly sort the keys."
<https://reproducible-builds.org/docs/timestamps/> and
<https://reproducible-builds.org/docs/stable-outputs/>

One hazard from the same source is already avoided: both parsers use `toLowerCase()` rather than
`toLocaleLowerCase()`, and neither contains `localeCompare` or any `.sort()`, so locale collation
cannot move a guide's bytes. The absence of any sort is also why unknown keys keep insertion order.

### Two parsers, no assertion that they agree

`apps/api/src/guide.ts` mirrors the format defined in `packages/passalong/src/guide.js`, and
`AGENTS.md` says to change both. That instruction is enforced by attention alone.
`packages/passalong/test/guide.test.js` and `apps/api/test/guide.test.mjs` are separate suites over
separate cases; `packages/passalong/fixtures/` holds one file, `fake-agent.mjs`, read only by the
e2e test. Nothing asserts the two implementations agree on a single byte.

Checked by hand: `tag()` is currently byte-identical in both. The risk is unenforced, not currently
violated. A shared corpus with a round-trip assertion in both suites would keep it that way; 14.5%
drift in one parser is what an unenforced mirror looks like from the inside.

## Content-addressed ids: rejected

Replacing the random `newId()` with a hash of the guide's bytes was considered and dropped. Three
independent reasons, in order of decisiveness.

**There is no canonical form to hash.** YAML 1.2.2 uses the phrase "canonical form" only for scalar
equality within a tag, never for serializing a document; comments, quoting style, number format and
key order are explicitly presentation details discarded on round-trip. CommonMark 0.31.2 mentions
front matter zero times — YAML frontmatter is in no markdown specification. RFC 8785 (JCS) covers
JSON only, is informational rather than standards-track, constrains numbers to IEEE-754 doubles, and
performs no Unicode normalization, so NFC and NFD spellings of one title would hash differently. The
normalizer would be ours, defined by us, forever.

**Changing a normalization later is not a patch.** `git patch-id` shipped three incompatible
normalizations and its own documentation records the bill: the change "thereby mak[es] existing
databases storing such 'unstable' or historical patch IDs unusable". Git also declined to make the
commit id context-insensitive; it built a *second, separate* id instead. OCI never mandates
canonicalization either — digests are over exact bytes, canonical JSON is a MAY, image ids are
frozen by declaring the config JSON immutable, and layer DiffID stability is bought by storing the
original tar headers with `tar-split` rather than by canonicalizing.
<https://git-scm.com/docs/git-patch-id>, <https://github.com/opencontainers/image-spec>

**The benefit does not exist here.** Measured on the corpus:

```
identical bodies under different ids: 1 group, 2 guides
identical titles under different ids: 2 groups, 4 guides
```

Content addressing would dedupe 2 guides out of 214. Nix's stated reason for content-addressed
derivations is early cutoff — "to prevent rebuilds when changes to the derivation do not result in
changes to the derivation's output" — which is a build-graph argument with no analogue in a store of
prose documents. Worth noting that `ca-derivations` is still experimental in Nix 2.35, and the
manual states fixed content-addressing is "the only form of content-addressing that is stabilized".
Nix has worked on this for two decades without shipping the general case.

## The claim is already fenced

The literature on leases converges on fencing tokens. Redis's own Redlock documentation now says
"You should implement fencing tokens" and "don't assume that a lock is retained as long as the
process that had acquired it is alive". Chubby issues a **sequencer** carrying a lock generation
number, checked by the resource server. KCL's DynamoDB lease table carries `leaseCounter`, "used for
lease versioning so that workers can detect that their lease has been taken by another worker".

Passalong has no such counter, but it is not unfenced. Every claim mutation in
`apps/api/src/claims.ts` — `progress`, `finish`, and the hand-in at line 882 — carries the identical
guard:

```sql
WHERE guide_id = ? AND agent_id = ? AND account_id = ? AND state = 'claimed'
```

`release` deletes the claim row. A stalled agent that wakes up and hands in therefore matches zero
rows and gets a 409: "this agent does not hold that task — it was released, or never taken here".
That is a compare-and-set on a unique token, which is the form antirez defends in his reply to
Kleppmann: "Each Redlock is associated with a large random token ... What do you do with a unique
token? For example you can implement Check and Set."
<https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/>,
<http://antirez.com/news/101>

The residual gap is ABA, and it is narrow. `agent_id` is stable across claims, so: agent A holds a
card, a person releases it, A takes it again, and an in-flight hand-in from A's *first* claim now
satisfies the guard against the second. A monotonic counter on the claim row closes it. Nothing else
in the reviewed literature applies that this design does not already have.

## A lease that expires without releasing has no precedent

`docs/V2.md` §5: when the lease expires the card moves to Stalled "and stays locked. It never goes
back to Ready on its own. Only you release it."

No primary source describes that shape. Chubby, Redis/Redlock, SQS, KCL, Kubernetes node leases,
Subversion and Git LFS were all checked. The documented alternatives are three, and two argue
against this one:

- **Expiry releases**, immediately or after a bounded delay. SQS makes the message visible again;
  KCL hands the lease to another worker. Chubby's `lock-delay` is deliberately capped — "currently
  one minute; this limit prevents a faulty client from making a lock (and thus some resource)
  unavailable for an arbitrarily long time".
- **Expiry demotes, then a separate timer reclaims automatically.** Kubernetes sets a node's `Ready`
  condition to `Unknown`, then evicts after five minutes. Still no human in the loop.
- **No expiry at all, plus an explicit human break.** Subversion locks and Git LFS locks have no TTL
  and no stalled state; someone forces the unlock. This is the closest real precedent, and it
  notably lacks the "stalled" concept entirely.

The choice is defensible by reclassifying the lease as an efficiency lock in Kleppmann's sense — one
where a double-take costs duplicated work rather than corruption — rather than a correctness lock.
Given the compare-and-set above, that reclassification holds: the dangerous write is already fenced,
so the lock is protecting effort, not data. What it costs is liveness, which is precisely what
Chubby bounded to a minute and what antirez called "a liveness issue that is unacceptable in most
situations". Worth revisiting as a deliberate trade, not worth treating as settled.
<https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html>

## Nobody serious judges completion with prose

The hand-in gate asks the agent for `evidence`, and `evidenceProblem()` accepts any string of 16
characters or more. `"ran the tests, all green"` passes. Every benchmark that had to decide whether
an agent finished a job reached the same conclusion about that, and reached it the hard way.

SWE-bench does not ask whether tests passed. It parses the test log into a `{test_id: status}` map
and checks two named lists shipped with the instance, `FAIL_TO_PASS` and `PASS_TO_PASS`; resolution
is set membership over that map. The tests ship separately from the task and, per OpenAI's SWE-bench
Verified writeup, "the tests are not shown to the agent". Terminal-Bench goes further and copies
`tests/` into the container only *after* the agent has stopped.

The reason to read SWE-bench's grading code is that most of it is scar tissue, and every scar is a
way an agent fooled a verdict. Its live source comments record four attacks:

- **The log can lie.** "A patch can print its own `PASSED` lines (e.g. from a `conftest.py` hook),
  so cross-check the log against the test command's exit status". Exiting non-zero while reporting
  no failure means "the log is not describing the run that actually happened", and grading returns
  invalid rather than passed.
- **The exit code you capture may not be the one you want.** Their eval scripts end with a
  `git checkout` that resets the test files, so the script's status is the reset's, not the tests'.
  They capture `$?` immediately after the test command and echo it outside the parsed region.
- **No output must not read as no failures.** A runner that dies still prints a summary — karma logs
  `Executed 0 of 0` — and an empty status map would otherwise score every test as passing, so "a
  zero count read as evidence turns a suite that never ran into a resolved instance".
- **Skipped is not passed.** Without an explicit check, "a patch that makes every F2P test skip"
  scores as fully resolved.

The closest analogue to Passalong's problem is their submission verifier, which re-derives the
verdict from the logs a submission claims to be scored from: "No Docker and no re-execution: the
recorded test output is the evidence, and grading it is deterministic." It classifies a claim with
no log attached as an `unbacked_claim` and fails it, because "shipping no log for an instance you
claim to have resolved is the cheapest way to inflate a score, so it cannot pass."

### The model judge is not an alternative

Zheng et al. (arXiv 2306.05685) is usually cited for "80% agreement with humans", which is pairwise
*preference* agreement on open-ended chat with ties discarded. The correctness-shaped measurement is
Table 4, where a failure means the judge called an incorrect answer correct:

| Prompt | Default | Chain-of-thought | Reference-guided |
| --- | --- | --- | --- |
| Incorrect answers passed as correct | 70% | 30% | **15%** |

Even handed the reference answer, 15% of wrong work was waved through. The same paper measures
position bias — the best judge flips its verdict on answer order 35% of the time — and verbosity
bias, where padding an answer with a restatement that adds no information fools two of three judges
**91.3%** of the time. Anthropic's own eval guidance ranks code-based grading as "fastest and most
reliable" and says of model grading, "test to ensure reliability first then scale". OpenAI's grader
documentation names "grader hacking" as a known attack.

### Two fields, not one

Three independent systems separate "what the process returned" from "the criterion is met", and it
is worth copying deliberately.

SARIF 2.1.0 — an OASIS Standard, and the only structured evidence format whose normative text
specifies command line, exit code and output together — makes `executionSuccessful` the **single
SHALL** of its invocation object, separate from the optional `exitCode`, "because not all programs
exit with an exit code of 0 on success and non-0 on failure". Its own example carries
`{"exitCode": 1, "exitCodeDescription": "Scan successful; warnings detected.",
"executionSuccessful": true}`. GitHub Actions draws the same line: `steps.<id>.outcome` is the
result *before* `continue-on-error` is applied and `conclusion` is the result after, so a policy
that softens a failure never overwrites what happened. SWE-bench enforces it by cross-checking the
parsed log against `$?`.

On adopting a format wholesale: don't. JUnit XML has no authoritative schema — Apache Ant ships no
XSD, and Jenkins, the de-facto arbiter, has no concept of an exit code at all. TAP14 explicitly
declines to define the keys inside its YAML diagnostic block, and its own repo calls the spec "a
dictionary". SARIF fits the vocabulary but is a static-analysis findings format whose largest
consumer, GitHub code scanning, ignores every invocation field that matters here. Borrow SARIF's
field names and its exit-code/success split; emit JUnit XML or TAP only if something downstream
already reads them.

### What MCP does and does not give us

Read against spec revision 2026-07-28. Tool annotations are **normatively untrusted**: "clients MUST
consider tool annotations to be untrusted unless they come from trusted servers", and the schema
calls every property a hint. Defaults are pessimistic — an unannotated tool is assumed destructive,
non-idempotent and open-world. So `idempotentHint` on a hand-in is documentation, not a guarantee.

`outputSchema` puts the obligation on the server: "Servers MUST provide structured results that
conform to this schema", while clients only SHOULD validate. Conformance cannot be assumed to have
been checked upstream.

Worth noting an asymmetry in this repo: `apps/api/src/mcp-http.ts` declares annotations (`READS`,
`ADDS`) and `outputSchema` throughout; `packages/passalong/src/mcp.js` declares neither. Same four
jobs, two different contracts, and the stdio server is the surface most agents actually reach.

Finally, the protocol's error split matches the verdict split: tool execution errors belong in the
result with `isError: true`, not as a JSON-RPC error, "otherwise, the LLM would not be able to see
that an error occurred and self-correct".

## What to do

Four changes, in the order they earn their keep.

**1. Run the check instead of reading about it.** *Implemented, in
`packages/passalong/src/checks.js`.* A check may now carry `cmd`. When it does, `hand_in` runs it
before anything is recorded, and the exit code decides the check rather than the agent's account of
it. What the process printed is what gets stored, replacing whatever the agent wrote in `ran`. A
non-zero exit refuses the hand-in with the command's own output, records nothing, and leaves the
claim held. `exit` and `ok` are stored as two fields even though `ok` is `exit === 0` today, so a
later rule does not have to rewrite what was already recorded. A command that never ran — a timeout,
a missing binary — keeps `exit: null`, so "it did not run" stays distinguishable from "it ran and
found nothing wrong".

Not done, and deliberately: parsing test output. SWE-bench needs 57 per-framework log parsers to
tell a skipped test from a passing one, and a half-parser that guesses would refuse honest runs and
pass misread ones. The exit code is the whole verdict here, which is how a CI step decides too.

This has to run where a shell exists. `packages/passalong/src/mcp.js` runs on the agent's machine
over stdio and can execute the command; `apps/api/src/mcp-http.ts` is a Worker and cannot. So the
strong path is local and the HTTP surface keeps the prose gate. That asymmetry should be explicit in
the tool description rather than discovered.

Keep `cmd` optional, and expect it to stay rare for a while. Measured on the corpus: 137 of 214
guides carry a `Verification` or `Acceptance` section at all, only 19 of those contain a fenced
block, 36 are prose with no code anywhere, and across 804 verification lines **11.8%** begin with a
recognisable command. Many of the rest are legitimately manual — "open the hub, the badge reads 3"
has no exit code and never will. Mandating a command would teach agents to invent one, which is
worse than the prose it replaced. The win is converting the 11.8% from claim to fact today, with a
format that absorbs the rest as guides gain commands.

One tension to note rather than resolve: both benchmarks hide the checks from the worker, and
Passalong cannot. A task's `Acceptance` *is* its specification — the agent has to read it to do the
work. That removes an anti-gaming guarantee the benchmarks rely on, which is a further argument for
executing the check rather than accepting a report of it.

**2. Give the two parsers a shared corpus.** One fixture set, a round-trip assertion in both
`packages/passalong/test/guide.test.js` and `apps/api/test/guide.test.mjs`, and a check that the two
implementations agree byte for byte. The measured 14.5% drift is what an unenforced mirror looks
like from the inside, and the format lives in markdown files in other people's repositories.

**3. Add a monotonic counter to the claim row.** The compare-and-set guard already fences the
dangerous write; a counter closes the ABA case and matches KCL's `leaseCounter`. Cheap, and it is
the precondition for ever letting a lapsed lease release on its own.

**4. Annotate the stdio MCP tools.** `readOnlyHint` on the reads, `outputSchema` on the four verbs,
to match `mcp-http.ts`. Advisory per the spec, but the asymmetry is a bug either way.

Not doing: content-addressed ids, for the three reasons above. Not doing: anything that tries to
make guide text reproducible.

## Sources

Primary sources, all fetched 2026-09-23 unless noted. Corpus measurements are against
`~/.passalong/guides` (214 guides) and the code as of this branch.

- Anthropic Messages API reference; model ids and versions; prompt caching — platform.claude.com
- OpenAI OpenAPI specification — github.com/openai/openai-openapi
- "Defeating Nondeterminism in LLM Inference", Thinking Machines Lab, Sep 2025
- vLLM reproducibility and batch-invariance docs — github.com/vllm-project/vllm
- Reproducible Builds documentation — reproducible-builds.org/docs/
- Nix manual 2.35, store derivation outputs; Dolstra's thesis
- git `object-file.c`, `git-hash-object`, `git-patch-id`, hash-function-transition
- OCI image-spec: descriptor, considerations, config
- RFC 8785 (JSON Canonicalization Scheme); YAML 1.2.2; CommonMark 0.31.2
- Chubby (Burrows, OSDI 2006); Redis distributed-locks; Kleppmann 2016; antirez news/101
- AWS SQS visibility timeout and at-least-once delivery; KCL shared-throughput consumers
- Kubernetes node lifecycle; Subversion book ch. 3 locking; Git LFS locking API
- SWE-bench: harness source (`grading.py`, `utils.py`, `submit/verify.py`), arXiv 2310.06770,
  the Apr 2024 harness-repair and Jun 2024 containerization reports (readable at tags `v2.1.0`
  and `v3.0.0`, not on `main`)
- SWE-bench Verified, OpenAI, Aug 2024; Terminal-Bench legacy harness source
- "Judging LLM-as-a-Judge", Zheng et al., arXiv 2306.05685
- Anthropic eval guidance; OpenAI graders documentation and `openai/evals` templates
- GitHub Actions workflow syntax, action exit codes, and the contexts reference
- SARIF v2.1.0 OASIS Standard (27 Mar 2020); TAP14; Apache Ant and `jenkinsci/junit-plugin`;
  OpenTelemetry semantic conventions
- Model Context Protocol specification, revision 2026-07-28 (`schema.ts`, `server/tools.mdx`)

Unverified and flagged as such by the researchers: Terminal-Bench 2.0's verdict code and its
validation methodology (the Harbor source was unreachable and its preprint is unpublished); SARIF
2.2 prose (draft only); and any first-party evidence of model-judged and test-executed verdicts
drifting apart, which nobody appears to have published.
