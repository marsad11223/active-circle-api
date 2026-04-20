#!/usr/bin/env bash
set -euo pipefail

# Manual E2E workflow for host schedule endpoint.
# Usage:
#   bash scripts/host-schedule-e2e.sh setup
#   bash scripts/host-schedule-e2e.sh check
#   bash scripts/host-schedule-e2e.sh cleanup
#   bash scripts/host-schedule-e2e.sh all
#
# Before running, copy env template:
#   cp scripts/host-schedule-e2e.env.example .env.schedule-e2e
# Then edit values and run:
#   source .env.schedule-e2e

MODE="${1:-all}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required."
  exit 1
fi

# Load .env.schedule-e2e safely (supports values containing '&', '?', etc.).
if [[ -f ".env.schedule-e2e" ]]; then
  while IFS='=' read -r key value; do
    # Skip blanks/comments
    [[ -z "${key// }" ]] && continue
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    key="$(echo "$key" | tr -d '[:space:]')"
    # Keep value as-is (except trailing CR)
    value="${value%$'\r'}"
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < ".env.schedule-e2e"
fi

: "${API_BASE_URL:?Set API_BASE_URL (e.g. http://localhost:3000)}"
STATE_DIR=".tmp"
STATE_FILE="$STATE_DIR/host-schedule-e2e-state.json"
mkdir -p "$STATE_DIR"

TEST_NAME="${TEST_NAME:-Schedule Test Host}"
TEST_PASSWORD="${TEST_PASSWORD:-TestPass123}"
TEST_EMAIL="${TEST_EMAIL:-host.schedule.test+$(date +%s)@example.com}"

DATE_1="${DATE_1:-2026-04-21}"
DATE_2="${DATE_2:-2026-04-22}"
DATE_3="${DATE_3:-2026-04-23}"
FROM_DATE="${FROM_DATE:-2026-04-20}"
TO_DATE="${TO_DATE:-2026-04-26}"

MONGO_URI="${MONGO_URI:-}"
MONGO_DB_NAME="${MONGO_DB_NAME:-}"

log() {
  echo "[$(date +'%H:%M:%S')] $*"
}

api_post() {
  local path="$1"
  local token="${2:-}"
  local data="$3"
  if [[ -n "$token" ]]; then
    curl -sS -X POST "$API_BASE_URL$path" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -sS -X POST "$API_BASE_URL$path" \
      -H "Content-Type: application/json" \
      -d "$data"
  fi
}

api_get() {
  local path="$1"
  curl -sS "$API_BASE_URL$path"
}

api_delete() {
  local path="$1"
  local token="$2"
  curl -sS -X DELETE "$API_BASE_URL$path" \
    -H "Authorization: Bearer $token"
}

write_state() {
  local json="$1"
  echo "$json" > "$STATE_FILE"
}

read_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "{}"
    return
  fi
  cat "$STATE_FILE"
}

db_patch_host_flags() {
  local user_id="$1"
  if [[ -z "$MONGO_URI" || -z "$MONGO_DB_NAME" ]]; then
    log "Skipping DB patch (MONGO_URI/MONGO_DB_NAME not set)."
    return 0
  fi
  if ! command -v mongosh >/dev/null 2>&1; then
    log "mongosh not found; skipping DB patch."
    return 0
  fi
  log "Patching host flags in MongoDB..."
  mongosh "$MONGO_URI" --quiet --eval "
db = db.getSiblingDB('$MONGO_DB_NAME');
db.users.updateOne(
  { _id: ObjectId('$user_id') },
  { \$set: {
      emailVerified: true,
      role: 'premiumMember',
      hasActiveSubscription: true,
      grantRole: 'host',
      isLifetimeHost: true
  }}
);
" >/dev/null
}

create_activity() {
  local host_token="$1"
  local title="$2"
  local date="$3"
  local time="$4"
  local price="$5"
  local category="$6"
  local payload response activity_id
  payload="$(cat <<EOF
{
  "title": "$title",
  "description": "Automated schedule test activity",
  "category": ["$category"],
  "location": "London",
  "date": "$date",
  "time": "$time",
  "maxParticipants": 10,
  "price": $price,
  "picture": "https://example.com/test.jpg"
}
EOF
)"
  response="$(api_post "/activities" "$host_token" "$payload")"
  activity_id="$(echo "$response" | jq -r '._id // .data._id // empty')"
  if [[ -z "$activity_id" ]]; then
    echo "Failed creating activity:"
    echo "$response" | jq .
    exit 1
  fi
  echo "$activity_id"
}

setup() {
  local signup_resp user_id host_login_resp host_token
  log "SETUP: create test host via signup..."
  signup_resp="$(api_post "/auth/signup" "" "$(cat <<EOF
{
  "name": "$TEST_NAME",
  "email": "$TEST_EMAIL",
  "password": "$TEST_PASSWORD",
  "role": "premiumMember",
  "address": "London",
  "phoneNumber": "0000000000"
}
EOF
)")"
  user_id="$(echo "$signup_resp" | jq -r '._id // .data._id // empty')"
  if [[ -z "$user_id" ]]; then
    echo "Failed signup response:"
    echo "$signup_resp" | jq .
    exit 1
  fi

  db_patch_host_flags "$user_id"

  log "SETUP: host login..."
  host_login_resp="$(api_post "/auth/login" "" "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")"
  host_token="$(echo "$host_login_resp" | jq -r '.accessToken // empty')"
  if [[ -z "$host_token" ]]; then
    echo "Failed host login:"
    echo "$host_login_resp" | jq .
    exit 1
  fi

  log "SETUP: creating activities..."
  local a1 a2 a3 a4
  a1="$(create_activity "$host_token" "Free Yoga Morning" "$DATE_1" "09:00" "0" "Yoga")"
  a2="$(create_activity "$host_token" "Paid Boxing Session" "$DATE_1" "14:00" "25" "Boxing")"
  a3="$(create_activity "$host_token" "Free Run Club" "$DATE_2" "18:30" "0" "Running")"
  a4="$(create_activity "$host_token" "Paid Tennis Clinic" "$DATE_3" "2:00 PM" "30" "Tennis")"

  write_state "$(cat <<EOF
{
  "apiBaseUrl": "$API_BASE_URL",
  "testUserId": "$user_id",
  "testEmail": "$TEST_EMAIL",
  "testPassword": "$TEST_PASSWORD",
  "activityIds": ["$a1", "$a2", "$a3", "$a4"],
  "fromDate": "$FROM_DATE",
  "toDate": "$TO_DATE"
}
EOF
)"

  log "SETUP complete."
  echo "State saved at $STATE_FILE"
  echo "Test user: $TEST_EMAIL ($user_id)"
}

check() {
  local st user_id from_date to_date
  st="$(read_state)"
  user_id="$(echo "$st" | jq -r '.testUserId // empty')"
  from_date="$(echo "$st" | jq -r '.fromDate // empty')"
  to_date="$(echo "$st" | jq -r '.toDate // empty')"
  if [[ -z "$user_id" || -z "$from_date" || -z "$to_date" ]]; then
    echo "State missing. Run setup first."
    exit 1
  fi
  log "CHECK: fetching schedule..."
  api_get "/activities/host/$user_id/schedule?from=$from_date&to=$to_date" \
    | jq '{timeZone, from, to, days: [.days[] | {date, offsetLabel, nonEmptyHours: [.hours[] | select((.activities|length)>0) | {hour, titles: [.activities[].title]}]}]}'
}

cleanup() {
  local st user_id test_email test_password host_login_resp host_token ids id
  st="$(read_state)"
  user_id="$(echo "$st" | jq -r '.testUserId // empty')"
  test_email="$(echo "$st" | jq -r '.testEmail // empty')"
  test_password="$(echo "$st" | jq -r '.testPassword // empty')"
  ids="$(echo "$st" | jq -r '.activityIds[]?')"

  if [[ -n "$test_email" && -n "$test_password" ]]; then
    host_login_resp="$(api_post "/auth/login" "" "{\"email\":\"$test_email\",\"password\":\"$test_password\"}")"
    host_token="$(echo "$host_login_resp" | jq -r '.accessToken // empty')"
  else
    host_token=""
  fi

  if [[ -n "$host_token" ]]; then
    log "CLEANUP: deleting activities..."
    for id in $ids; do
      if [[ -n "$id" ]]; then
        api_delete "/activities/$id" "$host_token" >/dev/null || true
      fi
    done
  else
    log "Host login failed during cleanup; skipping activity deletion."
  fi

  if [[ -n "$user_id" && -n "$host_token" ]]; then
    log "CLEANUP: deleting test user..."
    api_delete "/users/$user_id" "$host_token" | jq .
  else
    log "Missing user id or host token; skipping user deletion."
  fi

  rm -f "$STATE_FILE"
  log "CLEANUP complete."
}

case "$MODE" in
  setup) setup ;;
  check) check ;;
  cleanup) cleanup ;;
  all)
    setup
    check
    cleanup
    ;;
  *)
    echo "Invalid mode: $MODE"
    echo "Use one of: setup | check | cleanup | all"
    exit 1
    ;;
esac
