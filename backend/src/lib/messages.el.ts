// Greek translations of user-facing server messages, keyed by the exact English
// text the controllers send (see `localizeMessage`). Developer-only validation
// messages are not translated.

export const EL_MESSAGES: Record<string, string> = {
  // Generic
  'Server error': 'Σφάλμα διακομιστή. Δοκίμασε ξανά.',
  'Internal server error': 'Σφάλμα διακομιστή. Δοκίμασε ξανά.',
  'User not found': 'Ο χρήστης δεν βρέθηκε.',

  // Registration and sign-in
  'Enter a valid email address.': 'Βάλε ένα έγκυρο email.',
  'That email is already registered. Sign in instead.':
    'Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδέσου.',
  'Failed to register user': 'Η εγγραφή απέτυχε. Δοκίμασε ξανά.',
  'Email and password are required': 'Χρειάζονται email και κωδικός.',
  'Invalid credentials': 'Λάθος email ή κωδικός.',
  'Failed to login': 'Η σύνδεση απέτυχε. Δοκίμασε ξανά.',
  'Session expired. Please sign in again.': 'Η σύνδεση έληξε. Συνδέσου ξανά.',

  // Passwords
  'Password is required.': 'Χρειάζεται κωδικός.',
  'Password is too long.': 'Ο κωδικός είναι πολύ μεγάλος.',
  'That password is too common. Pick something else.':
    'Αυτός ο κωδικός είναι πολύ συνηθισμένος. Διάλεξε κάτι άλλο.',
  'Password needs more variety in its characters.':
    'Ο κωδικός χρειάζεται περισσότερη ποικιλία χαρακτήρων.',
  'Current password is incorrect.': 'Ο τρέχων κωδικός είναι λάθος.',

  // Password reset
  'If that address has an account, a reset link is on its way.':
    'Αν υπάρχει λογαριασμός με αυτό το email, ο σύνδεσμος επαναφοράς είναι καθ’ οδόν.',
  'Password reset is unavailable right now. Contact support.':
    'Η επαναφορά κωδικού δεν είναι διαθέσιμη αυτή τη στιγμή. Επικοινώνησε με την υποστήριξη.',
  'That reset link is invalid or has expired. Request a new one.':
    'Ο σύνδεσμος επαναφοράς δεν ισχύει ή έχει λήξει. Ζήτησε καινούριο.',
  'Password updated. Sign in with your new password.':
    'Ο κωδικός άλλαξε. Συνδέσου με τον καινούριο.',
  'Could not reset the password.': 'Δεν έγινε επαναφορά του κωδικού.',

  // PIN
  'Incorrect PIN.': 'Λάθος PIN.',
  'No PIN is set.': 'Δεν έχει οριστεί PIN.',
  'PIN must be digits only.': 'Το PIN πρέπει να έχει μόνο ψηφία.',
  'That PIN is too easy to guess. Pick another.':
    'Αυτό το PIN μαντεύεται εύκολα. Διάλεξε άλλο.',
  'Enter your current PIN or your account password to change it.':
    'Βάλε το τρέχον PIN ή τον κωδικό του λογαριασμού σου για να το αλλάξεις.',
  'Incorrect PIN or password.': 'Λάθος PIN ή κωδικός.',

  // Rate limits
  'Too many attempts. Try again in a few minutes.':
    'Πάρα πολλές προσπάθειες. Δοκίμασε ξανά σε λίγα λεπτά.',
  'Too many accounts created from this address. Try again later.':
    'Δημιουργήθηκαν πολλοί λογαριασμοί από αυτή τη σύνδεση. Δοκίμασε αργότερα.',
  'Too many PIN attempts. Wait a few minutes.':
    'Πάρα πολλές προσπάθειες PIN. Περίμενε λίγα λεπτά.',
  'Too many reset requests. Try again later.':
    'Πάρα πολλά αιτήματα επαναφοράς. Δοκίμασε αργότερα.',
  'Slow down a moment.': 'Λίγο πιο αργά.',

  // Onboarding
  'birthDate looks wrong — please check it':
    'Η ημερομηνία γέννησης δεν φαίνεται σωστή — έλεγξέ τη.',
}

/** Messages with interpolated numbers. Anchored so each pattern matches only its message. */
export const EL_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Password must be at least (\d+) characters\.$/,
    m => `Ο κωδικός πρέπει να έχει τουλάχιστον ${m[1]} χαρακτήρες.`],
  [/^PIN must be (\d+)–(\d+) digits\.$/,
    m => `Το PIN πρέπει να έχει ${m[1]}–${m[2]} ψηφία.`],
  [/^Too many attempts\. Locked for (\d+) minutes\.$/,
    m => `Πάρα πολλές προσπάθειες. Κλείδωμα για ${m[1]} λεπτά.`],
  [/^Too many attempts\. Try again in (\d+)s\.$/,
    m => `Πάρα πολλές προσπάθειες. Δοκίμασε ξανά σε ${m[1]} δευτ.`],
  [/^You must be at least (\d+) to use SomaTrack$/,
    m => `Πρέπει να είσαι τουλάχιστον ${m[1]} ετών για να χρησιμοποιήσεις το SomaTrack.`],
  [/^height must be between (\d+) and (\d+) cm$/,
    m => `Το ύψος πρέπει να είναι από ${m[1]} έως ${m[2]} cm.`],
  [/^weight must be between (\d+) and (\d+) kg$/,
    m => `Το βάρος πρέπει να είναι από ${m[1]} έως ${m[2]} kg.`],
]
