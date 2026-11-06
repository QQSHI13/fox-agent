![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **56 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 24.0/24.2/31.4 | 48.0 | 116.9 | bin | 7.1/7.3/8.5 | 5 |
| claude code | 2.1.318 (Claude Code) | 222.9/227.1/263.2 | 155.5 | 337.8 | bin | 9.6/10.0/10.1 | 5 |
| codex | codex-cli 0.167.0 | 40.0/41.1/41.9 | 115.0 | 458.6 | pkg | 38.0/39.2/44.0 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.2/11.3/12.8 | 34.0 | 171.3 | bin | 9.5/9.6/9.8 | 5 |
| pi | 1.5.0 | 300.6/305.9/317.9 | 125.5 | 114.2 | pkg | 228.3/230.8/231.7 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.1, linux-x64, JIT off) | 32.4/33.9/37.9 | 73.0 | 258.2 | bin | 7.8/9.5/9.8 | 5 |
| gemini cli | 0.67.0 | 1605.8/1615.0/1631.9 | 164.8 | 102.9 | pkg | 1531.1/1544.0/1551.3 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.106. | 612.5/678.5/836.5 | 334.1 | 205.5 | pkg | 104.1/106.7/107.8 | 5 |
| crush | crush version v0.100.0 | 415.5/434.0/569.8 | 145.1 | 131.5 | pkg | 125.2/127.7/130.9 | 5 |
| aider | aider 0.86.2 | 724.2/726.9/729.0 | 68.1 | 643.7 | pkg | 782.8/785.1/785.7 | 5 |
| amp | 0.0.1793966450-gc1122d (released 2026-11-06T12:00:50.000Z, 5 | 234.4/245.6/256.8 | 142.7 | 155.3 | bin | 223.1/229.9/242.3 | 5 |
| cursor-agent | 2026.11.05-86047df | 469.2/656.9/667.3 | 239.6 | 560.2 | pkg | 501.2/506.7/508.6 | 5 |
| qwen code | 0.26.8 | 585.3/593.4/870.3 | 272.2 | 293.2 | pkg | 35.4/38.1/42.8 | 5 |
| codebuff | 1.0.688 | 871.7/906.8/919.8 | 277.6 | 140.0 | bin | 898.4/916.0/924.7 | 5 |
| kilo code | 7.8.27 | 2180.1/2186.9/2227.1 | 741.2 | 720.0 | pkg | 785.6/817.4/835.1 | 5 |
| droid | 1.5.0 | 105.4/117.2/119.4 | 296.7 | 339.1 | bin | 99.2/107.0/110.6 | 5 |
| kimi code | 2.5.2 | 777.4/783.0/866.2 | 324.3 | 185.3 | bin | 607.2/619.6/628.0 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 32.7/56.6/66.5 | 74.0 | 217.6 | bin | 5.7/7.5/8.4 | 5 |
| cline | 3.0.74 | 1108.1/1135.8/1177.1 | 263.9 | 344.4 | pkg | 877.9/925.0/943.5 | 5 |
| continue | 1.5.47 | 21736.3/21738.0/21766.3 | 312.5 | 82.7 | pkg | 1130.0/1134.9/1149.9 | 5 |
| iflow cli | 0.5.19 | 1313.9/1321.5/1340.5 | 340.0 | 180.4 | pkg | 1219.9/1232.1/1242.9 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 137.7/171.2/187.3 | 98.8 | 207.4 | bin | 81.2/82.8/84.2 | 5 |

</details>

_Generated 2026-11-06T13:02:00Z on Linux x86_64 (7.0.0-1017-azure), load 0.7 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
