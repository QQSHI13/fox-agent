![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 22.3/23.9/25.7 | 60.8 | 116.8 | bin | 7.1/9.4/10.5 | 5 |
| claude code | 2.1.316 (Claude Code) | 256.3/261.1/323.9 | 155.4 | 328.3 | bin | 10.1/10.5/12.3 | 5 |
| codex | codex-cli 0.166.0 | 44.7/45.5/48.9 | 116.9 | 456.2 | pkg | 41.1/43.7/45.4 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 11.0/11.5/12.0 | 37.6 | 171.3 | bin | 9.8/9.9/10.1 | 5 |
| pi | 1.4.0 | 324.6/329.3/339.0 | 129.0 | 112.3 | pkg | 254.7/257.1/260.1 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.9, linux-x64, JIT off) | 31.8/32.5/34.2 | 73.6 | 257.6 | bin | 7.9/9.7/12.9 | 5 |
| gemini cli | 0.66.0 | 1665.5/1688.6/1705.0 | 170.0 | 102.7 | pkg | 1588.0/1602.1/1623.4 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 672.1/793.7/906.9 | 373.7 | 198.6 | pkg | 110.0/111.7/114.9 | 5 |
| crush | crush version v0.99.0 | 281.1/309.3/418.6 | 152.1 | 129.9 | pkg | 134.4/147.3/171.0 | 5 |
| aider | aider 0.86.2 | 730.4/732.8/741.1 | 68.2 | 642.8 | pkg | 799.7/808.3/811.6 | 5 |
| amp | 0.0.1793491262-ga7b498 (released 2026-11-01T00:01:02.000Z, 3 | 226.6/236.2/244.5 | 141.4 | 162.0 | bin | 215.7/221.6/231.6 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 468.7/639.1/649.8 | 202.7 | 583.2 | pkg | 491.5/498.0/540.5 | 5 |
| qwen code | 0.26.4 | 608.1/635.5/904.8 | 325.3 | 292.0 | pkg | 40.4/42.0/42.4 | 5 |
| codebuff | 1.0.688 | 908.1/918.7/929.1 | 276.1 | 140.0 | bin | 919.2/928.9/933.3 | 5 |
| kilo code | 7.8.18 | 2217.7/2255.7/2389.5 | 886.5 | 720.0 | pkg | 815.2/822.3/842.8 | 5 |
| droid | 1.1.0 | 106.3/108.1/112.9 | 282.1 | 325.4 | bin | 92.9/96.7/108.4 | 5 |
| kimi code | 2.4.1 | 796.7/801.9/828.0 | 329.5 | 192.6 | bin | 620.0/643.4/658.4 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 29.3/55.9/63.7 | 74.6 | 217.6 | bin | 6.0/7.0/7.4 | 5 |
| cline | 3.0.74 | 1132.6/1160.8/1195.8 | 262.7 | 343.5 | pkg | 853.4/869.8/972.3 | 5 |
| continue | 1.5.47 | 11285.7/11299.8/11320.9 | 316.9 | 82.7 | pkg | 1160.3/1180.7/1205.1 | 5 |
| iflow cli | 0.5.19 | 1342.7/1348.7/1358.3 | 358.1 | 180.3 | pkg | 1261.3/1280.6/1287.6 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 149.7/170.2/195.3 | 98.6 | 207.4 | bin | 83.2/85.8/88.3 | 5 |

</details>

_Generated 2026-11-01T03:07:29Z on Linux x86_64 (7.0.0-1017-azure), load 1.03 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
