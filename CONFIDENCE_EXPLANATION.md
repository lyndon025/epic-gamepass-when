# Confidence Rating System Explanation

This document explains how the "Confidence Rating" is calculated for game predictions. The rating is dynamic, based primarily on the **quantity of historical data** (Sample Size) and the **consistency of that data** (Coefficient of Variation).

The logic acts as a reliability score: it doesn't measure *how likely* a game is to arrive, but rather *how much we trust* the prediction of when (or if) it will arrive.

---

## 1. Base Score (Sample Size)

The starting score is determined by how much data we have. More data points generally yield a higher base confidence.

### A. "Repeat" Predictions
*Applies when a specific game has appeared on the service before.*

*   **3+ Appearances:** Base = **85**
*   **2 Appearances:** Base = **75**
*   **1 Appearance:** Base = **65**

*(Note: These base scores are further adjusted by a platform-specific multiplier. For example, Xbox and PS Plus get a temporary 1.25x boost to these base values.)*

### B. "New" Predictions
*Applies when predicting a new game based on its Publisher's history.*

*   **20+ Games from Publisher:** Base = **80**
*   **10-19 Games:** Base = **70**
*   **5-9 Games:** Base = **60**
*   **3-4 Games:** Base = **50**
*   **<3 Games:** Base = **40**

---

## 2. Consistency Adjustment (Coefficient of Variation)

After setting the base score, the system rewards consistent publishers and penalizes erratic ones using the **Coefficient of Variation (CV)**.

### What is CV?
The Coefficient of Variation is a mathematical measure of consistency.
$$CV = \frac{\text{Standard Deviation}}{\text{Mean Average}}$$

*   **Mean:** The average time between game drops.
*   **Standard Deviation:** How much the actual release dates differ from that average.

### Real-World Example
Imagine two publishers with an average wait time of **12 months**:
*   **Publisher A (Consistent):** Drops games at 11, 13, and 12 months. Their CV is very low (e.g., 0.08). The system knows exactly what to expect.
*   **Publisher B (Erratic):** Drops games at 1 month, 23 months, and 12 months. Their average is still 12 months, but their CV is high (e.g., 0.90). Predicting them is a guessing game.

### Impact on Score
*   **High Consistency (CV < 0.3):** **+10 Points** (e.g., Annual sports titles or strict schedules).
*   **Moderate Consistency (CV < 0.5):** **+5 Points**.
*   **High Inconsistency (CV > 0.8):** **-10 Points** (Pattern is too chaotic to trust).

---

## 3. Platform & Data Adjustments

The score is further tuned based on the general predictability of the platform and data completeness.

### Metacritic Bonus
*   **Has Metacritic Score:** **+5 Points** (High-profile games with scores tend to follow more predictable patterns than obscure titles).

### Platform Multipliers (Model Quality)
Different platforms have different baseline predictable behaviors. We scale the final score to reflect this reality.

| Platform | Multiplier | Max Cap | Notes |
| :--- | :--- | :--- | :--- |
| **Epic Games** | **1.0x** (Neutral) | **95** | Most predictable patterns. |
| **Xbox Game Pass** | **0.75x** (Lower) | **90** | Patterns vary significantly. |
| **PS Plus Extra** | **0.60x** (Lowest) | **80** | Catalog additions are highly unpredictable. |
| **Humble Choice** | **0.70x** | **85** | Monthly bundles are difficult to forecast. |

---

## 4. Special Overrides (First-Party Rules)

Certain scenarios bypass the standard formula and use hard-coded confidence values because the outcome is known or guaranteed by policy.

*   **Xbox First-Party (Microsoft Studios):** **99** (Day One guarantee).
*   **Bethesda/ZeniMax (Microsoft-owned):** **90**.
*   **Activision-Blizzard:** **85** (Staggered release schedule).
*   **Sony First-Party (on PS Plus):** **75**.
*   **Humble Choice Exclusions:** **95** (If a game has *ever* appeared in Humble Choice/Monthly, it is virtually guaranteed not to appear again).

---

## Summary Formula

The rough calculation logic is:

```python
Final Score = (Base_Score + Consistency_Bonus + Metacritic_Bonus) * Platform_Quality_Mult
```

*The final result is clamped between 5 and the Platform's Max Cap.*
