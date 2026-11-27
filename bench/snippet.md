![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **71 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 19.2/20.6/25.7 | 59.4 | 117.3 | bin | 6.1/7.7/7.9 | 5 |
| claude code | 2.1.332 (Claude Code) | 165.3/172.2/184.9 | 181.4 | 402.3 | bin | 9.8/10.0/10.8 | 5 |
| codex | codex-cli 0.172.0 | 36.3/36.8/174.4 | 94.7 | 449.4 | pkg | 32.4/34.9/36.2 | 5 |
| jcode | jcode v1.1.2 (4f874c9ea) | 13.6/14.6/120.6 | 38.9 | 154.3 | bin | 12.2/13.4/13.6 | 5 |
| pi | 1.6.1 | 236.4/240.7/248.6 | 123.1 | 123.9 | pkg | 181.1/182.4/184.1 | 5 |
| pi-bolt | 1.6.0 (Pi-Bolt 1.3.1, linux-x64, JIT off) | 22.5/25.4/26.5 | 69.4 | 245.0 | bin | 7.6/9.1/9.2 | 5 |
| gemini cli | 0.71.1 | 1269.1/1270.3/1286.0 | 173.7 | 125.7 | pkg | 1192.3/1196.2/1202.3 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.117. | 456.5/473.2/635.3 | 376.8 | 234.8 | pkg | 87.3/90.1/92.0 | 5 |
| crush | crush version v0.103.0 | 566.1/636.8/972.7 | 160.0 | 142.8 | pkg | 114.7/115.2/116.2 | 5 |
| aider | aider 0.86.2 | 535.7/540.6/549.5 | 68.6 | 643.7 | pkg | 595.6/601.3/602.6 | 5 |
| amp | 0.0.1795780844-g2b802b (released 2026-11-27T12:00:44.000Z, 1 | 194.3/200.6/207.5 | 149.0 | 156.8 | bin | 190.5/194.1/198.3 | 5 |
| cursor-agent | 2026.11.22-e9042b2 | 396.6/539.2/543.0 | 3.3 | 563.7 | pkg | 427.7/432.4/438.5 | 5 |
| qwen code | 0.28.7 | 365.1/371.1/560.5 | 257.1 | 300.6 | pkg | 33.4/34.8/35.3 | 5 |
| codebuff | 1.0.688 | 688.6/702.7/736.3 | 280.2 | 140.0 | bin | 710.6/716.4/722.6 | 5 |
| kilo code | 7.8.40 | 1705.2/1711.8/1761.5 | 892.3 | 733.3 | pkg | 637.8/642.8/647.5 | 5 |
| droid | 1.21.1 | 97.5/102.4/112.2 | 318.2 | 350.9 | bin | 91.9/96.4/100.7 | 5 |
| kimi code | 2.8.1 | 981.8/1024.2/1073.0 | 381.7 | 194.2 | bin | 473.7/483.1/518.0 | 5 |
| devin | devin 3000.15.14 (cfa79668e1a5) | 37.4/47.1/53.9 | 79.9 | 262.4 | bin | 6.0/6.6/7.5 | 5 |
| cline | 3.0.76 | 938.9/956.5/1049.3 | 254.0 | 343.1 | pkg | 735.8/755.0/774.9 | 5 |
| continue | 1.5.47 | 21591.9/21599.0/21607.6 | 308.0 | 82.7 | pkg | 897.5/912.7/920.3 | 5 |
| iflow cli | 0.5.19 | 1022.9/1035.3/1058.2 | 340.6 | 180.4 | pkg | 961.2/975.6/976.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 107.7/119.1/126.8 | 97.7 | 207.4 | bin | 62.6/66.8/67.4 | 5 |

</details>

_Generated 2026-11-27T13:41:53Z on Linux x86_64 (7.0.0-1020-azure), load 0.49 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
