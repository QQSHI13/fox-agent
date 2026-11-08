![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **57 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 16.3/19.1/21.1 | 47.9 | 116.9 | bin | 5.5/6.1/6.1 | 5 |
| claude code | 2.1.319 (Claude Code) | 148.7/148.9/175.4 | 175.7 | 340.2 | bin | 8.6/8.8/8.8 | 5 |
| codex | codex-cli 0.167.0 | 30.0/30.7/52.9 | 116.1 | 458.6 | pkg | 27.6/28.5/28.9 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 8.9/9.1/59.4 | 38.0 | 171.3 | bin | 7.3/7.7/7.7 | 5 |
| pi | 1.5.0 | 178.9/179.7/184.5 | 124.0 | 114.2 | pkg | 134.0/134.6/137.1 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.4, linux-x64, JIT off) | 22.7/23.1/26.6 | 73.2 | 260.5 | bin | 6.9/8.3/8.8 | 5 |
| gemini cli | 0.67.0 | 947.5/977.0/1025.2 | 164.9 | 102.9 | pkg | 873.8/923.2/941.6 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 388.5/392.5/533.5 | 332.7 | 205.5 | pkg | 70.6/72.5/72.7 | 5 |
| crush | crush version v0.100.0 | 400.6/419.7/560.1 | 145.8 | 131.5 | pkg | 83.5/86.1/86.5 | 5 |
| aider | aider 0.86.2 | 395.8/398.8/410.5 | 68.2 | 643.7 | pkg | 456.5/466.1/473.1 | 5 |
| amp | 0.0.1794110442-ga8fc4f (released 2026-11-08T04:00:42.000Z, 2 | 146.7/150.8/151.6 | 143.3 | 155.5 | bin | 143.5/153.0/164.3 | 5 |
| cursor-agent | 2026.11.05-86047df | 273.4/389.7/392.3 | 239.8 | 560.2 | pkg | 296.4/337.9/346.2 | 5 |
| qwen code | 0.27.0 | 330.2/338.6/497.2 | 273.3 | 293.5 | pkg | 23.4/25.7/27.9 | 5 |
| codebuff | 1.0.688 | 573.2/584.4/619.7 | 278.3 | 140.0 | bin | 592.8/595.0/599.4 | 5 |
| kilo code | 7.8.27 | 1354.9/1483.4/1508.8 | 884.5 | 720.0 | pkg | 507.0/516.2/524.5 | 5 |
| droid | 1.6.0 | 72.2/75.4/79.9 | 297.6 | 339.9 | bin | 68.7/69.5/82.4 | 5 |
| kimi code | 2.5.2 | 489.7/534.6/591.3 | 325.0 | 185.3 | bin | 390.5/398.0/404.9 | 5 |
| devin | devin 3000.12.28 (91c3aec41579) | 21.2/39.6/41.0 | 74.8 | 209.6 | bin | 4.0/5.5/5.6 | 5 |
| cline | 3.0.74 | 797.6/824.1/970.4 | 267.4 | 345.7 | pkg | 614.8/705.1/937.1 | 5 |
| continue | 1.5.47 | 21473.2/21477.1/21489.7 | 306.9 | 82.7 | pkg | 712.0/731.8/734.8 | 5 |
| iflow cli | 0.5.19 | 806.4/814.3/852.1 | 338.8 | 180.4 | pkg | 741.4/748.1/760.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 89.0/99.5/103.8 | 98.6 | 207.4 | bin | 52.7/54.7/56.2 | 5 |

</details>

_Generated 2026-11-08T06:24:35Z on Linux x86_64 (7.0.0-1017-azure), load 0.56 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
