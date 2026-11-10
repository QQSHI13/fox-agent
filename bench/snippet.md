![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **62 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 26.9/29.7/35.8 | 48.1 | 116.9 | bin | 7.7/8.7/8.9 | 5 |
| claude code | 2.1.322 (Claude Code) | 202.7/208.7/227.1 | 160.3 | 341.9 | bin | 10.3/13.1/14.4 | 5 |
| codex | codex-cli 0.167.0 | 41.5/42.0/42.7 | 116.0 | 458.6 | pkg | 39.9/41.1/41.5 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.4/11.7/11.7 | 37.4 | 171.3 | bin | 9.4/9.7/9.8 | 5 |
| pi | 1.5.1 | 311.1/316.5/334.5 | 121.9 | 115.2 | pkg | 232.3/235.2/236.0 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.7, linux-x64, JIT off) | 33.5/34.5/35.6 | 75.0 | 263.0 | bin | 7.7/9.1/10.1 | 5 |
| gemini cli | 0.67.0 | 1632.4/1660.0/1689.0 | 164.8 | 102.9 | pkg | 1555.4/1562.6/1574.8 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.108. | 641.2/710.3/864.3 | 335.5 | 210.5 | pkg | 110.5/112.3/114.1 | 5 |
| crush | crush version v0.100.0 | 586.9/635.9/949.6 | 144.6 | 131.5 | pkg | 129.5/130.8/133.5 | 5 |
| aider | aider 0.86.2 | 741.3/759.3/759.9 | 68.2 | 643.7 | pkg | 804.6/830.4/831.6 | 5 |
| amp | 0.0.1794308901-gd9882c (released 2026-11-10T11:08:21.000Z, 3 | 233.2/245.1/247.2 | 143.7 | 155.5 | bin | 224.8/245.3/254.0 | 5 |
| cursor-agent | 2026.11.05-86047df | 483.1/657.2/673.7 | 239.7 | 560.2 | pkg | 501.8/511.5/516.4 | 5 |
| qwen code | 0.27.1 | 604.8/608.6/892.0 | 273.5 | 294.0 | pkg | 34.6/39.5/41.1 | 5 |
| codebuff | 1.0.688 | 893.3/908.3/950.9 | 277.9 | 140.0 | bin | 909.6/936.3/951.8 | 5 |
| kilo code | 7.8.27 | 2248.3/2291.0/2330.3 | 872.5 | 720.0 | pkg | 814.5/821.4/825.0 | 5 |
| droid | 1.7.0 | 112.3/124.4/129.6 | 299.6 | 340.3 | bin | 99.8/110.1/112.0 | 5 |
| kimi code | 2.5.2 | 778.0/794.9/810.0 | 323.9 | 185.3 | bin | 617.6/621.8/649.1 | 5 |
| devin | devin 3000.12.43 (517d03d73926) | 27.5/55.0/62.7 | 75.6 | 209.7 | bin | 6.4/7.1/7.6 | 5 |
| cline | 3.0.74 | 1312.2/1367.2/1453.5 | 269.1 | 346.0 | pkg | 890.0/969.8/976.6 | 5 |
| continue | 1.5.47 | 21755.8/21784.9/21793.4 | 312.3 | 82.7 | pkg | 1147.4/1161.1/1172.0 | 5 |
| iflow cli | 0.5.19 | 1335.7/1344.6/1359.2 | 339.0 | 180.4 | pkg | 1250.2/1269.3/1272.7 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 144.0/159.7/165.6 | 98.5 | 207.4 | bin | 85.7/88.4/90.9 | 5 |

</details>

_Generated 2026-11-10T11:47:41Z on Linux x86_64 (7.0.0-1017-azure), load 0.65 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
