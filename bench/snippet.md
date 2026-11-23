![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **71 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 19.7/20.9/24.4 | 59.4 | 117.2 | bin | 7.4/8.6/9.8 | 5 |
| claude code | 2.1.330 (Claude Code) | 182.7/184.6/202.5 | 173.7 | 381.1 | bin | 10.3/10.7/11.6 | 5 |
| codex | codex-cli 0.171.0 | 34.3/35.2/36.0 | 95.2 | 444.0 | pkg | 31.3/33.8/37.9 | 5 |
| jcode | jcode v1.1.2 (4f874c9ea) | 13.5/14.0/97.8 | 34.1 | 154.3 | bin | 11.9/13.1/13.6 | 5 |
| pi | 1.6.0 | 236.9/242.1/244.2 | 122.1 | 122.7 | pkg | 178.3/179.1/181.5 | 5 |
| pi-bolt | 1.6.0 (Pi-Bolt 1.3.0, linux-x64, JIT off) | 22.1/24.6/26.3 | 68.3 | 244.4 | bin | 8.1/8.7/10.6 | 5 |
| gemini cli | 0.70.0 | 1269.6/1278.2/1297.5 | 178.5 | 102.3 | pkg | 1182.1/1203.1/1218.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.114. | 511.5/540.6/698.0 | 354.4 | 218.6 | pkg | 87.7/88.4/89.6 | 5 |
| crush | crush version v0.102.0 | 606.5/637.8/723.4 | 158.0 | 138.6 | pkg | 112.3/115.3/117.1 | 5 |
| aider | aider 0.86.2 | 537.0/547.1/561.9 | 68.5 | 643.7 | pkg | 597.2/603.6/620.2 | 5 |
| amp | 0.0.1795449633-g4295dd (released 2026-11-23T16:00:33.000Z, 1 | 186.9/196.8/207.4 | 147.8 | 156.4 | bin | 184.1/192.5/258.8 | 5 |
| cursor-agent | 2026.11.22-e9042b2 | 393.9/537.5/564.9 | 3.1 | 563.7 | pkg | 423.0/425.9/429.4 | 5 |
| qwen code | 0.28.4 | 371.4/379.3/559.3 | 254.5 | 300.2 | pkg | 29.8/33.2/33.7 | 5 |
| codebuff | 1.0.688 | 707.0/711.5/761.1 | 280.2 | 140.0 | bin | 708.1/720.4/732.2 | 5 |
| kilo code | 7.8.32 | 1699.0/1719.0/1736.3 | 889.4 | 732.0 | pkg | 635.3/642.0/645.8 | 5 |
| droid | 1.17.2 | 91.7/99.5/102.5 | 315.2 | 349.7 | bin | 91.9/97.9/98.6 | 5 |
| kimi code | 2.7.3 | 983.4/1041.0/1125.7 | 391.7 | 194.0 | bin | 484.3/488.0/489.3 | 5 |
| devin | devin 3000.14.30821 (a09cd7f323ee) | 31.0/46.2/51.3 | 77.9 | 257.1 | bin | 4.8/5.6/5.8 | 5 |
| cline | 3.0.75 | 989.8/1074.4/1079.7 | 275.1 | 355.3 | pkg | 739.9/762.5/1400.6 | 5 |
| continue | 1.5.47 | 21592.8/21596.1/21605.3 | 312.8 | 82.7 | pkg | 886.8/913.5/916.2 | 5 |
| iflow cli | 0.5.19 | 1012.8/1028.6/1044.9 | 339.2 | 180.4 | pkg | 961.9/968.5/975.9 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 113.1/121.4/124.5 | 97.7 | 207.4 | bin | 66.2/67.5/68.1 | 5 |

</details>

_Generated 2026-11-23T18:00:53Z on Linux x86_64 (7.0.0-1020-azure), load 0.69 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
