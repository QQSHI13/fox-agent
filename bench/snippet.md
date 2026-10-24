| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **106** | **#1** of 7 |
| TUI 1st paint | **162** | **#1** of 7 |
| TUI 1st input | **480** | **#1** of 7 |
| input latency | **28.8** | **#4** of 7 |
| bundle | **117** | **#2** of 7 |
| idle PSS | **21** | **#1** of 7 |
| `--version` | **53.0** | **#3** of 7 |

fox-agent headless vs scripted local provider: time to first token **427 ms**, peak RSS **53 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | 1st byte | 1st paint | 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 106 ms | 162 ms | 480 ms | 29 ms | render | 21 MB |
| claude code | 242 MB | 1820 ms | 2559 ms | 4285 ms | 61 ms | render | 247 MB |
| codex | — | — | — | — | — | — | — |
| jcode | 135 MB | 3699 ms | 3700 ms | 4501 ms | 15 ms | render | 32 MB |
| pi | 23 MB | 1739 ms | 1815 ms | 2159 ms | 24 ms | render | 78 MB |
| pi-bolt | 260 MB | 467 ms | 488 ms | 705 ms | 10 ms | render | 119 MB |
| gemini cli | — | — | — | — | — | — | — |
| copilot cli | — | — | — | — | — | — | — |
| crush | — | — | — | — | — | — | — |
| aider | — | — | — | — | — | — | — |
| amp | — | — | — | — | — | — | — |
| cursor-agent | — | — | — | — | — | — | — |
| qwen code | — | — | — | — | — | — | — |
| codebuff | — | — | — | — | — | — | — |
| kilo code | — | — | — | — | — | — | — |
| droid | — | — | — | — | — | — | — |
| kimi code | 192 MB | 9281 ms | 9777 ms | 10279 ms | 142 ms | render | 412 MB |
| devin | — | — | — | — | — | — | — |
| cline | — | — | — | — | — | — | — |
| continue | — | — | — | — | — | — | — |
| iflow cli | — | — | — | — | — | — | — |
| opencode v2 | 240 MB | 908 ms | 2737 ms | 3288 ms | 88 ms | render | 107 MB |

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | bundle (MB) | kind | `--version` min/p50/p95 | 1st byte min/p50/p95 | 1st paint min/p50/p95 | 1st input min/p50/p95 | latency min/p50/p95 | signal | idle PSS (MB) | n |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 116.6 | bin | 31.5/53.0/57.2 | 72.9/106.1/192.5 | 133.4/162.1/242.9 | 402.6/480.4/535.6 | 21.2/28.8/53.8 | render | 21.4 | 5 |
| claude code | 2.1.286 (Claude Code) | 241.7 | bin | 29.1/33.0/37.5 | 1478.6/1819.9/4073.9 | 2188.5/2559.1/5148.6 | 3795.7/4285.2/7152.9 | 43.3/61.0/90.7 | render | 247.3 | 5 |
| codex | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 | bin | 54.8/67.7/70.4 | 3353.2/3699.2/4249.2 | 3353.2/3699.7/4249.6 | 4166.4/4500.8/4889.9 | 10.7/14.8/22.3 | render | 31.9 | 5 |
| pi | 1.0.4 | 22.8 | pkg | 869.8/1282.2/1921.2 | 1353.7/1738.7/2078.6 | 1407.9/1815.4/2131.0 | 1694.2/2158.7/2478.8 | 11.5/23.7/33.7 | render | 77.7 | 5 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.5, linux-x64, JIT off) | 260.4 | bin | 32.7/35.5/37.1 | 359.2/466.7/1362.4 | 374.3/488.0/1424.6 | 586.6/705.1/1715.6 | 8.2/9.8/14.1 | render | 118.7 | 5 |
| gemini cli | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| copilot cli | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| crush | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| aider | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| amp | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| qwen code | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| codebuff | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| kilo code | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| droid | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| kimi code | 2.3.1 | 192.3 | bin | 2843.8/7958.5/8677.1 | 5345.8/9281.3/14170.6 | 5635.5/9776.9/14780.1 | 6056.5/10279.2/17084.3 | 74.5/142.2/763.1 | render | 412.4 | 5 |
| devin | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| cline | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| continue | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| iflow cli | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| opencode v2 | opencode v2.1.4 | 240.4 | bin | 328.0/368.1/405.0 | 630.2/907.9/952.5 | 2493.2/2737.0/3314.6 | 2859.5/3288.4/3763.7 | 64.3/87.8/140.7 | render | 107.0 | 5 |

</details>

_Generated 2026-10-24T05:57:12Z on Linux x86_64 (6.18.33.2-microsoft-standard-WSL2), load 7.24 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
