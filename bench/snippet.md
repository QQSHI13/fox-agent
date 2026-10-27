![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 25.3/27.2/31.7 | 44.6 | 116.7 | bin | 7.1/8.4/9.7 | 5 |
| claude code | 2.1.311 (Claude Code) | 234.7/240.3/279.0 | 164.2 | 293.8 | bin | 10.0/13.4/13.7 | 5 |
| codex | codex-cli 0.164.0 | 41.3/43.7/44.5 | 237.9 | 444.4 | pkg | 42.5/43.4/44.8 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 10.7/11.1/11.6 | 33.6 | 171.3 | bin | 9.1/9.1/9.7 | 5 |
| pi | 1.4.0 | 318.0/320.4/331.8 | 128.9 | 112.2 | pkg | 245.3/248.5/251.1 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.4, linux-x64, JIT off) | 31.9/37.9/41.4 | 77.7 | 257.4 | bin | 11.2/11.4/12.0 | 5 |
| gemini cli | 0.65.0 | 1584.3/1587.1/1597.3 | 170.2 | 102.6 | pkg | 1482.9/1507.0/1507.3 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.104. | 687.8/712.2/1079.0 | 354.8 | 198.6 | pkg | 102.1/106.3/108.1 | 5 |
| crush | crush version v0.98.2 | 507.6/598.4/917.8 | 159.1 | 128.9 | pkg | 144.8/148.7/149.9 | 5 |
| aider | aider 0.86.2 | 728.0/730.2/756.7 | 67.2 | 642.8 | pkg | 787.9/799.4/819.4 | 5 |
| amp | 0.0.1793073650-g23dd39 (released 2026-10-27T04:00:50.000Z, 3 | 218.0/231.6/234.2 | 138.9 | 161.0 | bin | 197.8/210.4/221.8 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 457.5/628.5/631.7 | 236.6 | 583.2 | pkg | 470.6/482.5/482.6 | 5 |
| qwen code | 0.26.1 | 586.4/597.0/861.5 | 322.4 | 275.4 | pkg | 35.7/37.1/39.5 | 5 |
| codebuff | 1.0.688 | 873.6/882.4/942.9 | 279.3 | 140.0 | bin | 931.6/942.4/946.3 | 5 |
| kilo code | 7.8.18 | 2148.8/2174.9/2182.2 | 886.3 | 720.0 | pkg | 782.0/797.6/812.0 | 5 |
| droid | 0.250.0 | 100.6/106.4/125.0 | 275.2 | 323.4 | bin | 88.7/90.8/94.4 | 5 |
| kimi code | 2.3.3 | 714.3/728.6/792.4 | 330.6 | 192.4 | bin | 576.7/592.4/645.1 | 5 |
| devin | devin 3000.11.228 (053434014dbd) | 51.5/57.1/57.6 | 98.3 | 217.5 | bin | 7.0/13.8/15.2 | 5 |
| cline | 3.0.74 | 1127.0/1218.0/1432.5 | 264.3 | 346.1 | pkg | 873.2/922.9/925.5 | 5 |
| continue | 1.5.47 | 11208.7/11216.9/11225.3 | 319.8 | 82.7 | pkg | 1093.1/1101.0/1106.4 | 5 |
| iflow cli | 0.5.19 | 1263.5/1273.6/1279.7 | 359.9 | 180.3 | pkg | 1182.2/1199.8/1216.7 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 141.6/150.3/160.7 | 98.9 | 207.4 | bin | 79.4/83.7/84.0 | 5 |

</details>

_Generated 2026-10-27T07:41:06Z on Linux x86_64 (6.17.0-1022-azure), load 0.74 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
