# FinWise evaluation results

Provider: {'provider': 'groq', 'model': 'openai/gpt-oss-120b', 'available': True}

Dataset: 535 transactions, 3 personas, 3 months, 15 planted anomalies

## E1 Categorisation
| Mode | Acc | Macro-F1 | LLM calls | Tokens | Txns via LLM | Time (s) |
|---|---|---|---|---|---|---|
| rules | 0.643 | 0.676 | 0 | 0 | 0 | 0.01 |
| llm | 0.933 | 0.858 | 6 | 13319 | 535 | 78.49 |
| hybrid | 0.972 | 0.967 | 3 | 6832 | 191 | 46.24 |

## E2 Anomaly detection (anomaly_true_categories)
| Method | TP | FP | FN | P | R | F1 |
|---|---|---|---|---|---|---|
| zscore_global | 6 | 0 | 9 | 1.000 | 0.400 | 0.571 |
| zscore_category | 5 | 1 | 10 | 0.833 | 0.333 | 0.476 |
| finwise | 15 | 0 | 0 | 1.000 | 1.000 | 1.000 |

## E2 Anomaly detection (anomaly_pred_categories)
| Method | TP | FP | FN | P | R | F1 |
|---|---|---|---|---|---|---|
| zscore_global | 5 | 3 | 10 | 0.625 | 0.333 | 0.435 |
| zscore_category | 6 | 1 | 9 | 0.857 | 0.400 | 0.545 |
| finwise | 15 | 2 | 0 | 0.882 | 1.000 | 0.938 |

## E2b Detector ablation (component removed)
| Removed | TP | FP | FN | P | R | F1 |
|---|---|---|---|---|---|---|
| full | 15 | 0 | 0 | 1.000 | 1.000 | 1.000 |
| suppression | 15 | 6 | 0 | 0.714 | 1.000 | 0.833 |
| min_history | 15 | 2 | 0 | 0.882 | 1.000 | 0.938 |
| merchant | 15 | 0 | 0 | 1.000 | 1.000 | 1.000 |
| duplicate | 12 | 0 | 3 | 1.000 | 0.800 | 0.889 |
| new_merchant | 15 | 0 | 0 | 1.000 | 1.000 | 1.000 |

## E3/E4 QA correctness and faithfulness
| Variant | N | Answer acc | Claim precision | Mean GFS | Fully grounded | Avg tokens | Avg latency (s) |
|---|---|---|---|---|---|---|---|
| stuffing | 20 | 0.250 | 0.517 | 0.631 | 0.600 | 6334 | 42.78 |
| tool | 30 | 0.900 | 0.968 | 0.983 | 0.967 | 796 | 6.05 |
| tool+verify | 30 | 0.900 | 1.000 | 1.000 | 1.000 | 27 | 0.22 |
