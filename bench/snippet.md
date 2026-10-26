![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **49 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 16.8/22.1/23.0 | 45.4 | 116.8 | bin | 6.6/6.9/7.7 | 5 |
| claude code | 2.1.310 (Claude Code) | 237.7/244.2/274.2 | 167.6 | 291.6 | bin | 9.0/10.4/10.7 | 5 |
| codex | codex-cli 0.164.0 | 44.2/44.5/48.2 | 235.7 | 444.4 | pkg | 41.5/41.9/46.0 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.0/9.0/9.4 | 34.2 | 171.3 | bin | 7.9/8.0/8.3 | 5 |
| pi | 1.4.0 | 312.7/313.7/328.6 | 129.1 | 111.8 | pkg | 228.0/235.1/239.5 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.3, linux-x64, JIT off) | 30.5/33.1/34.5 | 77.7 | 256.9 | bin | 7.7/8.7/8.8 | 5 |
| gemini cli | 0.65.0 | 1470.2/1498.6/1529.3 | 170.1 | 102.6 | pkg | 1410.9/1437.4/1455.4 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 691.0/706.1/887.8 | 356.5 | 198.5 | pkg | 98.1/100.0/103.0 | 5 |
| crush | crush version v0.98.2 | 431.9/452.1/669.7 | 156.8 | 128.9 | pkg | 136.4/138.6/149.0 | 5 |
| aider | aider 0.86.2 | 649.6/653.2/658.1 | 67.3 | 642.8 | pkg | 718.6/723.1/738.2 | 5 |
| amp | 0.0.1793025586-g9211b5 (released 2026-10-26T14:39:46.000Z, 2 | 206.8/217.2/231.5 | 138.6 | 161.0 | bin | 188.3/200.9/218.7 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 436.9/615.2/627.8 | 240.9 | 583.2 | pkg | 458.9/465.0/474.8 | 5 |
| qwen code | 0.26.1 | 537.9/539.7/807.6 | 322.6 | 275.4 | pkg | 34.1/37.1/40.0 | 5 |
| codebuff | 1.0.688 | 869.6/917.7/955.5 | 278.1 | 140.0 | bin | 896.5/920.0/923.8 | 5 |
| kilo code | 7.8.18 | 2296.4/2373.7/2465.0 | 494.2 | 720.0 | pkg | 846.3/858.1/862.9 | 5 |
| droid | 0.249.0 | 84.7/98.2/105.6 | 276.7 | 319.7 | bin | 76.9/79.6/80.4 | 5 |
| kimi code | 2.3.3 | 693.1/706.1/745.9 | 328.9 | 192.4 | bin | 564.5/568.7/578.9 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 26.0/50.1/61.5 | 100.9 | 217.5 | bin | 4.8/5.2/5.6 | 5 |
| cline | 3.0.74 | 1273.9/1407.5/1464.2 | 265.1 | 345.5 | pkg | 867.6/919.8/969.9 | 5 |
| continue | 1.5.47 | 11180.5/11191.9/11197.8 | 319.1 | 82.7 | pkg | 1010.5/1033.9/1038.5 | 5 |
| iflow cli | 0.5.19 | 1192.3/1202.6/1204.6 | 362.9 | 180.3 | pkg | 1116.8/1132.3/1134.1 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 134.7/149.9/156.0 | 98.6 | 207.4 | bin | 74.5/78.3/80.0 | 5 |

</details>

_Generated 2026-10-26T15:04:38Z on Linux x86_64 (6.17.0-1022-azure), load 0.8 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
