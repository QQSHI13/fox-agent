![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **48 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 21.7/23.1/25.0 | 48.1 | 116.9 | bin | 6.6/8.9/9.4 | 5 |
| claude code | 2.1.319 (Claude Code) | 201.3/203.8/244.4 | 157.2 | 340.2 | bin | 8.9/9.8/11.0 | 5 |
| codex | codex-cli 0.167.0 | 36.6/37.2/37.9 | 116.5 | 458.6 | pkg | 32.8/36.0/36.1 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.3/10.7/18.8 | 37.6 | 171.3 | bin | 9.3/10.4/10.5 | 5 |
| pi | 1.5.0 | 248.8/252.2/262.0 | 125.7 | 114.2 | pkg | 185.8/188.0/188.9 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.7, linux-x64, JIT off) | 28.1/29.0/29.4 | 74.7 | 263.0 | bin | 9.2/9.6/10.2 | 5 |
| gemini cli | 0.67.0 | 1299.5/1326.8/1355.8 | 164.8 | 102.9 | pkg | 1236.5/1263.1/1264.4 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 487.6/499.9/713.9 | 331.3 | 205.5 | pkg | 92.4/101.1/108.9 | 5 |
| crush | crush version v0.100.0 | 432.6/450.7/531.1 | 145.4 | 131.5 | pkg | 106.4/108.8/108.9 | 5 |
| aider | aider 0.86.2 | 579.2/580.3/587.4 | 68.2 | 643.7 | pkg | 660.0/690.2/710.3 | 5 |
| amp | 0.0.1794225648-g45053b (released 2026-11-09T12:00:48.000Z, 1 | 199.0/199.9/202.7 | 143.9 | 155.5 | bin | 190.1/205.5/208.5 | 5 |
| cursor-agent | 2026.11.05-86047df | 380.7/518.2/536.9 | 239.5 | 560.2 | pkg | 392.4/401.8/403.4 | 5 |
| qwen code | 0.27.0 | 457.7/471.5/699.2 | 274.2 | 293.5 | pkg | 30.3/33.5/36.3 | 5 |
| codebuff | 1.0.688 | 774.6/816.1/826.5 | 278.3 | 140.0 | bin | 823.8/835.3/852.2 | 5 |
| kilo code | 7.8.27 | 1808.2/1862.8/1979.2 | 907.2 | 720.0 | pkg | 663.9/668.0/680.0 | 5 |
| droid | 1.6.0 | 88.4/91.1/98.7 | 296.2 | 339.9 | bin | 84.3/85.3/86.8 | 5 |
| kimi code | 2.5.2 | 611.2/626.7/710.6 | 320.9 | 185.3 | bin | 473.1/494.2/545.9 | 5 |
| devin | devin 3000.12.32 (1126aba4a596) | 20.5/43.2/47.9 | 74.4 | 209.7 | bin | 4.7/4.9/6.1 | 5 |
| cline | 3.0.74 | 979.2/1031.4/1102.1 | 263.5 | 345.7 | pkg | 703.5/754.9/773.8 | 5 |
| continue | 1.5.47 | 1095.2/1118.7/1151.5 | 311.3 | 82.7 | pkg | 886.6/919.3/920.2 | 5 |
| iflow cli | 0.5.19 | 1043.2/1046.1/1050.9 | 336.3 | 180.4 | pkg | 969.6/975.3/986.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 114.3/128.1/142.3 | 98.5 | 207.4 | bin | 67.5/71.7/79.8 | 5 |

</details>

_Generated 2026-11-09T13:19:22Z on Linux x86_64 (7.0.0-1017-azure), load 1.18 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
