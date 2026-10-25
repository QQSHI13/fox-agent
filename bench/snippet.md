![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **56 ms**, peak RSS **58 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 17.3/17.6/20.7 | 45.0 | 116.8 | bin | 6.6/7.9/8.2 | 5 |
| claude code | 2.1.310 (Claude Code) | 234.0/237.7/277.6 | 167.5 | 291.6 | bin | 10.0/11.2/12.8 | 5 |
| codex | codex-cli 0.164.0 | 39.9/41.0/44.0 | 240.2 | 444.4 | pkg | 41.8/43.2/47.1 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.8/10.9/11.4 | 33.4 | 171.3 | bin | 8.9/9.2/9.2 | 5 |
| pi | 1.4.0 | 314.5/319.3/330.4 | 129.9 | 111.8 | pkg | 249.4/251.6/255.0 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.3, linux-x64, JIT off) | 31.5/32.4/34.8 | 77.8 | 256.9 | bin | 9.1/10.5/11.0 | 5 |
| gemini cli | 0.65.0 | 1583.0/1588.4/1608.7 | 170.2 | 102.6 | pkg | 1497.8/1504.8/1511.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 680.0/718.9/1090.9 | 356.5 | 198.5 | pkg | 102.7/105.4/105.9 | 5 |
| crush | crush version v0.98.2 | 462.2/472.0/679.8 | 156.2 | 128.9 | pkg | 140.7/148.2/155.1 | 5 |
| aider | aider 0.86.2 | 721.5/724.1/726.2 | 67.3 | 642.8 | pkg | 780.1/797.4/799.2 | 5 |
| amp | 0.0.1792929650-g000512 (released 2026-10-25T12:00:50.000Z, 1 | 219.4/226.7/232.4 | 138.9 | 160.9 | bin | 200.2/201.7/210.3 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 444.7/621.4/622.2 | 242.8 | 583.2 | pkg | 458.6/473.5/477.6 | 5 |
| qwen code | 0.26.1 | 581.5/585.2/873.5 | 322.5 | 275.4 | pkg | 35.9/39.1/39.5 | 5 |
| codebuff | 1.0.688 | 871.2/889.5/949.1 | 278.9 | 140.0 | bin | 897.3/907.6/923.8 | 5 |
| kilo code | 7.8.17 | 2187.1/2215.4/2272.8 | 499.7 | 718.6 | pkg | 790.2/807.1/818.0 | 5 |
| droid | 0.249.0 | 99.4/102.1/106.3 | 271.8 | 319.7 | bin | 83.8/91.7/95.7 | 5 |
| kimi code | 2.3.2 | 710.7/735.4/749.9 | 330.8 | 192.4 | bin | 574.2/577.8/578.6 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 26.2/50.7/57.1 | 99.9 | 217.5 | bin | 4.2/4.5/4.9 | 5 |
| cline | 3.0.73 | 1128.4/1178.9/1323.6 | 267.8 | 330.3 | pkg | 915.0/958.3/1088.2 | 5 |
| continue | 1.5.47 | 11203.6/11223.9/11264.7 | 319.4 | 82.7 | pkg | 1085.9/1098.3/1111.1 | 5 |
| iflow cli | 0.5.19 | 1264.1/1268.2/1293.4 | 363.5 | 180.3 | pkg | 1187.2/1199.9/1203.2 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 132.5/162.4/172.7 | 100.6 | 207.4 | bin | 79.8/84.0/85.3 | 5 |

</details>

_Generated 2026-10-25T13:35:21Z on Linux x86_64 (6.17.0-1022-azure), load 0.69 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
