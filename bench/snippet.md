![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 20.4/21.1/22.4 | 48.3 | 116.8 | bin | 6.5/8.5/9.6 | 5 |
| claude code | 2.1.318 (Claude Code) | 231.1/233.0/273.0 | 154.8 | 337.8 | bin | 8.1/11.9/12.6 | 5 |
| codex | codex-cli 0.166.0 | 36.7/39.0/44.1 | 117.5 | 456.2 | pkg | 35.3/41.4/57.7 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.1/9.6/10.1 | 34.1 | 171.3 | bin | 7.8/9.0/9.1 | 5 |
| pi | 1.5.0 | 285.1/290.8/296.7 | 125.7 | 114.1 | pkg | 208.3/212.2/213.4 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.9, linux-x64, JIT off) | 28.8/29.1/31.4 | 73.6 | 257.6 | bin | 6.9/9.3/10.5 | 5 |
| gemini cli | 0.66.0 | 1493.4/1509.5/1528.5 | 159.6 | 102.7 | pkg | 1398.4/1408.8/1423.0 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 621.9/768.3/987.3 | 374.5 | 198.6 | pkg | 99.5/101.4/101.8 | 5 |
| crush | crush version v0.99.0 | 234.2/265.2/381.4 | 147.2 | 129.9 | pkg | 116.5/138.7/140.7 | 5 |
| aider | aider 0.86.2 | 662.0/674.7/688.7 | 68.2 | 643.7 | pkg | 747.3/761.9/763.0 | 5 |
| amp | 0.0.1793782541-gd81f0f (released 2026-11-04T08:55:41.000Z, 2 | 229.8/241.9/246.8 | 140.3 | 154.8 | bin | 204.3/231.6/239.2 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 435.6/628.5/666.4 | 234.0 | 583.2 | pkg | 455.8/467.6/468.8 | 5 |
| qwen code | 0.26.7 | 548.5/551.4/846.0 | 276.8 | 292.8 | pkg | 39.0/39.9/41.1 | 5 |
| codebuff | 1.0.688 | 958.0/981.1/1053.5 | 278.9 | 140.0 | bin | 989.3/995.0/1000.8 | 5 |
| kilo code | 7.8.18 | 2450.5/2485.8/2503.0 | 930.4 | 720.0 | pkg | 887.3/897.7/900.3 | 5 |
| droid | 1.3.0 | 108.8/123.2/138.1 | 297.1 | 339.5 | bin | 97.4/104.8/106.4 | 5 |
| kimi code | 2.4.1 | 759.7/763.1/784.4 | 327.4 | 192.6 | bin | 614.8/628.0/644.2 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 19.2/52.1/54.7 | 74.9 | 217.6 | bin | 5.6/5.9/5.9 | 5 |
| cline | 3.0.74 | 1148.5/1211.4/1366.8 | 261.3 | 343.8 | pkg | 852.6/977.1/1293.5 | 5 |
| continue | 1.5.47 | 21731.6/21738.1/21760.4 | 311.7 | 82.7 | pkg | 1095.1/1114.2/1129.1 | 5 |
| iflow cli | 0.5.19 | 1228.1/1234.1/1266.4 | 336.9 | 180.4 | pkg | 1132.9/1137.3/1152.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 133.6/159.4/162.3 | 98.4 | 207.4 | bin | 78.6/79.6/82.0 | 5 |

</details>

_Generated 2026-11-04T11:55:02Z on Linux x86_64 (7.0.0-1017-azure), load 0.71 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
