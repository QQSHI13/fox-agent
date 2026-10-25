![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **58 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 13.8/15.2/18.0 | 44.7 | 116.8 | bin | 5.8/6.6/6.6 | 5 |
| claude code | 2.1.310 (Claude Code) | 183.7/191.5/226.5 | 166.8 | 291.6 | bin | 7.5/8.7/9.8 | 5 |
| codex | codex-cli 0.164.0 | 35.5/37.1/38.7 | 256.7 | 444.4 | pkg | 36.8/37.6/40.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.5/9.9/36.7 | 33.0 | 171.3 | bin | 7.8/8.0/8.4 | 5 |
| pi | 1.4.0 | 244.4/247.6/253.2 | 129.8 | 111.8 | pkg | 191.5/195.5/198.5 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.2, linux-x64, JIT off) | 28.8/29.7/32.8 | 87.9 | 263.7 | bin | 10.0/10.9/12.8 | 5 |
| gemini cli | 0.65.0 | 1211.8/1222.1/1227.7 | 170.2 | 102.6 | pkg | 1131.1/1141.5/1150.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 514.6/537.7/776.0 | 383.0 | 198.5 | pkg | 84.6/85.7/87.3 | 5 |
| crush | crush version v0.98.2 | 577.0/590.5/915.6 | 158.1 | 128.9 | pkg | 111.4/118.2/120.1 | 5 |
| aider | aider 0.86.2 | 547.5/549.2/570.7 | 67.3 | 642.8 | pkg | 609.3/623.3/626.1 | 5 |
| amp | 0.0.1792900834-gfb378a (released 2026-10-25T04:00:34.000Z, 4 | 166.1/172.0/175.1 | 138.3 | 160.9 | bin | 153.3/164.3/170.4 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 344.4/476.6/493.5 | 239.5 | 583.2 | pkg | 358.3/363.9/366.6 | 5 |
| qwen code | 0.26.1 | 450.2/455.7/663.2 | 323.2 | 275.4 | pkg | 31.1/32.5/34.1 | 5 |
| codebuff | 1.0.688 | 694.2/707.3/755.4 | 278.2 | 140.0 | bin | 720.7/729.6/736.2 | 5 |
| kilo code | 7.8.17 | 1653.8/1683.4/1765.6 | 755.0 | 718.6 | pkg | 625.4/632.7/633.5 | 5 |
| droid | 0.249.0 | 74.8/80.4/83.6 | 272.1 | 319.7 | bin | 67.1/70.3/75.8 | 5 |
| kimi code | 2.3.1 | 563.2/575.0/604.7 | 329.9 | 192.3 | bin | 439.9/449.3/450.5 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 18.8/38.6/45.7 | 98.3 | 217.5 | bin | 3.3/4.8/4.8 | 5 |
| cline | 3.0.73 | 914.4/920.1/930.5 | 267.1 | 330.3 | pkg | 698.9/710.4/1201.4 | 5 |
| continue | 1.5.47 | 11061.1/11067.0/11070.6 | 319.2 | 82.7 | pkg | 856.5/866.6/867.0 | 5 |
| iflow cli | 0.5.19 | 981.7/995.1/997.5 | 363.5 | 180.3 | pkg | 925.5/937.0/937.8 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 107.7/119.7/122.0 | 100.6 | 207.4 | bin | 65.2/65.7/66.3 | 5 |

</details>

_Generated 2026-10-25T08:09:01Z on Linux x86_64 (6.17.0-1022-azure), load 0.7 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
