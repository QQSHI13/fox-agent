![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **41 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 17.7/18.2/19.9 | 47.8 | 116.9 | bin | 5.8/6.7/6.8 | 5 |
| claude code | 2.1.319 (Claude Code) | 153.8/163.9/199.5 | 157.3 | 340.2 | bin | 9.3/9.7/10.7 | 5 |
| codex | codex-cli 0.167.0 | 31.2/32.3/34.0 | 116.6 | 458.6 | pkg | 29.6/30.6/33.2 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.1/9.6/9.9 | 37.7 | 171.3 | bin | 7.1/7.3/7.5 | 5 |
| pi | 1.5.0 | 189.0/190.5/196.1 | 124.2 | 114.2 | pkg | 141.4/142.6/149.2 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.2, linux-x64, JIT off) | 23.4/24.4/27.1 | 73.1 | 259.5 | bin | 6.1/8.1/9.5 | 5 |
| gemini cli | 0.67.0 | 1007.8/1020.7/1107.8 | 143.2 | 102.9 | pkg | 945.3/978.2/979.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.107. | 427.0/473.9/580.7 | 329.8 | 205.5 | pkg | 72.9/74.5/75.4 | 5 |
| crush | crush version v0.100.0 | 376.1/396.3/576.2 | 145.1 | 131.5 | pkg | 90.7/93.1/95.8 | 5 |
| aider | aider 0.86.2 | 445.7/455.0/502.5 | 68.3 | 643.7 | pkg | 531.9/547.1/559.6 | 5 |
| amp | 0.0.1794009661-g88d32b (released 2026-11-07T00:01:01.000Z, 3 | 162.0/168.4/220.9 | 142.5 | 155.4 | bin | 151.5/165.7/175.7 | 5 |
| cursor-agent | 2026.11.05-86047df | 305.9/422.3/435.5 | 240.9 | 560.2 | pkg | 328.6/332.5/342.1 | 5 |
| qwen code | 0.26.9 | 363.5/368.8/552.6 | 272.2 | 293.4 | pkg | 26.8/31.1/31.6 | 5 |
| codebuff | 1.0.688 | 664.3/699.1/710.5 | 278.5 | 140.0 | bin | 651.8/706.3/756.5 | 5 |
| kilo code | 7.8.27 | 1495.4/1582.9/1706.3 | 870.8 | 720.0 | pkg | 533.0/540.9/589.3 | 5 |
| droid | 1.5.0 | 70.8/75.9/92.7 | 297.8 | 339.1 | bin | 67.4/72.8/78.1 | 5 |
| kimi code | 2.5.2 | 525.7/538.3/628.1 | 322.3 | 185.3 | bin | 394.4/421.0/422.5 | 5 |
| devin | devin 3000.12.17 (d23bb600ed8f) | 20.5/41.2/45.3 | 74.9 | 213.1 | bin | 4.7/5.3/6.2 | 5 |
| cline | 3.0.74 | 817.4/841.4/1156.6 | 263.3 | 345.6 | pkg | 665.4/719.8/1012.3 | 5 |
| continue | 1.5.47 | 21509.0/21527.7/21572.3 | 311.9 | 82.7 | pkg | 749.7/776.3/778.8 | 5 |
| iflow cli | 0.5.19 | 858.8/864.0/901.2 | 339.2 | 180.4 | pkg | 791.7/805.4/812.2 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 93.2/104.7/115.9 | 98.3 | 207.4 | bin | 58.3/59.3/59.3 | 5 |

</details>

_Generated 2026-11-07T03:11:10Z on Linux x86_64 (7.0.0-1017-azure), load 0.88 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
