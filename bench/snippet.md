![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **57 ms**, peak RSS **61 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.7.0 | 25.4/27.0/33.6 | 48.1 | 116.9 | bin | 8.0/10.1/11.5 | 5 |
| claude code | 2.1.322 (Claude Code) | 214.0/218.5/231.7 | 160.3 | 341.9 | bin | 10.9/12.3/13.2 | 5 |
| codex | codex-cli 0.167.0 | 43.1/45.1/46.8 | 115.1 | 458.6 | pkg | 41.2/44.5/45.1 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 12.5/12.8/13.3 | 37.8 | 171.3 | bin | 11.0/11.1/12.0 | 5 |
| pi | 1.5.1 | 311.9/316.1/340.6 | 121.3 | 115.2 | pkg | 233.8/236.5/240.4 | 5 |
| pi-bolt | 1.5.0 (Pi-Bolt 1.1.7, linux-x64, JIT off) | 33.4/33.9/39.8 | 74.9 | 263.0 | bin | 8.8/10.5/13.5 | 5 |
| gemini cli | 0.67.0 | 1579.8/1594.5/1602.1 | 166.0 | 102.9 | pkg | 1514.3/1522.8/1538.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.108. | 622.1/625.2/869.9 | 333.0 | 210.5 | pkg | 109.7/111.2/112.6 | 5 |
| crush | crush version v0.100.0 | 562.6/661.6/986.1 | 144.5 | 131.5 | pkg | 138.2/143.2/145.5 | 5 |
| aider | aider 0.86.2 | 716.7/717.1/731.6 | 68.2 | 643.7 | pkg | 799.3/801.6/807.2 | 5 |
| amp | 0.0.1794308901-gd9882c (released 2026-11-10T11:08:21.000Z, 1 | 237.5/240.5/246.6 | 144.2 | 155.5 | bin | 223.9/234.3/238.9 | 5 |
| cursor-agent | 2026.11.05-86047df | 466.8/650.2/657.3 | 240.2 | 560.2 | pkg | 503.7/506.2/512.8 | 5 |
| qwen code | 0.27.1 | 574.8/581.9/873.9 | 273.9 | 294.0 | pkg | 37.6/39.9/43.1 | 5 |
| codebuff | 1.0.688 | 939.4/943.7/962.6 | 278.7 | 140.0 | bin | 941.7/965.2/969.2 | 5 |
| kilo code | 7.8.27 | 2188.6/2255.2/2287.5 | 742.0 | 720.0 | pkg | 821.7/831.5/834.9 | 5 |
| droid | 1.7.0 | 114.3/115.9/119.4 | 298.0 | 340.3 | bin | 100.6/106.5/109.9 | 5 |
| kimi code | 2.5.2 | 786.8/792.8/802.7 | 321.0 | 185.3 | bin | 608.2/616.6/624.6 | 5 |
| devin | devin 3000.12.43 (517d03d73926) | 29.8/55.9/60.0 | 75.3 | 209.7 | bin | 6.1/7.3/8.7 | 5 |
| cline | 3.0.74 | 1222.3/1232.9/1456.2 | 262.1 | 346.0 | pkg | 940.3/1124.4/1150.5 | 5 |
| continue | 1.5.47 | 21780.9/21795.4/21813.7 | 311.6 | 82.7 | pkg | 1149.9/1173.7/1183.3 | 5 |
| iflow cli | 0.5.19 | 1329.1/1342.8/1353.0 | 336.6 | 180.4 | pkg | 1241.5/1249.8/1261.7 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 146.4/155.8/160.4 | 98.5 | 207.4 | bin | 84.4/87.1/89.6 | 5 |

</details>

_Generated 2026-11-10T12:25:23Z on Linux x86_64 (7.0.0-1017-azure), load 0.63 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
