import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  childrenOf,
  dateHint,
  decodeString,
  expandJson,
  findTable,
  frameAt,
  JsonNumber,
  JsonObject,
  levelsWithin,
  linkOf,
  marked,
  parseJson,
  placeOf,
  scalarText,
  searchJson,
  serialize,
  sortKeys,
  tableOf,
  toCsv,
  toXml,
  toYaml,
} from "../app/utils/json-view.ts";

const messages = (out) => out.repairs.map((r) => r.message);
const compact = (text) => serialize(parseJson(text).value, 0);

test("valid JSON reads exactly, with nothing to report", () => {
  const text = '{"a":[1,true,null,"x\\nA"],"b":{},"c":[],"d":-1.5e3}';
  const out = parseJson(text);
  assert.equal(out.ok, true);
  assert.deepEqual(out.repairs, []);
  assert.deepEqual(out.warnings, []);
  assert.equal(serialize(out.value, 0), text);
  assert.equal(parseJson('"\\u0041"').value, "A");
});

test("agrees with JSON.parse on what strings and numbers hold", () => {
  for (const text of ['"a\\"b\\\\c\\/d\\t"', "0", "-0.25", "1E+2", "[[[]]]", '{"":""}']) {
    const out = parseJson(text);
    assert.equal(out.ok, true, text);
    assert.deepEqual(out.repairs, [], text);
    assert.equal(
      JSON.stringify(JSON.parse(serialize(out.value, 0))),
      JSON.stringify(JSON.parse(text)),
    );
  }
});

test("numbers and key order stay as written", () => {
  const text = '{"b":12345678901234567890,"1":1.50,"a":7}';
  const out = parseJson(text);
  assert.equal(serialize(out.value, 0), text);
  assert.ok(out.value.entries[0][1] instanceof JsonNumber);
});

test("each kind of near-JSON is repaired and named", () => {
  const cases = [
    ['{"a":1,}', '{"a":1}', "Removed trailing commas"],
    ["[1,,2]", "[1,2]", "Removed stray commas"],
    ['{"a":1 "b":2}', '{"a":1,"b":2}', "Added missing commas"],
    ["[1 2]", "[1,2]", "Added missing commas"],
    ["{a:1}", '{"a":1}', "Added quotes around keys"],
    ["['a']", '["a"]', "Changed single quotes to double quotes"],
    ["[“a”]", '["a"]', "Changed curly quotes to straight quotes"],
    ["[True,None]", "[true,null]", "Changed True to true"],
    ["[NaN]", "[null]", "Changed NaN to null"],
    ["// c\n[1 /* d */]", "[1]", "Removed comments"],
    ['["C:\\dir"]', '["C:\\\\dir"]', "Kept backslashes that were not valid escapes"],
    ['["a\nb"]', '["a\\nb"]', "Escaped raw line breaks or tabs inside strings"],
    ['{"a":[1', '{"a":[1]}', "Closed brackets the text ended inside"],
    ['["abc', '["abc"]', "Closed a string the text ended inside"],
    ['{"a":1,"b":', '{"a":1}', "Dropped a key the text ended after"],
  ];
  for (const [text, fixed, message] of cases) {
    const out = parseJson(text);
    assert.equal(out.ok, true, text);
    assert.equal(serialize(out.value, 0), fixed, text);
    assert.ok(messages(out).includes(message), `${text}: ${messages(out)}`);
  }
});

test("repeats of a repair are counted once", () => {
  const out = parseJson("[1,2,]\n".replace("[1,2,]", "[[1,],[2,],]"));
  assert.equal(out.repairs.find((r) => r.message === "Removed trailing commas").count, 3);
});

test("one value per line becomes a list", () => {
  const out = parseJson('{"a":1}\n{"a":2}\n');
  assert.equal(serialize(out.value, 0), '[{"a":1},{"a":2}]');
  assert.deepEqual(messages(out), ["Read 2 separate values as one list"]);
});

test("JSON inside a log line or a code fence is found, and the rest is reported", () => {
  for (const text of [
    '2026-11-09 INFO payload={"a":1}',
    '[INFO] {"a":1}',
    'Result: {"a":1}',
    '```json\n{"a":1}\n```',
  ]) {
    const out = parseJson(text);
    assert.equal(out.ok, true, text);
    assert.equal(serialize(out.value, 0), '{"a":1}', text);
    assert.ok(
      messages(out).some((m) => m.startsWith("Ignored")),
      text,
    );
  }
});

test("an error further in is an error, not a reason to show a fragment", () => {
  const out = parseJson('[1,oops,{"a":1}]');
  assert.equal(out.ok, false);
  assert.match(out.message, /oops is not a JSON value/);
  assert.equal(out.at, 3);
});

test("what cannot be read says where, and what it expected", () => {
  const out = parseJson('{\n  "a": 1,\n  oops\n}');
  assert.equal(out.ok, false);
  assert.match(out.message, /Expected ":" after the key oops/);
  assert.deepEqual(placeOf('{\n  "a": 1,\n  oops\n}', out.at), { line: 4, column: 1 });

  const mismatch = parseJson('{\n"a":[1}\n}');
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.message, /Expected "," or "\]" but found "}"\. It opened on line 2/);

  for (const bad of ["007", "[1.]", "[2026-11-09]", "[hello]", "[constructor]"])
    assert.equal(parseJson(bad).ok, false, bad);
});

test("the frame points under the place", () => {
  assert.deepEqual(frameAt("ab\ncdef\ngh", 5), {
    line: 2,
    column: 3,
    code: "cdef",
    caret: "  ^",
  });
});

test("repeated keys are kept and warned about, and __proto__ is data", () => {
  const out = parseJson('{"a":1,"a":2,"__proto__":{"x":1}}');
  assert.equal(out.value.entries.length, 3);
  assert.equal(out.warnings[0].count, 1);
  assert.equal({}.x, undefined);
  assert.equal(childrenOf(out.value, "")[2].name, "__proto__");
});

test("nesting too deep is an answer, not a crash", () => {
  const out = parseJson("[".repeat(2_000_000));
  assert.equal(out.ok, false);
  assert.match(out.message, /Nested deeper/);
});

test("paths paste into jq", () => {
  const root = parseJson('{"a":[{"b c":1}],"d":2}').value;
  const [a, d] = childrenOf(root, "");
  assert.equal(a.path, ".a");
  assert.equal(d.path, ".d");
  const [first] = childrenOf(a.value, a.path);
  assert.equal(first.path, ".a[0]");
  assert.equal(childrenOf(first.value, first.path)[0].path, '.a[0]["b c"]');
  assert.equal(childrenOf(parseJson("[1]").value, "")[0].path, ".[0]");
  assert.equal(childrenOf(parseJson('{"a b":1}').value, "")[0].path, '.["a b"]');
});

test("JSON and JWTs inside strings open in place; lookalikes do not", () => {
  const out = expandJson('{"a":1}', ".s");
  assert.equal(out.label, "JSON in a string");
  assert.equal(out.kids[0].path, ".s | fromjson | .a");

  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = decodeString(`${part({ alg: "HS256" })}.${part({ sub: "é" })}.sig`);
  assert.equal(jwt.label, "JWT, signature not checked");
  assert.equal(serialize(jwt.value, 0), '{"header":{"alg":"HS256"},"payload":{"sub":"é"}}');

  for (const text of ["{not json}", "[1,]", "plain", "eyJ.eyJ.x"])
    assert.equal(decodeString(text), null, text);
});

test("search finds keys and values, ignoring array indexes, and keeps the way to them", () => {
  const root = parseJson('{"a":[{"name":"Ada"},{"name":"Bob"}],"b":"ada"}').value;
  const out = searchJson(root, "ada");
  assert.equal(out.count, 2);
  assert.deepEqual([...out.hits].sort(), ["0/0/0/0", "0/1"]);
  assert.ok(out.open.has("0/0/0") && out.keep.has("0/0"));
  assert.equal(searchJson(parseJson("[5,6]").value, "1").count, 0);
});

test("a query starting with a dot is a path, and text when no path matches", () => {
  const root = parseJson('{"a":[{"n":1},{"n":2}],"b":".env"}').value;
  assert.equal(searchJson(root, ".a[].n").count, 2);
  assert.equal(searchJson(root, ".a[1].n").count, 1);
  assert.equal(searchJson(root, ".env").count, 1);
});

test("search looks inside strings that hold JSON, and stops at its limit", () => {
  const inner = searchJson(parseJson('{"s":"{\\"deep\\":1}"}').value, "deep");
  assert.ok(inner.hits.has("0/0/0"), "the key inside the string");
  assert.ok(inner.open.has("0/0"), "the string opens to show it");
  const out = searchJson(parseJson(`[${"1,".repeat(50)}1]`).value, "1", 10);
  assert.equal(out.count, 10);
  assert.equal(out.capped, true);
});

test("highlighting cuts text around each match, whatever its case", () => {
  assert.deepEqual(marked("aXbx", "x"), [
    { text: "a", hit: false },
    { text: "X", hit: true },
    { text: "b", hit: false },
    { text: "x", hit: true },
  ]);
  assert.deepEqual(marked("a.b", ".b"), [{ text: "a.b", hit: false }]);
});

test("format, minify and sort keep the data", () => {
  const root = parseJson('{"b":[1,{"z":1,"y":2}],"a":{}}').value;
  assert.equal(
    serialize(root, 2),
    '{\n  "b": [\n    1,\n    {\n      "z": 1,\n      "y": 2\n    }\n  ],\n  "a": {}\n}',
  );
  assert.equal(serialize(sortKeys(root), 0), '{"a":{},"b":[1,{"y":2,"z":1}]}');
  assert.equal(compact(serialize(root, 2)), serialize(root, 0));
});

test("opens as many levels as fit the budget, and always the root", () => {
  const nested = parseJson('{"a":{"b":{"c":1}}}').value;
  assert.equal(levelsWithin(nested, 200), 3);
  assert.equal(levelsWithin(nested, 2), 2);
  assert.equal(levelsWithin(parseJson(`[${"1,".repeat(999)}1]`).value, 200), 1);
});

test("a Unix time is only a date when its key says so", () => {
  const n = new JsonNumber("1794250000");
  assert.match(dateHint("created_at", n), /2026/);
  assert.match(dateHint("expiresAt", new JsonNumber("1794250000000")), /2026/);
  assert.equal(dateHint("user_id", n), null);
  assert.equal(dateHint("format", n), null);
  assert.equal(dateHint("created_at", new JsonNumber("12")), null);
});

test("only http and https strings are links", () => {
  assert.equal(linkOf("https://a.dev/x"), "https://a.dev/x");
  assert.equal(linkOf("javascript:alert(1)"), null);
  assert.equal(linkOf("see https://a.dev"), null);
  assert.equal(linkOf(new JsonObject()), null);
});

test("a table takes every column, and CSV quotes and defuses its cells", () => {
  const table = tableOf(parseJson('[{"a":"x,y","b":1},{"c":"=SUM(A1)","a":[1]}]').value);
  assert.deepEqual(table.columns, ["a", "b", "c"]);
  assert.equal(toCsv(table), `a,b,c\n"x,y",1,\n"[1]",,'=SUM(A1)`.replace('"[1]"', "[1]"));
});

test("the page never rewrites the box through execCommand, which froze it on 87 KB", () => {
  const page = readFileSync(new URL("../app/pages/json.vue", import.meta.url), "utf8");
  assert.doesNotMatch(page, /document\.execCommand/);
});

test("YAML nests, quotes what would change type, and drops a repeated key", () => {
  const root = parseJson(
    '{"a":[{"b":1,"c":"no"},[2]],"d":{},"e":[],"f":"x: y","a b":null,"g":1,"g":2}',
  ).value;
  assert.equal(
    toYaml(root, 2),
    'a:\n  - b: 1\n    c: "no"\n  - - 2\nd: {}\ne: []\nf: "x: y"\na b: null\ng: 2\n',
  );
  assert.equal(toYaml(parseJson('{"a":[{"b":1}]}').value, 4), "a:\n    -   b: 1\n");
  assert.equal(toYaml(parseJson("[]").value, 2), "[]\n");
});

test("XML repeats a key's list, escapes text, and always has one legal root", () => {
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
  assert.equal(
    toXml(parseJson('{"a":[1,2],"b c":"<&>","1x":null}').value, 2),
    `${head}<root>\n  <a>1</a>\n  <a>2</a>\n  <b_c>&lt;&amp;&gt;</b_c>\n  <_1x/>\n</root>\n`,
  );
  assert.equal(toXml(parseJson("[1]").value, 2), `${head}<root>\n  <item>1</item>\n</root>\n`);
  assert.equal(toXml(parseJson("3").value, 2), `${head}<root>3</root>\n`);
});

test("the shallowest table is found inside an envelope", () => {
  const found = findTable(parseJson('{"ok":true,"data":{"rows":[{"a":1},{"a":2}]}}').value);
  assert.equal(found.path, ".data.rows");
  assert.equal(found.value.length, 2);
  assert.equal(findTable(parseJson('{"a":[1,2]}').value), null);
});

test("scalars print as JSON", () => {
  assert.equal(scalarText("a"), '"a"');
  assert.equal(scalarText(null), "null");
  assert.equal(scalarText(new JsonNumber("1.50")), "1.50");
});
