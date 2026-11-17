#!/usr/bin/env bash
# Drinking reminder rules (ReminderPlan.java) on the build machine's JVM.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$(mktemp -d)"
javac -nowarn -d "$OUT" "$ROOT/app/src/main/java/at/stoicranger/fitness/ReminderPlan.java" "$ROOT/tools/nc-test/ReminderPlanTest.java"
java -cp "$OUT" ReminderPlanTest
