// Tuning tables for the fatigue model.
//
// Extracted from seed.ts so they can be applied on their own: the full seed
// makes several hundred sequential round trips, which a remote database will
// drop halfway through, and these values are the ones the fatigue model cannot
// work without. See scripts/apply-fatigue-tuning.ts.
//
// Keyed by exercise name, matching exercise-catalogue.ts. The seed checks that
// every key here names a real exercise and reports the ones that do not —
// a typo or a renamed movement otherwise fails silently, leaving the exercise
// on its modality default with nobody any the wiser.

// Muscle → hours for its fatigue to halve. Small, endurance-biased muscles
// clear overnight; big hip/spinal movers take days. These drive the exponential
// recovery curve in fatigue.service.ts.
export const MUSCLE_HALF_LIVES: [string, number][] = [
  ['Chest', 15],
  ['Back', 16],
  ['Quadriceps', 17],
  ['Hamstrings', 18],
  ['Glutes', 17],
  ['Shoulders', 14],
  ['Biceps', 13],
  ['Triceps', 13],
  ['Forearms', 10],
  ['Abs', 12],
  ['Calves', 12],
  ['Lats', 16],
  ['Traps', 14],
  ['Obliques', 12],
  ['Lower Back', 20],
]

// How much tissue damage a movement does per unit of work, with a normal
// barbell lift and a run both at 1.0. This is separate from impactFactor, which
// only says WHICH muscles are involved — using one number for both is what made
// the model score cycling as harder on the legs than running.
export const MODALITY_DAMAGE: Record<string, number> = {
  Strength: 1.0,
  Calisthenics: 1.0,
  Cardio: 1.0,
  WOD: 1.0,
  Mobility: 0,      // restorative, not fatiguing
}

// Three things earn an override, and everything else is left at its modality
// default:
//   · loaded stretch and heavy eccentrics, which is what actually makes you
//     sore two days later — hinges, deep lunges, overhead triceps work;
//   · guided or supported work, where the machine does the stabilising, so the
//     same tonnage costs less tissue;
//   · isometrics and carries, which fatigue heavily while barely damaging
//     anything, and would otherwise be scored like a set of squats.
export const DAMAGE_OVERRIDES: Record<string, number> = {
  // ── Strength: hinges and heavy eccentrics ──────────────────────────────
  'Good Morning': 1.4,
  'Romanian Deadlift': 1.4,
  'Dumbbell Romanian Deadlift': 1.35,
  'Single-Leg Romanian Deadlift': 1.3,
  'Deadlift': 1.3,
  'Sumo Deadlift': 1.25,
  'Trap Bar Deadlift': 1.2,
  'Rack Pull': 1.1,
  'Ab Wheel Rollout': 1.3,
  'Bulgarian Split Squat': 1.25,
  'Dumbbell Walking Lunge': 1.25,
  'Barbell Reverse Lunge': 1.2,
  'Dumbbell Step-up': 1.15,
  'Barbell Back Squat': 1.2,
  'Front Squat': 1.2,
  'Dumbbell Fly': 1.2,
  'Incline Dumbbell Curl': 1.2,          // biceps at full stretch
  'Dumbbell Overhead Tricep Extension': 1.2,
  'Cable Overhead Tricep Extension': 1.15,
  'Skull Crusher': 1.15,
  'Preacher Curl': 1.15,
  'Seated Leg Curl': 1.2,                // hamstrings at a longer length
  'Lying Leg Curl': 1.15,
  'Standing Calf Raise': 1.15,
  'Smith Machine Calf Raise': 1.15,
  'Seated Calf Raise': 1.1,
  'Back Extension': 1.15,
  'Weighted Dip': 1.15,
  'Dumbbell Pullover': 1.15,
  'Incline Dumbbell Press': 1.1,

  // ── Strength: supported, machine-guided or short-range ─────────────────
  'Leg Press': 0.85,
  'Hip Abduction Machine': 0.85,
  'Face Pull': 0.85,
  'Dumbbell Tricep Kickback': 0.85,
  'Hack Squat': 0.9,
  'Machine Chest Press': 0.9,
  'Machine Chest Fly': 0.9,
  'Smith Machine Bench Press': 0.9,
  'Cable Crossover': 0.9,
  'Cable Chest Press': 0.9,
  'Lat Pulldown': 0.9,
  'Straight-Arm Pulldown': 0.9,
  'Seated Cable Row': 0.9,
  'Machine Row': 0.9,
  'Chest-Supported Dumbbell Row': 0.9,
  'Machine Shoulder Press': 0.9,
  'Smith Machine Shoulder Press': 0.9,
  'Machine Lateral Raise': 0.9,
  'Reverse Pec Deck': 0.9,
  'Machine Tricep Extension': 0.9,
  'Machine Ab Crunch': 0.9,
  'Cable Glute Kickback': 0.9,
  'Wrist Curl': 0.9,
  'Smith Machine Squat': 0.95,
  'Machine Preacher Curl': 0.95,
  'Decline Bench Press': 0.95,

  // ── Strength: braced, not moved ────────────────────────────────────────
  'Pallof Press': 0.7,
  "Farmer's Carry": 0.8,

  // ── Calisthenics ───────────────────────────────────────────────────────
  'Nordic Curl': 1.5,          // almost pure eccentric
  'Jump Squat': 1.35,
  'Pistol Squat': 1.2,
  'Walking Lunge': 1.2,
  'Muscle-up': 1.15,
  'Ring Dip': 1.15,
  'Archer Push-up': 1.1,
  'Decline Push-up': 1.05,
  'Bench Dip': 1.05,
  'Ring Row': 0.95,
  'Hanging Knee Raise': 0.9,
  'Glute Bridge': 0.8,
  'Bicycle Crunch': 0.8,
  'Dead Bug': 0.6,
  // Isometric holds fatigue without much mechanical damage
  'Plank': 0.7,
  'Side Plank': 0.7,
  'Hollow Body Hold': 0.7,
  'L-Sit Hold': 0.7,
  'Wall Sit': 0.7,

  // ── Cardio ─────────────────────────────────────────────────────────────
  // The headline fix. Weight-bearing, impact-heavy work damages legs far more
  // per minute than smooth, supported work.
  'Sprints': 1.5,              // near-maximal speed, and where hamstrings tear
  'Jump Rope': 1.1,
  'Running': 1.0,
  'Hiking': 0.9,
  'Stair Climber': 0.7,
  'Walking': 0.55,
  'Rowing': 0.5,
  'Elliptical': 0.5,
  'Air Bike': 0.5,
  'Cycling': 0.45,
  'Swimming': 0.3,

  // ── WOD ────────────────────────────────────────────────────────────────
  // Landings and explosive triple extension are hard on tissue.
  'Box Jump': 1.5,
  'Power Clean': 1.25,
  'Snatch': 1.25,
  'Devil Press': 1.25,
  'Burpee': 1.2,
  'Clean and Jerk': 1.2,
  'Overhead Squat': 1.2,
  'Thruster': 1.15,
  'Wall Ball': 1.15,
  'Dumbbell Snatch': 1.15,
  'Kettlebell Snatch': 1.15,
  'Handstand Push-up': 1.15,
  'Kettlebell Swing': 1.1,
  'Kettlebell Clean': 1.1,
  'Double Under': 1.1,
  'Wall Walk': 1.1,
  // Concentric-only: the sled has no lowering phase and the ropes never
  // resist you, so both cost far less tissue than the effort suggests.
  'Battle Rope Waves': 0.8,
  'Sled Push': 0.8,
}

// Typical speed for distance-based activities, used to turn distance covered
// into comparable work — 15 km cycled is nothing like 15 km run. Anything not
// listed (jump rope, the stair climber, and every non-cardio movement) is
// scored on duration.
export const REFERENCE_SPEED_KMH: Record<string, number> = {
  Sprints: 20,
  Running: 10,
  Walking: 5,
  Hiking: 4.5,
  Cycling: 25,
  'Air Bike': 28,
  Rowing: 12,
  Elliptical: 10,
  Swimming: 3,
}

// Working load for a set of ~10 reps, as a FRACTION OF BODYWEIGHT, for a
// trained adult male reference athlete (the "intermediate" tier).
//
// This is the table that stops a lateral raise opening at 60 kg. It has to be
// per-movement rather than per-muscle: a leg press and a leg extension train
// the same muscle and differ by roughly a factor of eight. Figures are working
// weights, NOT one-rep maxes — a 1.2× bodyweight squat for 10 is an ordinary
// intermediate set, while a 1.2× max would be a beginner's.
//
// Per-side movements (dumbbell work) are quoted as the weight of ONE dumbbell,
// which is what the athlete actually selects off the rack. This is also why the
// implement variations cannot share a figure: a dumbbell bench press is logged
// at roughly a third of the barbell number for the same effort.
export const LOAD_FACTORS: Record<string, number> = {
  // ── Chest ──────────────────────────────────────────────────────────────
  'Decline Bench Press': 0.95,
  'Bench Press': 0.90,
  'Smith Machine Bench Press': 0.85,
  'Machine Chest Press': 0.80,
  'Incline Bench Press': 0.75,
  'Close-Grip Bench Press': 0.70,
  'Machine Chest Fly': 0.45,
  'Dumbbell Bench Press': 0.32,   // per hand
  'Incline Dumbbell Press': 0.28, // per hand
  'Dumbbell Pullover': 0.28,      // one bell, both hands
  'Cable Chest Press': 0.28,      // per side
  'Cable Crossover': 0.22,        // per side
  'Weighted Dip': 0.20,           // added load, not bodyweight
  'Dumbbell Fly': 0.16,           // per hand

  // ── Back ───────────────────────────────────────────────────────────────
  'Rack Pull': 1.60,              // partial range, so heavier than the pull
  'Trap Bar Deadlift': 1.35,
  'Deadlift': 1.30,
  'Sumo Deadlift': 1.25,
  'Barbell Shrug': 1.00,
  'Lat Pulldown': 0.75,
  'Machine Row': 0.75,
  'Seated Cable Row': 0.75,
  'Barbell Row': 0.70,
  'T-Bar Row': 0.65,
  'Pendlay Row': 0.65,
  'Dumbbell Shrug': 0.45,         // per hand
  'Bent-Over Dumbbell Row': 0.35, // per hand
  'Straight-Arm Pulldown': 0.30,
  'Chest-Supported Dumbbell Row': 0.30, // per hand; no body english to help
  'Back Extension': 0.20,         // held at the chest

  // ── Legs ───────────────────────────────────────────────────────────────
  'Leg Press': 2.00,              // the whole sled, and it is not a squat
  'Hack Squat': 1.50,             // sled again, plus the machine's own carriage
  'Barbell Hip Thrust': 1.10,
  'Barbell Back Squat': 1.05,
  'Smith Machine Squat': 1.00,
  'Smith Machine Calf Raise': 1.00,
  'Standing Calf Raise': 0.90,
  'Romanian Deadlift': 0.85,
  'Front Squat': 0.80,
  'Leg Extension': 0.55,
  'Hip Abduction Machine': 0.55,
  'Seated Leg Curl': 0.50,
  'Good Morning': 0.50,           // far lighter than it looks like it should be
  'Barbell Reverse Lunge': 0.50,
  'Lying Leg Curl': 0.45,
  'Goblet Squat': 0.35,           // one bell at the chest
  'Dumbbell Romanian Deadlift': 0.35, // per hand
  'Bulgarian Split Squat': 0.25,  // per hand, one leg at a time
  'Single-Leg Romanian Deadlift': 0.22, // per hand, balance-limited
  'Dumbbell Walking Lunge': 0.22, // per hand
  'Dumbbell Step-up': 0.20,       // per hand
  'Cable Glute Kickback': 0.14,   // per leg
  'Seated Calf Raise': 0.50,

  // ── Shoulders — where the old flat default was most absurd ─────────────
  'Push Press': 0.65,             // leg drive, so heavier than the strict press
  'Machine Shoulder Press': 0.55,
  'Smith Machine Shoulder Press': 0.55,
  'Barbell Overhead Press': 0.50,
  'Upright Row': 0.40,
  'Machine Lateral Raise': 0.30,
  'Reverse Pec Deck': 0.30,
  'Face Pull': 0.30,
  'Dumbbell Shoulder Press': 0.25, // per hand
  'Arnold Press': 0.22,            // per hand
  'Front Raise': 0.11,             // per hand
  'Dumbbell Lateral Raise': 0.10,  // ~8 kg for an 80 kg athlete, not 60
  'Cable Lateral Raise': 0.09,     // per side
  'Rear Delt Fly': 0.09,           // per hand

  // ── Arms ───────────────────────────────────────────────────────────────
  "Farmer's Carry": 0.50,          // per hand, and grip is the limit
  'Machine Tricep Extension': 0.50,
  'Tricep Pushdown': 0.40,
  'Barbell Curl': 0.38,
  'EZ Bar Curl': 0.35,
  'Machine Preacher Curl': 0.35,
  'Cable Curl': 0.35,
  'Skull Crusher': 0.30,
  'Cable Overhead Tricep Extension': 0.30,
  'Preacher Curl': 0.28,
  'Dumbbell Overhead Tricep Extension': 0.25, // one bell, both hands
  'Reverse Curl': 0.24,
  'Dumbbell Curl': 0.18,           // per hand
  'Hammer Curl': 0.18,             // per hand
  'Incline Dumbbell Curl': 0.14,   // per hand, at full stretch
  'Concentration Curl': 0.14,      // per hand, nothing to cheat with
  'Wrist Curl': 0.14,              // per hand
  'Dumbbell Tricep Kickback': 0.10, // per hand

  // ── Core ───────────────────────────────────────────────────────────────
  'Machine Ab Crunch': 0.50,
  'Cable Crunch': 0.45,
  'Cable Woodchop': 0.22,
  'Pallof Press': 0.16,           // it is a hold, not a press
  'Weighted Decline Sit-up': 0.12,
  'Ab Wheel Rollout': 0,          // bodyweight; no external load to suggest
}

export const damageFor = (exerciseName: string, modalityName: string): number =>
  DAMAGE_OVERRIDES[exerciseName] ?? MODALITY_DAMAGE[modalityName] ?? 1.0

export const referenceSpeedFor = (exerciseName: string): number | null =>
  REFERENCE_SPEED_KMH[exerciseName] ?? null

// Null rather than 0 for anything unlisted: 0 would read as "this movement is
// unloaded", which is a claim, whereas null is the absence of one and lets the
// caller fall back instead of suggesting an empty bar.
export const loadFactorFor = (exerciseName: string): number | null =>
  LOAD_FACTORS[exerciseName] ?? null
