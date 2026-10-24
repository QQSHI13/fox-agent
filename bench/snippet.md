![fox-agent bench](bench/fox.svg)

fox-agent headless vs scripted local provider: time to first token **48 ms**, peak RSS **57 MB**.

<details><summary>the full field · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | 1st byte min/p50/p95 (ms) | idle PSS (MB) | bundle (MB) | kind | `--version` min/p50/p95 (ms) | n |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 14.6/15.5/18.3 | 44.5 | 116.6 | bin | 6.7/7.9/11.5 | 5 |
| claude code | 2.1.310 (Claude Code) | 196.3/199.7/935.0 | 173.0 | 291.6 | bin | 9.4/11.4/11.8 | 5 |
| codex | codex-cli 0.164.0 | 36.8/37.2/38.4 | 233.9 | 444.4 | pkg | 36.7/38.1/38.4 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 9.9/10.0/10.4 | 34.2 | 171.3 | bin | 8.5/8.8/8.9 | 5 |
| pi | 1.4.0 | 252.6/257.2/262.3 | 129.2 | 111.8 | pkg | 195.3/197.2/199.6 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.0, linux-x64, JIT off) | 30.9/30.9/37.2 | 89.3 | 263.2 | bin | 10.8/12.8/13.2 | 5 |
| gemini cli | 0.65.0 | 1256.8/1271.7/1276.9 | — | 102.6 | pkg | 1180.4/1184.2/1195.2 | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 548.3/572.4/747.8 | 393.8 | 198.5 | pkg | 86.8/88.0/88.9 | 5 |
| crush | crush version v0.98.2 | 408.2/532.5/607.4 | 163.2 | 128.9 | pkg | 116.0/120.0/130.5 | 5 |
| aider | aider 0.86.2 | 569.8/572.0/584.3 | 67.5 | 642.8 | pkg | 647.9/658.3/669.6 | 5 |
| amp | 0.0.1792828848-gc7cca4 (released 2026-10-24T08:00:48.000Z, 5 | 177.7/185.7/189.8 | — | 161.1 | bin | 164.0/168.0/177.9 | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 350.7/497.6/530.6 | 241.5 | 583.2 | pkg | 366.6/381.3/383.2 | 5 |
| qwen code | 0.26.0 | 452.3/458.8/670.0 | 205.9 | 154.7 | pkg | 32.1/32.4/32.6 | 5 |
| codebuff | 1.0.688 | 772.4/772.8/778.1 | 301.5 | 140.0 | bin | 766.4/771.8/773.3 | 5 |
| kilo code | 7.8.17 | 1741.6/1779.5/1877.0 | 906.1 | 718.6 | pkg | 661.1/666.6/669.4 | 5 |
| droid | 0.249.0 | 75.6/85.4/89.6 | 272.9 | 319.7 | bin | 67.5/70.9/80.2 | 5 |
| kimi code | 2.3.1 | 585.5/597.5/619.7 | 325.0 | 192.3 | bin | 461.4/464.8/478.8 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 18.4/39.5/45.7 | 99.3 | 217.5 | bin | 4.5/5.0/6.9 | 5 |
| cline | 3.0.73 | 917.4/933.7/1002.8 | 267.9 | 330.3 | pkg | 745.3/767.4/806.6 | 5 |
| continue | 1.5.47 | 11079.3/11089.3/11132.7 | 322.7 | 82.7 | pkg | 892.0/900.5/904.0 | 5 |
| iflow cli | 0.5.19 | 1008.8/1025.6/1033.8 | 360.5 | 180.2 | pkg | 952.4/965.0/968.9 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 117.0/126.0/133.0 | 128.7 | 207.4 | bin | 66.0/70.0/70.7 | 5 |

</details>

<details><summary>what could not be measured</summary>

- **amp**: latency: never stopped repainting (no quiet window)
- **claude code**: latency: no input field accepted the keystroke
- **claude code**: ttfi: no input field accepted the keystroke
- **cline**: latency: waiting for login
- **cline**: ttfi: waiting for login
- **codebuff**: latency: no input field accepted the keystroke
- **codebuff**: ttfi: no input field accepted the keystroke
- **codex**: latency: waiting for login
- **codex**: ttfi: waiting for login
- **continue**: latency: no input field accepted the keystroke
- **continue**: ttfi: no input field accepted the keystroke
- **copilot cli**: latency: trust prompt
- **copilot cli**: ttfi: trust prompt
- **crush**: latency: no input field accepted the keystroke
- **crush**: ttfi: no input field accepted the keystroke
- **cursor-agent**: latency: blank screen
- **cursor-agent**: latency: no input field accepted the keystroke
- **cursor-agent**: ttfi: never became interactive (blank screen)
- **cursor-agent**: ttfi: no input field accepted the keystroke
- **devin**: latency: waiting for login
- **devin**: ttfi: waiting for login
- **droid**: latency: blank screen
- **droid**: ttfi: never became interactive (blank screen)
- **gemini cli**: latency: never stopped repainting (no quiet window)
- **gemini cli**: ttfi: never became interactive (blank screen)
- **jcode**: latency: probe 'zw' did not render
- **jcode**: ttfi: probe 'zx' did not render
- **kimi code**: latency: trust prompt
- **kimi code**: ttfi: trust prompt
- **qwen code**: latency: waiting for login
- **qwen code**: ttfi: waiting for login

</details>

_Generated 2026-10-24T09:36:04Z on Linux x86_64 (6.17.0-1022-azure), load 0.33 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
