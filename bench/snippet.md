![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **40 ms**, peak RSS **71 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 19.7/20.7/21.8 | 59.3 | 117.2 | bin | 6.1/7.0/7.3 | 5 |
| claude code | 2.1.332 (Claude Code) | 172.5/180.8/213.8 | 173.1 | 402.3 | bin | 9.1/10.4/12.2 | 5 |
| codex | codex-cli 0.172.0 | 34.7/35.7/87.0 | 65.7 | 449.4 | pkg | 31.4/32.3/32.5 | 5 |
| jcode | jcode v1.1.2 (4f874c9ea) | 13.5/14.3/75.4 | 38.4 | 154.3 | bin | 12.4/12.6/13.0 | 5 |
| pi | 1.6.1 | 237.0/241.6/246.1 | 122.5 | 123.9 | pkg | 179.9/184.6/185.7 | 5 |
| pi-bolt | 1.6.0 (Pi-Bolt 1.3.1, linux-x64, JIT off) | 22.9/23.4/24.1 | 69.4 | 245.0 | bin | 7.8/9.6/9.8 | 5 |
| gemini cli | 0.71.1 | 1288.6/1291.1/1297.4 | 177.8 | 125.7 | pkg | 1213.1/1217.5/1221.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.116. | 476.6/511.8/688.4 | 365.1 | 233.6 | pkg | 86.9/88.9/90.7 | 5 |
| crush | crush version v0.103.0 | 267.5/278.8/446.1 | 160.4 | 142.8 | pkg | 114.2/115.2/115.5 | 5 |
| aider | aider 0.86.2 | 541.6/542.6/548.8 | 68.5 | 643.7 | pkg | 604.1/613.7/616.0 | 5 |
| amp | 0.0.1795752045-g36b26b (released 2026-11-27T04:00:45.000Z, 7 | 192.5/201.7/202.9 | 148.5 | 156.8 | bin | 189.7/194.8/202.0 | 5 |
| cursor-agent | 2026.11.22-e9042b2 | 424.5/546.9/554.5 | 3.4 | 563.7 | pkg | 434.7/460.8/461.5 | 5 |
| qwen code | 0.28.7 | 381.7/388.4/573.7 | 256.1 | 300.6 | pkg | 32.9/33.4/33.6 | 5 |
| codebuff | 1.0.688 | 708.6/722.1/758.3 | 280.0 | 140.0 | bin | 722.4/764.5/765.4 | 5 |
| kilo code | 7.8.40 | 1731.2/1773.2/1858.8 | 895.7 | 733.3 | pkg | 650.0/662.8/665.1 | 5 |
| droid | 1.21.1 | 101.7/106.6/107.9 | 315.7 | 350.9 | bin | 96.0/97.9/99.8 | 5 |
| kimi code | 2.8.1 | 1055.6/1072.0/1236.1 | 381.3 | 194.2 | bin | 483.2/505.1/507.0 | 5 |
| devin | devin 3000.15.14 (cfa79668e1a5) | 34.6/44.7/47.9 | 79.4 | 262.4 | bin | 5.5/6.1/6.2 | 5 |
| cline | 3.0.76 | 948.6/996.5/1022.3 | 254.5 | 343.1 | pkg | 702.7/737.0/834.4 | 5 |
| continue | 1.5.47 | 21606.5/21609.0/21615.3 | 312.2 | 82.7 | pkg | 889.5/929.3/932.7 | 5 |
| iflow cli | 0.5.19 | 1036.3/1041.7/1057.7 | 338.9 | 180.4 | pkg | 960.9/980.1/991.4 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 112.1/134.2/140.6 | 97.7 | 207.4 | bin | 66.2/68.3/68.5 | 5 |

</details>

_Generated 2026-11-27T11:55:30Z on Linux x86_64 (7.0.0-1020-azure), load 1.23 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
