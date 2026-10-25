![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **68 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 17.4/18.1/21.0 | 44.6 | 116.7 | bin | 7.0/8.8/9.1 | 5 |
| claude code | 2.1.310 (Claude Code) | 238.5/249.1/303.4 | 167.7 | 291.6 | bin | 10.5/11.4/13.9 | 5 |
| codex | codex-cli 0.164.0 | 42.1/45.4/45.7 | 237.3 | 444.4 | pkg | 42.2/43.3/44.4 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.3/11.5/21.9 | 33.7 | 171.3 | bin | 9.4/9.9/10.0 | 5 |
| pi | 1.4.0 | 318.2/321.3/339.4 | 128.2 | 111.8 | pkg | 250.5/255.8/268.7 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 34.5/37.4/39.2 | 87.7 | 263.7 | bin | 14.2/15.4/16.7 | 5 |
| gemini cli | 0.65.0 | 1607.0/1625.4/1659.6 | 146.1 | 102.6 | pkg | 1513.2/1569.3/1569.6 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 697.6/801.4/1131.4 | 355.0 | 198.5 | pkg | 103.7/105.6/107.2 | 5 |
| crush | crush version v0.98.2 | 608.0/682.3/864.7 | 160.0 | 128.9 | pkg | 144.8/148.8/150.1 | 5 |
| aider | aider 0.86.2 | 736.1/748.3/761.5 | 67.4 | 642.8 | pkg | 816.6/823.1/825.6 | 5 |
| amp | 0.0.1792900834-gfb378a (released 2026-10-25T04:00:34.000Z, 4 | 226.4/234.8/254.3 | 138.5 | 160.9 | bin | 210.4/214.4/221.2 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 452.8/630.0/678.6 | 236.0 | 583.2 | pkg | 477.4/491.2/505.5 | 5 |
| qwen code | 0.26.1 | 597.2/604.9/866.7 | 322.4 | 275.4 | pkg | 37.2/40.7/44.8 | 5 |
| codebuff | 1.0.688 | 916.6/951.2/1013.9 | 279.0 | 140.0 | bin | 933.8/943.9/966.7 | 5 |
| kilo code | 7.8.17 | 2237.8/2276.5/2453.3 | 908.9 | 718.6 | pkg | 816.8/824.8/841.8 | 5 |
| droid | 0.249.0 | 93.4/107.5/113.9 | 271.7 | 319.7 | bin | 83.7/93.0/94.8 | 5 |
| kimi code | 2.3.1 | 744.1/748.8/763.6 | 329.9 | 192.3 | bin | 596.0/602.4/638.2 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 27.6/49.9/56.0 | 98.0 | 217.5 | bin | 4.8/6.5/6.6 | 5 |
| cline | 3.0.73 | 1227.7/1256.3/1274.3 | 268.5 | 330.3 | pkg | 944.4/1031.5/1226.1 | 5 |
| continue | 1.5.47 | 11238.4/11262.7/11276.5 | 319.6 | 82.7 | pkg | 1099.4/1114.3/1117.9 | 5 |
| iflow cli | 0.5.19 | 1298.9/1313.0/1323.1 | 362.3 | 180.3 | pkg | 1217.8/1228.1/1251.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 146.8/164.1/179.3 | 99.1 | 207.4 | bin | 79.2/85.6/86.3 | 5 |

</details>

_Generated 2026-10-25T08:09:12Z on Linux x86_64 (6.17.0-1022-azure), load 0.77 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
