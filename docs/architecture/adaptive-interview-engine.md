# P0-2 Future-Ready Adaptive Interview Engine — Architecture & Technical Reference

## Executive Summary

The **P0-2 Adaptive Interview Session Engine** transforms MockMate from a static sequential Q&A tool into a server-authoritative, evidence-backed reasoning evaluation platform. It evaluates candidate **reasoning quality, problem framing, trade-offs, systems thinking, and uncertainty handling** rather than code syntax or memorized answers.

---

## 1. System Architecture

```
+-----------------------------------------------------------------------------------+
|                                  Browser / Client                                 |
|  - Reasoning Mode Badges & Stage Indicators (Framing, Exploration, Challenge)    |
|  - Dynamic Probes, Constraint Banners & Non-numeric Coach Feedback Cards          |
|  - Server-Authoritative State & Client Submission UUID Tracking                   |
+----------------------------------------+------------------------------------------+
                                         | HTTP POST /api/interview/sessions/:id/answers
                                         v
+-----------------------------------------------------------------------------------+
|                              Express Backend Router                               |
|  - Path: /api/interview/sessions/:id/answers                                      |
|  - Validates Client Submission ID & Version Anti-Collision Checks                 |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                             Turn Evaluator Service                                |
|  - Strict Substring Evidence Integrity Verification                               |
|  - Quote Demotions & Anchor Score (0-4) Grounding                                 |
|  - Active Dimension Rubric Filtering by Reasoning Mode                            |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                           Adaptive Controller Engine                              |
|  - Evaluates Decision Matrix Rules (Turn Cap, Skipped, Probes, Challenges)       |
|  - Manages Probes per Root & Stage Progression                                    |
|  - Generates Deterministic Fallback Prompts if LLM Stream Offline                 |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        Supabase PostgreSQL Engine (RPC)                           |
|  - atomic_submit_adaptive_turn (SECURITY DEFINER, service_role only)             |
|  - Atomic session version increment & transaction safety                          |
|  - Idempotent turn replay protection via client_submission_id                     |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        Evidence Aggregation & Reporting                           |
|  - Minimum Scored Evidence Thresholds (INTERVIEW_READY vs NOT_ASSESSED)           |
|  - Zero Evaluative String Fallbacks in NOT_ASSESSED Reports                       |
|  - Elimination of Hire / No-Hire Recommendations                                  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Reasoning Modes & Active Dimensions Matrix

| Reasoning Mode | Primary Focus Areas | Active Evaluated Dimensions |
| :--- | :--- | :--- |
| `classic_behavioral` | STAR execution, ownership, stakeholder alignment | `NARRATIVE_COHERENCE`, `STAKEHOLDER_FLUENCY`, `DECISION_QUALITY`, `INTELLECTUAL_HONESTY` |
| `classic_technical` | Algorithmic logic, data structures, trade-offs | `PROBLEM_FRAMING`, `SYSTEMS_THINKING`, `TRADEOFF_CLARITY`, `DECISION_QUALITY`, `UNCERTAINTY_HANDLING` |
| `system_design` | Scalability, fault tolerance, API & storage tradeoffs | `SYSTEMS_THINKING`, `TRADEOFF_CLARITY`, `PROBLEM_FRAMING`, `DECISION_QUALITY`, `UNCERTAINTY_HANDLING` |
| `debugging_troubleshooting` | Root cause isolation, telemetry, hypothesis testing | `PROBLEM_FRAMING`, `SYSTEMS_THINKING`, `UNCERTAINTY_HANDLING`, `INTELLECTUAL_HONESTY` |
| `architecture_tradeoffs` | Multi-cloud, cost vs performance vs security | `TRADEOFF_CLARITY`, `SYSTEMS_THINKING`, `DECISION_QUALITY`, `PROBLEM_FRAMING` |
| `ai_native_engineering` | LLM latency, cost, function calling, fallback patterns | `SYSTEMS_THINKING`, `TRADEOFF_CLARITY`, `UNCERTAINTY_HANDLING`, `DECISION_QUALITY` |
| `product_strategy` | User centricity, MVP scoping, prioritization | `PROBLEM_FRAMING`, `STAKEHOLDER_FLUENCY`, `DECISION_QUALITY`, `NARRATIVE_COHERENCE` |
| `code_refactoring` | Maintainability, code smells, zero regression | `SYSTEMS_THINKING`, `TRADEOFF_CLARITY`, `DECISION_QUALITY`, `INTELLECTUAL_HONESTY` |
| `incident_management` | Post-mortems, mitigation under pressure, SLA | `UNCERTAINTY_HANDLING`, `STAKEHOLDER_FLUENCY`, `PROBLEM_FRAMING`, `INTELLECTUAL_HONESTY` |

---

## 3. Strict Evidence Integrity Verification Rules

1. **SubString Evidence Check**: Every scored observation (`anchorScore` 0, 1, 2, 3, or 4) **must** contain an `evidenceExcerpt` that is an exact character-for-character substring of the candidate's turn response.
2. **Quote Demotion**: If the LLM generates a quote that does not match candidate response text exactly, the observation is automatically demoted to `anchorScore = null` and `evidenceExcerpt = null`.
3. **No Synthesized Quotes**: The evaluator never invents or paraphrases candidate statements.
4. **No Hire / No-Hire Labels**: Reports produce objective readiness assessments (`INTERVIEW_READY` vs `NOT_ASSESSED`), eliminating arbitrary hiring labels.
5. **NOT_ASSESSED Guarantees**: If minimum evidence thresholds are not met, `biggestRiskArea` and `coachPack` are set to `null`, and filler strings or dummy scores are strictly prohibited.

---

## 4. Server-Authoritative Database Security & RPC Contracts

- **RPC Signature**: `atomic_submit_adaptive_turn(p_session_id, p_user_id, p_question_id, p_expected_version, p_client_submission_id, p_answer_kind, p_answer_text, p_turn_evaluation, p_controller_decision, p_next_question, p_is_session_complete)`
- **SECURITY DEFINER**: Function executes with elevated `service_role` security context.
- **REVOKE ALL**: Access is explicitly revoked from `PUBLIC`, `anon`, and `authenticated` roles. Only `service_role` can execute RPC calls.
- **Idempotency**: Submitting identical `p_client_submission_id` returns the previously stored turn state without incrementing session version or duplicating turns.
- **Version Guarding**: Submitting with a stale `p_expected_version` immediately raises a PostgreSQL exception (`409 Conflict`), enforcing strict linear turn progression.

---

## 5. Verification Strategy & Coverage

- **Unit & Service Tests**: 54 passing Jest tests across `adaptiveEngine.test.ts`, `sessionService.test.ts`, and `interviewRoutes.test.ts`.
- **Database Migrations**: 3 clean Supabase SQL migrations (`001_initial_schema.sql`, `20260721_add_authoritative_session_fields.sql`, `20260723_add_adaptive_interview_engine.sql`).
- **Static Verification**: `scripts/verify-supabase-migration.mjs` verifying schema constraints, triggers, and RPC function grants.
