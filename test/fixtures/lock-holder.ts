/**
 * Holds a session's turn marker from a SEPARATE process, for tests that need to
 * prove cross-process exclusion rather than simulate it.
 *
 * A hand-written `{pid: 1}` marker file proves the READ path (a live foreign pid
 * is respected) but not the WRITE path in a second process, nor that the
 * liveness check really follows pid death. This fixture is a real pid holding a
 * real marker: the test refuses while it lives, and is accepted once it dies.
 *
 * Prints "holding" once the marker is published, then stays up until killed.
 */
import { acquireTurnLock } from "../../src/store/lock.ts";

const id = process.env.FOX_LOCK_SESSION;
const kind = process.env.FOX_LOCK_KIND ?? "tui";
if (!id) {
  console.error("lock-holder: FOX_LOCK_SESSION is required");
  process.exit(2);
}

if (!acquireTurnLock(id, kind)) {
  // Someone else already holds it — say so instead of pretending.
  console.error(`lock-holder: ${id} already held`);
  process.exit(3);
}

console.log("holding");
// The marker is deliberately NOT released on exit: a crash must leave the file
// behind so the stale-holder path is what the test observes.
setInterval(() => {}, 1000);
