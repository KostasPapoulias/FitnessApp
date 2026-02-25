# Project Structure Overview

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         App.jsx                              │
│                    (Main Application)                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      NavBar.jsx                              │
│              (Main Navigation Container)                     │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │   Home     │  │    Add     │  │   Start    │           │
│  │   Icon     │  │   Icon     │  │   Icon     │           │
│  └────────────┘  └────────────┘  └────────────┘           │
└──────┬────────────────┬────────────────┬────────────────────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│    Home     │  │     Add     │  │    Start    │
│  Component  │  │  Component  │  │  Component  │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Redux Store Structure

```
Redux Store
├── categories
│   ├── categoriesList: []
│   ├── recovery: [
│   │   { name: 'Triceps', count: 0 },
│   │   { name: 'Biceps', count: 0 },
│   │   ...
│   │ ]
│   └── selectedCategories: []
│
├── exercises
│   └── list: []
│
└── help
    ├── help: ['true']
    ├── toggleUp: ['true']
    └── toggleDown: ['true']
```

## Component Hierarchy

### Home Section
```
Home.jsx
└── Human.jsx
    └── (displays body visualization)
```

### Add Section
```
Add.jsx (uses useAddLogic hook)
├── TopPart.jsx
│   └── Info.jsx (help toggle)
│
├── AddCategoryMenu.jsx (when topNew is true)
│
├── DisplayDefault.jsx (when topNew is false)
│   ├── AddExerciseMenu.jsx (when adding new exercise)
│   └── ChosenExercises.jsx (default view)
│       └── SetRep.jsx (when exercise clicked)
│
└── ShowSelectedCategories.jsx
    └── (horizontal category list)
```

### Start Section
```
Start.jsx (uses useStartLogic hook)
├── WorkoutPanel.jsx (when workout started)
│   └── Timer.jsx
│
└── ChosenExercises.jsx (default view)
    └── (displays selected exercises)
```

## Data Flow

### Reading from Redux
```
Component
    │
    └── useSelector(state => state.exercises.list)
            │
            └── Redux Store
                    │
                    └── Returns: exercises.list
```

### Writing to Redux
```
Component
    │
    └── dispatch(addCategory('Chest'))
            │
            └── Redux Store
                    │
                    └── categoriesSlice reducer
                            │
                            └── Updates state.categories.categoriesList
```

## Logic Hooks Pattern

```
Component
    │
    ├── import { useAddLogic } from '../logic/AddLogic'
    │
    └── const { topNew, handleTopNew, ... } = useAddLogic(props)
            │
            └── Logic Hook
                    │
                    ├── useState (local state)
                    ├── useSelector (Redux state)
                    ├── useDispatch (Redux actions)
                    └── Custom handlers
                            │
                            └── Returns: state & handlers
```

## File Organization Pattern

```
NavBar/
├── NavBar.jsx                    # Main container
├── logic/                        # Business logic
│   ├── NavBarLogic.js           # Navigation logic
│   ├── AddLogic.js              # Add page logic
│   ├── StartLogic.js            # Start page logic
│   └── HomeLogic.js             # Home page logic
│
├── Add/
│   ├── Add.jsx                  # Main Add component
│   ├── components/              # Sub-components
│   │   ├── TopPart.jsx
│   │   ├── DisplayDefault.jsx
│   │   ├── ShowSelectedCategories.jsx
│   │   └── ChosenExercises.jsx
│   └── ... (other files)
│
├── Start/
│   ├── Start.jsx                # Main Start component
│   ├── components/              # Sub-components
│   │   └── ChosenExercises.jsx
│   └── ... (other files)
│
└── Home/
    ├── Home.jsx                 # Main Home component
    └── ... (other files)
```

## Benefits of This Structure

1. **Clear Separation**
   - UI components in component files
   - Business logic in logic hooks
   - State management in Redux slices

2. **Easy to Navigate**
   - Related files grouped together
   - Clear naming conventions
   - Predictable file locations

3. **Scalable**
   - Easy to add new features
   - Clear patterns to follow
   - Minimal file changes needed

4. **Testable**
   - Logic hooks can be tested independently
   - Components can be tested with mock data
   - Redux slices have predictable behavior

## Example: Adding a New Feature

To add a new section (e.g., "Profile"):

1. Create `NavBar/Profile/Profile.jsx`
2. Create `NavBar/logic/ProfileLogic.js`
3. Create `NavBar/Profile/components/` for sub-components
4. Add ProfileIcon to NavBar
5. Add to NavBar navigation logic
6. Create Redux slice if needed: `profileSlice.jsx`

## Common Patterns

### Accessing Redux State
```javascript
// In any component
import { useSelector } from 'react-redux';

const categories = useSelector(state => state.categories.categoriesList);
const exercises = useSelector(state => state.exercises.list);
```

### Updating Redux State
```javascript
// In any component
import { useDispatch } from 'react-redux';
import { addCategory } from '../categoriesSlice';

const dispatch = useDispatch();
dispatch(addCategory('NewCategory'));
```

### Using Logic Hooks
```javascript
// In any component
import { useAddLogic } from '../logic/AddLogic';

function MyComponent(props) {
  const { state, handlers } = useAddLogic(props);
  // Use state and handlers
}
```
