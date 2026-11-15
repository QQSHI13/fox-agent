![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **33 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 18.9/19.5/22.1 | 47.9 | 116.9 | bin | 5.0/5.1/5.5 | 5 |
| claude code | 2.1.325 (Claude Code) | 159.1/166.6/172.9 | 163.2 | 365.8 | bin | 6.5/7.1/7.5 | 5 |
| codex | codex-cli 0.169.0 | 27.8/30.3/35.0 | 90.9 | 422.7 | pkg | 24.2/27.0/29.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 7.8/8.1/8.4 | 37.9 | 171.3 | bin | 6.8/7.9/8.2 | 5 |
| pi | 1.5.2 | 216.8/218.7/228.0 | 122.3 | 115.3 | pkg | 159.1/162.3/163.7 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 17.8/19.2/19.3 | 72.1 | 265.3 | bin | 4.9/6.0/7.1 | 5 |
| gemini cli | 0.68.0 | 1123.1/1124.9/1155.5 | 141.9 | 103.0 | pkg | 1034.7/1052.4/1059.5 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 462.7/500.2/650.1 | 356.0 | 218.4 | pkg | 76.7/80.9/81.3 | 5 |
| crush | crush version v0.101.0 | 232.0/262.0/274.9 | 156.9 | 137.8 | pkg | 97.4/98.2/98.5 | 5 |
| aider | aider 0.86.2 | 473.1/475.9/479.3 | 68.2 | 643.7 | pkg | 539.1/540.4/543.9 | 5 |
| amp | 0.0.1794744038-ga74b43 (released 2026-11-15T12:00:38.000Z, 2 | 166.8/180.4/201.8 | 145.3 | 156.0 | bin | 155.9/160.2/162.5 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 351.1/482.3/486.2 | 250.3 | 561.7 | pkg | 376.5/381.5/383.8 | 5 |
| qwen code | 0.27.4 | 324.5/333.5/512.7 | 254.9 | 295.3 | pkg | 25.6/28.2/29.4 | 5 |
| codebuff | 1.0.688 | 687.6/692.1/722.8 | 278.3 | 140.0 | bin | 694.2/720.5/721.0 | 5 |
| kilo code | 7.8.27 | 1696.4/1707.5/1775.5 | 884.0 | 720.0 | pkg | 632.0/639.0/642.0 | 5 |
| droid | 1.12.1 | 88.5/93.0/95.4 | 303.6 | 346.5 | bin | 83.6/90.8/92.0 | 5 |
| kimi code | 2.5.3 | 606.3/616.1/680.3 | 322.3 | 185.3 | bin | 441.2/443.0/447.4 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 15.6/45.8/49.4 | 75.2 | 213.7 | bin | 3.0/3.4/5.7 | 5 |
| cline | 3.0.74 | 886.3/957.3/1000.9 | 265.4 | 345.1 | pkg | 629.1/634.9/647.3 | 5 |
| continue | 1.5.47 | 21542.7/21555.9/21570.0 | 311.2 | 82.7 | pkg | 806.9/823.0/832.6 | 5 |
| iflow cli | 0.5.19 | 936.9/949.0/956.1 | 340.1 | 180.4 | pkg | 867.3/875.0/877.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 107.1/113.5/120.4 | 98.0 | 207.4 | bin | 60.7/62.0/62.6 | 5 |

</details>

_Generated 2026-11-15T14:19:21Z on Linux x86_64 (7.0.0-1014-aws), load 0.67 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
