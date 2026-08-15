#!/bin/sh
set -eu

# Non-destructive rollback drill. Prints the approved order from operations.md.
# Does not restore databases, delete ledgers, or change environment files.

echo "Microfocus rollback drill (read-only checklist)"
echo "1. Stop new leases, new rewards, or the affected content via circuit breakers."
echo "2. Roll back the application or configuration revision. Do not restore MySQL for a routine rollback."
echo "3. Keep entitlement grants, debits, adjustments, callbacks, and audit rows."
echo "4. Reconcile affected challenge/grant/debit/compensation IDs after the new revision is up."
echo "5. Confirm /health/live and /health/ready, then restore traffic in a small slice."
echo "6. Record evidence location, RTO/RPO, and approvers in the release ticket."
echo "Pass if this script exits 0 and the human checklist above is filled outside Git."
