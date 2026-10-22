/*
 * md.js - the gateway UI's own markdown renderer. No CDN, no dependency.
 *
 * Why not `marked` from a CDN (what the old UI did): the gateway is a local
 * tool, and a local tool that needs the internet to render a transcript is
 * broken exactly when you are debugging a network problem. It is also a
 * supply-chain surface: a 38 KB blob from a third party runs with access to the
 * whole transcript, which can contain anything the agent has read.
 *
 * Scope is deliberate - the subset a transcript actually uses: headings,
 * paragraphs, fenced code, inline code, bold/italic/strike, links, ordered and
 * unordered lists (nested), blockquotes, tables, rules. Anything else is shown
 * as literal text rather than silently dropped.
 *
 * Safety: ALL text is escaped before any rule runs, so raw HTML in a model reply
 * is displayed, never executed. Links whose scheme is not http(s)/mailto (and
 * relative links) are unwrapped to plain text - `javascript:` in a model's
 * reply must not become a clickable link.
 *
 * A classic script, not an ES module: that keeps `ui.html` openable straight
 * from disk (file:// blocks module imports of other files' cross-origin, and
 * this file is also loaded by `bun test` via eval).
 */
(function (global) {
  "use strict";

  /** HTML-escape. Everything that reaches the output goes through this first. */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** A URL safe to put in href, or "" (caller then renders plain text). */
  function safeUrl(raw) {
    var h = String(raw || "").trim();
    if (!h) return "";
    // Anything with a scheme must be http(s) or mailto. This rejects
    // javascript:, data:, vbscript:, file: - the set that turns a transcript
    // line into an XSS or a local-file probe.
    if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return /^(https?|mailto):/i.test(h) ? h : "";
    return h; // relative / anchor
  }

  function link(href, text, title) {
    var h = safeUrl(href.replace(/&amp;/g, "&"));
    if (!h) return text;
    var t = title ? ' title="' + title + '"' : "";
    return '<a href="' + esc(h) + '"' + t + ' rel="noopener noreferrer nofollow" target="_blank">' + text + "</a>";
  }

  /**
   * Inline spans. Code spans are stashed first so their contents cannot be
   * re-interpreted (`` `**not bold**` `` stays literal) - the classic bug in
   * hand-rolled renderers.
   */
  function inline(src) {
    var stash = [];
    var keep = function (html) {
      stash.push(html);
      return "\u0001" + (stash.length - 1) + "\u0001";
    };

    var s = esc(src);

    // `code` and ``code with ` inside``
    s = s.replace(/(`+)([\s\S]*?)\1(?!`)/g, function (m, ticks, body) {
      return keep("<code>" + body.replace(/^ (.*) $/, "$1") + "</code>");
    });

    // links [text](url "title")
    s = s.replace(/\[([^\]\n]*)\]\(\s*([^()\s]+)(?:\s+&quot;([^&]*)&quot;)?\s*\)/g, function (m, text, href, title) {
      return keep(link(href, text, title));
    });

    // autolinks <https://...>
    s = s.replace(/&lt;((?:https?:\/\/)[^\s&]+)&gt;/g, function (m, href) {
      return keep(link(href, href));
    });

    // bold, then italic, then strike. Underscore emphasis needs a non-word
    // boundary so MAX_BG_TASKS_PER_SESSION is not mangled.
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^\w_])__(?=\S)([\s\S]*?\S)__(?![\w_])/g, "$1<strong>$2</strong>");
    s = s.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?![\w_])/g, "$1<em>$2</em>");
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");

    // two trailing spaces = hard break
    s = s.replace(/ {2,}\n/g, "<br>\n");

    return s.replace(/\u0001(\d+)\u0001/g, function (m, i) {
      return stash[Number(i)];
    });
  }

  var FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w#+.\-]*)\s*$/;
  var HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  var HR = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
  var UL = /^(\s*)[-*+]\s+(.*)$/;
  var OL = /^(\s*)\d{1,9}[.)]\s+(.*)$/;
  var QUOTE = /^\s{0,3}>\s?(.*)$/;
  var TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/;
  var blank = function (l) {
    return /^\s*$/.test(l);
  };
  var startsBlock = function (l) {
    return FENCE.test(l) || HEAD.test(l) || HR.test(l) || QUOTE.test(l) || UL.test(l) || OL.test(l);
  };

  function dedent(lines) {
    var min = Infinity;
    for (var i = 0; i < lines.length; i++) {
      if (blank(lines[i])) continue;
      var m = lines[i].match(/^(\s*)/)[1].length;
      if (m < min) min = m;
    }
    if (!isFinite(min) || min === 0) return lines;
    return lines.map(function (l) {
      return l.slice(min);
    });
  }

  function splitRow(line) {
    var row = line.trim();
    if (row.startsWith("|")) row = row.slice(1);
    if (row.endsWith("|")) row = row.slice(0, -1);
    var cells = [];
    var cur = "";
    var inCode = false;
    for (var i = 0; i < row.length; i++) {
      var ch = row[i];
      if (ch === "\\" && row[i + 1] === "|") {
        cur += "|";
        i++;
        continue;
      }
      if (ch === "`") inCode = !inCode;
      if (ch === "|" && !inCode) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  /** Blocks. `lines` is a plain array of source lines (already \n-split). */
  function blocks(lines) {
    var out = [];
    var i = 0;
    var n = lines.length;

    while (i < n) {
      var line = lines[i];

      if (blank(line)) {
        i++;
        continue;
      }

      // fenced code: runs to the closing fence, or to EOF while streaming
      var f = line.match(FENCE);
      if (f) {
        var fence = f[1];
        var lang = f[2] || "";
        var body = [];
        i++;
        while (i < n) {
          var close = lines[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
          if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
            i++;
            break;
          }
          body.push(lines[i]);
          i++;
        }
        out.push(
          '<pre class="code"' +
            (lang ? ' data-lang="' + esc(lang) + '"' : "") +
            "><code>" +
            esc(body.join("\n")) +
            "</code></pre>",
        );
        continue;
      }

      var h = line.match(HEAD);
      if (h) {
        var lvl = h[1].length;
        out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">");
        i++;
        continue;
      }

      if (HR.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }

      // blockquote: one level at a time; recursion handles nesting
      if (QUOTE.test(line)) {
        var q = [];
        while (i < n && (QUOTE.test(lines[i]) || (q.length && !blank(lines[i]) && !startsBlock(lines[i]) && !TABLE_SEP.test(lines[i]) && lines[i][0] === ">"))) {
          var mq = lines[i].match(QUOTE);
          q.push(mq ? mq[1] : lines[i]);
          i++;
        }
        out.push("<blockquote>\n" + blocks(q).join("\n") + "\n</blockquote>");
        continue;
      }

      // table: a header row followed by a separator row
      if (line.indexOf("|") >= 0 && i + 1 < n && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf("|") >= 0) {
        var head = splitRow(line);
        var seps = splitRow(lines[i + 1]);
        var aligns = seps.map(function (s) {
          var left = s.startsWith(":");
          var right = s.endsWith(":");
          return left && right ? "center" : right ? "right" : left ? "left" : "";
        });
        var rows = [];
        i += 2;
        while (i < n && !blank(lines[i]) && lines[i].indexOf("|") >= 0) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        var cell = function (tag, text, idx) {
          var a = aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : "";
          return "<" + tag + a + ">" + inline(text || "") + "</" + tag + ">";
        };
        var html =
          "<table><thead><tr>" +
          head.map(function (c, idx) {
            return cell("th", c, idx);
          }).join("") +
          "</tr></thead><tbody>" +
          rows
            .map(function (r) {
              return (
                "<tr>" +
                head
                  .map(function (_, idx) {
                    return cell("td", r[idx], idx);
                  })
                  .join("") +
                "</tr>"
              );
            })
            .join("") +
          "</tbody></table>";
        out.push(html);
        continue;
      }

      // lists: items of one kind, with nested blocks inside an item
      var isUL = UL.test(line);
      var isOL = OL.test(line);
      if (isUL || isOL) {
        var ordered = isOL;
        var items = [];
        while (i < n) {
          var lm = lines[i].match(ordered ? OL : UL);
          if (!lm) break;
          var indent = lm[1].length;
          if (indent > 3) break; // a deeper marker belongs to the item above
          var itemLines = [lm[2]];
          i++;
          // continuation: indented lines, blank lines, or another nested list
          while (i < n) {
            if (blank(lines[i])) {
              // a blank ends the item unless the next line is still indented
              var j = i + 1;
              while (j < n && blank(lines[j])) j++;
              if (j < n && /^\s{2,}/.test(lines[j])) {
                itemLines.push("");
                i++;
                continue;
              }
              break;
            }
            var nm = lines[i].match(ordered ? OL : UL);
            if (nm && nm[1].length <= indent) break;
            if (/^\s{2,}/.test(lines[i])) {
              itemLines.push(lines[i]);
              i++;
              continue;
            }
            // a lazy paragraph continuation
            if (!startsBlock(lines[i])) {
              itemLines.push(lines[i]);
              i++;
              continue;
            }
            break;
          }
          items.push(itemLines);
        }
        var listHtml = items
          .map(function (raw) {
            var rest = dedent(raw.slice(1));
            // A task item ("- [ ] x") renders a real disabled checkbox: an agent
            // todo list is the single most common list in a transcript, and a
            // literal "[ ]" reads as a link that failed to render.
            var task = raw[0].match(/^\[([ xX])\]\s+([\s\S]*)$/);
            var lead = "";
            var first = raw[0];
            if (task) {
              lead =
                '<input type="checkbox" disabled' +
                (task[1].toLowerCase() === "x" ? " checked" : "") +
                ' aria-label="' +
                (task[1].toLowerCase() === "x" ? "done" : "todo") +
                '"> ';
              first = task[2];
            }
            var inner;
            if (rest.length && rest.some(startsBlock)) inner = inline(first) + "\n" + blocks(rest).join("\n");
            else inner = inline([first].concat(rest).join("\n"));
            return '<li' + (task ? ' class="task"' : "") + ">" + lead + inner + "</li>";
          })
          .join("\n");
        out.push(ordered ? "<ol>\n" + listHtml + "\n</ol>" : "<ul>\n" + listHtml + "\n</ul>");
        continue;
      }

      // paragraph: up to a blank line or the start of another block
      var para = [line];
      i++;
      while (i < n && !blank(lines[i]) && !startsBlock(lines[i]) && !TABLE_SEP.test(lines[i])) {
        // a table header followed by its separator ends the paragraph
        if (lines[i].indexOf("|") >= 0 && i + 1 < n && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf("|") >= 0) break;
        para.push(lines[i]);
        i++;
      }
      out.push("<p>" + inline(para.join("\n")) + "</p>");
    }
    return out;
  }

  /** Render markdown to an HTML string. Never throws on malformed input. */
  function render(src) {
    try {
      return blocks(String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n")).join("\n");
    } catch (e) {
      // A renderer bug must not blank a transcript: show the source instead.
      return "<pre>" + esc(src) + "</pre>";
    }
  }

  global.FoxMD = { render: render, escape: esc, inline: inline };
})(typeof globalThis !== "undefined" ? globalThis : this);
