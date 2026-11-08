![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **40 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 19.4/20.8/21.5 | 47.9 | 116.9 | bin | 6.0/7.1/7.2 | 5 |
| claude code | 2.1.319 (Claude Code) | 165.5/177.4/272.1 | 157.3 | 340.2 | bin | 11.7/12.3/12.7 | 5 |
| codex | codex-cli 0.167.0 | 32.0/32.8/33.8 | 115.6 | 458.6 | pkg | 33.2/49.6/54.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.3/9.9/22.5 | 33.9 | 171.3 | bin | 7.9/8.0/8.2 | 5 |
| pi | 1.5.0 | 208.6/213.1/218.3 | 124.4 | 114.2 | pkg | 155.6/159.1/164.2 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.4, linux-x64, JIT off) | 26.8/27.8/31.2 | 73.3 | 260.5 | bin | 7.5/14.9/19.5 | 5 |
| gemini cli | 0.67.0 | 1071.1/1110.0/1110.4 | 164.7 | 102.9 | pkg | 1021.9/1079.6/1087.7 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 431.1/441.1/642.6 | 330.8 | 205.5 | pkg | 78.8/83.3/86.5 | 5 |
| crush | crush version v0.100.0 | 376.4/380.2/849.6 | 145.2 | 131.5 | pkg | 87.8/89.5/90.8 | 5 |
| aider | aider 0.86.2 | 410.0/439.6/453.5 | 68.2 | 643.7 | pkg | 538.8/570.6/585.3 | 5 |
| amp | 0.0.1794110442-ga8fc4f (released 2026-11-08T04:00:42.000Z, 3 | 154.3/168.0/172.9 | 143.6 | 155.5 | bin | 154.6/174.0/180.9 | 5 |
| cursor-agent | 2026.11.05-86047df | 311.1/422.6/483.3 | 240.7 | 560.2 | pkg | 315.3/335.1/339.6 | 5 |
| qwen code | 0.27.0 | 358.3/384.0/571.2 | 273.3 | 293.5 | pkg | 25.9/30.7/32.2 | 5 |
| codebuff | 1.0.688 | 683.8/736.5/793.1 | 277.9 | 140.0 | bin | 689.1/778.8/785.9 | 5 |
| kilo code | 7.8.27 | 1665.1/1731.8/1757.9 | 874.0 | 720.0 | pkg | 639.7/665.2/672.0 | 5 |
| droid | 1.6.0 | 83.6/89.8/125.5 | 296.3 | 339.9 | bin | 70.8/77.3/88.2 | 5 |
| kimi code | 2.5.2 | 563.0/586.7/620.5 | 321.1 | 185.3 | bin | 435.7/444.3/509.6 | 5 |
| devin | devin 3000.12.28 (91c3aec41579) | 19.8/41.1/43.1 | 74.6 | 209.6 | bin | 5.3/5.6/5.7 | 5 |
| cline | 3.0.74 | 845.0/881.1/894.9 | 263.0 | 345.7 | pkg | 696.0/717.4/737.9 | 5 |
| continue | 1.5.47 | 21504.1/21570.7/21587.0 | 308.5 | 82.7 | pkg | 793.6/831.4/845.9 | 5 |
| iflow cli | 0.5.19 | 892.0/898.9/913.7 | 339.1 | 180.4 | pkg | 827.8/840.7/870.7 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 111.5/129.5/135.3 | 98.6 | 207.4 | bin | 60.2/64.4/65.3 | 5 |

</details>

_Generated 2026-11-08T07:20:59Z on Linux x86_64 (7.0.0-1017-azure), load 0.66 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
