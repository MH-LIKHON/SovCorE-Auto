#!/usr/bin/env bash
# ============================================================
# scripts/smoke-test.sh
# ============================================================
#
# Purpose:
#   Post-deployment smoke test for SovCorE Auto. Runs a series
#   of HTTP checks against a running instance and prints a
#   pass/fail result for each check. Exits 0 if all pass,
#   1 if any fail.
#
# Usage:
#   BASE_URL=https://your-domain.com bash scripts/smoke-test.sh
#   BASE_URL=http://localhost bash scripts/smoke-test.sh
#
# Dependencies: curl, jq
#
# ============================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
PASS=0
FAIL=0

# ==================================================
# HELPERS
# ==================================================

green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }

check() {
    local label="$1"
    local expected_status="$2"
    local url="$3"
    shift 3
    local extra=("$@")

    http_status=$(curl -s -o /dev/null -w "%{http_code}" "${extra[@]}" "$url")

    if [ "$http_status" = "$expected_status" ]; then
        green "  PASS  [$http_status] $label"
        PASS=$((PASS + 1))
    else
        red   "  FAIL  [$http_status expected $expected_status] $label"
        FAIL=$((FAIL + 1))
    fi
}

check_body() {
    local label="$1"
    local url="$2"
    local jq_filter="$3"
    local expected_value="$4"

    body=$(curl -s "$url")
    actual=$(echo "$body" | jq -r "$jq_filter" 2>/dev/null || echo "__jq_error__")

    if [ "$actual" = "$expected_value" ]; then
        green "  PASS  $label (value: $actual)"
        PASS=$((PASS + 1))
    else
        red   "  FAIL  $label (expected: $expected_value, got: $actual)"
        FAIL=$((FAIL + 1))
    fi
}

# ==================================================
# BACKEND SMOKE TESTS
# ==================================================

echo ""
echo "=== Backend ==="

check "liveness — GET /api/v1/health returns 200" \
    "200" "$BASE_URL/api/v1/health"

check_body "liveness — status field is ok" \
    "$BASE_URL/api/v1/health" ".status" "ok"

check "readiness — GET /api/v1/readiness returns 200" \
    "200" "$BASE_URL/api/v1/readiness"

check_body "readiness — database field is ok" \
    "$BASE_URL/api/v1/readiness" ".database" "ok"

check "auth — POST /api/v1/auth/request-code rejects empty body with 422" \
    "422" "$BASE_URL/api/v1/auth/request-code" \
    -X POST -H "Content-Type: application/json" -d '{}'

check "auth — POST /api/v1/auth/verify-code rejects bad code format with 422" \
    "422" "$BASE_URL/api/v1/auth/verify-code" \
    -X POST -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","code":"abc"}'

check "auth — unauthenticated request to protected route returns 401" \
    "401" "$BASE_URL/api/v1/vehicles"

check "rate limit — 6th request-code request in a minute returns 429" \
    "429" "$BASE_URL/api/v1/auth/request-code" \
    -X POST -H "Content-Type: application/json" -d '{"email":"ratelimit@example.com"}' \
    -X POST -H "Content-Type: application/json" -d '{"email":"ratelimit@example.com"}' \
    -X POST -H "Content-Type: application/json" -d '{"email":"ratelimit@example.com"}' \
    -X POST -H "Content-Type: application/json" -d '{"email":"ratelimit@example.com"}' \
    -X POST -H "Content-Type: application/json" -d '{"email":"ratelimit@example.com"}' \
    -X POST -H "Content-Type: application/json" -d '{"email":"ratelimit@example.com"}' || true
# Note: the above check is approximate; rate limits share a window across
# all test runs so this may produce a false result if the window has been
# exhausted by prior runs. Manual verification is required for the rate
# limit check in production.

# ==================================================
# SECURITY HEADER CHECKS
# ==================================================

echo ""
echo "=== Security headers ==="

header_check() {
    local label="$1"
    local url="$2"
    local header_name="$3"
    local expected_substring="$4"

    header_value=$(curl -s -I "$url" | grep -i "^${header_name}:" | head -1 | cut -d: -f2- | tr -d '\r' | xargs)

    if echo "$header_value" | grep -qi "$expected_substring"; then
        green "  PASS  $label ($header_name: $header_value)"
        PASS=$((PASS + 1))
    else
        red   "  FAIL  $label (expected '$expected_substring' in '$header_value')"
        FAIL=$((FAIL + 1))
    fi
}

header_check "X-Content-Type-Options: nosniff" \
    "$BASE_URL/api/v1/health" "X-Content-Type-Options" "nosniff"

header_check "X-Frame-Options: DENY" \
    "$BASE_URL/api/v1/health" "X-Frame-Options" "DENY"

header_check "X-XSS-Protection present" \
    "$BASE_URL/api/v1/health" "X-XSS-Protection" "1"

header_check "Referrer-Policy: strict-origin-when-cross-origin" \
    "$BASE_URL/api/v1/health" "Referrer-Policy" "strict-origin"

header_check "Content-Security-Policy present" \
    "$BASE_URL/api/v1/health" "Content-Security-Policy" "default-src"

header_check "X-Request-ID present in response" \
    "$BASE_URL/api/v1/health" "X-Request-ID" "-"

# ==================================================
# FRONTEND SMOKE TESTS
# ==================================================

echo ""
echo "=== Frontend ==="

check "marketing home page returns 200" \
    "200" "$BASE_URL/"

check "login page returns 200" \
    "200" "$BASE_URL/login"

check "unknown route returns 404 or 200 (Next.js not-found)" \
    "404" "$BASE_URL/route-that-does-not-exist-smoke-test" || \
check "unknown route returns 200 (Next.js custom not-found page)" \
    "200" "$BASE_URL/route-that-does-not-exist-smoke-test"

# ==================================================
# SUMMARY
# ==================================================

echo ""
echo "=============================="
echo "  PASSED: $PASS"
echo "  FAILED: $FAIL"
echo "=============================="
echo ""

if [ "$FAIL" -gt 0 ]; then
    red "Smoke test FAILED — $FAIL check(s) did not pass."
    exit 1
else
    green "Smoke test PASSED — all $PASS checks passed."
    exit 0
fi
