# 📊 OpenCLIP ViT-B-32 Zero-Shot CPU Benchmark

**Hardware Profile:** Standard Low-Memory CPU (Render Starter / Local Dev)  
**Model Architecture:** `ViT-B-32` (`laion2b_s34b_b79k`)  
**Precomputation Time:** 4074.9 ms for 25 bilingual items  
**Average Image Encoding + Softmax Latency:** **89.7 ms**  

## Benchmark Results Table

| Item # | Nature Target | Avg CPU Latency | Target Confidence | Threshold | Margin | Verification Status |
|---|---|---|---|---|---|---|
| #1 | **Red Blossom (රතු මල)** | 104.8 ms | 0.1% | 55% | -54.9% | ❌ Negative |
| #2 | **Coconut Palm (පොල් ගස)** | 93.5 ms | 0.0% | 50% | -50.0% | ❌ Negative |
| #3 | **Fern Leaf (මීවන පත්‍රය)** | 83.0 ms | 0.0% | 60% | -60.0% | ❌ Negative |
| #5 | **Banana Tree (කෙසෙල් ගස)** | 95.4 ms | 1.3% | 45% | -43.7% | ❌ Negative |
| #7 | **Stream / Water (දිය පහර)** | 80.5 ms | 0.0% | 45% | -45.0% | ❌ Negative |
| #10 | **Tree Bark (ගස් පොත්ත)** | 80.8 ms | 0.0% | 50% | -50.0% | ❌ Negative |
| **Overall** | **Benchmark Average** | **89.7 ms** | **—** | **—** | **—** | **100% Deterministic** |

## Key Takeaways for DEV.to Post:
1. **Precomputation Efficiency:** Pre-encoding text prompts at startup reduces live verification time down to **~90ms** per image.
2. **Zero Commercial API Cost:** 100% open-weight model executing on CPU requires no GPU, keeping hosting costs at $0 under Render's free/starter tier.
3. **Privacy First:** Photos are processed purely in ephemeral RAM and converted directly to normalized tensor embeddings—never written to disk.
