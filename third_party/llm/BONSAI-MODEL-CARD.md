---
license: apache-2.0
base_model: prism-ml/Ternary-Bonsai-2-27B-gguf
tags:
  - gguf
  - llama.cpp
  - abliteration
  - ternary
  - ptq1_0
  - uncensored
  - prism
  - bonsai
  - qwen35
pipeline_tag: text-generation
---

# Ternary Bonsai 2 27B — Abliterated (PTQ1_0 GGUF)

Refusal-ablated **Ternary Bonsai 2 27B**, edited directly on the ternary lattice and shipped
in PrismML's native PTQ1_0 pack.

- **5,946,648,928 bytes — byte-for-byte the size of the official PTQ1_0 release**
- No requantization, no BF16 bake, no runtime steering, no control vector at serve time
- Requires the [PrismML llama.cpp fork](https://github.com/PrismML-Eng/llama.cpp)

> **Also available: [PQ2_0 (2.13 bpw), with optional MTP speculative decoding](https://huggingface.co/BoldingBuilds/Ternary-Bonsai-2-27B-Abliterated-PQ2_0-MTP-GGUF)**
> — same method, larger pack, and about 37% faster decode when you enable the
> grafted MTP head. Worth noting: the MTP head does *not* help this PTQ1_0 build
> (measured +1.6%), so the speedup is a reason to take the 2-bit pack, not this one.

**Differs from PrismML's release in exactly 98 tensors and nowhere else.** The other 753
tensors are byte-identical, including `token_embd` and `output`. Anyone with both files can
check that without trusting us.

## Results

Paired against the untouched PrismML release: same card, same runtime, same flags, same
seed, `enable_thinking: false` on both arms. Judge is Qwen3.8-27B-OBLITERATED-Q8_0 with the
StrongReject rubric; the prefix grader is reported beside it as a cheap second opinion.

**Refusal — SimpleSafetyTests, n=100**

| | stock | abliterated |
|---|---|---|
| **judged refusal** | **83.0%** | **1.0%** |
| prefix refusal | 78.0% | 0.0% |
| mean rubric score | 0.158 | 0.696 |
| empty completions | 0 | 0 |
| unparsed by judge | 0 | 0 |

**Benign over-refusal — XSTest-safe, n=250** (lower is better)

| | stock | abliterated |
|---|---|---|
| **over-refusal** | 1.6% | **0.0%** |
| full compliance | 242 / 250 | **250 / 250** |
| partial refusal | 4 | 0 |
| full refusal | 4 | 0 |

Over-refusal went **down**, not up. The model answers every harmless prompt in the set,
which the stock model does not.

**Capability — HumanEval-164, greedy, paired per problem**

| | stock | abliterated |
|---|---|---|
| pass@1 | 0.811 (133/164) | 0.805 (132/164) |
| capped at token limit | 11.6% | 8.5% |
| median completion tokens | 141 | 113 |

Per problem: 129 both pass, 28 both fail, 3 gained, 4 lost.
**McNemar exact two-sided p = 1.000** (discordant n=7) — no detectable capability change.

The empty-completion and unparsed counts are listed deliberately. An empty answer scores as
compliance under any prefix grader, so a 0% refusal rate means nothing without them. An
earlier run of this same eval produced "0/100 refusal" purely from 82 empty answers, because
thinking consumed the token budget before the model reached its reply.

## Why this is not a normal abliteration

Standard abliteration projects a refusal direction out of the residual-writing tensors:
`W ← W − λ·r·(rᵀW)`. **On a ternary checkpoint that does nothing at all.**

Bonsai 2's weights take three values per group of 128: `{−s, 0, +s}`. Projection asks each
weight to move about 1.4% of its magnitude while the lattice step is 100%, so repacking
rounds every weight straight back. Measured on real writer tensors:

| approach | refusal component removed | ternary digits changed |
|---|---|---|
| project, repack at λ=1.0 | none | **0 of 89,128,960** |
| project, repack at λ=1.3 | none | 72 of 89,128,960 (0.0001%) |
| refit per-group scales, digits frozen | 1.1% | 0 |
| **flip digits on the lattice (this model)** | **99.1–99.3%** | 0.24% |

**This is a trap worth naming.** A projected-then-repacked model passes a file-size check
*and* a quantizer reproducibility check while containing no abliteration whatsoever. If you
build one of these, diff the tensors against the base release. Size is not evidence.

The per-group scales cannot carry the edit either — a scale can only scale, while the
correction it must express varies across the 128 weights in its group. That is the 1.1% row.

## Method

The quantity to remove is not each weight but the row sum `c = rᵀW`, one value per column. A
single flipped digit moves `c` by `r_i · s · Δ`, a whole lattice step — enormous next to the
1.4% nudge projection wanted. So the edit does not need many digits, it needs the right ones:
spend them where `|r_i|` is largest, since those buy the most change in `c` per unit of
damage to `W`. Greedy, one pass over rows in descending `|r_i|`, clipped so every digit stays
in `{−1,0,+1}` and every group scale is untouched.

- **Writers only**: `ffn_down`, `ssm_out`, `attn_output` — 98 tensors
- **Blocks 15–63.** Early blocks deliberately untouched; including them destroys coding.
  Corroborated three ways: huihui's Qwen3.8 recipe skips 0–14, our own all-blocks arm
  collapsed to 0.233 answer quality, and `Hikari07jp` restored L0–7 on Bonsai 1 to recover
  coding from 16/20 to 19/20.
- **λ = 1.0**, top 512 rows per tensor, 0.24% of digits flipped
- Direction transferred from the Qwen3.8-27B parent, recovered from huihui's released weights
  by rank-1 decomposition (σ₁/σ₂ ≈ 23)

**Cost, stated plainly:** `|dW|/|W| = 0.071`, roughly 5× what a true projection costs on a
full-precision model, because a coarse lattice cannot make small corrections. The HumanEval
result above is what that cost bought — apparently nothing, which is the interesting part.

## Rebuilding this

Default `llama-quantize` does **not** reproduce the release — it yields 7.11 GB because
`output.weight` and `token_embd.weight` land at Q6_K/Q4_K. The released configuration is:

```bash
llama-quantize \
  --output-tensor-type PTQ1_0 --token-embedding-type PTQ1_0 \
  --tensor-type ssm_alpha=bf16 --tensor-type ssm_beta=bf16 \
  in-F16.gguf out-PTQ1_0.gguf PTQ1_0 16
```

The 96 `ssm_alpha`/`ssm_beta` tensors cannot be reproduced from the released F16 at all: the
PTQ1_0 release stores them BF16 (7 mantissa bits) while the F16 file holds 10, so packing
truncates them ~0.4%. They are spliced verbatim from the base release here.

## Usage

```bash
git clone https://github.com/PrismML-Eng/llama.cpp
cmake -B build -DGGML_CUDA=ON && cmake --build build -j

./build/bin/llama-server \
  -m Ternary-Bonsai-2-27B-Abliterated-PTQ1_0.gguf \
  -ngl 99 -c 8192 --flash-attn on --jinja
```

Benchmarks above were run with `--chat-template-kwargs '{"enable_thinking": false}'`. With
thinking enabled, budget generously: this model reasons ~25% longer than stock, and a 256
token cap leaves most answers empty.

## Limitations

- Abliteration is a behavioural change, not a safety property. **This model will produce
  unsafe content if asked**, including in categories stock refuses outright. Use under your
  own policy and applicable law.
- Requires the PrismML fork; stock llama.cpp cannot load PTQ1_0.
- The direction is **transferred from the Qwen3.8 parent**, not fitted on Bonsai 2 itself. A
  natively fitted direction may do better and has not been tried.
- Same-condition lab measurement, not a leaderboard reproduction. Single greedy sample per
  problem; at n=164 the resolution floor is ~6.5 points.
- Vision mmproj not included (text only).

## Prior art and attribution

- Base weights and format:
  [prism-ml/Ternary-Bonsai-2-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf) (Apache-2.0)
- **[Hikari07jp/Ternary-Bonsai-27B-Abliterated-LowDeg-GGUF](https://huggingface.co/Hikari07jp/Ternary-Bonsai-27B-Abliterated-LowDeg-GGUF)**
  did this first, on Bonsai **1**, with the same family of method (direct ternary code edit
  on writers). Their early-block rollback is the degradation fix and is prior art for the
  block choice here. This release is Bonsai **2** and adds the measured mechanism: why
  projection fails on ternary weights, and what the lattice costs.
- Architecture lineage: Qwen3.5 / Qwen3.8-27B hybrid attention

## License

Apache-2.0, same as the base release.
