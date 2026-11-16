![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **46 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 20.8/24.6/53.2 | 48.2 | 116.9 | bin | 6.4/6.9/7.1 | 5 |
| claude code | 2.1.325 (Claude Code) | 176.8/184.4/212.3 | 162.7 | 365.8 | bin | 10.3/12.2/12.8 | 5 |
| codex | codex-cli 0.169.0 | 35.4/35.9/37.7 | 90.5 | 422.7 | pkg | 31.9/32.8/36.0 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 14.2/15.2/80.4 | 37.6 | 171.3 | bin | 12.4/13.6/14.2 | 5 |
| pi | 1.5.2 | 239.5/242.5/257.2 | 122.9 | 115.3 | pkg | 183.7/185.2/186.7 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 23.0/26.2/27.8 | 72.1 | 265.3 | bin | 7.6/7.9/8.9 | 5 |
| gemini cli | 0.68.0 | 1233.0/1237.2/1254.7 | 142.9 | 103.0 | pkg | 1170.6/1172.7/1177.8 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 500.8/536.0/718.3 | 357.7 | 218.4 | pkg | 88.2/90.7/91.6 | 5 |
| crush | crush version v0.101.0 | 609.0/632.9/721.5 | 157.9 | 137.8 | pkg | 112.1/112.7/113.0 | 5 |
| aider | aider 0.86.2 | 544.6/550.3/572.5 | 68.5 | 643.7 | pkg | 609.6/619.5/640.7 | 5 |
| amp | 0.0.1794816357-gc47859 (released 2026-11-16T08:05:57.000Z, 1 | 191.1/192.8/210.2 | 145.7 | 156.0 | bin | 172.1/186.1/190.0 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 389.5/522.9/526.1 | 248.9 | 561.7 | pkg | 409.9/418.2/419.6 | 5 |
| qwen code | 0.27.4 | 364.9/376.9/567.9 | 255.6 | 295.3 | pkg | 30.2/33.6/35.9 | 5 |
| codebuff | 1.0.688 | 708.3/717.0/815.7 | 279.6 | 140.0 | bin | 723.4/744.4/747.8 | 5 |
| kilo code | 7.8.27 | 1693.4/1735.1/1819.7 | 877.9 | 720.0 | pkg | 649.8/674.3/682.6 | 5 |
| droid | 1.12.1 | 89.7/98.6/105.4 | 359.7 | 346.5 | bin | 96.0/97.5/102.9 | 5 |
| kimi code | 2.5.3 | 693.9/770.9/1067.8 | 361.2 | 185.3 | bin | 471.3/484.4/490.1 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 28.3/46.6/50.5 | 74.5 | 213.7 | bin | 4.2/4.7/5.6 | 5 |
| cline | 3.0.74 | 940.7/956.4/991.3 | 263.7 | 345.1 | pkg | 709.6/769.5/782.3 | 5 |
| continue | 1.5.47 | 21613.3/21619.1/21649.8 | 307.6 | 82.7 | pkg | 883.4/925.5/931.8 | 5 |
| iflow cli | 0.5.19 | 1032.0/1050.3/1054.6 | 338.4 | 180.4 | pkg | 965.1/985.0/991.2 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 109.2/121.2/128.6 | 97.1 | 207.4 | bin | 62.7/65.3/68.2 | 5 |

</details>

_Generated 2026-11-16T08:29:27Z on Linux x86_64 (7.0.0-1019-azure), load 0.64 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
