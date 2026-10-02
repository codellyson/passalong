# The guide corpus

One file per shape the format has to keep working: a transfer guide, a task, a bug report, the
quoting edges, and the smallest guide there is. They are read by
`packages/passalong/test/corpus.test.js` and by `apps/api/test/corpus.test.mjs`, which is the
point — `packages/passalong/src/guide.js` defines the format and `apps/api/src/guide.ts` mirrors
it, and until this existed nothing checked that the two agreed on anything.

**Every file here is in canonical form**: `serialize(parse(x))` returns it byte for byte. That is
the assertion, not a convenience. A change to `META_ORDER`, to `quote()`, to `tag()` or to how a
list is written shows up here as a diff in a file somebody has to look at, rather than as a silent
rewrite of guides already sitting in other people's repositories.

So: if a change makes these files drift, that is the question the change has to answer. Re-writing
them to match is a decision about every guide ever published, not a test fixup. Normalisations that
are *meant* to happen — a tag with an underscore, frontmatter in another order — belong in the
tables in `corpus.test.js`, written as the pair they are, rather than as a file that quietly
becomes its own output.

Add a file when the format grows a shape these do not cover. Keep them small and readable; this is
a corpus, not a fuzz seed.
