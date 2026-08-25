# AI Intern Interview — Reference Q&A Dataset

This document provides a human-readable view of the questions used by the AI Interviewer.
The machine-readable source of truth is [`data/qa-dataset.json`](../data/qa-dataset.json).

---

## Overview

| # | ID | Category | Difficulty | Question (English) |
|---|-----|----------|------------|---------------------|
| 1 | q01 | ML Fundamentals | Medium | Explain the bias-variance tradeoff. |
| 2 | q02 | ML Fundamentals | Medium | How would you handle a dataset with significant class imbalance? |
| 3 | q03 | Tooling | Easy | What's the difference between a Python list and a NumPy array, and when would you use each? |
| 4 | q04 | ML Fundamentals | Medium | Explain overfitting and three ways to mitigate it. |
| 5 | q05 | Behavioral | Medium | Walk me through a machine learning project you've worked on, from data to results. |
| 6 | q06 | ML Fundamentals | Hard | Explain p-value and a common misinterpretation of it. |
| 7 | q07 | ML Fundamentals | Medium | What is the purpose of an activation function, and why can't a network rely only on linear functions? |
| 8 | q08 | Debugging | Hard | Your model has 99% training accuracy but 60% validation accuracy. What's happening, and how do you fix it? |
| 9 | q09 | Ethics | Medium | Why is it important to evaluate a model for bias, and how would you check for it? |
| 10 | q10 | Behavioral | Easy | Tell me about a time you had to learn a new tool or technique quickly. How did you approach it? |

---

## Detailed Questions & Answers

### Q01 — Bias-Variance Tradeoff
**Category:** ML Fundamentals · **Difficulty:** Medium

**Question (EN):** Explain the bias-variance tradeoff.
**Question (HI):** बायस-वेरिएंस ट्रेडऑफ़ को समझाइए।
**Question (DE):** Erklären Sie den Bias-Varianz-Tradeoff.

**Ideal Answer (EN):** Bias is error from overly simple assumptions (underfitting), variance is error from sensitivity to training data noise (overfitting). Total error is bias² + variance + irreducible noise. Model complexity controls where you sit on that curve, and the goal is the sweet spot that minimizes validation error, not training error.

**Rubric Keyphrases:** bias, variance, underfitting, overfitting, irreducible noise, model complexity, validation error, tradeoff

**Follow-up Hint:** Ask for a concrete example of a high-bias vs high-variance model.

---

### Q02 — Class Imbalance
**Category:** ML Fundamentals · **Difficulty:** Medium

**Question (EN):** How would you handle a dataset with significant class imbalance?
**Question (HI):** आप महत्वपूर्ण क्लास असंतुलन वाले डेटासेट को कैसे संभालेंगे?
**Question (DE):** Wie würden Sie mit einem Datensatz umgehen, der eine erhebliche Klassenungleichverteilung aufweist?

**Ideal Answer (EN):** Don't just look at accuracy — use precision/recall/F1/ROC-AUC per class. Techniques include resampling (oversample minority, undersample majority, SMOTE), class-weighted loss functions, and threshold tuning at inference time. Choice depends on whether false positives or false negatives are more costly for the use case.

**Rubric Keyphrases:** precision, recall, F1, ROC-AUC, resampling, SMOTE, class-weighted loss, threshold tuning, false positives, false negatives

**Follow-up Hint:** Ask which metric they'd report to a non-technical stakeholder and why.

---

### Q03 — Python List vs NumPy Array
**Category:** Tooling · **Difficulty:** Easy

**Question (EN):** What's the difference between a Python list and a NumPy array, and when would you use each?
**Question (HI):** पायथन लिस्ट और NumPy ऐरे में क्या अंतर है, और आप प्रत्येक का उपयोग कब करेंगे?
**Question (DE):** Was ist der Unterschied zwischen einer Python-Liste und einem NumPy-Array, und wann würden Sie jeweils eines verwenden?

**Ideal Answer (EN):** Lists are heterogeneous, dynamically typed, flexible but slow for numeric work. NumPy arrays are homogeneous, fixed-type, contiguous in memory, and support vectorized operations that are far faster for numerical/array math. Use lists for general-purpose collections, NumPy for anything numeric at scale.

**Rubric Keyphrases:** heterogeneous vs homogeneous, vectorized operations, contiguous memory, fixed type, performance, numeric at scale

**Follow-up Hint:** Ask why vectorization is faster under the hood.

---

### Q04 — Overfitting
**Category:** ML Fundamentals · **Difficulty:** Medium

**Question (EN):** Explain overfitting and three ways to mitigate it.
**Question (HI):** ओवरफिटिंग को समझाइए और इसे कम करने के तीन तरीके बताइए।
**Question (DE):** Erklären Sie Overfitting und drei Möglichkeiten, es zu verringern.

**Ideal Answer (EN):** Overfitting is when a model memorizes training data patterns (including noise) instead of learning generalizable signal, showing as a gap between training and validation performance. Mitigations include regularization (L1/L2, dropout), more/better training data or augmentation, and early stopping or simpler architectures/cross-validation.

**Rubric Keyphrases:** memorize training data, noise, generalizable, training vs validation gap, regularization, L1/L2, dropout, data augmentation, early stopping, cross-validation

**Follow-up Hint:** Ask how they'd detect overfitting was happening in the first place.

---

### Q05 — ML Project Walkthrough
**Category:** Behavioral · **Difficulty:** Medium

**Question (EN):** Walk me through a machine learning project you've worked on, from data to results.
**Question (HI):** मुझे अपने किसी मशीन लर्निंग प्रोजेक्ट के बारे में बताइए, डेटा से लेकर परिणामों तक।
**Question (DE):** Führen Sie mich durch ein Machine-Learning-Projekt, an dem Sie gearbeitet haben, von den Daten bis zu den Ergebnissen.

**Ideal Answer (EN):** A strong answer includes: clear problem framing, what the data was and any cleaning/feature work, model choice and why, how it was evaluated, and an honest note on what didn't work or what they'd do differently. Depth and honesty matter more than the specific project.

**Rubric Keyphrases:** problem framing, data cleaning, feature engineering, model selection, evaluation, what didn't work, lessons learned, honest reflection

**Follow-up Hint:** Ask about the part that didn't go as planned.

---

### Q06 — P-Value
**Category:** ML Fundamentals · **Difficulty:** Hard

**Question (EN):** Explain p-value and a common misinterpretation of it.
**Question (HI):** p-वैल्यू को समझाइए और इसकी एक सामान्य गलत व्याख्या बताइए।
**Question (DE):** Erklären Sie den p-Wert und eine häufige Fehlinterpretation davon.

**Ideal Answer (EN):** A p-value is the probability of observing data this extreme (or more) under the null hypothesis — it is not the probability the null hypothesis is true, and it's not the probability the result is 'real.' Common misuse: treating p < 0.05 as proof of practical significance rather than just statistical significance under a chosen threshold.

**Rubric Keyphrases:** probability under null hypothesis, not probability null is true, statistical significance, practical significance, p < 0.05, threshold, misinterpretation

**Follow-up Hint:** Ask the difference between statistical and practical significance.

---

### Q07 — Activation Functions
**Category:** ML Fundamentals · **Difficulty:** Medium

**Question (EN):** What is the purpose of an activation function, and why can't a network rely only on linear functions?
**Question (HI):** एक्टिवेशन फ़ंक्शन का उद्देश्य क्या है, और नेटवर्क केवल लीनियर फ़ंक्शन पर क्यों निर्भर नहीं रह सकता?
**Question (DE):** Was ist der Zweck einer Aktivierungsfunktion, und warum kann ein Netzwerk nicht nur auf linearen Funktionen basieren?

**Ideal Answer (EN):** Activation functions introduce non-linearity, which is what lets a network approximate complex, non-linear relationships. Stacking purely linear layers collapses mathematically into a single linear transformation no matter how deep the network is, so without non-linearity, depth buys you nothing.

**Rubric Keyphrases:** non-linearity, approximate complex relationships, linear layers collapse, single linear transformation, depth without non-linearity

**Follow-up Hint:** Ask for an example of a non-linear activation function and a tradeoff of using it.

---

### Q08 — Debugging: Train vs Validation Gap
**Category:** Debugging · **Difficulty:** Hard

**Question (EN):** Your model has 99% training accuracy but 60% validation accuracy. What's happening, and how do you fix it?
**Question (HI):** आपके मॉडल की ट्रेनिंग सटीकता 99% है लेकिन वैलिडेशन सटीकता 60% है। क्या हो रहा है, और आप इसे कैसे ठीक करेंगे?
**Question (DE):** Ihr Modell hat 99% Trainingsgenauigkeit, aber 60% Validierungsgenauigkeit. Was passiert da, und wie beheben Sie das?

**Ideal Answer (EN):** This is classic overfitting (or a data leakage / train-test split bug, which should be ruled out first). Fixes include regularization, simplifying the model, more data or augmentation, cross-validation, and double-checking that no validation information leaked into training (e.g. via feature engineering done before the split).

**Rubric Keyphrases:** overfitting, data leakage, train-test split bug, regularization, simplify model, data augmentation, cross-validation, feature engineering before split

**Follow-up Hint:** Ask specifically how they'd check for leakage versus genuine overfitting.

---

### Q09 — Model Bias & Ethics
**Category:** Ethics · **Difficulty:** Medium

**Question (EN):** Why is it important to evaluate a model for bias, and how would you check for it?
**Question (HI):** मॉडल में पूर्वाग्रह (bias) का मूल्यांकन करना क्यों महत्वपूर्ण है, और आप इसकी जाँच कैसे करेंगे?
**Question (DE):** Warum ist es wichtig, ein Modell auf Verzerrungen (Bias) zu überprüfen, und wie würden Sie das tun?

**Ideal Answer (EN):** Models trained on historical data can encode and amplify existing societal or sampling biases, producing unfair outcomes for specific groups even with high aggregate accuracy. Checking involves disaggregating performance metrics by relevant subgroups, auditing training data representativeness, and testing on held-out slices designed to surface disparities.

**Rubric Keyphrases:** historical data bias, amplify societal bias, unfair outcomes, disaggregate metrics by subgroup, training data representativeness, held-out slices, disparities

**Follow-up Hint:** Ask for a real or hypothetical example where this has gone wrong.

---

### Q10 — Learning a New Tool
**Category:** Behavioral · **Difficulty:** Easy

**Question (EN):** Tell me about a time you had to learn a new tool or technique quickly. How did you approach it?
**Question (HI):** मुझे उस समय के बारे में बताइए जब आपको जल्दी से कोई नया टूल या तकनीक सीखनी पड़ी। आपने इसे कैसे अपनाया?
**Question (DE):** Erzählen Sie mir von einer Situation, in der Sie schnell ein neues Werkzeug oder eine neue Technik lernen mussten. Wie sind Sie vorgegangen?

**Ideal Answer (EN):** A strong answer shows a structured learning approach (docs, small experiments, asking for help appropriately), application to a real problem rather than just tutorial-following, and reflection on what they'd do faster next time.

**Rubric Keyphrases:** structured learning, documentation, small experiments, asking for help, real problem application, reflection, what would do differently

**Follow-up Hint:** Ask what they'd do differently if they had to learn it again today.

---

## Editing the Dataset

To add or edit questions:

1. Edit `data/qa-dataset.json` — this is the single source of truth
2. Run `node scripts/ingest.js` to validate and re-ingest into the vector DB
3. No code changes required — the pipeline reads from the dataset dynamically
