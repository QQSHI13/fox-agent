| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **18.3** | **#2** of 22 |
| TUI 1st paint | **23.2** | **#2** of 20 |
| TUI 1st input | **193** | **#1** of 9 |
| input latency | **3.1** | **#3** of 8 |
| bundle | **117** | **#4** of 22 |
| idle PSS | **45** | **#1** of 20 |
| `--version` | **7.4** | **#2** of 22 |

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **57 MB**.

<details><summary>dashboard · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | bundle (MB) | kind | `--version` min/p50/p95 | 1st byte min/p50/p95 | 1st paint min/p50/p95 | 1st input min/p50/p95 | latency min/p50/p95 | signal | idle PSS (MB) | n |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 116.6 | bin | 6.8/7.4/8.3 | 14.6/18.3/21.1 | 20.2/23.2/25.0 | 190.7/192.9/215.0 | 3.0/3.1/3.2 | render | 44.6 | 5 |
| claude code | 2.1.310 (Claude Code) | 291.6 | bin | 9.2/10.3/10.6 | 205.4/213.4/236.8 | 218.0/226.4/248.9 | — | — | render | 173.8 | 5 |
| codex | codex-cli 0.164.0 | 444.4 | pkg | 37.5/37.8/38.4 | 35.8/36.6/38.9 | 336.9/337.1/782.8 | — | — | render | 233.7 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 171.3 | bin | 8.6/8.8/8.9 | 10.0/10.2/11.1 | 10.4/10.6/11.2 | 240.1/240.4/263.6 | 2.5/2.6/2.6 | render | 46.2 | 5 |
| pi | 1.4.0 | 111.8 | pkg | 196.3/200.1/200.4 | 250.7/257.6/268.1 | 265.3/269.5/276.1 | 472.1/501.4/506.8 | 3.3/3.5/4.0 | render | 129.5 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.0, linux-x64, JIT off) | 263.2 | bin | 13.5/15.5/16.8 | 31.3/31.9/33.2 | 34.2/34.9/36.3 | 224.4/224.6/226.0 | 2.6/2.8/2.8 | render | 89.3 | 5 |
| gemini cli | 0.65.0 | 102.6 | pkg | 1177.7/1190.9/1216.7 | 1258.1/1268.7/1278.2 | 1258.1/1268.7/1278.2 | — | — | — | — | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 198.5 | pkg | 86.7/87.6/88.2 | 550.7/580.1/740.6 | 755.8/784.2/921.9 | — | — | render | 399.9 | 5 |
| crush | crush version v0.98.2 | 128.9 | pkg | 112.0/120.2/121.6 | 574.6/667.1/719.3 | 576.6/668.2/719.3 | — | — | render | 162.5 | 5 |
| aider | aider 0.86.2 | 642.8 | pkg | 621.3/642.5/644.2 | 549.4/551.9/570.6 | 549.8/552.3/571.0 | 743.3/758.0/862.1 | 4.7/4.8/5.0 | render | 67.4 | 5 |
| amp | 0.0.1792814442-g8ccdc4 (released 2026-10-24T04:00:42.000Z, 3 | 161.1 | bin | 150.2/161.6/164.5 | 168.1/184.4/223.5 | 168.1/184.4/223.5 | 336.7/353.0/392.2 | — | — | — | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 583.2 | pkg | 359.9/366.2/372.4 | 335.3/477.2/490.0 | 335.3/335.3/335.3 | — | — | render | 240.7 | 5 |
| qwen code | 0.26.0 | 154.7 | pkg | 29.8/31.8/33.7 | 432.6/441.3/635.7 | 774.5/784.6/1101.1 | — | — | render | 208.5 | 5 |
| codebuff | 1.0.688 | 140.0 | bin | 714.2/724.9/733.4 | 687.0/696.7/697.8 | 1714.9/1724.1/1756.6 | — | — | render | 291.3 | 5 |
| kilo code | 7.8.17 | 718.6 | pkg | 621.2/631.1/634.6 | 1668.8/1706.1/1810.3 | 1668.8/1706.1/1810.3 | 5511.4/5756.4/12456.5 | 8.3/9.7/26.5 | render | 938.2 | 5 |
| droid | 0.249.0 | 319.7 | bin | 66.6/69.5/74.9 | 74.6/83.0/87.3 | — | — | — | render | 272.9 | 5 |
| kimi code | 2.3.1 | 192.3 | bin | 449.0/452.3/456.2 | 564.0/570.7/585.7 | 590.0/597.0/611.7 | — | — | render | 361.6 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 217.5 | bin | 4.2/4.5/5.7 | 19.5/39.1/46.4 | 21.7/41.3/48.4 | — | — | render | 102.8 | 5 |
| cline | 3.0.73 | 330.3 | pkg | 710.3/1020.5/1021.7 | 925.6/967.4/1286.4 | 925.6/967.4/1286.4 | — | — | render | 268.0 | 5 |
| continue | 1.5.47 | 82.7 | pkg | 883.8/898.8/960.2 | 11060.9/11069.1/11075.3 | 11076.4/11084.9/11094.0 | — | — | render | 319.9 | 5 |
| iflow cli | 0.5.19 | 180.2 | pkg | 927.5/959.2/1040.8 | 977.9/989.9/1015.1 | 1008.8/1051.1/1080.6 | 1386.8/1409.0/5165.6 | 46.0/46.7/47.2 | render | 358.2 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 | bin | 64.6/65.6/66.6 | 101.9/118.6/126.7 | 101.9/118.6/126.7 | 1584.8/1586.2/2137.8 | 16.8/18.0/19.1 | render | 131.2 | 5 |

</details>

<details><summary>what could not be measured</summary>

- **amp**: latency: never settled
- **claude code**: latency: probe 'zw' did not render
- **claude code**: ttfi: probe 'zj' did not render
- **cline**: latency: probe 'zw' did not render
- **cline**: ttfi: probe 'zj' did not render
- **codebuff**: latency: probe 'xj' did not render
- **codebuff**: ttfi: probe 'zw' did not render
- **codex**: latency: probe 'zw' did not render
- **codex**: ttfi: probe 'jb' did not render
- **continue**: latency: probe 'xj' did not render
- **continue**: ttfi: probe 'zw' did not render
- **copilot cli**: latency: probe 'zw' did not render
- **copilot cli**: ttfi: probe 'zj' did not render
- **copilot cli**: ttfi: probe 'zw' did not render
- **crush**: latency: probe 'jk' did not render
- **crush**: ttfi: probe 'zw' did not render
- **cursor-agent**: latency: probe 'jk' did not render
- **cursor-agent**: latency: probe 'xj' did not render
- **cursor-agent**: ttfi: never became interactive
- **cursor-agent**: ttfi: probe 'zx' did not render
- **devin**: latency: probe 'zw' did not render
- **devin**: ttfi: probe 'zx' did not render
- **droid**: latency: probe 'xj' did not render
- **droid**: ttfi: never became interactive
- **gemini cli**: latency: never settled
- **gemini cli**: ttfi: never became interactive
- **kimi code**: latency: probe 'zw' did not render
- **kimi code**: ttfi: probe 'zw' did not render
- **qwen code**: latency: probe 'zw' did not render
- **qwen code**: ttfi: probe 'zj' did not render
- **qwen code**: ttfi: probe 'zw' did not render

</details>

_Generated 2026-10-24T08:05:36Z on Linux x86_64 (6.17.0-1022-azure), load 0.28 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
