![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **37 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 18.5/23.8/25.2 | 48.0 | 116.9 | bin | 4.6/6.1/6.2 | 5 |
| claude code | 2.1.325 (Claude Code) | 170.2/175.8/195.5 | 163.4 | 365.8 | bin | 7.3/7.7/8.3 | 5 |
| codex | codex-cli 0.169.0 | 31.4/32.9/34.1 | 90.5 | 422.7 | pkg | 32.1/32.3/33.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.2/11.6/12.0 | 37.4 | 171.3 | bin | 9.9/10.2/11.6 | 5 |
| pi | 1.5.2 | 224.7/227.2/234.2 | 123.2 | 115.3 | pkg | 169.3/171.6/171.9 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 19.8/20.7/21.2 | 72.2 | 265.3 | bin | 5.9/6.0/6.7 | 5 |
| gemini cli | 0.68.0 | 1167.3/1176.2/1188.4 | 143.0 | 103.0 | pkg | 1082.6/1100.4/1101.8 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 486.5/508.2/672.7 | 358.4 | 218.4 | pkg | 84.3/85.9/90.1 | 5 |
| crush | crush version v0.101.0 | 570.2/626.2/753.8 | 155.8 | 137.8 | pkg | 106.6/110.5/111.1 | 5 |
| aider | aider 0.86.2 | 486.3/488.6/491.0 | 68.6 | 643.7 | pkg | 565.7/570.9/572.9 | 5 |
| amp | 0.0.1794838312-g371aa5 (released 2026-11-16T14:11:52.000Z, 1 | 188.0/189.9/201.8 | 145.5 | 156.0 | bin | 174.1/184.7/188.3 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 377.5/509.0/509.9 | 247.6 | 561.7 | pkg | 398.4/409.6/418.1 | 5 |
| qwen code | 0.27.4 | 346.0/349.7/534.0 | 257.7 | 295.3 | pkg | 29.1/33.3/33.4 | 5 |
| codebuff | 1.0.688 | 742.8/757.0/770.1 | 280.8 | 140.0 | bin | 743.4/764.5/768.4 | 5 |
| kilo code | 7.8.27 | 1785.4/1794.4/1819.0 | 882.6 | 720.0 | pkg | 668.0/675.0/676.4 | 5 |
| droid | 1.12.1 | 88.9/103.5/105.7 | 303.4 | 346.5 | bin | 84.8/87.3/91.4 | 5 |
| kimi code | 2.5.3 | 635.3/640.8/651.2 | 357.1 | 185.3 | bin | 438.0/441.0/450.8 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 31.1/44.5/52.1 | 75.3 | 213.7 | bin | 3.7/4.2/5.8 | 5 |
| cline | 3.0.74 | 937.8/949.8/1067.4 | 265.0 | 345.2 | pkg | 696.5/717.9/720.7 | 5 |
| continue | 1.5.47 | 21561.6/21563.1/21570.1 | 312.7 | 82.7 | pkg | 835.0/845.4/856.1 | 5 |
| iflow cli | 0.5.19 | 942.4/949.6/957.8 | 340.3 | 180.4 | pkg | 881.3/896.5/904.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 106.5/120.4/126.1 | 97.9 | 207.4 | bin | 61.3/64.4/64.8 | 5 |

</details>

_Generated 2026-11-16T15:37:15Z on Linux x86_64 (7.0.0-1016-aws), load 0.45 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
