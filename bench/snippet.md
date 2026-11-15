![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **47 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 24.8/25.6/33.1 | 47.9 | 116.9 | bin | 8.8/11.2/11.3 | 5 |
| claude code | 2.1.325 (Claude Code) | 197.4/212.4/248.5 | 165.1 | 365.8 | bin | 11.2/12.0/14.4 | 5 |
| codex | codex-cli 0.169.0 | 36.1/38.8/39.1 | 90.5 | 422.7 | pkg | 32.1/33.5/34.4 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.9/11.7/40.2 | 37.5 | 171.3 | bin | 8.8/9.4/10.1 | 5 |
| pi | 1.5.2 | 280.4/293.8/295.1 | 121.6 | 115.3 | pkg | 204.2/210.3/210.6 | 5 |
| pi-bolt | 1.5.2 (Pi-Bolt 1.2.1, linux-x64, JIT off) | 27.1/30.6/36.4 | 72.1 | 265.3 | bin | 8.9/11.0/12.0 | 5 |
| gemini cli | 0.68.0 | 1311.0/1334.7/1379.0 | 147.2 | 103.0 | pkg | 1286.3/1335.5/1378.6 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.112. | 575.8/606.1/738.5 | 355.7 | 218.4 | pkg | 91.0/94.6/95.2 | 5 |
| crush | crush version v0.101.0 | 446.4/465.3/725.2 | 156.7 | 137.8 | pkg | 139.9/141.3/149.1 | 5 |
| aider | aider 0.86.2 | 618.6/639.5/686.0 | 68.1 | 643.7 | pkg | 646.0/720.2/722.0 | 5 |
| amp | 0.0.1794744038-ga74b43 (released 2026-11-15T12:00:38.000Z, 2 | 195.3/209.6/228.3 | 145.5 | 156.0 | bin | 202.9/214.5/238.0 | 5 |
| cursor-agent | 2026.11.13-eacade1 | 439.8/575.7/603.6 | 247.1 | 561.7 | pkg | 457.5/471.5/472.7 | 5 |
| qwen code | 0.27.4 | 418.9/429.1/630.7 | 253.7 | 295.3 | pkg | 33.7/36.6/36.7 | 5 |
| codebuff | 1.0.688 | 845.5/889.6/904.1 | 277.8 | 140.0 | bin | 845.8/903.7/913.4 | 5 |
| kilo code | 7.8.27 | 1928.9/2096.2/2131.1 | 877.3 | 720.0 | pkg | 681.2/701.8/711.8 | 5 |
| droid | 1.12.1 | 100.4/108.3/113.0 | 302.3 | 346.5 | bin | 105.2/113.2/123.5 | 5 |
| kimi code | 2.5.3 | 723.7/781.8/866.6 | 321.1 | 185.3 | bin | 528.8/557.6/588.4 | 5 |
| devin | devin 3000.12.57 (96542e930752) | 26.2/54.0/58.2 | 74.5 | 213.7 | bin | 5.8/6.7/7.3 | 5 |
| cline | 3.0.74 | 1047.4/1175.1/1297.9 | 262.5 | 345.1 | pkg | 779.6/824.8/1237.6 | 5 |
| continue | 1.5.47 | 21644.3/21709.7/21729.5 | 311.5 | 82.7 | pkg | 1032.1/1047.0/1081.9 | 5 |
| iflow cli | 0.5.19 | 1080.4/1166.1/1228.0 | 340.1 | 180.4 | pkg | 1090.2/1142.5/1143.8 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 121.1/131.2/147.0 | 98.0 | 207.4 | bin | 68.0/75.7/77.0 | 5 |

</details>

_Generated 2026-11-15T15:04:20Z on Linux x86_64 (7.0.0-1017-azure), load 0.55 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
