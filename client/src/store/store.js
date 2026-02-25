import { configureStore } from '@reduxjs/toolkit';
import categoriesReducer from './categoriesSlice';
import exercisesReducer from './exercisesSlice';
import helpReducer from './helpSlice';

export const store = configureStore({
  reducer: {
    categories: categoriesReducer,
    exercises: exercisesReducer,
    help: helpReducer,
  },
});

export default store;
