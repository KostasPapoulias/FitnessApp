# Quick Reference Guide - Redux Toolkit & useSelector/useDispatch

## Running the App

```bash
npm run dev    # Start development server
npm run build  # Build for production
```

## Redux Slices & Actions

### Categories Slice
```javascript
import { useDispatch } from 'react-redux';
import { 
  addCategory,           // Add a category to the list
  clearCategory,         // Clear all categories
  removeCategory,        // Remove a specific category
  incrementCategoryCount,// Increment recovery count
  decrementCategoryCount,// Decrement recovery count
  setCategories          // Set entire categories array
} from './categoriesSlice';

// Usage
const dispatch = useDispatch();
dispatch(addCategory('Chest'));
dispatch(clearCategory());
dispatch(incrementCategoryCount('Triceps'));
```

### Exercises Slice
```javascript
import { 
  addItem,        // Add exercise to list
  removeItem,     // Remove exercise from list
  clearList,      // Clear all exercises
  updateList,     // Update list (filter by id)
  updateExercise, // Update specific exercise
  setExercises    // Set entire exercises array
} from './exercisesSlice';

// Usage
dispatch(addItem({ id: 1, name: 'Push-ups' }));
dispatch(clearList());
dispatch(updateExercise({ id: 1, name: 'Modified Push-ups' }));
```

### Help Slice
```javascript
import { 
  addHelp,     // Set help state
  deleteHelp,  // Delete help state
  toggleUp,    // Toggle up arrow
  toggleDown   // Toggle down arrow
} from './helpSlice';

// Usage
dispatch(toggleUp('true'));
dispatch(toggleDown('false'));
```

## useSelector - Reading from Redux

### Basic Usage
```javascript
import { useSelector } from 'react-redux';

function MyComponent() {
  // Get categories list
  const categories = useSelector(state => state.categories.categoriesList);
  
  // Get exercises list
  const exercises = useSelector(state => state.exercises.list);
  
  // Get recovery data
  const recovery = useSelector(state => state.categories.recovery);
  
  // Get help state
  const help = useSelector(state => state.help.help);
  
  return (
    <div>
      {categories.map(cat => <div key={cat}>{cat}</div>)}
    </div>
  );
}
```

### With Default Values
```javascript
// Safely access with default empty array
const categories = useSelector(state => 
  Array.isArray(state.categories.categoriesList) 
    ? state.categories.categoriesList 
    : []
);

// Or with optional chaining
const exercises = useSelector(state => state.exercises?.list || []);
```

### Multiple Selectors
```javascript
function MyComponent() {
  const categories = useSelector(state => state.categories.categoriesList);
  const exercises = useSelector(state => state.exercises.list);
  const help = useSelector(state => state.help.help);
  
  // Use all three in your component
}
```

## useDispatch - Writing to Redux

### Basic Pattern
```javascript
import { useDispatch } from 'react-redux';
import { addCategory } from './categoriesSlice';

function MyComponent() {
  const dispatch = useDispatch();
  
  const handleClick = () => {
    dispatch(addCategory('Chest'));
  };
  
  return <button onClick={handleClick}>Add Category</button>;
}
```

### Multiple Actions
```javascript
const handleReset = () => {
  dispatch(clearList());
  dispatch(clearCategory());
  dispatch(toggleUp('true'));
};
```

### With Dynamic Data
```javascript
const handleAddExercise = (exercise) => {
  dispatch(addItem({
    id: Date.now(),
    name: exercise.name,
    category: exercise.category,
    image: exercise.image
  }));
};
```

## Common Use Cases

### 1. Display List from Redux
```javascript
function ExerciseList() {
  const exercises = useSelector(state => state.exercises.list);
  
  return (
    <div>
      {exercises.map(ex => (
        <div key={ex.id}>{ex.name}</div>
      ))}
    </div>
  );
}
```

### 2. Add Item to Redux
```javascript
function AddExercise() {
  const dispatch = useDispatch();
  
  const handleAdd = () => {
    dispatch(addItem({ 
      id: 1, 
      name: 'Push-ups',
      category: 'Chest' 
    }));
  };
  
  return <button onClick={handleAdd}>Add</button>;
}
```

### 3. Remove Item from Redux
```javascript
function ExerciseItem({ exercise }) {
  const dispatch = useDispatch();
  
  const handleRemove = () => {
    dispatch(removeItem(exercise));
  };
  
  return (
    <div>
      {exercise.name}
      <button onClick={handleRemove}>Remove</button>
    </div>
  );
}
```

### 4. Clear All Items
```javascript
function ClearButton() {
  const dispatch = useDispatch();
  
  const handleClear = () => {
    dispatch(clearList());
    dispatch(clearCategory());
  };
  
  return <button onClick={handleClear}>Clear All</button>;
}
```

### 5. Conditional Rendering Based on Redux State
```javascript
function WorkoutStart() {
  const exercises = useSelector(state => state.exercises.list);
  const dispatch = useDispatch();
  
  const handleStart = () => {
    if (exercises.length > 0) {
      // Start workout
      console.log('Starting workout with', exercises.length, 'exercises');
    }
  };
  
  return (
    <div>
      {exercises.length === 0 ? (
        <p>Add exercises to start workout</p>
      ) : (
        <button onClick={handleStart}>
          Start Workout ({exercises.length} exercises)
        </button>
      )}
    </div>
  );
}
```

## Logic Hooks Pattern

### Using a Logic Hook
```javascript
import { useAddLogic } from '../logic/AddLogic';

function Add({ exercises, onListChange, saveDate }) {
  // Get all logic from custom hook
  const {
    topNew,
    chosenCategories,
    handleTopNew,
    handleChosenCategories,
    // ... other state and handlers
  } = useAddLogic(exercises, onListChange, saveDate);
  
  return (
    <div>
      <button onClick={handleTopNew}>New</button>
      {/* Use other state and handlers */}
    </div>
  );
}
```

### Creating a Logic Hook
```javascript
// in logic/MyLogic.js
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { addCategory } from '../../categoriesSlice';

export function useMyLogic(props) {
  // Local state
  const [isOpen, setIsOpen] = useState(false);
  
  // Redux state
  const categories = useSelector(state => state.categories.categoriesList);
  const dispatch = useDispatch();
  
  // Handlers
  const handleOpen = () => setIsOpen(true);
  const handleAddCategory = (cat) => dispatch(addCategory(cat));
  
  // Return what component needs
  return {
    isOpen,
    categories,
    handleOpen,
    handleAddCategory,
  };
}
```

## Redux DevTools

Install Redux DevTools browser extension to:
- Inspect Redux state
- See action history
- Time-travel debugging

## Troubleshooting

### Error: "Cannot read property 'list' of undefined"
```javascript
// Problem
const exercises = useSelector(state => state.exercises.list);

// Solution: Add safety check
const exercises = useSelector(state => state.exercises?.list || []);
```

### Action not working
```javascript
// Wrong ❌
dispatch({ type: 'ADD_ITEM', payload: item });

// Correct ✅
import { addItem } from './exercisesSlice';
dispatch(addItem(item));
```

### Component not re-rendering
```javascript
// Make sure you're using useSelector, not just reading once
// Wrong ❌
const exercises = store.getState().exercises.list;

// Correct ✅
const exercises = useSelector(state => state.exercises.list);
```

## Where to Add useSelector/useDispatch

Add them in **any React component** that needs to:
- Read data from Redux store → use `useSelector`
- Update data in Redux store → use `useDispatch`

You DON'T need them in:
- Plain JavaScript files (use logic hooks instead)
- Components that only receive props
- Components that only manage local state

## Examples in Your App

### In Add Component
```javascript
// Read exercises list
const exercises = useSelector(state => state.exercises.list);

// Add exercise
dispatch(addItem(newExercise));

// Clear exercises
dispatch(clearList());
```

### In Start Component
```javascript
// Read exercises list
const exercises = useSelector(state => state.exercises.list);

// Read recovery data
const recovery = useSelector(state => state.categories.recovery);

// Update recovery count
dispatch(incrementCategoryCount('Triceps'));
```

### In Home Component
```javascript
// Read any data you need from Redux
const categories = useSelector(state => state.categories.categoriesList);
const exercises = useSelector(state => state.exercises.list);
```

## Quick Command Reference

```bash
# Start development server
npm run dev

# Install new package
npm install package-name

# Build for production
npm run build

# Run with port
npm run dev -- --port 3000
```
