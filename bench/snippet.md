![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **49 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 21.5/23.6/25.8 | 47.9 | 116.9 | bin | 5.2/6.3/6.9 | 5 |
| claude code | 2.1.322 (Claude Code) | 182.4/183.1/205.0 | 158.1 | 341.9 | bin | 7.9/9.5/9.6 | 5 |
| codex | codex-cli 0.167.0 | 35.5/36.3/39.4 | 116.5 | 458.6 | pkg | 31.6/34.1/35.7 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.1/9.2/9.7 | 37.8 | 171.3 | bin | 7.2/7.8/8.1 | 5 |
| pi | 1.5.1 | 253.9/258.9/270.7 | 122.9 | 115.2 | pkg | 189.0/190.9/194.9 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.7, linux-x64, JIT off) | 26.2/26.8/28.5 | 74.8 | 263.0 | bin | 6.6/7.3/9.1 | 5 |
| gemini cli | 0.67.0 | 1304.1/1316.9/1325.3 | 164.9 | 102.9 | pkg | 1230.9/1244.7/1260.3 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.108. | 527.6/533.8/711.6 | 333.8 | 210.5 | pkg | 85.6/93.8/97.0 | 5 |
| crush | crush version v0.100.0 | 446.2/457.4/633.9 | 145.5 | 131.5 | pkg | 106.6/116.7/129.7 | 5 |
| aider | aider 0.86.2 | 565.8/574.5/589.3 | 68.1 | 643.7 | pkg | 626.4/641.9/643.0 | 5 |
| amp | 0.0.1794308901-gd9882c (released 2026-11-10T11:08:21.000Z, 2 | 210.3/219.5/229.5 | 144.4 | 155.5 | bin | 204.2/214.8/228.2 | 5 |
| cursor-agent | 2026.11.05-86047df | 398.2/563.9/570.3 | 239.7 | 560.2 | pkg | 427.4/428.0/431.1 | 5 |
| qwen code | 0.27.1 | 463.6/472.1/727.5 | 273.9 | 294.0 | pkg | 34.6/36.2/36.3 | 5 |
| codebuff | 1.0.688 | 814.0/819.5/882.6 | 278.6 | 140.0 | bin | 833.1/833.8/836.4 | 5 |
| kilo code | 7.8.27 | 2006.1/2027.3/2128.5 | 874.7 | 720.0 | pkg | 759.9/765.9/769.8 | 5 |
| droid | 1.7.0 | 91.9/97.5/100.9 | 298.7 | 340.3 | bin | 78.7/87.8/93.7 | 5 |
| kimi code | 2.5.2 | 638.1/647.0/687.7 | 322.9 | 185.3 | bin | 514.2/520.5/521.6 | 5 |
| devin | devin 3000.12.43 (517d03d73926) | 19.6/49.9/52.4 | 75.9 | 209.7 | bin | 3.8/5.5/6.0 | 5 |
| cline | 3.0.74 | 1088.0/1108.5/1174.8 | 265.7 | 346.0 | pkg | 781.6/1052.2/1068.7 | 5 |
| continue | 1.5.47 | 21616.4/21623.4/21627.1 | 312.7 | 82.7 | pkg | 937.5/940.7/964.6 | 5 |
| iflow cli | 0.5.19 | 1054.6/1078.7/1092.7 | 338.3 | 180.4 | pkg | 970.5/987.3/1010.0 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 121.4/141.7/148.0 | 98.5 | 207.4 | bin | 71.7/73.0/74.1 | 5 |

</details>

_Generated 2026-11-10T11:39:55Z on Linux x86_64 (7.0.0-1017-azure), load 0.66 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
