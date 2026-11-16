![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **50 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 24.6/25.5/28.8 | 48.1 | 116.9 | bin | 6.6/7.6/8.1 | 5 |
| claude code | 2.1.325 (Claude Code) | 229.6/247.0/255.4 | 162.5 | 365.8 | bin | 9.3/10.5/12.2 | 5 |
| codex | codex-cli 0.169.0 | 39.8/41.3/51.5 | 90.6 | 422.7 | pkg | 36.2/43.3/46.4 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 13.4/14.4/15.6 | 33.9 | 171.3 | bin | 11.5/12.2/15.7 | 5 |
| pi | 1.5.2 | 303.0/308.9/319.1 | 121.8 | 115.3 | pkg | 219.9/220.8/224.6 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 26.2/26.9/42.9 | 72.2 | 265.3 | bin | 7.7/9.3/10.9 | 5 |
| gemini cli | 0.68.0 | 1520.2/1549.7/1567.4 | 143.1 | 103.0 | pkg | 1442.0/1466.1/1469.7 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 663.4/665.9/922.0 | 357.6 | 218.4 | pkg | 103.2/107.5/116.3 | 5 |
| crush | crush version v0.101.0 | 571.4/659.3/800.5 | 157.3 | 137.8 | pkg | 145.8/148.2/155.9 | 5 |
| aider | aider 0.86.2 | 642.6/645.5/648.0 | 68.4 | 643.7 | pkg | 725.3/730.9/735.6 | 5 |
| amp | 0.0.1794801642-g11f2f8 (released 2026-11-16T04:00:42.000Z, 3 | 237.0/255.6/266.9 | 146.3 | 156.0 | bin | 231.4/240.8/268.3 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 497.7/686.4/711.2 | 247.3 | 561.7 | pkg | 514.4/524.1/551.2 | 5 |
| qwen code | 0.27.4 | 460.1/471.2/684.7 | 253.6 | 295.3 | pkg | 37.4/38.6/40.2 | 5 |
| codebuff | 1.0.688 | 955.7/968.1/1000.3 | 279.7 | 140.0 | bin | 961.6/979.0/1011.4 | 5 |
| kilo code | 7.8.27 | 2417.8/2449.0/2531.7 | 901.2 | 720.0 | pkg | 889.1/908.3/982.3 | 5 |
| droid | 1.12.1 | 110.7/122.5/148.3 | 303.9 | 346.5 | bin | 110.7/119.9/121.3 | 5 |
| kimi code | 2.5.3 | 825.7/830.4/869.4 | 359.6 | 185.3 | bin | 597.1/612.4/616.4 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 38.5/64.1/67.6 | 74.8 | 213.7 | bin | 6.7/8.7/9.0 | 5 |
| cline | 3.0.74 | 1202.1/1221.9/1290.8 | 262.0 | 345.1 | pkg | 859.9/890.8/946.9 | 5 |
| continue | 1.5.47 | 21723.3/21746.7/21780.9 | 307.4 | 82.7 | pkg | 1065.0/1076.6/1104.4 | 5 |
| iflow cli | 0.5.19 | 1212.0/1242.2/1322.6 | 339.9 | 180.4 | pkg | 1135.2/1162.7/1186.5 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 137.3/153.9/161.3 | 97.7 | 207.4 | bin | 78.6/84.2/84.3 | 5 |

</details>

_Generated 2026-11-16T07:25:30Z on Linux x86_64 (7.0.0-1019-azure), load 0.82 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
