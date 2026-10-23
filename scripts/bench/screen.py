"""The bench's terminal model: what is actually ON SCREEN after escape parsing.

Why this exists at all: the bench used to decide "the probe appeared" by looking
for the literal bytes `hellobench` in the raw PTY stream. That is not what a
terminal does, and it produced three separate classes of wrong answer:

  * A cell-diffing TUI (jcode) redraws with cursor moves and never emits the
    probe as one contiguous run, so it read as "never echoed" (n/a).
  * A TUI that wraps long input inserts a newline mid-string, splitting it.
  * Escape traffic can arrive between the characters of the probe.

A person judges "my typing appeared" by looking at the screen, so the bench now
does the same: parse the escape stream into a character grid and search the
GRID. Wrapping, cell-diffs and interleaved SGR all resolve to their visible
result, which is the only thing the metric was ever trying to measure.

Deliberately small and dependency-free (the bench must run on a stock runner
with no pip installs): enough of DEC/ANSI to place text where a terminal would.
Anything it does not model degrades to "character written at the cursor", which
is right far more often than dropping the byte.
"""
import re

# One token of the escape stream: either an escape sequence we recognise, or a
# run of printable text. Everything between escapes is literal on screen.
_TOKEN = re.compile(
    rb"(\x1b\[[0-9;?<>=!]*[a-zA-Z@`])"      # CSI
    rb"|(\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))"  # OSC
    rb"|(\x1b[()][0-9A-Z])"                 # charset select
    rb"|(\x1b[=>78M])"                      # keypad / save / restore / index
    rb"|(\x1b.)"                            # any other 2-byte escape
    rb"|([\r\n\x08\x07])"                   # CR LF BS BEL
    rb"|([^\x1b\r\n\x08\x07]+)"             # printable run
)


class Screen:
    """A character grid fed from a byte stream.

    Width/height are generous and fixed: the goal is "did this text land", not
    pixel-accurate reflow, and clamping to a real PTY size would make the answer
    depend on the runner's window. Text that scrolls past the bottom is kept in
    ``_scrollback`` so a long startup banner cannot push the probe out of the
    window before we look.
    """

    def __init__(self, width=400, height=200):
        self.w = width
        self.h = height
        self.rows = [[" "] * width for _ in range(height)]
        self.x = 0
        self.y = 0
        self._scrollback = []  # rows pushed off the top, oldest first
        # Escape sequences arrive split across PTY reads all the time — fox's
        # very first chunk is a bare 6-byte "\x1b[?25l". Feeding the tail of a
        # sequence as text paints \x1b[?25l on the grid as literal characters
        # and shifts everything after it, so an incomplete tail is held here
        # until the next read completes it.
        self._pending = b""
        self._utf = b""  # an incomplete UTF-8 sequence split across reads

    def _split_tail(self, data):
        """Split off a trailing incomplete escape sequence.

        Only the LAST escape can be incomplete, so scan back for the last ESC and
        decide explicitly whether the sequence it starts is finished. Tokenizing
        and asking "did we consume everything" is NOT sufficient: the generic
        2-byte escape arm happily eats `\\x1b[` and leaves the parameters to be
        painted as literal text, which shifted every following character.
        """
        esc = data.rfind(b"\x1b")
        if esc < 0:
            return data, b""
        tail = data[esc:]

        if len(tail) == 1:  # bare ESC: the final byte has not arrived yet
            return data[:esc], tail

        if tail[1:2] == b"]":  # OSC ends with BEL or ST, never a final byte
            if b"\x07" in tail[2:] or b"\x1b\\" in tail[2:]:
                return data, b""
            return data[:esc], tail

        if tail[1:2] == b"[":  # CSI: parameters, then a final byte 0x40-0x7e
            if any(0x40 <= b <= 0x7E for b in tail[2:]):
                return data, b""
            return data[:esc], tail

        if tail[1:2] in (b"(", b")") and len(tail) < 3:  # charset select
            return data[:esc], tail

        return data, b""

    # ---- cursor helpers -------------------------------------------------
    def _row(self, y):
        return self.rows[y] if 0 <= y < self.h else None

    def _put(self, ch):
        if self.x >= self.w:
            self.x = 0
            self._newline()
        row = self._row(self.y)
        if row is not None:
            row[self.x] = ch
        self.x += 1

    def _newline(self):
        self.y += 1
        if self.y >= self.h:
            # scroll: the top row survives for later inspection
            self._scrollback.append("".join(self.rows[0]).rstrip())
            if len(self._scrollback) > 2000:
                del self._scrollback[0]
            self.rows.pop(0)
            self.rows.append([" "] * self.w)
            self.y = self.h - 1

    # ---- CSI ------------------------------------------------------------
    def _csi(self, seq):
        # seq is b"\x1b[...X"; the final byte is the command
        body = seq[2:-1].decode("latin-1")
        cmd = chr(seq[-1])
        # private modes (?25l etc.) carry a "?" prefix and mean nothing here
        if body[:1] in ("?", "<", "=", ">", "!"):
            return
        params = []
        for part in body.split(";"):
            try:
                params.append(int(part) if part else 0)
            except ValueError:
                params.append(0)
        n = params[0] if params else 0

        if cmd == "H" or cmd == "f":       # cursor position
            row = (params[0] if len(params) > 0 and params[0] else 1) - 1
            col = (params[1] if len(params) > 1 and params[1] else 1) - 1
            self.y = max(0, min(self.h - 1, row))
            self.x = max(0, min(self.w - 1, col))
        elif cmd == "A":
            self.y = max(0, self.y - (n or 1))
        elif cmd == "B":
            self.y = min(self.h - 1, self.y + (n or 1))
        elif cmd == "C":
            self.x = min(self.w - 1, self.x + (n or 1))
        elif cmd == "D":
            self.x = max(0, self.x - (n or 1))
        elif cmd == "G":                   # column absolute
            self.x = max(0, min(self.w - 1, (n or 1) - 1))
        elif cmd == "d":                   # row absolute
            self.y = max(0, min(self.h - 1, (n or 1) - 1))
        elif cmd == "J":                   # erase display
            if n in (2, 3):
                for r in self.rows:
                    for i in range(self.w):
                        r[i] = " "
        elif cmd == "K":                   # erase in line
            row = self._row(self.y)
            if row is not None:
                for i in range(self.x, self.w):
                    row[i] = " "
        # SGR (m), modes (h/l), scrolling regions, etc.: no effect on content

    # ---- driver ---------------------------------------------------------
    def feed(self, data):
        data = self._pending + data
        data, self._pending = self._split_tail(data)
        for m in _TOKEN.finditer(data):
            csi, osc, charset, keypad, other, ctrl, text = m.groups()
            if text is not None:
                # Decode as UTF-8, not one byte per cell. Claude/opencode/pi
                # draw box-drawing and block characters, so byte-wise writes
                # put 2-3 junk cells on the grid per glyph and pushed the probe
                # off its real column. A truncated tail (split read) is held in
                # _utf and completed by the next feed.
                buf = self._utf + text
                self._utf = b""
                try:
                    decoded = buf.decode("utf-8")
                except UnicodeDecodeError as e:
                    if e.start >= len(buf) - 3 and e.reason == "unexpected end of data":
                        decoded = buf[: e.start].decode("utf-8", "replace")
                        self._utf = buf[e.start:]
                    else:
                        decoded = buf.decode("utf-8", "replace")
                for ch in decoded:
                    if ch == "\t":
                        self.x = min(self.w - 1, (self.x // 8 + 1) * 8)
                        continue
                    self._put(ch)
            elif csi is not None:
                self._csi(csi)
            elif ctrl is not None:
                if ctrl == b"\r":
                    self.x = 0
                elif ctrl == b"\n":
                    self._newline()
                elif ctrl == b"\x08":
                    self.x = max(0, self.x - 1)
            # OSC / charset / keypad / other: no visible characters
        return self

    def contains(self, needle):
        """True once `needle` reads out of the grid.

        Checks each row, then the rows joined end-to-end: a narrow terminal
        wraps the input box, so "hello" ending row 0 and "bench" starting row 1
        is the same visible text as one row. The probe is a nonsense word, so
        the cross-row join cannot collide with real content.
        """
        text = needle.decode("utf-8", "replace")
        rows = ["".join(r) for r in self.rows]
        if any(text in r for r in rows):
            return True
        if text in "".join(rows):
            return True
        return any(text in line for line in self._scrollback)

    def snapshot(self, limit=1000):
        return "\n".join(
            "".join(r).rstrip() for r in self.rows if "".join(r).strip()
        )[:limit]
