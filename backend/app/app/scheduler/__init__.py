# ============================================================
# backend/app/app/scheduler/__init__.py
# ============================================================
#
# Purpose:
#   Package marker for the background scheduler. The scheduler
#   runs reminder dispatch and other recurring maintenance
#   tasks using APScheduler. It starts during the FastAPI
#   lifespan and stops cleanly on shutdown.
#
# Consumed by:
#   - backend/app/main.py (lifespan startup)
# ============================================================
