# Security policy

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private reporting:
**[Report a vulnerability](https://github.com/velezanthony/django-language-service/security/advisories/new)**

That channel is private until an advisory is published, so a working exploit
never sits in an open thread while a fix is being written.

Include what you did, what happened, and the smallest repository or template
that reproduces it. A fixture is worth more than a description.

## Supported versions

Nothing is published yet — there are no releases and no tags. Until there are,
the supported version is `main`.

## What this extension does with your workspace

The threat this extension has to survive is **a repository you opened but do
not trust**, which is why `package.json` declares
`untrustedWorkspaces.supported: true`. The posture behind that claim:

- **Workspace Python and templates are read and parsed, never executed.** The
  parsers are regex and string scanners over source text. Nothing in the
  workspace is imported, evaluated, or run.
- **The one exception is not one.** `adapters/script-filter` calls
  `new vm.Script(code)` to syntax-check the JavaScript inside a `<script>`
  block. That constructor compiles; it does not run. There is no
  `runInContext`, `runInNewContext`, or `eval` anywhere in the extension.
- **No hover marks its markdown trusted.** A `command:` URI in workspace text
  therefore cannot become a clickable link. `hover/trusted-markdown.test.ts`
  holds that as a contract over the source, and `_shared/markdown-escape.ts`
  escapes the text besides — a model name containing an image tag does not
  become an image request.
- **The diagram webview allows exactly two command URIs**, by name, and its
  content lives behind a CSP with a per-load nonce.
- **Two settings are restricted in an untrusted workspace** —
  `excludePaths` and `suppressBuiltinHtmlValidation` — so a repository cannot
  widen what gets scanned, or ask the extension to write to its own
  `settings.json`, until you trust it.
- **The only setting this extension ever writes** is
  `html.validate.scripts` / `.styles`, workspace-scoped, only with a workspace
  open, only when the scan found Django artifacts, and only when you have not
  opted out. See `adapters/script-filter/suppression-plan.ts`.
- **Virtual workspaces are declared unsupported**, rather than half-working:
  the index round-trips paths through `Uri.fsPath`, which means nothing off the
  `file` scheme.

If you find a case where one of these statements is false, that is a
vulnerability report even if you cannot show an exploit — the claim is the
promise.

## Out of scope

- The bundled `src/test-django-project/` is a deliberately messy fixture. Its
  `SECRET_KEY` is a literal placeholder and its models are written to stress the
  parsers, not to be secure.
- Findings that require a user to already trust a workspace **and** run
  something in it. Trusting a repository is trusting its code.
