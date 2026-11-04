![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **38 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 14.8/16.0/18.8 | 49.1 | 116.8 | bin | 5.9/7.2/7.7 | 5 |
| claude code | 2.1.318 (Claude Code) | 146.5/156.8/194.8 | 155.0 | 337.8 | bin | 8.2/9.4/9.8 | 5 |
| codex | codex-cli 0.166.0 | 30.8/31.8/35.0 | 117.4 | 456.2 | pkg | 27.6/29.8/31.1 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.3/9.5/11.1 | 34.0 | 171.3 | bin | 7.3/7.6/8.0 | 5 |
| pi | 1.5.0 | 191.0/194.0/205.8 | 124.3 | 114.1 | pkg | 147.4/150.9/153.6 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.9, linux-x64, JIT off) | 23.7/25.1/30.1 | 73.5 | 257.6 | bin | 6.7/8.1/8.7 | 5 |
| gemini cli | 0.66.0 | 983.4/998.5/1019.3 | 142.9 | 102.7 | pkg | 936.0/959.3/989.5 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 437.7/508.6/599.7 | 375.7 | 198.6 | pkg | 74.6/75.9/76.9 | 5 |
| crush | crush version v0.99.0 | 430.6/449.0/521.4 | 147.5 | 129.9 | pkg | 87.5/96.4/109.3 | 5 |
| aider | aider 0.86.2 | 425.6/432.4/449.0 | 68.1 | 643.7 | pkg | 478.9/540.3/548.9 | 5 |
| amp | 0.0.1793782541-gd81f0f (released 2026-11-04T08:55:41.000Z, 3 | 151.2/161.2/164.1 | 140.1 | 154.8 | bin | 144.5/155.8/164.4 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 281.9/397.3/406.9 | 234.4 | 583.2 | pkg | 313.4/322.1/330.4 | 5 |
| qwen code | 0.26.7 | 345.4/365.7/534.1 | 276.3 | 292.8 | pkg | 25.0/29.3/29.6 | 5 |
| codebuff | 1.0.688 | 611.2/618.8/660.8 | 278.2 | 140.0 | bin | 622.6/638.1/639.4 | 5 |
| kilo code | 7.8.18 | 1471.2/1501.7/1555.9 | 929.4 | 720.0 | pkg | 538.7/548.1/548.5 | 5 |
| droid | 1.3.0 | 72.5/77.4/92.4 | 299.0 | 339.5 | bin | 69.0/70.1/76.0 | 5 |
| kimi code | 2.4.1 | 493.2/498.6/532.3 | 331.5 | 192.6 | bin | 381.5/398.7/400.7 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 20.6/35.8/38.0 | 74.7 | 217.6 | bin | 3.9/6.0/6.1 | 5 |
| cline | 3.0.74 | 798.0/806.8/828.3 | 267.7 | 343.8 | pkg | 665.5/762.8/832.8 | 5 |
| continue | 1.5.47 | 21491.6/21505.4/21531.9 | 311.9 | 82.7 | pkg | 711.4/752.7/754.5 | 5 |
| iflow cli | 0.5.19 | 836.6/848.7/912.3 | 338.9 | 180.4 | pkg | 779.9/807.1/835.2 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 87.1/101.8/118.8 | 98.6 | 207.4 | bin | 54.9/58.2/58.9 | 5 |

</details>

_Generated 2026-11-04T12:09:06Z on Linux x86_64 (7.0.0-1017-azure), load 0.49 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
