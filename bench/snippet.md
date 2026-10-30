![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **38 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 17.4/19.5/21.4 | 47.9 | 116.9 | bin | 5.4/6.9/7.2 | 5 |
| claude code | 2.1.314 (Claude Code) | 144.4/151.2/172.9 | 147.5 | 298.2 | bin | 7.1/7.4/7.9 | 5 |
| codex | codex-cli 0.166.0 | 32.6/34.0/35.0 | 117.4 | 456.2 | pkg | 29.5/33.7/60.9 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 8.8/9.6/33.7 | 37.6 | 171.3 | bin | 7.4/7.4/7.6 | 5 |
| pi | 1.4.0 | 198.6/201.0/202.5 | 129.5 | 112.3 | pkg | 153.0/159.7/159.8 | 5 |
| pi-bolt | n/a (not installed) | — | — | — | — | — | — |
| gemini cli | 0.66.0 | 1011.4/1020.6/1059.2 | 145.4 | 102.7 | pkg | 944.4/959.4/981.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 420.5/475.8/766.0 | 367.5 | 198.6 | pkg | 75.1/76.2/78.4 | 5 |
| crush | crush version v0.99.0 | 484.8/632.0/685.7 | 151.3 | 129.9 | pkg | 90.7/98.4/118.8 | 5 |
| aider | aider 0.86.2 | 405.8/423.7/440.5 | 68.1 | 642.8 | pkg | 461.9/479.0/490.8 | 5 |
| amp | 0.0.1793332853-ge7c6c6 (released 2026-10-30T04:00:53.000Z, 2 | 150.3/161.7/173.5 | 140.9 | 161.7 | bin | 131.9/146.3/146.8 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 290.2/405.1/420.2 | 234.0 | 583.2 | pkg | 307.0/319.9/327.3 | 5 |
| qwen code | 0.26.4 | 345.9/369.1/599.4 | 324.2 | 292.0 | pkg | 30.6/31.7/33.2 | 5 |
| codebuff | 1.0.688 | 562.5/582.8/632.5 | 277.8 | 140.0 | bin | 599.6/647.6/648.9 | 5 |
| kilo code | 7.8.18 | 1375.3/1416.3/1449.8 | 933.9 | 720.0 | pkg | 507.3/519.7/527.7 | 5 |
| droid | 1.0.0 | 64.7/68.7/75.8 | 285.8 | 325.0 | bin | 56.2/59.0/68.9 | 5 |
| kimi code | 2.4.0 | 486.7/497.8/505.0 | 331.5 | 192.7 | bin | 384.3/391.3/423.6 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 18.7/34.3/39.7 | 75.1 | 217.6 | bin | 5.2/5.2/6.2 | 5 |
| cline | 3.0.74 | 779.1/801.9/964.3 | 266.0 | 343.2 | pkg | 586.7/620.8/636.6 | 5 |
| continue | 1.5.47 | 10979.3/10982.6/11026.8 | 317.8 | 82.7 | pkg | 707.3/744.5/751.0 | 5 |
| iflow cli | 0.5.19 | 805.0/830.9/865.7 | 358.2 | 180.3 | pkg | 781.2/784.5/827.5 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 86.9/106.5/110.2 | 98.5 | 207.4 | bin | 51.9/53.8/55.5 | 5 |

</details>

_Generated 2026-10-30T06:20:17Z on Linux x86_64 (7.0.0-1017-azure), load 0.79 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
