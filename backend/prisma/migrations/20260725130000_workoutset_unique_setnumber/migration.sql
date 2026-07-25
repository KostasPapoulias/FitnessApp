-- One row per (exercise, set number). Re-logging a set now corrects it in place
-- via upsert; previously it appended a duplicate row that double-counted both
-- session volume and muscle fatigue.
CREATE UNIQUE INDEX "WorkoutSet_workoutExerciseId_setNumber_key"
  ON "WorkoutSet"("workoutExerciseId", "setNumber");
