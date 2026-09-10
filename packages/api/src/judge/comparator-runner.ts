/**
 * The five Elice comparison modes, in the Python that defines them.
 *
 * Real CPython rather than a JavaScript reimplementation, because the
 * semantics are Python's: `re.search` with inline flags, Unicode classes,
 * lookarounds and backreferences, and `str.splitlines()`/`str.rstrip()`, whose
 * behaviour around `\v`, `\f`, `\x85`, ` ` and the BOM is not what any
 * JavaScript equivalent does. Reproducing that by hand is how a grader ends up
 * disagreeing with itself on the exercises nobody tested.
 *
 * This module never sees student *code* — only the output a program already
 * produced and the case's expected text — so unlike the execution runner its
 * interpreter is reused. The strings are still untrusted, which is why they
 * are passed as data and never interpolated into a Python source string.
 */
export const COMPARATOR_HARNESS = `
import json, re

def _normalize(value):
    """Elice's 'same output': trailing whitespace per line, and at the end.

    Leading and interior whitespace stay significant, so '1 2' and '1  2' are
    still different answers. Python's own splitlines is what decides where a
    line ends, which is the part a JavaScript version gets wrong.
    """
    lines = [line.rstrip() for line in value.splitlines()]
    return "\\n".join(lines).rstrip()

def _cove_compare(payload):
    request = json.loads(payload)
    comparator = request["comparator"]
    actual = request["actual"]
    expected = request["expected"]

    try:
        if comparator == "STDOUT":
            matched = _normalize(actual) == _normalize(expected)
        elif comparator == "STDOUT_MATCH":
            # Substring, deliberately unnormalized: 'contains' means what it
            # says, and normalizing here would quietly make it a different rule.
            matched = expected in actual
        elif comparator == "STDOUT_NOMATCH":
            matched = expected not in actual
        elif comparator == "STDOUT_REGEX":
            matched = re.search(expected, actual) is not None
        elif comparator == "STDOUT_REGEX_NOMATCH":
            matched = re.search(expected, actual) is None
        else:
            return json.dumps({"kind": "error", "detail": "unknown comparator"})
    except re.error as exc:
        # An unusable pattern is the author's problem, never the student's.
        return json.dumps({"kind": "invalid-pattern", "detail": str(exc)})
    except Exception as exc:
        return json.dumps({"kind": "error", "detail": type(exc).__name__})

    return json.dumps({"kind": "match" if matched else "no-match"})
`;
