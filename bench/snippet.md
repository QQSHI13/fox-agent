![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **42 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 18.4/21.4/25.2 | 47.9 | 116.9 | bin | 4.8/6.3/6.7 | 5 |
| claude code | 2.1.325 (Claude Code) | 170.4/185.1/191.9 | 163.2 | 365.8 | bin | 6.8/7.6/8.8 | 5 |
| codex | codex-cli 0.169.0 | 30.5/31.2/32.0 | 90.6 | 422.7 | pkg | 27.0/31.2/31.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 8.8/9.2/13.9 | 34.0 | 171.3 | bin | 6.7/7.2/7.5 | 5 |
| pi | 1.5.2 | 218.7/222.2/226.1 | 121.4 | 115.3 | pkg | 160.0/161.8/161.9 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 19.4/20.8/24.2 | 72.1 | 265.3 | bin | 5.4/8.4/9.5 | 5 |
| gemini cli | 0.68.0 | 1129.3/1177.5/1193.3 | 141.6 | 103.0 | pkg | 1057.7/1070.2/1079.8 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 464.4/511.9/697.3 | 358.6 | 218.4 | pkg | 76.5/80.1/80.2 | 5 |
| crush | crush version v0.101.0 | 446.2/459.2/1042.0 | 156.5 | 137.8 | pkg | 100.5/101.8/105.1 | 5 |
| aider | aider 0.86.2 | 484.7/488.7/499.1 | 68.3 | 643.7 | pkg | 555.9/569.8/582.9 | 5 |
| amp | 0.0.1794744038-ga74b43 (released 2026-11-15T12:00:38.000Z, 1 | 192.8/196.5/216.5 | 145.5 | 156.0 | bin | 180.0/194.0/194.5 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 401.6/507.9/520.2 | 247.7 | 561.7 | pkg | 380.0/400.6/402.4 | 5 |
| qwen code | 0.27.4 | 336.3/339.6/545.9 | 253.3 | 295.3 | pkg | 32.0/34.1/34.8 | 5 |
| codebuff | 1.0.688 | 717.3/732.9/754.0 | 277.7 | 140.0 | bin | 756.3/758.4/763.0 | 5 |
| kilo code | 7.8.27 | 1696.9/1773.6/1815.8 | 896.0 | 720.0 | pkg | 637.0/666.4/687.0 | 5 |
| droid | 1.12.1 | 90.4/95.6/99.4 | 303.9 | 346.5 | bin | 86.6/91.5/95.1 | 5 |
| kimi code | 2.5.3 | 617.8/646.4/675.1 | 321.9 | 185.3 | bin | 471.7/490.1/504.4 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 18.7/43.2/53.8 | 74.6 | 213.7 | bin | 3.0/5.0/5.6 | 5 |
| cline | 3.0.74 | 997.0/1027.3/1264.0 | 263.4 | 345.1 | pkg | 706.6/763.7/813.7 | 5 |
| continue | 1.5.47 | 21563.6/21587.7/21628.0 | 307.3 | 82.7 | pkg | 827.4/876.1/878.0 | 5 |
| iflow cli | 0.5.19 | 952.8/973.1/993.0 | 339.2 | 180.4 | pkg | 869.6/898.1/920.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 116.0/131.7/137.1 | 98.1 | 207.4 | bin | 64.1/65.6/66.6 | 5 |

</details>

_Generated 2026-11-15T14:03:27Z on Linux x86_64 (7.0.0-1017-azure), load 0.89 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
