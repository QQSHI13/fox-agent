![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 19.5/22.1/24.0 | 48.5 | 116.9 | bin | 6.8/7.7/9.0 | 5 |
| claude code | 2.1.319 (Claude Code) | 219.3/220.8/260.7 | 157.7 | 340.2 | bin | 9.8/11.0/11.2 | 5 |
| codex | codex-cli 0.167.0 | 40.2/41.3/44.6 | 115.8 | 458.6 | pkg | 36.0/38.0/38.2 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.5/12.3/13.0 | 37.5 | 171.3 | bin | 9.2/9.4/9.7 | 5 |
| pi | 1.5.0 | 304.9/307.9/314.7 | 126.6 | 114.2 | pkg | 228.9/229.5/231.3 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.4, linux-x64, JIT off) | 31.5/33.7/38.4 | 73.3 | 260.5 | bin | 9.3/9.5/10.7 | 5 |
| gemini cli | 0.67.0 | 1605.6/1615.2/1621.2 | 164.8 | 102.9 | pkg | 1530.7/1541.2/1543.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 618.0/666.8/836.1 | 332.8 | 205.5 | pkg | 104.9/108.2/108.8 | 5 |
| crush | crush version v0.100.0 | 267.6/298.9/595.6 | 146.0 | 131.5 | pkg | 124.1/127.0/127.9 | 5 |
| aider | aider 0.86.2 | 720.0/723.4/723.9 | 68.2 | 643.7 | pkg | 779.0/781.5/783.2 | 5 |
| amp | 0.0.1794110442-ga8fc4f (released 2026-11-08T04:00:42.000Z, 1 | 228.0/235.6/253.7 | 143.9 | 155.5 | bin | 225.2/247.1/247.8 | 5 |
| cursor-agent | 2026.11.05-86047df | 477.9/647.9/664.1 | 239.8 | 560.2 | pkg | 509.1/521.7/542.9 | 5 |
| qwen code | 0.27.0 | 585.8/594.7/853.4 | 273.5 | 293.5 | pkg | 36.5/37.4/37.6 | 5 |
| codebuff | 1.0.688 | 869.0/901.5/915.6 | 277.9 | 140.0 | bin | 893.7/911.5/930.3 | 5 |
| kilo code | 7.8.27 | 2158.0/2205.9/2229.5 | 741.8 | 720.0 | pkg | 782.9/791.3/796.1 | 5 |
| droid | 1.6.0 | 108.6/115.0/136.9 | 298.5 | 339.9 | bin | 102.1/105.2/109.8 | 5 |
| kimi code | 2.5.2 | 773.5/787.2/811.7 | 323.8 | 185.3 | bin | 607.1/617.3/637.9 | 5 |
| devin | devin 3000.12.28 (91c3aec41579) | 28.0/62.7/71.3 | 73.7 | 209.6 | bin | 5.9/7.0/7.8 | 5 |
| cline | 3.0.74 | 1119.0/1126.8/1232.3 | 259.6 | 345.7 | pkg | 843.3/860.0/1030.2 | 5 |
| continue | 1.5.47 | 21757.7/21761.5/21779.6 | 310.6 | 82.7 | pkg | 1129.5/1140.1/1144.4 | 5 |
| iflow cli | 0.5.19 | 1317.8/1320.4/1329.0 | 341.0 | 180.4 | pkg | 1223.1/1231.6/1244.8 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 145.2/151.3/158.8 | 98.6 | 207.4 | bin | 80.4/83.8/87.3 | 5 |

</details>

_Generated 2026-11-08T06:00:34Z on Linux x86_64 (7.0.0-1017-azure), load 0.39 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
