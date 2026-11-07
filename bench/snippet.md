![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 25.5/29.5/31.3 | 47.9 | 116.9 | bin | 6.9/7.4/8.0 | 5 |
| claude code | 2.1.319 (Claude Code) | 228.0/231.6/268.1 | 157.2 | 340.2 | bin | 8.8/9.2/10.0 | 5 |
| codex | codex-cli 0.167.0 | 38.7/39.8/42.7 | 116.3 | 458.6 | pkg | 34.7/36.0/42.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.4/9.8/10.1 | 38.0 | 171.3 | bin | 8.1/8.3/8.5 | 5 |
| pi | 1.5.0 | 293.3/296.5/305.2 | 126.3 | 114.2 | pkg | 215.5/217.7/217.8 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.3, linux-x64, JIT off) | 30.6/30.8/42.8 | 73.2 | 259.5 | bin | 7.9/9.3/9.9 | 5 |
| gemini cli | 0.67.0 | 1508.4/1530.5/1538.5 | 143.0 | 102.9 | pkg | 1439.0/1465.0/1466.9 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 607.2/613.0/829.3 | 332.6 | 205.5 | pkg | 104.9/105.3/111.6 | 5 |
| crush | crush version v0.100.0 | 550.1/700.3/805.7 | 144.7 | 131.5 | pkg | 117.4/119.1/120.5 | 5 |
| aider | aider 0.86.2 | 663.2/667.8/671.7 | 68.2 | 643.7 | pkg | 743.6/749.3/749.8 | 5 |
| amp | 0.0.1794009661-g88d32b (released 2026-11-07T00:01:01.000Z, 5 | 232.3/244.7/248.8 | 142.2 | 155.4 | bin | 228.5/230.6/232.1 | 5 |
| cursor-agent | 2026.11.05-86047df | 458.0/649.0/655.9 | 239.8 | 560.2 | pkg | 485.6/487.8/489.7 | 5 |
| qwen code | 0.26.9 | 537.4/546.7/824.0 | 273.9 | 293.4 | pkg | 37.0/37.2/38.3 | 5 |
| codebuff | 1.0.688 | 931.2/955.2/1012.9 | 277.9 | 140.0 | bin | 955.7/977.4/994.3 | 5 |
| kilo code | 7.8.27 | 2411.3/2445.1/2533.3 | 910.0 | 720.0 | pkg | 868.0/877.5/883.8 | 5 |
| droid | 1.6.0 | 104.5/109.9/120.6 | 296.7 | 339.9 | bin | 91.3/96.9/97.5 | 5 |
| kimi code | 2.5.2 | 757.5/763.1/878.4 | 327.7 | 185.3 | bin | 648.1/683.5/713.5 | 5 |
| devin | devin 3000.12.17 (d23bb600ed8f) | 22.0/50.2/52.2 | 74.8 | 213.1 | bin | 6.0/6.1/6.4 | 5 |
| cline | 3.0.74 | 1194.6/1213.5/1454.0 | 260.5 | 345.6 | pkg | 885.3/1268.9/1304.0 | 5 |
| continue | 1.5.47 | 21737.0/21745.1/21748.3 | 312.4 | 82.7 | pkg | 1095.1/1113.4/1117.7 | 5 |
| iflow cli | 0.5.19 | 1229.8/1234.5/1255.3 | 338.0 | 180.4 | pkg | 1139.2/1153.4/1155.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 135.1/150.0/156.3 | 98.5 | 207.4 | bin | 78.4/80.9/82.3 | 5 |

</details>

_Generated 2026-11-07T05:16:13Z on Linux x86_64 (7.0.0-1017-azure), load 0.65 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
