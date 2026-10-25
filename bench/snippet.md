![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **34 ms**, peak RSS **58 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 12.2/12.2/16.3 | 45.4 | 117.2 | bin | 5.9/6.2/6.4 | 5 |
| claude code | 2.1.310 (Claude Code) | 144.1/144.7/169.6 | 185.3 | 291.6 | bin | 6.7/8.2/9.1 | 5 |
| codex | codex-cli 0.164.0 | 29.6/29.8/30.2 | 238.6 | 444.4 | pkg | 28.5/30.5/31.4 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 7.9/8.3/8.4 | 33.7 | 171.3 | bin | 6.4/6.7/7.2 | 5 |
| pi | 1.4.0 | 181.0/185.2/191.0 | 128.8 | 111.8 | pkg | 142.0/146.8/148.1 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 25.0/28.1/29.6 | 88.1 | 263.7 | bin | 8.8/9.2/9.8 | 5 |
| gemini cli | 0.65.0 | 909.5/918.4/923.7 | 170.1 | 102.6 | pkg | 841.1/851.1/856.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 402.2/466.0/657.9 | 356.3 | 198.5 | pkg | 67.5/68.6/68.8 | 5 |
| crush | crush version v0.98.2 | 398.8/405.1/457.5 | 157.8 | 128.9 | pkg | 91.8/93.0/98.5 | 5 |
| aider | aider 0.86.2 | 396.2/399.6/404.3 | 67.3 | 642.8 | pkg | 452.5/456.1/464.8 | 5 |
| amp | 0.0.1792900834-gfb378a (released 2026-10-25T04:00:34.000Z, 4 | 136.4/137.3/143.0 | 137.9 | 160.9 | bin | 119.3/129.5/131.8 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 254.5/359.8/370.0 | 240.4 | 583.2 | pkg | 257.2/288.8/308.9 | 5 |
| qwen code | 0.26.1 | 324.1/328.8/496.5 | 323.1 | 275.4 | pkg | 23.2/23.5/24.0 | 5 |
| codebuff | 1.0.688 | 539.3/548.4/574.1 | 278.4 | 140.0 | bin | 557.0/568.2/568.7 | 5 |
| kilo code | 7.8.17 | 1307.0/1364.1/1390.8 | 890.2 | 718.6 | pkg | 501.6/511.1/512.4 | 5 |
| droid | 0.249.0 | 58.5/62.1/62.7 | 275.6 | 319.7 | bin | 52.6/54.6/59.5 | 5 |
| kimi code | 2.3.1 | 431.3/443.8/460.1 | 329.8 | 192.3 | bin | 336.5/355.2/368.6 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 17.6/31.2/35.7 | 100.4 | 217.5 | bin | 3.5/4.2/4.7 | 5 |
| cline | 3.0.73 | 729.4/748.6/884.8 | 271.3 | 330.3 | pkg | 596.2/634.1/652.2 | 5 |
| continue | 1.5.47 | 10930.5/10933.9/10936.3 | 320.1 | 82.7 | pkg | 641.1/668.6/669.0 | 5 |
| iflow cli | 0.5.19 | 749.4/755.2/853.6 | 362.8 | 180.3 | pkg | 702.6/710.8/712.8 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 84.9/97.2/105.6 | 100.5 | 207.4 | bin | 48.8/52.9/53.2 | 5 |

</details>

_Generated 2026-10-25T08:22:04Z on Linux x86_64 (6.17.0-1022-azure), load 0.77 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
