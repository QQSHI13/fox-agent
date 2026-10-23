/**
 * A C++ grammar — because the highlighter library does not ship one.
 *
 * `@speed-highlight/core` ships `c.js` (which `GRAMMARS` maps as `c`) and no C++
 * at all: its `languages/` directory has asm, bash, bf, c, css, csv, diff,
 * docker, git, go, html, http, ini, java, js, json, lua, make, md, pl, py, rs,
 * sql, toml, ts, uri, xml, yaml — and nothing for `cpp`. Mapping `cpp` onto the C
 * grammar would be close but wrong in exactly the places a reader looks: C has
 * no `class`, `template`, `namespace`, `constexpr`, `nullptr`, `virtual` or
 * `override`, so every C++ keyword would render as a bare identifier while
 * `int`/`char` lit up. A fence that half-highlights is more confusing than one
 * that does not, so the grammar lives here instead.
 *
 * The shape is the library's own (see `ShjGrammar` in its typings): an ordered
 * list of rules, each `{match, type}` or `{expand}` for the shared string/number
 * patterns. ORDER IS THE ALGORITHM — the tokenizer takes the first rule that
 * matches at the cursor — so comments come before operators, raw strings before
 * the generic string rule, and keywords before identifiers.
 *
 * No rule expands into a NAMED sub-language (`sub: "asm"` and friends in the
 * library's own grammars): our call site is `tokenizeWith(text, grammar, cb)`
 * with no `languages` registry, so a named sub would have nothing to resolve to.
 * Inline sub-grammars (arrays) are fine and used below for the preprocessor.
 */
import type { ShjGrammar } from "@speed-highlight/core/tokenize";

/**
 * C++ keywords + the alternative operator spellings (`and`, `or`, `not`, …),
 * which are standard C++ and appear in real code. `final`/`override` are
 * contextual keywords, and are what a reader scans for in a class body.
 */
const CPP_KEYWORDS =
  /\b(alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|co_await|co_return|co_yield|compl|concept|const|consteval|constexpr|constinit|const_cast|continue|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|final|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|override|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq)\b/g;

export const cppGrammar: ShjGrammar = [
  // Line and block comments first: everything inside them must stay unparsed,
  // or the quotes and stars in a commented-out block get colored as code.
  { match: /\/\/.*\n?|\/\*((?!\*\/)[^])*(\*\/)?/g, type: "cmnt" },

  // Raw string literals, R"delim( ... )delim", BEFORE the generic string rule —
  // otherwise the quote inside `R"(` opens a normal string that swallows the
  // rest of the line. The delimiter is any character except space, paren and
  // backslash, and must repeat to close.
  { match: /R"([^ ()\\]*)\(((?!\)\1")[^])*\)\1"/g, type: "str" },

  { expand: "str" },
  { expand: "num" },

  // `#include <vector>`: the directive is a keyword, the path is a string. The
  // sub-grammar only sees the matched region, so `<` here cannot be mistaken for
  // a comparison operator elsewhere in the file.
  {
    type: "kwd",
    match: /#\s*(?:include|import)\s*(<[^>\n]*>|"[^"\n]*")/g,
    sub: [{ type: "str", match: /<[^>\n]*>|"[^"\n]*"/g }],
  },
  // every other preprocessor directive (`#define`, `#pragma`, `#ifdef`, …)
  { type: "kwd", match: /#\s*[a-zA-Z]+\b/g },

  { type: "kwd", match: CPP_KEYWORDS },

  // `std` in `std::vector`, and any other namespace prefix. A `type` tint (not
  // `class`) because it names a scope, not a type.
  { type: "type", match: /\b[a-zA-Z_]\w*(?=::)/g },

  // Operators and binding punctuation, explicitly including the two C++-only
  // ones (`::` scope resolution, `->` member access) that the C set lacks.
  { type: "oper", match: /::|->|[/*+:?&|%^~=!,<>.^-]+/g },

  // A call: an identifier immediately followed by an open paren. After keywords
  // so `if (` and `while (` stay keywords rather than becoming function names.
  { type: "func", match: /[a-zA-Z_][\w_]*(?=\s*\()/g },

  // CamelCase identifiers as class/struct/enum names — the C++ convention the
  // library's own C grammar also uses. Last, so it cannot outrank the rules
  // above that already claimed a token.
  { type: "class", match: /\b[A-Z][\w_]*\b/g },
];
