![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 25.2/26.4/31.0 | 48.1 | 116.9 | bin | 6.7/8.1/9.1 | 5 |
| claude code | 2.1.325 (Claude Code) | 220.8/227.6/248.2 | 163.0 | 365.8 | bin | 9.1/10.1/10.6 | 5 |
| codex | codex-cli 0.169.0 | 40.4/42.4/42.9 | 90.6 | 422.7 | pkg | 39.1/41.4/43.6 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 13.9/14.5/14.9 | 34.1 | 171.3 | bin | 12.2/12.4/12.5 | 5 |
| pi | 1.5.2 | 292.4/297.9/301.7 | 122.5 | 115.3 | pkg | 219.7/222.9/224.1 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 26.0/28.8/32.8 | 72.3 | 265.3 | bin | 7.4/10.6/11.5 | 5 |
| gemini cli | 0.68.0 | 1507.5/1511.8/1531.8 | 143.0 | 103.0 | pkg | 1397.6/1416.7/1448.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 660.7/714.5/879.9 | 356.0 | 218.4 | pkg | 108.0/108.9/111.4 | 5 |
| crush | crush version v0.101.0 | 611.6/640.9/786.7 | 157.0 | 137.8 | pkg | 132.5/137.3/137.5 | 5 |
| aider | aider 0.86.2 | 641.8/644.4/658.6 | 68.4 | 643.7 | pkg | 735.2/742.0/746.8 | 5 |
| amp | 0.0.1794830433-g119204 (released 2026-11-16T12:00:33.000Z, 5 | 246.1/248.8/260.8 | 146.2 | 156.0 | bin | 226.2/239.9/253.6 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 513.0/661.8/665.9 | 247.3 | 561.7 | pkg | 523.9/553.8/577.1 | 5 |
| qwen code | 0.27.4 | 444.3/457.3/683.6 | 254.0 | 295.3 | pkg | 38.1/39.5/40.2 | 5 |
| codebuff | 1.0.688 | 958.1/973.6/1012.9 | 279.0 | 140.0 | bin | 967.3/1000.3/1003.1 | 5 |
| kilo code | 7.8.27 | 2405.1/2440.3/2523.1 | 923.9 | 720.0 | pkg | 875.5/880.8/896.4 | 5 |
| droid | 1.12.1 | 123.7/125.2/127.4 | 304.0 | 346.5 | bin | 118.3/122.0/128.0 | 5 |
| kimi code | 2.5.3 | 821.0/833.6/871.3 | 360.5 | 185.3 | bin | 577.7/593.1/594.5 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 33.5/60.4/61.8 | 75.0 | 213.7 | bin | 6.0/6.5/7.5 | 5 |
| cline | 3.0.74 | 1192.1/1214.4/1239.9 | 263.2 | 345.1 | pkg | 884.9/950.3/953.6 | 5 |
| continue | 1.5.47 | 21711.6/21720.3/21732.7 | 307.4 | 82.7 | pkg | 1056.0/1063.7/1073.2 | 5 |
| iflow cli | 0.5.19 | 1197.3/1213.5/1218.2 | 338.9 | 180.4 | pkg | 1121.7/1127.1/1128.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 141.2/157.1/164.3 | 97.6 | 207.4 | bin | 79.9/83.3/84.1 | 5 |

</details>

_Generated 2026-11-16T13:01:32Z on Linux x86_64 (7.0.0-1019-azure), load 0.66 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
