![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **49 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 20.0/20.4/23.1 | 47.9 | 116.9 | bin | 6.0/7.4/7.6 | 5 |
| claude code | 2.1.319 (Claude Code) | 179.9/181.0/211.9 | 157.4 | 340.2 | bin | 9.0/9.2/9.9 | 5 |
| codex | codex-cli 0.167.0 | 34.6/35.2/37.0 | 116.1 | 458.6 | pkg | 31.5/34.6/34.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.6/10.1/10.8 | 37.7 | 171.3 | bin | 8.0/8.4/8.8 | 5 |
| pi | 1.5.0 | 236.1/238.1/247.0 | 125.6 | 114.2 | pkg | 175.9/178.1/178.4 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.7, linux-x64, JIT off) | 26.4/27.4/33.2 | 74.8 | 263.0 | bin | 8.2/9.6/9.8 | 5 |
| gemini cli | 0.67.0 | 1240.5/1249.3/1254.8 | 164.7 | 102.9 | pkg | 1159.6/1171.8/1181.1 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 468.6/487.5/665.7 | 329.4 | 205.5 | pkg | 86.3/87.7/88.1 | 5 |
| crush | crush version v0.100.0 | 621.5/628.3/669.8 | 144.7 | 131.5 | pkg | 101.7/102.3/103.3 | 5 |
| aider | aider 0.86.2 | 549.6/551.8/555.5 | 68.2 | 643.7 | pkg | 608.3/613.4/614.8 | 5 |
| amp | 0.0.1794225648-g45053b (released 2026-11-09T12:00:48.000Z, 2 | 182.6/186.9/188.8 | 144.4 | 155.5 | bin | 180.5/183.3/193.9 | 5 |
| cursor-agent | 2026.11.05-86047df | 361.9/504.0/508.2 | 239.8 | 560.2 | pkg | 387.0/395.1/395.6 | 5 |
| qwen code | 0.27.0 | 440.5/444.1/661.1 | 272.7 | 293.5 | pkg | 30.7/31.6/31.9 | 5 |
| codebuff | 1.0.688 | 717.1/722.6/772.0 | 277.7 | 140.0 | bin | 713.6/728.1/742.7 | 5 |
| kilo code | 7.8.27 | 1683.4/1703.0/1810.6 | 888.7 | 720.0 | pkg | 634.8/641.3/644.3 | 5 |
| droid | 1.6.0 | 86.0/88.4/91.2 | 295.9 | 339.9 | bin | 76.4/80.7/90.5 | 5 |
| kimi code | 2.5.2 | 607.6/616.1/638.0 | 327.9 | 185.3 | bin | 470.0/476.8/479.5 | 5 |
| devin | devin 3000.12.32 (1126aba4a596) | 19.9/44.0/49.1 | 74.5 | 209.7 | bin | 4.4/5.2/6.3 | 5 |
| cline | 3.0.74 | 904.3/940.9/949.5 | 263.9 | 345.7 | pkg | 678.2/737.6/756.0 | 5 |
| continue | 1.5.47 | 21599.9/21601.4/21603.7 | 311.0 | 82.7 | pkg | 879.6/917.0/925.5 | 5 |
| iflow cli | 0.5.19 | 1027.0/1039.8/1047.2 | 339.9 | 180.4 | pkg | 958.9/966.8/973.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 105.4/131.1/138.4 | 98.5 | 207.4 | bin | 66.7/67.3/67.7 | 5 |

</details>

_Generated 2026-11-09T12:30:35Z on Linux x86_64 (7.0.0-1017-azure), load 0.47 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
