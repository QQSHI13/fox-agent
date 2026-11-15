![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **44 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 19.7/24.8/28.7 | 48.0 | 116.9 | bin | 6.5/7.4/7.6 | 5 |
| claude code | 2.1.325 (Claude Code) | 171.6/182.3/186.4 | 162.9 | 365.8 | bin | 9.0/10.4/10.6 | 5 |
| codex | codex-cli 0.169.0 | 34.4/35.1/36.0 | 90.6 | 422.7 | pkg | 31.6/33.4/35.3 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.3/10.3/10.6 | 37.6 | 171.3 | bin | 8.3/8.6/8.7 | 5 |
| pi | 1.5.2 | 239.9/243.5/254.7 | 122.7 | 115.3 | pkg | 183.3/184.7/185.0 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 22.8/23.5/24.2 | 72.1 | 265.3 | bin | 7.5/9.3/9.6 | 5 |
| gemini cli | 0.68.0 | 1256.2/1264.5/1272.8 | 164.3 | 103.0 | pkg | 1186.7/1194.3/1199.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 494.7/529.7/698.1 | 355.9 | 218.4 | pkg | 88.5/88.8/92.4 | 5 |
| crush | crush version v0.101.0 | 545.8/637.5/928.0 | 157.0 | 137.8 | pkg | 113.9/114.9/114.9 | 5 |
| aider | aider 0.86.2 | 551.2/552.9/562.4 | 68.3 | 643.7 | pkg | 610.4/617.3/622.0 | 5 |
| amp | 0.0.1794744038-ga74b43 (released 2026-11-15T12:00:38.000Z, 1 | 184.7/191.6/196.2 | 145.4 | 156.0 | bin | 180.5/201.9/202.6 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 389.6/532.0/541.1 | 248.3 | 561.7 | pkg | 418.7/419.3/425.4 | 5 |
| qwen code | 0.27.4 | 374.6/383.8/561.3 | 254.7 | 295.3 | pkg | 31.6/32.0/34.1 | 5 |
| codebuff | 1.0.688 | 720.5/724.6/726.1 | 277.0 | 140.0 | bin | 728.7/737.0/744.0 | 5 |
| kilo code | 7.8.27 | 1715.1/1739.6/1808.7 | 873.6 | 720.0 | pkg | 634.9/639.2/646.9 | 5 |
| droid | 1.12.1 | 94.0/96.6/105.6 | 304.9 | 346.5 | bin | 93.4/98.2/99.0 | 5 |
| kimi code | 2.5.3 | 675.2/676.7/706.7 | 321.0 | 185.3 | bin | 472.4/490.4/502.8 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 21.7/44.7/50.9 | 74.5 | 213.7 | bin | 4.0/4.5/5.9 | 5 |
| cline | 3.0.74 | 1011.1/1025.6/1062.2 | 267.5 | 345.1 | pkg | 701.5/723.7/752.3 | 5 |
| continue | 1.5.47 | 21610.2/21616.9/21626.5 | 311.2 | 82.7 | pkg | 917.1/921.9/925.0 | 5 |
| iflow cli | 0.5.19 | 1044.0/1046.9/1052.7 | 339.2 | 180.4 | pkg | 976.5/986.1/1003.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 105.9/121.7/129.5 | 98.2 | 207.4 | bin | 66.9/68.2/69.0 | 5 |

</details>

_Generated 2026-11-15T13:26:14Z on Linux x86_64 (7.0.0-1017-azure), load 0.29 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
