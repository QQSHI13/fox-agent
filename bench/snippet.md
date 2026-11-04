![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **38 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 16.3/18.3/19.2 | 47.9 | 116.8 | bin | 6.0/6.2/6.2 | 5 |
| claude code | 2.1.318 (Claude Code) | 141.2/150.9/185.0 | 155.2 | 337.8 | bin | 8.4/9.2/9.4 | 5 |
| codex | codex-cli 0.166.0 | 29.5/30.5/32.8 | 116.9 | 456.2 | pkg | 27.0/29.1/30.5 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 8.4/9.0/9.3 | 37.7 | 171.3 | bin | 7.0/7.3/7.4 | 5 |
| pi | 1.5.0 | 176.8/181.4/191.5 | 125.0 | 114.1 | pkg | 131.5/134.5/134.8 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.9, linux-x64, JIT off) | 22.7/25.4/29.2 | 73.5 | 257.6 | bin | 6.3/7.1/7.8 | 5 |
| gemini cli | 0.66.0 | 949.8/956.1/976.1 | 143.1 | 102.7 | pkg | 914.9/919.5/930.1 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.105. | 411.0/453.5/631.3 | 374.6 | 198.6 | pkg | 67.3/68.2/69.8 | 5 |
| crush | crush version v0.99.0 | 461.6/540.4/772.7 | 146.9 | 129.9 | pkg | 77.6/89.5/103.9 | 5 |
| aider | aider 0.86.2 | 397.2/401.5/409.2 | 68.2 | 643.7 | pkg | 460.2/466.5/509.3 | 5 |
| amp | 0.0.1793793640-g2084a9 (released 2026-11-04T12:00:40.000Z, 5 | 143.6/146.2/155.0 | 140.4 | 154.8 | bin | 140.2/145.4/159.2 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 267.6/379.3/392.7 | 233.9 | 583.2 | pkg | 285.8/295.6/311.3 | 5 |
| qwen code | 0.26.7 | 338.0/351.4/519.9 | 276.7 | 292.8 | pkg | 24.9/29.3/32.1 | 5 |
| codebuff | 1.0.688 | 570.3/581.5/594.1 | 278.9 | 140.0 | bin | 596.0/605.2/608.9 | 5 |
| kilo code | 7.8.18 | 1368.0/1381.1/1428.7 | 903.2 | 720.0 | pkg | 506.9/514.7/517.3 | 5 |
| droid | 1.3.0 | 69.1/72.2/79.8 | 296.5 | 339.5 | bin | 64.3/65.7/75.1 | 5 |
| kimi code | 2.4.1 | 472.0/494.2/501.0 | 328.0 | 192.6 | bin | 371.3/380.1/434.1 | 5 |
| devin | devin 3000.11.234 (92c83011d113) | 20.3/36.4/39.1 | 74.9 | 217.6 | bin | 4.0/4.6/6.8 | 5 |
| cline | 3.0.74 | 736.2/767.3/809.5 | 266.5 | 343.8 | pkg | 639.7/650.1/705.0 | 5 |
| continue | 1.5.47 | 21464.8/21471.0/21496.8 | 312.4 | 82.7 | pkg | 688.7/710.2/713.5 | 5 |
| iflow cli | 0.5.19 | 799.9/808.3/834.2 | 339.0 | 180.4 | pkg | 755.8/760.2/773.3 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 84.7/98.6/102.6 | 98.7 | 207.4 | bin | 53.0/55.7/56.1 | 5 |

</details>

_Generated 2026-11-04T13:01:40Z on Linux x86_64 (7.0.0-1017-azure), load 0.51 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
