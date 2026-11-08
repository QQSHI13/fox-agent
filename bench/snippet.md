![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 21.3/25.7/27.1 | 48.3 | 116.9 | bin | 8.4/10.3/11.4 | 5 |
| claude code | 2.1.319 (Claude Code) | 201.0/209.1/253.9 | 156.9 | 340.2 | bin | 8.5/11.0/11.8 | 5 |
| codex | codex-cli 0.167.0 | 37.2/37.8/38.6 | 115.7 | 458.6 | pkg | 33.6/35.7/39.2 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.3/10.8/11.8 | 37.6 | 171.3 | bin | 9.1/10.6/10.8 | 5 |
| pi | 1.5.0 | 248.3/258.6/262.0 | 125.5 | 114.2 | pkg | 188.7/194.1/194.2 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.4, linux-x64, JIT off) | 27.1/27.7/32.6 | 73.1 | 260.5 | bin | 9.3/9.5/9.6 | 5 |
| gemini cli | 0.67.0 | 1288.2/1322.0/1342.8 | 164.8 | 102.9 | pkg | 1200.7/1206.2/1216.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 499.6/548.9/728.1 | 333.2 | 205.5 | pkg | 90.7/92.0/94.9 | 5 |
| crush | crush version v0.100.0 | 485.0/632.3/797.3 | 145.0 | 131.5 | pkg | 100.6/104.6/105.5 | 5 |
| aider | aider 0.86.2 | 559.0/565.1/587.4 | 68.1 | 643.7 | pkg | 657.8/692.1/714.0 | 5 |
| amp | 0.0.1794110442-ga8fc4f (released 2026-11-08T04:00:42.000Z, 3 | 190.4/192.4/200.9 | 143.7 | 155.5 | bin | 192.8/198.0/214.6 | 5 |
| cursor-agent | 2026.11.05-86047df | 371.3/512.0/542.8 | 240.8 | 560.2 | pkg | 382.2/405.6/407.6 | 5 |
| qwen code | 0.27.0 | 441.5/452.5/671.6 | 273.1 | 293.5 | pkg | 32.0/35.3/38.1 | 5 |
| codebuff | 1.0.688 | 744.0/755.5/803.4 | 278.1 | 140.0 | bin | 766.7/785.2/790.2 | 5 |
| kilo code | 7.8.27 | 1742.9/1751.6/1757.5 | 892.5 | 720.0 | pkg | 649.1/669.3/676.8 | 5 |
| droid | 1.6.0 | 88.6/96.3/98.8 | 297.0 | 339.9 | bin | 81.8/86.5/92.0 | 5 |
| kimi code | 2.5.2 | 609.6/621.7/633.8 | 320.7 | 185.3 | bin | 484.5/497.9/503.8 | 5 |
| devin | devin 3000.12.28 (91c3aec41579) | 20.2/50.9/52.6 | 74.9 | 209.6 | bin | 5.2/6.0/6.4 | 5 |
| cline | 3.0.74 | 900.2/934.4/1052.4 | 263.8 | 345.7 | pkg | 709.3/724.0/1249.6 | 5 |
| continue | 1.5.47 | 21606.0/21615.8/21634.1 | 311.7 | 82.7 | pkg | 918.7/924.6/925.9 | 5 |
| iflow cli | 0.5.19 | 1047.3/1057.6/1087.7 | 339.6 | 180.4 | pkg | 985.9/996.3/997.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 112.0/124.1/133.3 | 98.4 | 207.4 | bin | 68.7/71.7/74.1 | 5 |

</details>

_Generated 2026-11-08T07:06:55Z on Linux x86_64 (7.0.0-1017-azure), load 0.57 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
