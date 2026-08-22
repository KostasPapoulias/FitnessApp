// The exercise catalogue: everything the seed knows how to create.
//
// Split out of seed.ts the same way fatigue-tuning.ts was, and for the same
// reason — this is content, edited far more often than the code that applies
// it, and it is now long enough that the two do not belong in one file.
//
// Calibration numbers (damageFactor, loadFactor, referenceSpeedKmh) live in
// fatigue-tuning.ts and are keyed by exercise name. An exercise added here
// without an entry there still works: it just gets its modality's default
// damage, no reference speed, and no first-time weight suggestion.
//
// ── naming ────────────────────────────────────────────────────────────────
// Where the same movement exists on different kit, each implement gets its own
// row, named for the implement: "Barbell Overhead Press", "Dumbbell Shoulder
// Press", "Machine Shoulder Press". This is not cosmetic. `canPerform` in
// training-constraints.service requires ALL of an exercise's equipment, so one
// row tagged ['Barbell', 'Dumbbell'] means "needs both" and sorts to the bottom
// for someone who owns only dumbbells. The variations also genuinely differ:
// a machine press is guided and does less damage per unit of work, and a
// dumbbell pair is loaded per hand, so they cannot share a loadFactor either.
//
// A bare name (Bench Press, Deadlift, Squat) means the barbell version, which
// is what those names mean everywhere else in the sport.

// muscle impact tuple: [muscleName, impactFactor]
//
// impactFactor says how hard THIS movement drives THAT muscle, 0–1, and only
// that — how much damage the work does is damageFactor's job. Rough scale:
//   0.9–1.0  the movement's reason for existing
//   0.6–0.8  a genuine second mover, trained but not the target
//   0.3–0.5  stabiliser or assistant; involved, barely fatigued
export type M = [string, number]

export interface Ex {
  name: string
  modality: string
  /**
   * Form cues, not a restatement of the name. This is the only prose in the
   * app about how to actually perform the movement, and ExerciseDetail renders
   * it verbatim — "Barbell flat bench chest press" told a reader nothing they
   * could not get from the title.
   */
  description: string
  categories?: string[]
  equipment?: string[]
  muscles: M[]
}

export const MODALITIES = ['Strength', 'Calisthenics', 'Cardio', 'WOD', 'Mobility']

export const CATEGORIES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']

export const EQUIPMENT = [
  'Dumbbell', 'Barbell', 'Kettlebell', 'Bodyweight', 'Treadmill', 'Cable Machine',
  'Machine', 'Pull-up Bar', 'Bench', 'Resistance Band', 'Foam Roller', 'Rower',
  'Bike', 'Jump Rope', 'Yoga Mat', 'Plyo Box', 'Medicine Ball', 'EZ Bar', 'Dip Bars',
  // Added with the equipment-variation catalogue. Each one exists because a
  // movement genuinely needs it and no existing entry describes it: tagging a
  // Smith machine squat as 'Machine' would tell someone with only a cable stack
  // that they can do it.
  'Smith Machine', 'Trap Bar', 'Ab Wheel', 'Gymnastic Rings', 'Sled',
  'Battle Ropes', 'Elliptical', 'Stair Climber',
]

/**
 * Old name → new name, applied before anything else on every seed run.
 *
 * Renaming in place rather than adding the new name and abandoning the old one:
 * an Exercise id is referenced by every logged set, strength estimate and
 * template that ever used it, so a "rename" that creates a fresh row silently
 * orphans the athlete's history and leaves a duplicate in the list.
 *
 * Only applied when the old name exists and the new one does not, so a second
 * run is a no-op and a hand-created row is never overwritten.
 */
export const RENAMES: [from: string, to: string][] = [
  // Ambiguous once the implement variations exist: this row was tagged
  // ['Barbell', 'Dumbbell'], which under canPerform's all-of rule meant it
  // needed both.
  ['Shoulder Press', 'Barbell Overhead Press'],
  // Plural, and inconsistent with every other entry.
  ['Deadlifts', 'Deadlift'],
  ['Squats', 'Barbell Back Squat'],
  ['Barbell Curls', 'Barbell Curl'],
  ['Lateral Raises', 'Dumbbell Lateral Raise'],
  ['Hammer Curls', 'Hammer Curl'],
  ['Dumbbell Flyes', 'Dumbbell Fly'],
  ['Tricep Dips', 'Parallel Bar Dip'],
  ['Russian Twists', 'Russian Twist'],
  ['Skull Crushers', 'Skull Crusher'],
  ['Pull-ups', 'Pull-up'],
  ['Chin-ups', 'Chin-up'],
  ['Push-ups', 'Push-up'],
  ['Diamond Push-ups', 'Diamond Push-up'],
  ['Pike Push-ups', 'Pike Push-up'],
  ['Lunges', 'Walking Lunge'],
  ['Burpees', 'Burpee'],
  ['Thrusters', 'Thruster'],
  ['Wall Balls', 'Wall Ball'],
  ['Box Jumps', 'Box Jump'],
  ['Kettlebell Swings', 'Kettlebell Swing'],
  ['Double Unders', 'Double Under'],
  // Paired with the seated version below, so which one it is now matters.
  ['Leg Curl', 'Lying Leg Curl'],
]

export const EXERCISES: Ex[] = [
  // ══════════════ STRENGTH ══════════════

  // ── Chest ──────────────────────────────────────────────────────────────
  {
    name: 'Bench Press', modality: 'Strength', categories: ['Chest'],
    equipment: ['Barbell', 'Bench'],
    description: 'Shoulder blades pulled back and down into the bench, feet planted. Lower the bar to the base of the sternum with the elbows around 45° from the ribs, pause without sinking into the chest, and press back over the shoulder joint rather than over the face.',
    muscles: [['Chest', 1.0], ['Triceps', 0.6], ['Shoulders', 0.5]],
  },
  {
    name: 'Incline Bench Press', modality: 'Strength', categories: ['Chest'],
    equipment: ['Barbell', 'Bench'],
    description: 'Bench at 30–45°; steeper than that and it becomes a shoulder press. The bar touches just below the collarbone, elbows a little tighter than on flat, and the press finishes over the upper chest.',
    muscles: [['Chest', 0.95], ['Shoulders', 0.6], ['Triceps', 0.5]],
  },
  {
    name: 'Decline Bench Press', modality: 'Strength', categories: ['Chest'],
    equipment: ['Barbell', 'Bench'],
    description: 'Bench declined 15–30°, legs hooked before you unrack. The shorter range makes this the heaviest of the three presses — take the bar to the lower chest with the elbows tucked. Use a spotter: the bar path finishes over your throat.',
    muscles: [['Chest', 0.95], ['Triceps', 0.65], ['Shoulders', 0.35]],
  },
  {
    name: 'Close-Grip Bench Press', modality: 'Strength', categories: ['Arms', 'Chest'],
    equipment: ['Barbell', 'Bench'],
    description: 'Hands about shoulder-width — closer than that punishes the wrists without adding triceps. Elbows stay tucked to the ribs, the bar lands on the lower chest, and the lockout comes from the elbows straightening rather than the chest squeezing.',
    muscles: [['Triceps', 0.9], ['Chest', 0.6], ['Shoulders', 0.4]],
  },
  {
    name: 'Smith Machine Bench Press', modality: 'Strength', categories: ['Chest'],
    equipment: ['Smith Machine', 'Bench'],
    description: 'The fixed bar path removes the balancing work, so you can push closer to failure alone — set the safety catches at chest height and use them. Position the bench so the bar meets the sternum, not the collarbone; the bar cannot come to you.',
    muscles: [['Chest', 0.95], ['Triceps', 0.55], ['Shoulders', 0.4]],
  },
  {
    name: 'Dumbbell Bench Press', modality: 'Strength', categories: ['Chest'],
    equipment: ['Dumbbell', 'Bench'],
    description: 'Kick the dumbbells up with the knees one at a time. Deeper stretch than a barbell and each side works independently, so keep the wrists stacked over the elbows — and stop pressing the bells together at the top, which is the chest relaxing, not contracting.',
    muscles: [['Chest', 0.95], ['Triceps', 0.55], ['Shoulders', 0.45]],
  },
  {
    name: 'Incline Dumbbell Press', modality: 'Strength', categories: ['Chest'],
    equipment: ['Dumbbell', 'Bench'],
    description: 'Bench at 30°, dumbbells starting level with the upper chest. Press up and slightly in without clashing the bells. The free path lets the shoulders rotate as they want to, which is why this often stays pain-free when an incline barbell bites.',
    muscles: [['Chest', 0.9], ['Shoulders', 0.55], ['Triceps', 0.45]],
  },
  {
    name: 'Dumbbell Fly', modality: 'Strength', categories: ['Chest'],
    equipment: ['Dumbbell', 'Bench'],
    description: 'A wide arc on a soft, fixed elbow bend — if the angle changes it has become a sloppy press. Lower only to where the chest stretches, not to where the shoulder does, and stop short of touching the bells so the chest stays loaded.',
    muscles: [['Chest', 0.9], ['Shoulders', 0.35]],
  },
  {
    name: 'Machine Chest Press', modality: 'Strength', categories: ['Chest'],
    equipment: ['Machine'],
    description: 'Set the seat so the handles sit at mid-chest; too low and it turns into an incline press. Back flat on the pad, elbows finishing just short of locked. Guided and stable, which makes it the safest place to train close to failure.',
    muscles: [['Chest', 0.9], ['Triceps', 0.5], ['Shoulders', 0.35]],
  },
  {
    name: 'Machine Chest Fly', modality: 'Strength', categories: ['Chest'],
    equipment: ['Machine'],
    description: 'Pec deck. Seat height should put the handles level with the sternum and the forearms flat on the pads. Squeeze the elbows together in front of the chest, hold a beat, and let the arms travel back only as far as the chest stretch allows.',
    muscles: [['Chest', 0.85], ['Shoulders', 0.3]],
  },
  {
    name: 'Cable Crossover', modality: 'Strength', categories: ['Chest'],
    equipment: ['Cable Machine'],
    description: 'Split stance, slight forward lean, elbows softly bent and fixed. Bring the handles together in front of the hips or the chest depending on pulley height. Cable tension does what a dumbbell fly cannot — it stays on the chest at the top of the rep.',
    muscles: [['Chest', 0.85], ['Shoulders', 0.3]],
  },
  {
    name: 'Cable Chest Press', modality: 'Strength', categories: ['Chest'],
    equipment: ['Cable Machine'],
    description: 'Pulleys at chest height, one foot forward for a base. Press both handles forward and slightly together while resisting the pull back. Standing means the core holds you in place, so load it lighter than a bench press and expect it to feel different.',
    muscles: [['Chest', 0.85], ['Triceps', 0.5], ['Shoulders', 0.4]],
  },
  {
    name: 'Dumbbell Pullover', modality: 'Strength', categories: ['Chest', 'Back'],
    equipment: ['Dumbbell', 'Bench'],
    description: 'Lie along or across the bench holding one dumbbell over the chest. Elbows slightly bent, take the weight back overhead until the ribs and lats stretch, then pull it back over the chest. Judge the depth by the stretch, not by how far back you can reach.',
    muscles: [['Lats', 0.8], ['Chest', 0.6], ['Triceps', 0.4]],
  },
  {
    name: 'Weighted Dip', modality: 'Strength', categories: ['Chest', 'Arms'],
    equipment: ['Dip Bars'],
    description: 'Belt on the extra load, then lean the torso forward and let the elbows flare a little — upright and tucked is the triceps version. Descend until the upper arms pass parallel and no further; below that the shoulder capsule takes the whole load.',
    muscles: [['Chest', 0.85], ['Triceps', 0.8], ['Shoulders', 0.5]],
  },

  // ── Back ───────────────────────────────────────────────────────────────
  {
    name: 'Deadlift', modality: 'Strength', categories: ['Back'],
    equipment: ['Barbell'],
    description: 'Bar over mid-foot, shins brushing it, lats pulled tight so it tracks up the legs the whole way. Push the floor away rather than pulling with the back, and finish standing tall — leaning back at the top adds nothing but spinal load.',
    muscles: [['Back', 1.0], ['Lower Back', 0.9], ['Glutes', 0.8], ['Hamstrings', 0.8], ['Traps', 0.6], ['Forearms', 0.5]],
  },
  {
    name: 'Sumo Deadlift', modality: 'Strength', categories: ['Back', 'Legs'],
    equipment: ['Barbell'],
    description: 'Wide stance, toes turned out, hands inside the knees. The hips start lower and the torso stays far more upright, shifting work off the lower back and onto the hips and quads. Open the knees out over the toes as the bar breaks the floor.',
    muscles: [['Glutes', 0.9], ['Back', 0.85], ['Hamstrings', 0.75], ['Lower Back', 0.7], ['Quadriceps', 0.6], ['Traps', 0.5]],
  },
  {
    name: 'Trap Bar Deadlift', modality: 'Strength', categories: ['Back', 'Legs'],
    equipment: ['Trap Bar'],
    description: 'Standing inside the bar puts the load in line with the hips, so the torso stays upright and the lower back does far less than on a straight bar. The easiest heavy pull to learn, and the one to use when the spine is the limit rather than the legs.',
    muscles: [['Back', 0.9], ['Glutes', 0.85], ['Quadriceps', 0.7], ['Hamstrings', 0.7], ['Traps', 0.6], ['Lower Back', 0.6]],
  },
  {
    name: 'Rack Pull', modality: 'Strength', categories: ['Back'],
    equipment: ['Barbell'],
    description: 'A deadlift started from pins set at or just below the knee. The short range lets you handle more than you can pull from the floor, which is both the point and the trap — load it for the back, and keep the bar dragging up the thighs.',
    muscles: [['Back', 0.9], ['Lower Back', 0.8], ['Traps', 0.7], ['Glutes', 0.6], ['Forearms', 0.5]],
  },
  {
    name: 'Barbell Row', modality: 'Strength', categories: ['Back'],
    equipment: ['Barbell'],
    description: 'Hinge to roughly 45°, back flat, and hold that angle for the whole set — standing up as you pull is the rep that turns this into a shrug. The bar meets the lower ribs or navel with the elbows driving back, not out.',
    muscles: [['Lats', 0.9], ['Back', 0.85], ['Biceps', 0.5], ['Lower Back', 0.5]],
  },
  {
    name: 'Pendlay Row', modality: 'Strength', categories: ['Back'],
    equipment: ['Barbell'],
    description: 'Torso parallel to the floor, bar reset on the ground between every rep. Each pull starts dead, so there is no bounce and no hip drive to hide behind — explosive up to the sternum, controlled back to the floor.',
    muscles: [['Back', 0.9], ['Lats', 0.85], ['Traps', 0.55], ['Biceps', 0.45]],
  },
  {
    name: 'Bent-Over Dumbbell Row', modality: 'Strength', categories: ['Back'],
    equipment: ['Dumbbell'],
    description: 'One hand and one knee on a bench, or hinged over with both. Let the dumbbell hang and the shoulder blade travel forward at the bottom, then pull the elbow past the ribs. That extra range at the bottom is the whole reason to pick this over a barbell.',
    muscles: [['Lats', 0.85], ['Back', 0.8], ['Biceps', 0.5]],
  },
  {
    name: 'Chest-Supported Dumbbell Row', modality: 'Strength', categories: ['Back'],
    equipment: ['Dumbbell', 'Bench'],
    description: 'Face-down on an incline bench, which takes the lower back and hips out of it entirely. With nothing to swing, every rep is the back working — the load will be lighter than a bent-over row and it is supposed to be.',
    muscles: [['Back', 0.9], ['Lats', 0.8], ['Traps', 0.5], ['Biceps', 0.45]],
  },
  {
    name: 'T-Bar Row', modality: 'Strength', categories: ['Back'],
    equipment: ['Barbell'],
    description: 'One end of the bar wedged into a corner or landmine, load on the other, hinged over with a neutral grip. The angle of pull hits the mid-back hard while the anchored end takes the balancing work. Chest up, and stop the bar at the ribs.',
    muscles: [['Back', 0.9], ['Lats', 0.85], ['Traps', 0.5], ['Biceps', 0.45]],
  },
  {
    name: 'Machine Row', modality: 'Strength', categories: ['Back'],
    equipment: ['Machine'],
    description: 'Chest against the pad, seat set so the handles are level with the lower ribs. Pull the elbows back until the shoulder blades meet, then let them travel forward under control. No lower-back involvement at all, which is the reason to choose it.',
    muscles: [['Back', 0.85], ['Lats', 0.8], ['Biceps', 0.45]],
  },
  {
    name: 'Seated Cable Row', modality: 'Strength', categories: ['Back'],
    equipment: ['Cable Machine'],
    description: 'Sit tall with a small knee bend, pull the handle to the navel and keep the torso still — rowing with the whole body turns this into a lower-back exercise. Let the shoulder blades stretch forward at the front of every rep.',
    muscles: [['Back', 0.85], ['Lats', 0.8], ['Biceps', 0.45]],
  },
  {
    name: 'Lat Pulldown', modality: 'Strength', categories: ['Back'],
    equipment: ['Cable Machine'],
    description: 'Grip a little wider than the shoulders, thighs locked under the pad. Lead with the elbows down toward the floor and bring the bar to the collarbone; leaning back to force it lower makes it a row. Behind the neck is the other way to hurt a shoulder.',
    muscles: [['Lats', 0.95], ['Back', 0.6], ['Biceps', 0.5]],
  },
  {
    name: 'Straight-Arm Pulldown', modality: 'Strength', categories: ['Back'],
    equipment: ['Cable Machine'],
    description: 'Elbows locked almost straight, a slight hinge at the hips, and sweep the bar from head height down to the thighs. With the elbows out of the movement the biceps cannot take over, which makes this the cleanest way to actually feel the lats work.',
    muscles: [['Lats', 0.85], ['Triceps', 0.35], ['Abs', 0.3]],
  },
  {
    name: 'Barbell Shrug', modality: 'Strength', categories: ['Back'],
    equipment: ['Barbell'],
    description: 'Straight up and straight down — rolling the shoulders adds nothing and grinds the joint. Hold the top for a second; a heavy shrug with no pause is just a bounce. Straps are legitimate here, since the grip gives out long before the traps do.',
    muscles: [['Traps', 1.0], ['Forearms', 0.4]],
  },
  {
    name: 'Dumbbell Shrug', modality: 'Strength', categories: ['Back'],
    equipment: ['Dumbbell'],
    description: 'Bells hang at the sides rather than in front of the thighs, which lets the shoulders travel a little higher than a barbell allows. Shrug straight up, pause at the top, and lower all the way into a full stretch.',
    muscles: [['Traps', 0.95], ['Forearms', 0.4]],
  },
  {
    name: 'Back Extension', modality: 'Strength', categories: ['Back', 'Legs'],
    equipment: ['Machine'],
    description: 'Pads just below the hip bones so the hips can fold. Lower under control, drive back up by squeezing the glutes, and stop level with the legs — arching past straight loads the spine exactly where it has no leverage.',
    muscles: [['Lower Back', 0.9], ['Glutes', 0.7], ['Hamstrings', 0.6]],
  },

  // ── Legs ───────────────────────────────────────────────────────────────
  {
    name: 'Barbell Back Squat', modality: 'Strength', categories: ['Legs'],
    equipment: ['Barbell'],
    description: 'Bar on the upper back, feet a little wider than the hips, toes turned slightly out. Break at the hips and knees together, sit down between the feet to at least parallel, and drive up with the chest staying where it started — the hips shooting up first is the back taking over.',
    muscles: [['Quadriceps', 1.0], ['Glutes', 0.85], ['Hamstrings', 0.7], ['Lower Back', 0.5], ['Abs', 0.4]],
  },
  {
    name: 'Front Squat', modality: 'Strength', categories: ['Legs'],
    equipment: ['Barbell'],
    description: 'Bar racked across the front delts with the elbows held high — if the elbows drop the bar rolls off. The upright torso puts the load onto the quads and demands far more from the upper back, so expect roughly 70–80% of your back squat.',
    muscles: [['Quadriceps', 1.0], ['Glutes', 0.7], ['Abs', 0.55], ['Back', 0.5]],
  },
  {
    name: 'Smith Machine Squat', modality: 'Strength', categories: ['Legs'],
    equipment: ['Smith Machine'],
    description: 'The fixed bar path lets you stand with the feet further forward than a free squat would allow, which loads the quads hard and takes the balancing work away. Set the catches at your bottom position; the trade for stability is that you cannot bail sideways.',
    muscles: [['Quadriceps', 0.95], ['Glutes', 0.75], ['Hamstrings', 0.5]],
  },
  {
    name: 'Hack Squat', modality: 'Strength', categories: ['Legs'],
    equipment: ['Machine'],
    description: 'Back and shoulders locked into the pads, feet mid-platform. The machine holds your spine in place, so the only limit is the legs — which is why it can be loaded heavily and taken far closer to failure than a barbell squat.',
    muscles: [['Quadriceps', 1.0], ['Glutes', 0.6], ['Hamstrings', 0.4]],
  },
  {
    name: 'Goblet Squat', modality: 'Strength', categories: ['Legs'],
    equipment: ['Dumbbell'],
    description: 'Hold one dumbbell vertically against the chest. The counterweight in front makes it almost impossible to fall forward, so it is the squat to learn depth with — elbows brush the inside of the knees at the bottom.',
    muscles: [['Quadriceps', 0.85], ['Glutes', 0.7], ['Abs', 0.45]],
  },
  {
    name: 'Leg Press', modality: 'Strength', categories: ['Legs'],
    equipment: ['Machine'],
    description: 'Feet mid-platform, shoulder-width. Lower until the knees reach about 90° and stop before the lower back peels off the seat — that rounding, not the weight, is what hurts people on this machine. Never lock the knees out hard at the top.',
    muscles: [['Quadriceps', 0.95], ['Glutes', 0.7], ['Hamstrings', 0.45]],
  },
  {
    name: 'Leg Extension', modality: 'Strength', categories: ['Legs'],
    equipment: ['Machine'],
    description: 'Pivot lined up with the knee joint, pad on the shins above the ankle. Extend to straight, pause, and lower slowly. The only movement in the catalogue that isolates the quads outright, which is what makes it useful and also why the load is small.',
    muscles: [['Quadriceps', 0.9]],
  },
  {
    name: 'Lying Leg Curl', modality: 'Strength', categories: ['Legs'],
    equipment: ['Machine'],
    description: 'Hips flat on the pad, pad just above the heels. Curl the heels toward the glutes without letting the hips lift — that lift is the lower back donating range the hamstrings did not earn. Lower slowly; the eccentric is where hamstrings actually grow.',
    muscles: [['Hamstrings', 0.9], ['Calves', 0.3]],
  },
  {
    name: 'Seated Leg Curl', modality: 'Strength', categories: ['Legs'],
    equipment: ['Machine'],
    description: 'Same curl with the hips bent at 90°, which pre-stretches the hamstrings and trains them at a longer length than the lying version. Strap the thigh pad down firmly or the hips rise and steal the range.',
    muscles: [['Hamstrings', 0.9], ['Calves', 0.3]],
  },
  {
    name: 'Romanian Deadlift', modality: 'Strength', categories: ['Legs'],
    equipment: ['Barbell'],
    description: 'Knees softly bent and kept there. Push the hips back and let the bar slide down the thighs until the hamstrings tell you to stop — usually mid-shin, and the floor is not the target. Back stays flat throughout; the range comes from the hips, never the spine.',
    muscles: [['Hamstrings', 1.0], ['Glutes', 0.8], ['Lower Back', 0.6], ['Back', 0.4]],
  },
  {
    name: 'Dumbbell Romanian Deadlift', modality: 'Strength', categories: ['Legs'],
    equipment: ['Dumbbell'],
    description: 'The same hip hinge with a dumbbell in each hand, which lets the weights pass either side of the knees and reach a slightly deeper stretch. Easier on the lower back at a given load, and the version to use when there is no barbell.',
    muscles: [['Hamstrings', 0.95], ['Glutes', 0.8], ['Lower Back', 0.5]],
  },
  {
    name: 'Single-Leg Romanian Deadlift', modality: 'Strength', categories: ['Legs'],
    equipment: ['Dumbbell'],
    description: 'One leg planted, the other extending back as a counterweight, hips square to the floor throughout — letting the free hip open up is what turns this into a twist. Balance limits the load long before the hamstring does, which is fine: that is the point.',
    muscles: [['Hamstrings', 0.95], ['Glutes', 0.8], ['Lower Back', 0.5], ['Abs', 0.4]],
  },
  {
    name: 'Good Morning', modality: 'Strength', categories: ['Legs', 'Back'],
    equipment: ['Barbell'],
    description: 'Bar on the back as for a squat, then hinge forward with a flat back and soft knees until the torso is near parallel. Brutal on the hamstrings and spinal erectors at very light loads — start far lighter than a Romanian deadlift and stay there.',
    muscles: [['Hamstrings', 0.9], ['Lower Back', 0.85], ['Glutes', 0.7]],
  },
  {
    name: 'Barbell Hip Thrust', modality: 'Strength', categories: ['Legs'],
    equipment: ['Barbell', 'Bench'],
    description: 'Shoulder blades on the bench edge, bar across the hips on a pad, shins vertical at the top. Drive through the heels and finish with the ribs down and the glutes locked — arching the lower back to get higher is the most common way to make this a spine exercise.',
    muscles: [['Glutes', 1.0], ['Hamstrings', 0.6], ['Quadriceps', 0.35]],
  },
  {
    name: 'Cable Glute Kickback', modality: 'Strength', categories: ['Legs'],
    equipment: ['Cable Machine'],
    description: 'Ankle strap on the low pulley, torso leaning slightly forward and held still. Drive the leg back from the hip and stop as the glute finishes contracting — swinging further just arches the lower back. Light loads, slow tempo.',
    muscles: [['Glutes', 0.85], ['Hamstrings', 0.5]],
  },
  {
    name: 'Hip Abduction Machine', modality: 'Strength', categories: ['Legs'],
    equipment: ['Machine'],
    description: 'Press the knees apart against the pads and return slowly. Trains the smaller glute muscles that stabilise the pelvis — worth including if your knees cave in on squats or one hip gives out on single-leg work.',
    muscles: [['Glutes', 0.8]],
  },
  {
    name: 'Bulgarian Split Squat', modality: 'Strength', categories: ['Legs'],
    equipment: ['Dumbbell'],
    description: 'Rear foot on a bench, front foot far enough forward that the knee stays over the mid-foot at the bottom. Upright torso for the quads, leaning slightly forward for the glutes. One of the hardest movements in the app to recover from — count the sets per leg.',
    muscles: [['Quadriceps', 0.9], ['Glutes', 0.85], ['Hamstrings', 0.5]],
  },
  {
    name: 'Barbell Reverse Lunge', modality: 'Strength', categories: ['Legs'],
    equipment: ['Barbell'],
    description: 'Step back rather than forward, which keeps the front knee still and is far kinder to it than a forward lunge. Lower the back knee to just above the floor, then drive through the front heel to stand.',
    muscles: [['Quadriceps', 0.8], ['Glutes', 0.9], ['Hamstrings', 0.55]],
  },
  {
    name: 'Dumbbell Walking Lunge', modality: 'Strength', categories: ['Legs'],
    equipment: ['Dumbbell'],
    description: 'Dumbbells hanging at the sides, torso tall, steps long enough that the front shin stays near vertical. Continuous walking gives the legs no rest between reps, so the last few metres tell you more about conditioning than about leg strength.',
    muscles: [['Quadriceps', 0.85], ['Glutes', 0.85], ['Hamstrings', 0.55], ['Calves', 0.4]],
  },
  {
    name: 'Dumbbell Step-up', modality: 'Strength', categories: ['Legs'],
    equipment: ['Dumbbell', 'Plyo Box'],
    description: 'Box height around knee level. Put the whole foot on the box and stand up by driving through that heel — pushing off the trailing foot is the cheat that makes it easy. Step back down under control rather than dropping.',
    muscles: [['Quadriceps', 0.85], ['Glutes', 0.9], ['Calves', 0.4]],
  },
  {
    name: 'Standing Calf Raise', modality: 'Strength', categories: ['Legs'],
    equipment: ['Machine'],
    description: 'Balls of the feet on the platform, knees straight. Drop the heels into a full stretch, pause there, then press all the way up onto the toes and hold. With the knee straight this trains the big gastrocnemius; bouncing through the bottom trains nothing.',
    muscles: [['Calves', 1.0]],
  },
  {
    name: 'Seated Calf Raise', modality: 'Strength', categories: ['Legs'],
    equipment: ['Machine'],
    description: 'Knees bent under the pad, which takes the gastrocnemius out and leaves the soleus underneath it doing the work. That muscle responds to slow reps and long pauses far more than heavy ones — the pair together is why both entries exist.',
    muscles: [['Calves', 0.95]],
  },
  {
    name: 'Smith Machine Calf Raise', modality: 'Strength', categories: ['Legs'],
    equipment: ['Smith Machine'],
    description: 'Bar on the upper back, balls of the feet on a plate or step to get the heels below the toes. The fixed path means no balancing, so the load can be pushed hard — the standing calf machine, when the gym does not have one.',
    muscles: [['Calves', 1.0]],
  },

  // ── Shoulders ──────────────────────────────────────────────────────────
  {
    name: 'Barbell Overhead Press', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Barbell'],
    description: 'Standing, bar on the front delts, ribs down and glutes tight so the lower back does not arch to help. Move the head back out of the way, press up, and finish with the bar over the middle of the foot with the biceps beside the ears.',
    muscles: [['Shoulders', 1.0], ['Triceps', 0.6], ['Abs', 0.4]],
  },
  {
    name: 'Push Press', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Barbell'],
    description: 'A short dip and drive from the legs to start the bar, then the shoulders finish it overhead. The leg drive is a quick few inches, not a squat. Lets you overload a weight the strict press cannot move — and the elbows must lock out before the hips do.',
    muscles: [['Shoulders', 0.9], ['Triceps', 0.55], ['Quadriceps', 0.45], ['Glutes', 0.35]],
  },
  {
    name: 'Dumbbell Shoulder Press', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Dumbbell'],
    description: 'Seated or standing, dumbbells starting at ear height with the palms forward or slightly turned in. The independent path suits shoulders that a straight bar irritates, and the bells finish above the head rather than clashing over it.',
    muscles: [['Shoulders', 0.95], ['Triceps', 0.55]],
  },
  {
    name: 'Arnold Press', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Dumbbell'],
    description: 'Start with the palms facing you at chin height and rotate them outward as you press. The rotation brings the front delt through a longer range, so it is done light and slow — rushing the turn under load is how the shoulder gets pinched.',
    muscles: [['Shoulders', 0.95], ['Triceps', 0.5]],
  },
  {
    name: 'Machine Shoulder Press', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Machine'],
    description: 'Seat set so the handles start level with the shoulders, back flat on the pad. The pad supports the spine, so none of the load leaks into bracing — the version to reach for when the lower back is already cooked from pressing overhead standing.',
    muscles: [['Shoulders', 0.9], ['Triceps', 0.5]],
  },
  {
    name: 'Smith Machine Shoulder Press', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Smith Machine', 'Bench'],
    description: 'Upright bench set under the bar, positioned so the bar comes down in front of the face rather than behind it. The fixed path removes the balance demand of a free barbell press, which makes the last few reps of a set genuinely safer to chase.',
    muscles: [['Shoulders', 0.9], ['Triceps', 0.55]],
  },
  {
    name: 'Dumbbell Lateral Raise', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Dumbbell'],
    description: 'Raise to shoulder height and no further, leading with the elbows and keeping a slight bend. Swinging heavier weight up hands the work to the traps, which is why this is one of the lightest movements in the app and should stay that way.',
    muscles: [['Shoulders', 0.95], ['Traps', 0.35]],
  },
  {
    name: 'Cable Lateral Raise', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Cable Machine'],
    description: 'Low pulley, cable running across the body, one arm at a time. Unlike a dumbbell the tension is there at the bottom of the range too, where the side delt is at its longest — so this feels harder than the same load in the hand.',
    muscles: [['Shoulders', 0.9], ['Traps', 0.3]],
  },
  {
    name: 'Machine Lateral Raise', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Machine'],
    description: 'Pads against the outer arms, pivot lined up with the shoulder. The path is fixed, so momentum is not available and the load can be tracked properly week to week — useful for a muscle whose free-weight version is so easy to cheat.',
    muscles: [['Shoulders', 0.9], ['Traps', 0.3]],
  },
  {
    name: 'Front Raise', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Dumbbell'],
    description: 'Raise to shoulder height with the arm nearly straight, one at a time or both together, and lower slowly. The front delt already gets heavy work from every press, so treat this as an accessory rather than a main movement.',
    muscles: [['Shoulders', 0.85]],
  },
  {
    name: 'Rear Delt Fly', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Dumbbell'],
    description: 'Hinged over or face-down on an incline bench, arms hanging, elbows slightly bent. Sweep the dumbbells out and back rather than up — a shrugging finish means the traps have taken it. Light, high-rep work is what the rear delt responds to.',
    muscles: [['Shoulders', 0.8], ['Traps', 0.4]],
  },
  {
    name: 'Reverse Pec Deck', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Machine'],
    description: 'The chest fly machine run backwards: chest on the pad, arms sweeping out and back. Supported and fixed, so the rear delts get the work instead of the lower back holding a hinge — the easiest way to train them honestly.',
    muscles: [['Shoulders', 0.8], ['Traps', 0.5]],
  },
  {
    name: 'Face Pull', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Cable Machine'],
    description: 'Rope at eye height, pull toward the forehead while rotating the hands so the knuckles finish pointing back. Trains the rear delts and the upper-back rotators that everything else in the gym neglects. Light weight, held for a beat at the end.',
    muscles: [['Shoulders', 0.8], ['Traps', 0.6], ['Back', 0.4]],
  },
  {
    name: 'Upright Row', modality: 'Strength', categories: ['Shoulders'],
    equipment: ['Barbell'],
    description: 'Hands about shoulder-width, not narrow, and stop pulling when the elbows reach shoulder height. Higher than that with a close grip is the classic recipe for shoulder impingement — if it pinches, use the wider grip or do lateral raises instead.',
    muscles: [['Shoulders', 0.85], ['Traps', 0.6], ['Biceps', 0.35]],
  },

  // ── Arms ───────────────────────────────────────────────────────────────
  {
    name: 'Barbell Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['Barbell'],
    description: 'Elbows pinned to the sides and the torso still — the moment the hips swing, the load has moved from the biceps to the lower back. Lower all the way to straight arms; half reps at the top are where most curling volume gets wasted.',
    muscles: [['Biceps', 1.0], ['Forearms', 0.4]],
  },
  {
    name: 'EZ Bar Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['EZ Bar'],
    description: 'The angled grip turns the wrists slightly in, which most people find far kinder than a straight bar at the same load. Everything else is a barbell curl: elbows fixed, body still, full range.',
    muscles: [['Biceps', 0.95], ['Forearms', 0.4]],
  },
  {
    name: 'Dumbbell Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['Dumbbell'],
    description: 'Curl with the palms turning up as the arm bends, which lets the biceps do the job it actually has — bending the elbow and rotating the forearm. Alternate arms or curl both; either way the elbow stays under the shoulder.',
    muscles: [['Biceps', 0.95], ['Forearms', 0.35]],
  },
  {
    name: 'Hammer Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['Dumbbell'],
    description: 'Neutral grip held throughout, thumbs up. That hand position shifts work onto the brachialis under the biceps and the forearm, which is why it usually handles more weight than a supinated curl.',
    muscles: [['Biceps', 0.9], ['Forearms', 0.6]],
  },
  {
    name: 'Incline Dumbbell Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['Dumbbell', 'Bench'],
    description: 'Lie back on a bench set to about 45° and let the arms hang behind the body. That start position stretches the biceps further than any standing curl can, so the load is light and the bottom of the rep is the part that matters.',
    muscles: [['Biceps', 0.95]],
  },
  {
    name: 'Concentration Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['Dumbbell'],
    description: 'Seated, elbow braced against the inside of the thigh so nothing else can contribute. One arm at a time, squeezed at the top and lowered slowly. Nothing to cheat with, so the weight is small and honest.',
    muscles: [['Biceps', 0.9]],
  },
  {
    name: 'Preacher Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['EZ Bar', 'Bench'],
    description: 'Upper arms flat on the pad, armpits pressed into the top of it. The pad blocks any swing and holds the elbow in front of the body, which loads the bottom of the curl hard — do not bounce out of full extension, that stretch is where biceps tear.',
    muscles: [['Biceps', 0.95]],
  },
  {
    name: 'Machine Preacher Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['Machine'],
    description: 'The preacher position with a fixed path and a stack: seat set so the elbows line up with the pivot, arms flat on the pad. Resistance stays even through the whole curl, and there is no bar to fight at the bottom.',
    muscles: [['Biceps', 0.9]],
  },
  {
    name: 'Cable Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['Cable Machine'],
    description: 'Low pulley, elbows at the sides, standing a step back from the stack so the cable pulls slightly behind you. Tension never disappears at the top the way it does with a barbell, so the squeeze at the end is worth holding.',
    muscles: [['Biceps', 0.9], ['Forearms', 0.35]],
  },
  {
    name: 'Reverse Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['EZ Bar'],
    description: 'Palms down, wrists held straight and firm. This trains the forearm extensors and the brachialis rather than the biceps head, so the weight drops sharply compared with a normal curl — grip usually gives out first.',
    muscles: [['Forearms', 0.85], ['Biceps', 0.6]],
  },
  {
    name: 'Wrist Curl', modality: 'Strength', categories: ['Arms'],
    equipment: ['Dumbbell'],
    description: 'Forearms resting on a bench or the thighs, wrists hanging over the end. Let the weight roll to the fingertips, then curl it back up. Small range, high reps — the forearms recover fast and respond to frequency rather than load.',
    muscles: [['Forearms', 0.9]],
  },
  {
    name: "Farmer's Carry", modality: 'Strength', categories: ['Arms', 'Core'],
    equipment: ['Dumbbell'],
    description: 'Heavy weight in each hand, shoulders pulled back, ribs down, and walk. Grip, traps and the whole trunk work the entire time. Log the distance or the time in reps — it is a carry, not a set, and it ends when the hands open.',
    muscles: [['Forearms', 0.9], ['Traps', 0.8], ['Abs', 0.5], ['Obliques', 0.5], ['Glutes', 0.4]],
  },
  {
    name: 'Tricep Pushdown', modality: 'Strength', categories: ['Arms'],
    equipment: ['Cable Machine'],
    description: 'Elbows pinned to the ribs and kept there — every inch they drift forward is the lats taking the rep. Push down to straight arms, hold for a beat, and let the rope or bar come back up only to where the elbows stay put.',
    muscles: [['Triceps', 0.95]],
  },
  {
    name: 'Cable Overhead Tricep Extension', modality: 'Strength', categories: ['Arms'],
    equipment: ['Cable Machine'],
    description: 'Facing away from the stack with the rope held behind the head, elbows high and narrow. Overhead puts the long head of the triceps on stretch, which is the part a pushdown barely touches — the two together cover the whole muscle.',
    muscles: [['Triceps', 0.95]],
  },
  {
    name: 'Dumbbell Overhead Tricep Extension', modality: 'Strength', categories: ['Arms'],
    equipment: ['Dumbbell'],
    description: 'One dumbbell held in both hands behind the head, elbows pointing up and staying there. Lower until the triceps stretch, then extend without letting the elbows flare out. Heavy loading here is what makes elbows ache; keep it moderate.',
    muscles: [['Triceps', 0.95]],
  },
  {
    name: 'Skull Crusher', modality: 'Strength', categories: ['Arms'],
    equipment: ['EZ Bar', 'Bench'],
    description: 'Lying with the arms angled slightly back rather than straight up, so tension stays on the triceps at the top. Bend at the elbow only, lowering the bar to the forehead or just behind it. The elbows drifting apart is the fault that eventually hurts them.',
    muscles: [['Triceps', 0.95]],
  },
  {
    name: 'Machine Tricep Extension', modality: 'Strength', categories: ['Arms'],
    equipment: ['Machine'],
    description: 'Seat and pad set so the elbows sit on the pivot. Everything else is held in place, so nothing can swing and the last reps can be pushed properly — the triceps version of a machine curl.',
    muscles: [['Triceps', 0.9]],
  },
  {
    name: 'Dumbbell Tricep Kickback', modality: 'Strength', categories: ['Arms'],
    equipment: ['Dumbbell'],
    description: 'Hinged over with the upper arm parallel to the floor and locked there, extend the elbow back to straight and hold. Only the last part of the range is loaded, so this is a finisher on light weight, not a mass builder.',
    muscles: [['Triceps', 0.85]],
  },

  // ── Core (loaded) ──────────────────────────────────────────────────────
  {
    name: 'Cable Crunch', modality: 'Strength', categories: ['Core'],
    equipment: ['Cable Machine'],
    description: 'Kneeling under a high pulley with the rope beside the head. Curl the ribs toward the hips and round the spine deliberately — the hips stay put. Pulling with the arms or folding at the hip turns the best loaded ab movement into a lat exercise.',
    muscles: [['Abs', 0.95], ['Obliques', 0.4]],
  },
  {
    name: 'Weighted Decline Sit-up', modality: 'Strength', categories: ['Core'],
    equipment: ['Bench'],
    description: 'Feet hooked on a declined bench, a plate or dumbbell held on the chest. Curl up one vertebra at a time rather than snapping up straight — and lower slowly, which is the half most people drop.',
    muscles: [['Abs', 0.9], ['Obliques', 0.5]],
  },
  {
    name: 'Ab Wheel Rollout', modality: 'Strength', categories: ['Core'],
    equipment: ['Ab Wheel'],
    description: 'From the knees, ribs pulled down and the lower back flat, roll out only as far as you can go without the back arching — that point is the honest end of your range. Any further and the spine is doing what the abs were supposed to prevent.',
    muscles: [['Abs', 0.95], ['Obliques', 0.4], ['Lats', 0.4]],
  },
  {
    name: 'Machine Ab Crunch', modality: 'Strength', categories: ['Core'],
    equipment: ['Machine'],
    description: 'Seat and pads set so the pivot is level with the navel. Crunch by shortening the distance between ribs and hips, not by pulling the handles. Loadable and trackable, which body-weight ab work never quite is.',
    muscles: [['Abs', 0.9], ['Obliques', 0.4]],
  },
  {
    name: 'Cable Woodchop', modality: 'Strength', categories: ['Core'],
    equipment: ['Cable Machine'],
    description: 'Pulley high, arms nearly straight, and rotate from the ribs and hips down across the body — the arms just hold the handle. Feet stay planted and the knees turn with the hips rather than the lower back doing the twisting.',
    muscles: [['Obliques', 0.9], ['Abs', 0.6], ['Shoulders', 0.35]],
  },
  {
    name: 'Pallof Press', modality: 'Strength', categories: ['Core'],
    equipment: ['Cable Machine'],
    description: 'Stand side-on to the pulley, handle at the chest, and press it straight out while refusing to let the cable rotate you. Nothing visibly moves, which is the exercise: the core works hardest when it stops motion rather than making it.',
    muscles: [['Obliques', 0.85], ['Abs', 0.7]],
  },

  // ══════════════ CALISTHENICS ══════════════
  {
    name: 'Pull-up', modality: 'Calisthenics', categories: ['Back'],
    equipment: ['Pull-up Bar'],
    description: 'Overhand grip just outside the shoulders. Start from a dead hang with the shoulders pulled down out of the ears, then drive the elbows to the ribs until the chin clears the bar. Lower all the way; half-range pull-ups build half a back.',
    muscles: [['Lats', 0.95], ['Back', 0.8], ['Biceps', 0.7], ['Forearms', 0.5]],
  },
  {
    name: 'Chin-up', modality: 'Calisthenics', categories: ['Back'],
    equipment: ['Pull-up Bar'],
    description: 'Underhand, shoulder-width grip. The supinated hands let the biceps contribute far more, so most people manage several more of these than pull-ups — which makes it the better place to start if a pull-up is not there yet.',
    muscles: [['Lats', 0.9], ['Biceps', 0.8], ['Back', 0.6]],
  },
  {
    name: 'Push-up', modality: 'Calisthenics', categories: ['Chest'],
    equipment: ['Bodyweight'],
    description: 'Hands under the shoulders, body in one line from head to heels, elbows tracking back at about 45°. Chest to the floor, then push the floor away and let the shoulder blades spread at the top. Hips sagging is the whole movement falling apart.',
    muscles: [['Chest', 0.85], ['Triceps', 0.6], ['Shoulders', 0.5], ['Abs', 0.4]],
  },
  {
    name: 'Diamond Push-up', modality: 'Calisthenics', categories: ['Arms'],
    equipment: ['Bodyweight'],
    description: 'Hands together under the sternum, thumbs and index fingers touching. Elbows stay close to the ribs, which moves most of the load onto the triceps. Harder than it looks — regress to an incline before letting the hips drop.',
    muscles: [['Triceps', 0.85], ['Chest', 0.6], ['Shoulders', 0.4]],
  },
  {
    name: 'Archer Push-up', modality: 'Calisthenics', categories: ['Chest'],
    equipment: ['Bodyweight'],
    description: 'Hands wide, and lower toward one hand while the other arm straightens out to the side. Most of the bodyweight goes through the bent arm, which is the step on the way to a one-arm push-up. Alternate sides each rep.',
    muscles: [['Chest', 0.9], ['Triceps', 0.65], ['Shoulders', 0.5]],
  },
  {
    name: 'Decline Push-up', modality: 'Calisthenics', categories: ['Chest'],
    equipment: ['Plyo Box'],
    description: 'Feet up on a box, hands on the floor. Raising the feet shifts more bodyweight onto the arms and tilts the emphasis toward the upper chest and shoulders — the bodyweight equivalent of an incline press.',
    muscles: [['Chest', 0.85], ['Shoulders', 0.6], ['Triceps', 0.6]],
  },
  {
    name: 'Pike Push-up', modality: 'Calisthenics', categories: ['Shoulders'],
    equipment: ['Bodyweight'],
    description: 'Hips high in an inverted V, hands wider than the shoulders. Lower the crown of the head toward the floor between the hands and press back up. With the torso near vertical this is a shoulder press — the entry point to handstand push-ups.',
    muscles: [['Shoulders', 0.85], ['Triceps', 0.6]],
  },
  {
    name: 'Parallel Bar Dip', modality: 'Calisthenics', categories: ['Arms'],
    equipment: ['Dip Bars'],
    description: 'Torso upright and elbows tucked for the triceps; lean forward and let them flare for the chest. Lower until the upper arms are just past parallel and press back to straight. Stop the descent where the shoulder starts to complain.',
    muscles: [['Triceps', 0.9], ['Chest', 0.6], ['Shoulders', 0.4]],
  },
  {
    name: 'Bench Dip', modality: 'Calisthenics', categories: ['Arms'],
    equipment: ['Bench'],
    description: 'Hands on the bench edge behind you, heels on the floor or a second bench. Keep the back close to the bench and lower until the elbows reach 90°. Easier than a parallel-bar dip but harder on the shoulder — go shallow if it pinches.',
    muscles: [['Triceps', 0.85], ['Chest', 0.45], ['Shoulders', 0.4]],
  },
  {
    name: 'Muscle-up', modality: 'Calisthenics', categories: ['Back'],
    equipment: ['Pull-up Bar'],
    description: 'An explosive pull to the sternum, then a fast transition of the elbows over the bar into a dip. Needs a chest-height pull-up and a strong dip before the transition is worth attempting — the false grip is what makes it possible.',
    muscles: [['Lats', 0.9], ['Triceps', 0.7], ['Chest', 0.6], ['Back', 0.6]],
  },
  {
    name: 'Ring Dip', modality: 'Calisthenics', categories: ['Arms'],
    equipment: ['Gymnastic Rings'],
    description: 'The rings move, so the shoulders and chest work constantly just to stop them drifting. Turn the rings out at the top for the full lockout. Expect far fewer reps than on fixed bars, and build up on those first.',
    muscles: [['Triceps', 0.9], ['Chest', 0.7], ['Shoulders', 0.55]],
  },
  {
    name: 'Ring Row', modality: 'Calisthenics', categories: ['Back'],
    equipment: ['Gymnastic Rings'],
    description: 'Hang under the rings with the body straight and pull the chest to the hands. Walking the feet forward makes it harder, back makes it easier — a difficulty dial no barbell row has, and the reason it works for every level.',
    muscles: [['Back', 0.85], ['Lats', 0.7], ['Biceps', 0.5]],
  },
  {
    name: 'Inverted Row', modality: 'Calisthenics', categories: ['Back'],
    equipment: ['Barbell'],
    description: 'Bar set in a rack at hip height, hang underneath with the heels on the floor and pull the chest to the bar. Keep the body in one line — the hips sagging is the giveaway that the set is done.',
    muscles: [['Back', 0.85], ['Lats', 0.7], ['Biceps', 0.5]],
  },
  {
    name: 'Bodyweight Squat', modality: 'Calisthenics', categories: ['Legs'],
    equipment: ['Bodyweight'],
    description: 'Feet shoulder-width, arms out for balance, sit down between the heels to full depth and stand. The movement to own before adding a bar — depth and knee tracking cost nothing to fix here and are expensive to fix under load.',
    muscles: [['Quadriceps', 0.8], ['Glutes', 0.7]],
  },
  {
    name: 'Jump Squat', modality: 'Calisthenics', categories: ['Legs'],
    equipment: ['Bodyweight'],
    description: 'A quarter-to-parallel squat driven into a jump, landing softly on the whole foot and absorbing straight into the next rep. Landings are what make this fatiguing out of proportion to how easy it feels — keep the sets short.',
    muscles: [['Quadriceps', 0.85], ['Glutes', 0.8], ['Calves', 0.6]],
  },
  {
    name: 'Pistol Squat', modality: 'Calisthenics', categories: ['Legs'],
    equipment: ['Bodyweight'],
    description: 'One leg held out in front, squat all the way down on the other and stand back up. Ankle mobility limits most people long before leg strength does — hold a light counterweight out front, or squat to a box, and lower it over time.',
    muscles: [['Quadriceps', 0.9], ['Glutes', 0.8], ['Hamstrings', 0.5], ['Abs', 0.4]],
  },
  {
    name: 'Walking Lunge', modality: 'Calisthenics', categories: ['Legs'],
    equipment: ['Bodyweight'],
    description: 'Step out far enough that the front shin stays near vertical, drop the back knee toward the floor, then step through into the next rep. Torso upright the whole way. Unloaded, but the number of steps adds up faster than people expect.',
    muscles: [['Quadriceps', 0.85], ['Glutes', 0.8], ['Hamstrings', 0.6]],
  },
  {
    name: 'Glute Bridge', modality: 'Calisthenics', categories: ['Legs'],
    equipment: ['Bodyweight'],
    description: 'On the back, heels close to the hips, drive through them and lift until the hips are level with the knees and shoulders. Squeeze at the top with the ribs down — arching the lower back to get higher is the mistake this movement exists to teach against.',
    muscles: [['Glutes', 0.85], ['Hamstrings', 0.5]],
  },
  {
    name: 'Nordic Curl', modality: 'Calisthenics', categories: ['Legs'],
    equipment: ['Bodyweight'],
    description: 'Kneeling with the ankles anchored, lower the torso toward the floor as slowly as the hamstrings allow, hips straight. Almost pure eccentric work — two or three sets of a few reps will make you sore for days, so introduce it gradually.',
    muscles: [['Hamstrings', 0.95], ['Glutes', 0.5], ['Calves', 0.3]],
  },
  {
    name: 'Wall Sit', modality: 'Calisthenics', categories: ['Legs'],
    equipment: ['Bodyweight'],
    description: 'Back flat against the wall, thighs parallel to the floor, knees over the ankles. Hold. The burn is the quads working without any change in length, which is fatiguing without doing much damage — recovery is quick.',
    muscles: [['Quadriceps', 0.9], ['Glutes', 0.4]],
  },
  {
    name: 'Plank', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Bodyweight'],
    description: 'Elbows under the shoulders, one line from head to heels, ribs pulled down and glutes squeezed. Held properly this is hard within thirty seconds — a five-minute plank usually means the hips have found somewhere to rest.',
    muscles: [['Abs', 0.9], ['Obliques', 0.6]],
  },
  {
    name: 'Side Plank', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Bodyweight'],
    description: 'On one forearm, elbow under the shoulder, hips stacked and lifted so the body makes a straight line. The obliques hold the hip up against gravity — as soon as it drifts down the set is over. Both sides, equal time.',
    muscles: [['Obliques', 0.9], ['Abs', 0.5], ['Shoulders', 0.35]],
  },
  {
    name: 'Hollow Body Hold', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Bodyweight'],
    description: 'Lower back pressed flat into the floor, shoulders and legs lifted just clear of it, arms overhead. The lower back losing contact means the position has been lost — bend the knees or bring the arms down to make it holdable.',
    muscles: [['Abs', 0.95], ['Quadriceps', 0.35]],
  },
  {
    name: 'Dead Bug', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Yoga Mat'],
    description: 'On the back, arms up and knees over the hips. Lower one arm and the opposite leg slowly while the lower back stays glued to the floor, then swap. Gentle on the spine, which makes it the ab work that survives a cranky lower back.',
    muscles: [['Abs', 0.8], ['Obliques', 0.45]],
  },
  {
    name: 'Bicycle Crunch', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Yoga Mat'],
    description: 'Alternate elbow toward the opposite knee while the other leg extends. Rotate from the ribs rather than yanking on the neck, and go slowly — speed here mostly demonstrates momentum.',
    muscles: [['Abs', 0.8], ['Obliques', 0.8]],
  },
  {
    name: 'Russian Twist', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Bodyweight'],
    description: 'Seated, leaning back at about 45° with the feet up, rotate the ribcage side to side. The lean is what loads the abs; sitting upright makes it an arm swing. Add a plate or ball once the position holds cleanly.',
    muscles: [['Obliques', 0.9], ['Abs', 0.7]],
  },
  {
    name: 'Hanging Leg Raise', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Pull-up Bar'],
    description: 'Hanging with the shoulders active, raise straight legs to at least hip height by curling the pelvis up — legs lifted with a flat back is hip flexor work, not abs. Lower under control; swinging into the next rep is the usual failure.',
    muscles: [['Abs', 0.9], ['Obliques', 0.5], ['Forearms', 0.4]],
  },
  {
    name: 'Hanging Knee Raise', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Pull-up Bar'],
    description: 'The same hang with the knees tucked to the chest, which shortens the lever enough for most people to actually curl the pelvis. The step before straight-leg raises, and the version to drop back to when the swing creeps in.',
    muscles: [['Abs', 0.85], ['Obliques', 0.4], ['Forearms', 0.35]],
  },
  {
    name: 'L-Sit Hold', modality: 'Calisthenics', categories: ['Core'],
    equipment: ['Dip Bars'],
    description: 'Supported on straight arms with shoulders pushed down, legs held straight out in front. Start with tucked knees and extend one leg at a time as it becomes holdable. Ten honest seconds is a real set.',
    muscles: [['Abs', 0.95], ['Quadriceps', 0.4], ['Triceps', 0.4]],
  },

  // ══════════════ CARDIO ══════════════
  {
    name: 'Running', modality: 'Cardio',
    equipment: ['Treadmill'],
    description: 'Outdoors or on a treadmill. Land under the hips rather than out in front, keep the cadence quick, and let the pace rather than the stride length do the work. Impact makes this the most damaging cardio in the app for the legs.',
    muscles: [['Calves', 0.7], ['Quadriceps', 0.6], ['Hamstrings', 0.6], ['Glutes', 0.5]],
  },
  {
    name: 'Sprints', modality: 'Cardio',
    equipment: ['Bodyweight'],
    description: 'Short maximal efforts with full recovery between them — 60 to 200 metres, walked back. Warm up thoroughly first: near-maximal speed is where hamstrings tear, and it does more tissue damage per minute than anything else here.',
    muscles: [['Hamstrings', 0.8], ['Quadriceps', 0.7], ['Glutes', 0.7], ['Calves', 0.6]],
  },
  {
    name: 'Walking', modality: 'Cardio',
    equipment: ['Bodyweight'],
    description: 'Brisk, conversational pace. Barely registers as training load, which is exactly why it works on a rest day — it moves blood through tired muscle without adding fatigue to recover from.',
    muscles: [['Calves', 0.4], ['Quadriceps', 0.3], ['Glutes', 0.3]],
  },
  {
    name: 'Hiking', modality: 'Cardio',
    equipment: ['Bodyweight'],
    description: 'Sustained walking over gradient and uneven ground. The climbing loads the glutes and calves; the descent is the part that actually makes you sore, since it is all eccentric.',
    muscles: [['Quadriceps', 0.6], ['Glutes', 0.6], ['Calves', 0.6], ['Hamstrings', 0.4]],
  },
  {
    name: 'Cycling', modality: 'Cardio',
    equipment: ['Bike'],
    description: 'Road or stationary. Saddle height set so the knee stays slightly bent at the bottom of the stroke. No impact and no eccentric loading, so it buys a large aerobic dose for very little muscle damage.',
    muscles: [['Quadriceps', 0.7], ['Glutes', 0.6], ['Hamstrings', 0.5], ['Calves', 0.4]],
  },
  {
    name: 'Air Bike', modality: 'Cardio',
    equipment: ['Bike'],
    description: 'Fan bike, arms and legs both driving. Resistance rises with effort, so it punishes anyone who starts too hard — pace the first thirty seconds. Systemically brutal while doing very little damage to any one muscle.',
    muscles: [['Quadriceps', 0.6], ['Shoulders', 0.5], ['Back', 0.4], ['Hamstrings', 0.4]],
  },
  {
    name: 'Rowing', modality: 'Cardio',
    equipment: ['Rower'],
    description: 'Legs, then back, then arms on the drive; arms, then back, then legs on the recovery. Most of the power comes from the legs — pulling with the arms first is what makes an erg feel like a back workout and leaves the score unchanged.',
    muscles: [['Back', 0.6], ['Quadriceps', 0.5], ['Lats', 0.5], ['Glutes', 0.4]],
  },
  {
    name: 'Swimming', modality: 'Cardio',
    equipment: ['Bodyweight'],
    description: 'Lap swimming, any stroke. Fully supported and non-impact, so the aerobic cost is high and the tissue damage close to nothing — the option when the legs need a week off but the engine does not.',
    muscles: [['Back', 0.6], ['Shoulders', 0.6], ['Lats', 0.5], ['Triceps', 0.4]],
  },
  {
    name: 'Elliptical', modality: 'Cardio',
    equipment: ['Elliptical'],
    description: 'A running-shaped movement with the impact removed, because the feet never leave the pedals. Useful for aerobic work while the joints are recovering; drive with the legs rather than hauling on the handles.',
    muscles: [['Quadriceps', 0.5], ['Glutes', 0.5], ['Hamstrings', 0.4], ['Calves', 0.3]],
  },
  {
    name: 'Stair Climber', modality: 'Cardio',
    equipment: ['Stair Climber'],
    description: 'Stand tall and let the legs work — leaning on the rails takes most of the bodyweight off and turns a hard piece of cardio into an easy one. Steady climbing loads the glutes and calves far more than flat running does.',
    muscles: [['Glutes', 0.65], ['Quadriceps', 0.6], ['Calves', 0.6], ['Hamstrings', 0.4]],
  },
  {
    name: 'Jump Rope', modality: 'Cardio',
    equipment: ['Jump Rope'],
    description: 'Small jumps off the balls of the feet, elbows in, the rope turned by the wrists rather than the arms. Calves take almost all of it, so the first few sessions leave them sore out of proportion to the effort.',
    muscles: [['Calves', 0.7], ['Shoulders', 0.3], ['Forearms', 0.3]],
  },

  // ══════════════ MOBILITY ══════════════
  {
    name: 'Cat-Cow Stretch', modality: 'Mobility',
    equipment: ['Yoga Mat'],
    description: 'On all fours, alternate between rounding the spine toward the ceiling and letting it sink while the chest opens. Move segment by segment with the breath rather than swinging between the two ends.',
    muscles: [['Back', 0.4], ['Lower Back', 0.4]],
  },
  {
    name: 'Thread the Needle', modality: 'Mobility',
    equipment: ['Yoga Mat'],
    description: 'From all fours, reach one arm under the other and let the shoulder and side of the head rest on the floor. Rotation through the upper back specifically, which is what stiffens up after a week of pressing and desk work.',
    muscles: [['Back', 0.4], ['Traps', 0.3], ['Shoulders', 0.3]],
  },
  {
    name: 'Thoracic Opener', modality: 'Mobility',
    equipment: ['Bench'],
    description: 'Upper back across a bench or roller, hands behind the head, and extend back over it while the ribs stay down. Move the mid-back, not the lower one — the pinch people feel is usually the lumbar spine doing the work instead.',
    muscles: [['Back', 0.4], ['Shoulders', 0.3]],
  },
  {
    name: 'Shoulder Dislocates', modality: 'Mobility',
    equipment: ['Resistance Band'],
    description: 'Wide grip on a band, arms straight, and pass it from in front of the hips to behind the back and return. Start much wider than feels necessary and narrow the grip over weeks. Straight elbows throughout, or it does nothing.',
    muscles: [['Shoulders', 0.4], ['Traps', 0.3]],
  },
  {
    name: "World's Greatest Stretch", modality: 'Mobility',
    equipment: ['Yoga Mat'],
    description: 'Deep lunge, opposite hand on the floor, then drop the back elbow to the instep and rotate the other arm up to the ceiling. Hip flexors, hamstrings and thoracic rotation in one sequence, which is where the name comes from.',
    muscles: [['Hamstrings', 0.4], ['Glutes', 0.4], ['Back', 0.3]],
  },
  {
    name: '90/90 Hip Switch', modality: 'Mobility',
    equipment: ['Yoga Mat'],
    description: 'Seated with both knees at right angles, one leg in front and one out to the side, then rotate the knees across to the other side without using the hands. Trains hip rotation in both directions, which squats and running never ask for.',
    muscles: [['Glutes', 0.4]],
  },
  {
    name: 'Couch Stretch', modality: 'Mobility',
    equipment: ['Yoga Mat'],
    description: 'Back foot up against a wall or couch, front foot forward, then square the hips and squeeze the back glute to take the arch out of the lower back. That squeeze is the whole stretch — without it the lumbar spine absorbs it instead.',
    muscles: [['Quadriceps', 0.4], ['Glutes', 0.3]],
  },
  {
    name: 'Pigeon Pose', modality: 'Mobility',
    equipment: ['Yoga Mat'],
    description: 'Front shin across the body, back leg extended straight behind, hips level. Fold forward over the front leg to deepen it. Back off if it is felt in the front knee rather than the glute — that means the hip is not rotating and the knee is.',
    muscles: [['Glutes', 0.5]],
  },
  {
    name: 'Hamstring Stretch', modality: 'Mobility',
    equipment: ['Yoga Mat'],
    description: 'Seated or lying, leg straight, hinge from the hip with a flat back rather than rounding forward to reach the toes. Hold thirty to sixty seconds per side and breathe out into it instead of bouncing.',
    muscles: [['Hamstrings', 0.5], ['Calves', 0.3]],
  },
  {
    name: 'Deep Squat Hold', modality: 'Mobility',
    equipment: ['Bodyweight'],
    description: 'Sit into the bottom of a squat and stay there, heels down, elbows pushing the knees out. Hold a light weight in front as a counterbalance if the heels lift. A minute or two here does more for squat depth than any single stretch.',
    muscles: [['Glutes', 0.4], ['Quadriceps', 0.4], ['Calves', 0.3]],
  },
  {
    name: 'Sun Salutation Flow', modality: 'Mobility',
    equipment: ['Yoga Mat'],
    description: 'The standard vinyasa sequence, moving with the breath. A full-body warm-up that touches the hamstrings, hips, shoulders and spine in one loop — useful before training as well as on its own.',
    muscles: [['Back', 0.3], ['Hamstrings', 0.3], ['Shoulders', 0.3]],
  },
  {
    name: 'Foam Rolling', modality: 'Mobility',
    equipment: ['Foam Roller'],
    description: 'Roll slowly over the tissue and pause on the spots that bite, breathing until they ease. Thirty to sixty seconds per area is plenty. It changes how the muscle feels, not what it is — treat it as a warm-up, not as recovery.',
    muscles: [['Quadriceps', 0.3], ['Back', 0.3], ['Calves', 0.3]],
  },

  // ══════════════ WOD ══════════════
  {
    name: 'Burpee', modality: 'WOD',
    equipment: ['Bodyweight'],
    description: 'Chest and thighs to the floor, then stand and jump with the hands overhead. Step back and up rather than jumping both ways once the reps get high — the pace of a long set is set by breathing, not by leg strength.',
    muscles: [['Chest', 0.6], ['Quadriceps', 0.7], ['Glutes', 0.7], ['Shoulders', 0.5], ['Abs', 0.4]],
  },
  {
    name: 'Thruster', modality: 'WOD',
    equipment: ['Barbell'],
    description: 'Front squat straight into an overhead press, driven as one movement — the bar leaves the shoulders on the momentum out of the squat. The most systemically punishing barbell movement in the app, which is why it appears in so many workouts.',
    muscles: [['Quadriceps', 0.8], ['Shoulders', 0.7], ['Glutes', 0.6], ['Triceps', 0.5]],
  },
  {
    name: 'Wall Ball', modality: 'WOD',
    equipment: ['Medicine Ball'],
    description: 'Squat to depth with the ball at the chest, then stand and throw it to a target on the wall. Catch it into the next squat. Simple, and relentless: the shoulders fail before the legs do in any long set.',
    muscles: [['Quadriceps', 0.7], ['Shoulders', 0.6], ['Glutes', 0.6], ['Triceps', 0.4]],
  },
  {
    name: 'Box Jump', modality: 'WOD',
    equipment: ['Plyo Box'],
    description: 'Jump from both feet, land softly with the hips back rather than crashing onto straight legs, and stand tall on the box. Step down between reps — rebounding off a high box is how achilles tendons go, and it saves no time worth having.',
    muscles: [['Quadriceps', 0.7], ['Glutes', 0.7], ['Calves', 0.6], ['Hamstrings', 0.4]],
  },
  {
    name: 'Kettlebell Swing', modality: 'WOD',
    equipment: ['Kettlebell'],
    description: 'A hip hinge, not a squat and not a front raise. Hike the bell back between the legs, then snap the hips forward and let the arms follow — the bell floats up on hip drive alone. Russian to chest height, American overhead.',
    muscles: [['Glutes', 0.8], ['Hamstrings', 0.7], ['Lower Back', 0.5], ['Shoulders', 0.4], ['Forearms', 0.4]],
  },
  {
    name: 'Kettlebell Clean', modality: 'WOD',
    equipment: ['Kettlebell'],
    description: 'Hinge, then pull the bell up close to the body and rotate the hand around it so it lands softly in the rack position on the forearm. Banging the wrist means the bell was flipped rather than guided — keep the elbow in tight to the ribs.',
    muscles: [['Glutes', 0.7], ['Hamstrings', 0.6], ['Traps', 0.6], ['Shoulders', 0.5], ['Forearms', 0.5]],
  },
  {
    name: 'Kettlebell Snatch', modality: 'WOD',
    equipment: ['Kettlebell'],
    description: 'One continuous movement from between the legs to locked out overhead, punching the hand through at the top so the bell settles rather than slaps. Hip drive does the work; pulling with the arm is what tears hands.',
    muscles: [['Shoulders', 0.75], ['Glutes', 0.7], ['Traps', 0.6], ['Hamstrings', 0.6], ['Forearms', 0.5]],
  },
  {
    name: 'Turkish Get-up', modality: 'WOD',
    equipment: ['Kettlebell'],
    description: 'From lying to standing and back, with the bell locked out overhead the whole time and the eyes on it. Slow by design — a single rep takes half a minute, and the shoulder stability it demands is the point rather than the load.',
    muscles: [['Shoulders', 0.8], ['Abs', 0.8], ['Obliques', 0.7], ['Glutes', 0.5], ['Quadriceps', 0.5]],
  },
  {
    name: 'Clean and Jerk', modality: 'WOD',
    equipment: ['Barbell'],
    description: 'Ground to shoulders in one pull, then a dip and drive to lock it overhead. Technical: the bar stays close to the body, and the third pull is dropping under it rather than heaving it higher. Learn it light with a coach before loading it.',
    muscles: [['Quadriceps', 0.7], ['Shoulders', 0.7], ['Traps', 0.6], ['Glutes', 0.6], ['Back', 0.5]],
  },
  {
    name: 'Power Clean', modality: 'WOD',
    equipment: ['Barbell'],
    description: 'Pull from the floor, extend the hips hard, and catch the bar on the shoulders above a quarter squat. Stopping the catch high is what makes it a power clean — if you have to squat it up, the weight is past what this movement is for.',
    muscles: [['Traps', 0.7], ['Quadriceps', 0.7], ['Glutes', 0.7], ['Back', 0.6], ['Hamstrings', 0.5]],
  },
  {
    name: 'Snatch', modality: 'WOD',
    equipment: ['Barbell'],
    description: 'Floor to overhead in one movement on a wide grip. The most technical lift in the catalogue, and the one where mobility fails first — if the bar cannot be held overhead in a squat, work the position before adding weight.',
    muscles: [['Shoulders', 0.7], ['Traps', 0.7], ['Quadriceps', 0.6], ['Glutes', 0.6], ['Back', 0.6]],
  },
  {
    name: 'Overhead Squat', modality: 'WOD',
    equipment: ['Barbell'],
    description: 'Bar locked out overhead on a wide grip, squatted to depth with the arms staying behind the ears. Exposes every restriction in the ankles, hips and shoulders at once — start with a broomstick, not a bar.',
    muscles: [['Quadriceps', 0.8], ['Shoulders', 0.7], ['Abs', 0.6], ['Glutes', 0.6], ['Back', 0.5]],
  },
  {
    name: 'Dumbbell Snatch', modality: 'WOD',
    equipment: ['Dumbbell'],
    description: 'One dumbbell from the floor to overhead in a single movement, alternating hands. Far easier to learn than the barbell version and it survives high reps, which is why it turns up in so many metcons.',
    muscles: [['Shoulders', 0.7], ['Glutes', 0.7], ['Traps', 0.6], ['Hamstrings', 0.5], ['Quadriceps', 0.5]],
  },
  {
    name: 'Devil Press', modality: 'WOD',
    equipment: ['Dumbbell'],
    description: 'A burpee onto two dumbbells, then swing them from the floor to overhead in one arc as you stand. Brutally simple and brutally taxing — pace it from the first rep, because there is nowhere to hide once the breathing goes.',
    muscles: [['Shoulders', 0.75], ['Chest', 0.6], ['Glutes', 0.6], ['Quadriceps', 0.6], ['Hamstrings', 0.5]],
  },
  {
    name: 'Toes-to-Bar', modality: 'WOD',
    equipment: ['Pull-up Bar'],
    description: 'From a hang, curl the pelvis and bring both feet to the bar between the hands, then control the swing back. The kip is a rhythm, not a thrash — losing it is what turns a set of ten into a set of three.',
    muscles: [['Abs', 0.9], ['Lats', 0.5], ['Forearms', 0.5], ['Obliques', 0.4]],
  },
  {
    name: 'Handstand Push-up', modality: 'WOD',
    equipment: ['Bodyweight'],
    description: 'Kicked up against a wall, lower the crown of the head to the floor and press back to lockout. Build it from pike push-ups with the feet elevated. Head contact should be light — the neck is not meant to carry any of the load.',
    muscles: [['Shoulders', 0.95], ['Triceps', 0.8], ['Traps', 0.5], ['Abs', 0.4]],
  },
  {
    name: 'Wall Walk', modality: 'WOD',
    equipment: ['Bodyweight'],
    description: 'Start in a plank with the feet at the wall, then walk the feet up and the hands in until the chest is close to it, and reverse. Shoulders take it the whole way, and the walk down is the half people rush and regret.',
    muscles: [['Shoulders', 0.85], ['Abs', 0.7], ['Triceps', 0.6]],
  },
  {
    name: 'Double Under', modality: 'WOD',
    equipment: ['Jump Rope'],
    description: 'Two rope passes per jump. Same small bounce as a single under, just faster wrists — jumping higher is the instinct and it is the wrong one. Calves absorb every rep, so a long set leaves them sore for days.',
    muscles: [['Calves', 0.7], ['Shoulders', 0.4], ['Forearms', 0.4]],
  },
  {
    name: 'Battle Rope Waves', modality: 'WOD',
    equipment: ['Battle Ropes'],
    description: 'Athletic stance, ropes moving in alternating or simultaneous waves from the shoulders. Almost no eccentric loading, so the heart rate goes through the roof while the muscle damage stays low — ideal for a finisher on a heavy week.',
    muscles: [['Shoulders', 0.8], ['Forearms', 0.6], ['Abs', 0.5], ['Back', 0.4]],
  },
  {
    name: 'Sled Push', modality: 'WOD',
    equipment: ['Sled'],
    description: 'Low body angle, arms locked, and drive with short hard steps. There is no lowering phase at all, which is why a sled can be pushed heavy without leaving you sore — the legs get the work and the tissue gets off lightly.',
    muscles: [['Quadriceps', 0.85], ['Glutes', 0.8], ['Calves', 0.6], ['Hamstrings', 0.4]],
  },
]
