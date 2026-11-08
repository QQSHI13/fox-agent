"""Build hook: turn on heading permalinks (`#` links next to each heading).

Why a hook instead of a `markdown_extensions:` block in docsforge.yml:

A user-supplied `markdown_extensions:` list REPLACES docsforge's defaults rather
than extending them — only the three builtins (`toc`, `tables`, `fenced_code`)
are always unioned (see `MarkdownExtensions.run_validation` in
docsforge/config_options.py). Declaring `toc: {permalink: true}` that way dropped
the other ~30 defaults, including `pymdownx.emoji`, which is why every
`:material-*:` icon on the landing page rendered as literal text instead of an
SVG. That is a silent failure mode: nothing warns, the build succeeds, and the
damage is only visible in the rendered page.

Setting the one option here keeps the default extension list intact and makes the
intent explicit. Anything added here must be a *config* for an extension that is
already in the default list — this hook must not be used to register a new one,
because a hook that adds extensions is the same trap wearing a different hat.
"""


def on_config(config):
    # `mdx_configs` is the private dict of per-extension configs, normally
    # populated from `markdown_extensions`. Touching it here leaves the extension
    # LIST alone and only sets options for `toc`, which is a builtin.
    mdx = config.get("mdx_configs")
    if mdx is None:
        mdx = config.setdefault("mdx_configs", {})
    toc = mdx.setdefault("toc", {})
    toc["permalink"] = True
    toc.setdefault("title", "On this page")
    return config
