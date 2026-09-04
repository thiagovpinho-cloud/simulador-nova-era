# Focado Recovery — Step 1 Surgical Checkpoint

Date: 2026-09-04
Branch: focado/recuperacao-funcional-passo-a-passo

Validated changes:
- Pedidos Comerciais no longer depends on order-drafts to open.
- order-drafts loads as an optional, non-blocking enhancement.
- legacy simulator header/summary remain preserved in index.html but are suppressed from first paint by app-shell.css during extraction.
- regression tests enforce both rules.
- preview workflow and smoke test passed before this checkpoint was recorded.

Do not promote to production until manual browser validation confirms:
1. hard refresh does not flash the legacy simulator;
2. Pedidos Comerciais opens;
3. saving, editing, deleting drafts works;
4. failure of drafts does not block Pedidos.
