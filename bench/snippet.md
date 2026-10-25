![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **63 ms**, peak RSS **58 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 17.6/17.8/21.7 | 44.6 | 116.7 | bin | 6.8/8.4/9.5 | 5 |
| claude code | 2.1.310 (Claude Code) | 240.3/243.5/284.7 | 167.4 | 291.6 | bin | 9.6/11.0/11.1 | 5 |
| codex | codex-cli 0.164.0 | 42.2/43.1/43.7 | 239.2 | 444.4 | pkg | 43.0/45.4/46.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.6/11.1/12.4 | 33.8 | 171.3 | bin | 9.0/9.3/9.7 | 5 |
| pi | 1.4.0 | 319.0/325.9/332.8 | 129.2 | 111.8 | pkg | 249.6/253.9/254.1 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 36.7/38.8/43.6 | 87.6 | 263.7 | bin | 11.8/14.8/14.9 | 5 |
| gemini cli | 0.65.0 | 1621.2/1623.2/1624.6 | 170.2 | 102.6 | pkg | 1499.1/1529.9/1541.7 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 667.4/723.2/1152.7 | 382.1 | 198.5 | pkg | 103.9/104.5/105.9 | 5 |
| crush | crush version v0.98.2 | 462.1/601.1/826.9 | 156.6 | 128.9 | pkg | 145.5/157.4/162.4 | 5 |
| aider | aider 0.86.2 | 735.1/739.7/744.3 | 67.4 | 642.8 | pkg | 801.7/809.2/811.5 | 5 |
| amp | 0.0.1792900834-gfb378a (released 2026-10-25T04:00:34.000Z, 2 | 225.6/229.5/245.7 | 138.4 | 160.9 | bin | 199.8/219.9/227.3 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 447.5/634.6/643.7 | 234.3 | 583.2 | pkg | 466.0/493.0/494.5 | 5 |
| qwen code | 0.26.1 | 599.9/604.7/866.1 | 322.7 | 275.4 | pkg | 38.4/40.4/40.8 | 5 |
| codebuff | 1.0.688 | 897.3/907.5/927.2 | 276.6 | 140.0 | bin | 915.9/921.6/938.0 | 5 |
| kilo code | 7.8.17 | 2197.0/2215.9/2280.9 | 875.5 | 718.6 | pkg | 792.6/807.7/833.7 | 5 |
| droid | 0.249.0 | 91.5/105.5/122.6 | 282.2 | 319.7 | bin | 88.3/90.4/92.3 | 5 |
| kimi code | 2.3.1 | 729.6/741.7/758.8 | 327.7 | 192.3 | bin | 585.8/614.7/616.7 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 25.9/50.5/56.9 | 95.9 | 217.5 | bin | 4.9/6.6/7.0 | 5 |
| cline | 3.0.73 | 1175.5/1191.1/1277.4 | 269.0 | 330.3 | pkg | 956.6/970.6/992.3 | 5 |
| continue | 1.5.47 | 11229.4/11239.0/11260.5 | 319.1 | 82.7 | pkg | 1112.8/1129.3/1134.9 | 5 |
| iflow cli | 0.5.19 | 1284.5/1295.6/1323.0 | 360.6 | 180.3 | pkg | 1205.9/1217.1/1230.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 135.4/159.2/169.6 | 98.7 | 207.4 | bin | 79.9/80.9/81.1 | 5 |

</details>

_Generated 2026-10-25T06:41:01Z on Linux x86_64 (6.17.0-1022-azure), load 1.01 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
