![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **40 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 18.7/21.9/22.4 | 47.9 | 116.9 | bin | 6.1/7.7/7.9 | 5 |
| claude code | 2.1.325 (Claude Code) | 153.5/162.3/175.1 | 162.9 | 365.8 | bin | 9.3/11.0/12.0 | 5 |
| codex | codex-cli 0.169.0 | 30.4/31.3/32.9 | 90.3 | 422.7 | pkg | 29.4/32.4/33.5 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 12.8/13.1/90.6 | 37.5 | 171.3 | bin | 13.7/19.5/32.4 | 5 |
| pi | 1.5.2 | 191.7/195.9/197.8 | 121.5 | 115.3 | pkg | 142.7/143.2/145.9 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 20.5/22.3/25.2 | 72.2 | 265.3 | bin | 6.5/8.8/8.8 | 5 |
| gemini cli | 0.68.0 | 961.8/975.3/1101.7 | 165.5 | 103.0 | pkg | 921.6/934.2/956.8 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 417.4/437.6/561.3 | 358.4 | 218.4 | pkg | 69.9/72.6/77.7 | 5 |
| crush | crush version v0.101.0 | 407.0/466.0/644.2 | 157.8 | 137.8 | pkg | 97.5/100.5/102.2 | 5 |
| aider | aider 0.86.2 | 400.3/404.0/421.2 | 68.4 | 643.7 | pkg | 461.5/499.8/550.1 | 5 |
| amp | 0.0.1794801642-g11f2f8 (released 2026-11-16T04:00:42.000Z, 4 | 157.7/157.9/163.0 | 145.3 | 156.0 | bin | 141.0/156.6/161.5 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 313.5/411.8/420.2 | 245.9 | 561.7 | pkg | 320.8/333.5/354.1 | 5 |
| qwen code | 0.27.4 | 293.6/300.9/432.6 | 256.8 | 295.3 | pkg | 28.6/29.3/29.4 | 5 |
| codebuff | 1.0.688 | 550.9/572.1/605.9 | 279.3 | 140.0 | bin | 579.1/607.3/624.7 | 5 |
| kilo code | 7.8.27 | 1399.6/1487.2/1543.0 | 932.2 | 720.0 | pkg | 512.2/529.2/530.5 | 5 |
| droid | 1.12.1 | 77.5/81.6/86.8 | 306.2 | 346.5 | bin | 78.3/78.6/92.4 | 5 |
| kimi code | 2.5.3 | 565.2/587.2/615.7 | 358.2 | 185.3 | bin | 382.7/394.7/409.8 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 24.9/38.0/40.1 | 74.8 | 213.7 | bin | 4.2/4.7/5.4 | 5 |
| cline | 3.0.74 | 809.2/828.6/831.9 | 266.6 | 345.1 | pkg | 636.2/729.9/898.5 | 5 |
| continue | 1.5.47 | 21474.4/21523.6/21573.5 | 311.9 | 82.7 | pkg | 716.2/719.7/749.0 | 5 |
| iflow cli | 0.5.19 | 844.0/861.5/914.5 | 339.5 | 180.4 | pkg | 826.3/840.5/849.4 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 95.6/102.9/123.3 | 97.6 | 207.4 | bin | 58.7/61.9/63.9 | 5 |

</details>

_Generated 2026-11-16T08:12:33Z on Linux x86_64 (7.0.0-1019-azure), load 0.64 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
