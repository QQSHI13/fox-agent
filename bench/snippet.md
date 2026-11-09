![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **70 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 29.6/29.9/37.1 | 48.2 | 116.9 | bin | 9.9/11.0/12.1 | 5 |
| claude code | 2.1.319 (Claude Code) | 259.0/280.0/325.0 | 157.7 | 340.2 | bin | 12.7/13.8/14.4 | 5 |
| codex | codex-cli 0.167.0 | 47.9/49.0/51.3 | 115.9 | 458.6 | pkg | 44.5/45.8/48.1 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 13.9/14.5/21.1 | 37.6 | 171.3 | bin | 11.2/14.1/14.8 | 5 |
| pi | 1.5.0 | 345.8/352.9/367.5 | 126.5 | 114.2 | pkg | 261.4/265.9/268.9 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.7, linux-x64, JIT off) | 35.6/37.7/45.1 | 74.9 | 263.0 | bin | 10.5/12.7/12.7 | 5 |
| gemini cli | 0.67.0 | 1797.8/1864.7/1907.9 | 165.9 | 102.9 | pkg | 1706.9/1737.5/1763.5 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 718.1/793.0/951.8 | 330.7 | 205.5 | pkg | 119.3/123.0/127.2 | 5 |
| crush | crush version v0.100.0 | 309.7/334.3/445.8 | 145.6 | 131.5 | pkg | 146.9/150.3/150.5 | 5 |
| aider | aider 0.86.2 | 786.6/900.1/922.1 | 68.1 | 643.7 | pkg | 862.4/1066.8/1083.8 | 5 |
| amp | 0.0.1794225648-g45053b (released 2026-11-09T12:00:48.000Z, 1 | 307.5/323.6/340.2 | 144.5 | 155.5 | bin | 275.5/285.3/285.6 | 5 |
| cursor-agent | 2026.11.05-86047df | 531.8/763.9/788.4 | 240.0 | 560.2 | pkg | 563.1/583.5/590.1 | 5 |
| qwen code | 0.27.0 | 653.6/672.2/999.7 | 272.8 | 293.5 | pkg | 43.3/45.2/46.4 | 5 |
| codebuff | 1.0.688 | 972.7/1172.4/1246.7 | 276.8 | 140.0 | bin | 1105.5/1143.4/1149.9 | 5 |
| kilo code | 7.8.27 | 2667.3/2731.3/2788.3 | 920.2 | 720.0 | pkg | 849.7/967.1/972.7 | 5 |
| droid | 1.6.0 | 122.9/124.9/129.9 | 352.8 | 339.9 | bin | 114.0/117.6/119.6 | 5 |
| kimi code | 2.5.2 | 890.0/898.6/1046.2 | 324.1 | 185.3 | bin | 734.2/769.8/798.3 | 5 |
| devin | devin 3000.12.32 (1126aba4a596) | 29.1/59.7/68.0 | 74.2 | 209.7 | bin | 5.1/5.6/7.9 | 5 |
| cline | 3.0.74 | 1323.9/1334.5/1435.3 | 263.2 | 345.7 | pkg | 924.4/1004.1/1073.9 | 5 |
| continue | 1.5.47 | 1511.6/1539.9/1584.8 | 311.6 | 82.7 | pkg | 1275.0/1298.3/1307.5 | 5 |
| iflow cli | 0.5.19 | 1467.5/1500.3/1582.8 | 339.1 | 180.4 | pkg | 1365.8/1382.3/1394.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 175.9/209.0/224.7 | 98.4 | 207.4 | bin | 99.6/104.1/107.2 | 5 |

</details>

_Generated 2026-11-09T13:29:26Z on Linux x86_64 (7.0.0-1017-azure), load 1.3 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
